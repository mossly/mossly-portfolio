/**
 * Phase 3E-4 backfill: adds the `full` variant (native-resolution webp,
 * quality 85) for the 83 legacy photos that predate it.
 *
 * For each id in src/data/photos.seed.json:
 *   1. Fetch the original from its public R2 URL (images.mossly.org).
 *   2. Re-encode with sharp at NATIVE resolution (no resize) to webp q85.
 *   3. Upload to R2 at photos/<id>/full.webp (immutable cache, image/webp),
 *      via the same S3-compatible PUT mechanism migrate-to-r2.ts uses.
 *   4. Record native width/height.
 *
 * Emits scripts/backfill-full.sql (one `UPDATE photos SET full_key=...`
 * per photo) for the human to apply via:
 *   wrangler d1 execute mossly-content --remote --file=scripts/backfill-full.sql
 *
 * Run: npm run backfill:full
 *
 * Requires R2 credentials in the environment (same as migrate-to-r2.ts):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and optionally
 *   R2_BUCKET / IMAGES_BASE overrides.
 *
 * This script does NOT touch remote D1 -- writing backfill-full.sql is the
 * only side effect on the metadata side; applying it is a separate, explicit
 * step for the human to run.
 */
import sharp from 'sharp'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import seedPhotos from '../src/data/photos.seed.json'
import publicPhotos from '../src/data/photos.json'

interface SeedPhoto {
  id: string
  original_key: string
}

interface PublicVariant {
  url: string
  width: number
  height: number
}

interface PublicPhoto {
  id: string
  variants: {
    original: PublicVariant
  }
}

type PublicPhotosByCategory = Record<string, PublicPhoto[]>

/**
 * id -> the original's true (upright) pixel dimensions, sourced from
 * photos.json -- the SAME source seed-d1.ts joined against for original_w/h.
 * Used to assert the re-encoded full.webp came out at the expected
 * orientation/resolution before its UPDATE is emitted.
 */
const originalDimsById = new Map<string, { width: number; height: number }>()
for (const category of Object.keys(publicPhotos as PublicPhotosByCategory)) {
  for (const photo of (publicPhotos as PublicPhotosByCategory)[category]) {
    const original = photo.variants?.original
    if (original && typeof original.width === 'number' && typeof original.height === 'number') {
      originalDimsById.set(photo.id, { width: original.width, height: original.height })
    }
  }
}

const R2_BUCKET = process.env.R2_BUCKET || 'mossly-images'
const IMAGES_BASE = process.env.IMAGES_BASE || 'https://images.mossly.org'
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY

const missing: string[] = []
if (!R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID')
if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID')
if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY')
if (missing.length) {
  console.error(`Missing required env var(s): ${missing.join(', ')}`)
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SQL_OUT = path.join(REPO_ROOT, 'scripts', 'backfill-full.sql')

const FULL_QUALITY = 85

// ---- S3 client (aws4fetch), mirrors migrate-to-r2.ts ----

let s3Client: { fetch: (input: string, init?: RequestInit) => Promise<Response> } | null = null

async function getS3Client() {
  if (s3Client) return s3Client
  const { AwsClient } = await import('aws4fetch')
  s3Client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto',
  })
  return s3Client
}

function r2Endpoint(key: string): string {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`
}

async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const client = await getS3Client()
  const res = await client.fetch(r2Endpoint(key), {
    method: 'PUT',
    body,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
  if (!res.ok) {
    throw new Error(`R2 PUT ${key} failed: ${res.status} ${await res.text().catch(() => '')}`)
  }
}

/** Escape a SQL string literal by doubling embedded single quotes. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function fetchOriginal(originalKey: string): Promise<Buffer> {
  const url = `${IMAGES_BASE}/${originalKey}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: ${res.status}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function backfillPhoto(photo: SeedPhoto): Promise<string> {
  const expected = originalDimsById.get(photo.id)
  if (!expected) {
    throw new Error(`no original dimensions in photos.json for ${photo.id} -- cannot verify the encode`)
  }

  const originalBuf = await fetchOriginal(photo.original_key)

  // .rotate() with no args applies the EXIF orientation (no-op for
  // orientation=1) so the pixels come out upright -- webp carries no
  // orientation tag, so a rotated original would otherwise produce a sideways
  // full.webp with swapped dimensions, diverging from the browser upload path
  // (which orients via createImageBitmap's imageOrientation:'from-image').
  const { data: fullBuf, info } = await sharp(originalBuf)
    .rotate()
    .webp({ quality: FULL_QUALITY })
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height
  if (!width || !height) {
    throw new Error(`could not read encoded webp dimensions for ${photo.id}`)
  }

  // Assert the encode matches the known upright original dims. A mismatch means
  // wrong orientation (swapped w/h) or a resolution surprise -- abort the whole
  // backfill before any SQL is emitted rather than persist a bad row.
  if (width !== expected.width || height !== expected.height) {
    throw new Error(
      `encoded full.webp dimensions ${width}x${height} != expected original ${expected.width}x${expected.height} for ${photo.id}`,
    )
  }

  const fullKey = `photos/${photo.id}/full.webp`
  await putObject(fullKey, fullBuf, 'image/webp')

  return `UPDATE photos SET full_key = ${sqlString(fullKey)}, full_w = ${width}, full_h = ${height} WHERE id = ${sqlString(photo.id)};`
}

async function main() {
  console.log('Backfilling `full` variant for the legacy seeded photos')

  const photos = seedPhotos as SeedPhoto[]
  const statements: string[] = []
  const failures: { id: string; error: string }[] = []

  let done = 0
  for (const photo of photos) {
    try {
      const statement = await backfillPhoto(photo)
      statements.push(statement)
      done++
      console.log(`  [${done}/${photos.length}] ${photo.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`  FAILED [${photo.id}]: ${message}`)
      failures.push({ id: photo.id, error: message })
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} photo(s) failed:`)
    for (const f of failures) console.error(`  - ${f.id}: ${f.error}`)
    console.error('\nAborting: refusing to write a partial backfill-full.sql. Fix the failures and re-run.')
    process.exit(1)
  }

  const header = `-- GENERATED FILE — do not edit by hand.
-- Regenerate via: npm run backfill:full  (scripts/backfill-full.ts)
--
-- Backfills full_key/full_w/full_h for the 83 legacy seeded photos after
-- migrations/0002_full_variant.sql has been applied. Apply explicitly:
--   wrangler d1 execute mossly-content --remote --file=scripts/backfill-full.sql
`
  const sql = `${header}\n${statements.join('\n')}\n`

  await fs.writeFile(SQL_OUT, sql, 'utf8')
  console.log(`\nWrote ${statements.length} UPDATE statements to ${path.relative(REPO_ROOT, SQL_OUT)}`)
  console.log(`${done} succeeded, 0 failed (of ${photos.length})`)
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
