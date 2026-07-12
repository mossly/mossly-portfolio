import sharp from 'sharp'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import frozenPhotos from '../src/data/photos.frozen.json'
import photoOrder from '../src/data/photo-order.json'

// ---- types (mirror the frozen/public shapes; kept local to this script) ----

interface FrozenVariant {
  url: string
  width: number
  height: number
  format?: string
}

interface FrozenPhoto {
  id: string
  filename: string
  category: string
  title?: string
  description?: string
  metadata: Record<string, unknown>
  variants: {
    medium: FrozenVariant
    original: FrozenVariant
  }
  aspectRatio: number
  blurDataUrl?: string
}

type FrozenData = Record<string, FrozenPhoto[]>
type PhotoOrderData = Record<string, string[]>

// ---- CLI args ----

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined

// ---- config (env, unless --dry-run) ----

const R2_BUCKET = process.env.R2_BUCKET || 'mossly-images'
const IMAGES_BASE = process.env.IMAGES_BASE || 'https://images.mossly.org'
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY

if (!DRY_RUN) {
  const missing: string[] = []
  if (!R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID')
  if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID')
  if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY')
  if (missing.length) {
    console.error(
      `Missing required env var(s): ${missing.join(', ')}\n` +
      `Set them, or run with --dry-run to test without R2/network access.`
    )
    process.exit(1)
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(REPO_ROOT, 'public')
const DRY_RUN_DIR = path.join(REPO_ROOT, '.migrate-dryrun')
const PUBLIC_OUT = path.join(REPO_ROOT, 'src/data/photos.json')
const SEED_OUT = path.join(REPO_ROOT, 'src/data/photos.seed.json')

// ---- S3 client (aws4fetch), loaded lazily so --dry-run never needs it installed ----

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

// ---- helpers ----

function extToContentType(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'png') return 'image/png'
  return `image/${e}`
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

interface VariantResult {
  buffer: Buffer
  width: number
  height: number
}

async function makeWebpVariant(sourcePath: string, maxDim: number, quality: number): Promise<VariantResult> {
  const buffer = await sharp(sourcePath)
    .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
  const meta = await sharp(buffer).metadata()
  return { buffer, width: meta.width || 0, height: meta.height || 0 }
}

/**
 * Mirrors gallery-manager.ts applyOrder(): photos listed in photo-order.json
 * come first, in that order; photos absent from the list keep their
 * source (frozen.json) order, appended after the listed ones.
 */
function computeSortOrders(category: string, photos: FrozenPhoto[]): Map<string, number> {
  const idOrder = (photoOrder as PhotoOrderData)[category] || []
  const rank = new Map(idOrder.map((id, i) => [id, i]))
  const indexed = photos.map((photo, sourceIndex) => ({ photo, sourceIndex }))
  indexed.sort((a, b) => {
    const ra = rank.has(a.photo.id) ? rank.get(a.photo.id)! : Number.POSITIVE_INFINITY
    const rb = rank.has(b.photo.id) ? rank.get(b.photo.id)! : Number.POSITIVE_INFINITY
    if (ra !== rb) return ra - rb
    return a.sourceIndex - b.sourceIndex
  })
  const sortOrders = new Map<string, number>()
  indexed.forEach(({ photo }, i) => sortOrders.set(photo.id, i))
  return sortOrders
}

// ---- main ----

interface PublicVariant {
  url: string
  width: number
  height: number
}

interface PublicPhoto {
  id: string
  filename: string
  category: string
  title?: string
  description?: string
  metadata: Record<string, unknown>
  aspectRatio: number
  variants: {
    medium: PublicVariant
    large: PublicVariant
    original: PublicVariant
  }
}

interface SeedRecord {
  id: string
  content_hash: string
  category: string
  title?: string
  filename: string
  sort_order: number
  aspect_ratio: number
  medium_key: string
  medium_w: number
  medium_h: number
  large_key: string
  large_w: number
  large_h: number
  original_key: string
  original_bytes: number
  metadata: Record<string, unknown>
}

async function migratePhoto(photo: FrozenPhoto, sortOrder: number): Promise<{ public: PublicPhoto; seed: SeedRecord }> {
  const originalRelUrl = photo.variants.original.url // e.g. /images/<category>/<filename>
  const originalPath = path.join(PUBLIC_DIR, originalRelUrl.replace(/^\//, ''))

  const originalBytes = await fs.readFile(originalPath)
  const contentHash = crypto.createHash('sha256').update(originalBytes).digest('hex')

  // Read the original's real dimensions from the bytes rather than trusting the
  // frozen metadata (which predates the ID/metadata-instability fix in PLAN 1A).
  const originalMeta = await sharp(originalBytes).metadata()
  const originalW = originalMeta.width || photo.variants.original.width
  const originalH = originalMeta.height || photo.variants.original.height

  const ext = path.extname(photo.filename).slice(1).toLowerCase() || 'jpg'
  const contentType = extToContentType(ext)

  const [medium, large] = await Promise.all([
    makeWebpVariant(originalPath, 1200, 75),
    makeWebpVariant(originalPath, 2560, 80),
  ])

  const mediumKey = `photos/${photo.id}/medium.webp`
  const largeKey = `photos/${photo.id}/large.webp`
  const originalKey = `photos/${photo.id}/original.${ext}`

  if (DRY_RUN) {
    const dir = path.join(DRY_RUN_DIR, 'photos', photo.id)
    await ensureDir(dir)
    await fs.writeFile(path.join(dir, 'medium.webp'), medium.buffer)
    await fs.writeFile(path.join(dir, 'large.webp'), large.buffer)
    await fs.writeFile(path.join(dir, `original.${ext}`), originalBytes)
  } else {
    await putObject(mediumKey, medium.buffer, 'image/webp')
    await putObject(largeKey, large.buffer, 'image/webp')
    await putObject(originalKey, originalBytes, contentType)
  }

  const publicPhoto: PublicPhoto = {
    id: photo.id,
    filename: photo.filename,
    category: photo.category,
    title: photo.title,
    description: photo.description,
    metadata: photo.metadata,
    aspectRatio: photo.aspectRatio,
    variants: {
      medium: { url: `${IMAGES_BASE}/${mediumKey}`, width: medium.width, height: medium.height },
      large: { url: `${IMAGES_BASE}/${largeKey}`, width: large.width, height: large.height },
      original: { url: `${IMAGES_BASE}/${originalKey}`, width: originalW, height: originalH },
    },
  }

  const seedRecord: SeedRecord = {
    id: photo.id,
    content_hash: contentHash,
    category: photo.category,
    title: photo.title,
    filename: photo.filename,
    sort_order: sortOrder,
    aspect_ratio: photo.aspectRatio,
    medium_key: mediumKey,
    medium_w: medium.width,
    medium_h: medium.height,
    large_key: largeKey,
    large_w: large.width,
    large_h: large.height,
    original_key: originalKey,
    original_bytes: originalBytes.length,
    metadata: photo.metadata,
  }

  return { public: publicPhoto, seed: seedRecord }
}

async function main() {
  console.log(DRY_RUN ? '🧪 Dry run — no R2 uploads, writing variants to .migrate-dryrun/' : '🚀 Migrating photos to R2')
  if (LIMIT !== undefined) console.log(`   (limited to first ${LIMIT} photos)`)

  const data = frozenPhotos as FrozenData

  // Flatten while keeping per-category sort order computation, then respect --limit globally.
  let allPhotos: { photo: FrozenPhoto; sortOrder: number }[] = []
  for (const [category, photos] of Object.entries(data)) {
    const sortOrders = computeSortOrders(category, photos)
    for (const photo of photos) {
      allPhotos.push({ photo, sortOrder: sortOrders.get(photo.id)! })
    }
  }

  if (LIMIT !== undefined) allPhotos = allPhotos.slice(0, LIMIT)

  const publicByCategory: Record<string, PublicPhoto[]> = {}
  const seedRecords: SeedRecord[] = []
  const failures: { id: string; filename: string; error: string }[] = []

  let done = 0
  for (const { photo, sortOrder } of allPhotos) {
    try {
      const { public: pub, seed } = await migratePhoto(photo, sortOrder)
      if (!publicByCategory[photo.category]) publicByCategory[photo.category] = []
      publicByCategory[photo.category].push(pub)
      seedRecords.push(seed)
      done++
      console.log(`  ✅ [${done}/${allPhotos.length}] ${photo.category}/${photo.filename} (${photo.id})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ id: photo.id, filename: photo.filename, error: message })
      console.error(`  ❌ [${done + failures.length}/${allPhotos.length}] ${photo.category}/${photo.filename} (${photo.id}): ${message}`)
    }
  }

  await ensureDir(path.dirname(PUBLIC_OUT))
  await fs.writeFile(PUBLIC_OUT, JSON.stringify(publicByCategory, null, 2))
  await fs.writeFile(SEED_OUT, JSON.stringify(seedRecords, null, 2))

  console.log(`\n📄 Wrote ${PUBLIC_OUT}`)
  console.log(`📄 Wrote ${SEED_OUT}`)
  console.log(`\n✅ ${done} succeeded, ❌ ${failures.length} failed (of ${allPhotos.length} attempted)`)
  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f.id} ${f.filename}: ${f.error}`)
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
