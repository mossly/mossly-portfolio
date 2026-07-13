/**
 * Phase 3B: generate migrations/seed.sql from src/data/photos.seed.json,
 * joining original pixel dimensions from src/data/photos.json (the only
 * source that carries them).
 *
 * Run: npm run db:seed:gen
 *
 * IMPORTANT: this script only writes a local .sql file. It never touches
 * a remote or local D1 database itself — applying seed.sql is a separate,
 * explicit step (`wrangler d1 execute ... --file=migrations/seed.sql`).
 */
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import seedPhotos from '../src/data/photos.seed.json'
import publicPhotos from '../src/data/photos.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const OUTPUT_PATH = path.join(REPO_ROOT, 'scripts', 'seed.sql')

interface SeedPhoto {
  id: string
  content_hash: string
  category: string
  title: string
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
  metadata: Record<string, unknown> & {
    dateTaken?: string
    camera?: string
    lens?: string
    iso?: number
    aperture?: string
    shutterSpeed?: string
    focalLength?: string
  }
}

interface PublicVariant {
  url: string
  width: number
  height: number
}

interface PublicPhoto {
  id: string
  variants: {
    medium: PublicVariant
    large?: PublicVariant
    original: PublicVariant
  }
}

type PublicPhotosByCategory = Record<string, PublicPhoto[]>

const COLUMNS = [
  'id',
  'content_hash',
  'category',
  'title',
  'filename',
  'status',
  'sort_order',
  'medium_key',
  'medium_w',
  'medium_h',
  'large_key',
  'large_w',
  'large_h',
  'aspect_ratio',
  'date_taken',
  'camera',
  'lens',
  'iso',
  'aperture',
  'shutter_speed',
  'focal_length',
  'exif_json',
  'original_key',
  'original_bytes',
  'original_w',
  'original_h',
] as const

/** Escape a SQL string literal by doubling embedded single quotes. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlStringOrNull(value: string | null | undefined): string {
  return value === null || value === undefined ? 'NULL' : sqlString(value)
}

function sqlNumberOrNull(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'NULL'
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite numeric value encountered: ${value}`)
  }
  return String(value)
}

function sqlNumber(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected finite number, got: ${JSON.stringify(value)}`)
  }
  return String(value)
}

async function main(): Promise<void> {
  const seed = seedPhotos as SeedPhoto[]
  const byCategory = publicPhotos as PublicPhotosByCategory

  // Build a lookup of id -> original {width, height} across all categories.
  const originalDimsById = new Map<string, { width: number; height: number }>()
  for (const category of Object.keys(byCategory)) {
    for (const photo of byCategory[category]) {
      const original = photo.variants?.original
      if (original && typeof original.width === 'number' && typeof original.height === 'number') {
        originalDimsById.set(photo.id, { width: original.width, height: original.height })
      }
    }
  }

  const missing: string[] = []
  const rows: string[] = []

  for (const photo of seed) {
    const dims = originalDimsById.get(photo.id)
    if (!dims) {
      missing.push(photo.id)
      continue
    }

    const meta = photo.metadata ?? {}
    const dateTaken = meta.dateTaken ?? null

    const values = [
      sqlString(photo.id),
      sqlString(photo.content_hash),
      sqlString(photo.category),
      sqlString(photo.title),
      sqlString(photo.filename),
      sqlString('published'),
      sqlNumber(photo.sort_order),
      sqlString(photo.medium_key),
      sqlNumber(photo.medium_w),
      sqlNumber(photo.medium_h),
      sqlStringOrNull(photo.large_key),
      sqlNumberOrNull(photo.large_w),
      sqlNumberOrNull(photo.large_h),
      sqlNumber(photo.aspect_ratio),
      sqlStringOrNull(dateTaken),
      sqlStringOrNull(meta.camera),
      sqlStringOrNull(meta.lens),
      sqlNumberOrNull(meta.iso),
      sqlStringOrNull(meta.aperture),
      sqlStringOrNull(meta.shutterSpeed),
      sqlStringOrNull(meta.focalLength),
      sqlString(JSON.stringify(meta)),
      sqlStringOrNull(photo.original_key),
      sqlNumberOrNull(photo.original_bytes),
      sqlNumber(dims.width),
      sqlNumber(dims.height),
    ]

    rows.push(
      `INSERT OR REPLACE INTO photos (${COLUMNS.join(', ')})\nVALUES (${values.join(', ')});`
    )
  }

  if (missing.length > 0) {
    throw new Error(
      `${missing.length} photo(s) from photos.seed.json are missing from photos.json (or lack ` +
        `variants.original.width/height): ${missing.join(', ')}`
    )
  }

  if (rows.length !== seed.length) {
    throw new Error(
      `Expected ${seed.length} INSERT statements, generated ${rows.length}. Aborting write.`
    )
  }

  const header = `-- GENERATED FILE — do not edit by hand.
-- Regenerate via: npm run db:seed:gen  (scripts/seed-d1.ts)
--
-- Seeds the 83 legacy photos into the D1 \`photos\` table (schema:
-- migrations/0001_core.sql, Phase 3A). Idempotency strategy: INSERT OR
-- REPLACE keyed on the \`id\` primary key, so re-applying this file is safe
-- and simply overwrites existing rows with the same content.
--
-- This file lives OUTSIDE migrations/ on purpose: wrangler's
-- migrations_dir is "migrations", so a seed there would be swept up by
-- \`wrangler d1 migrations apply\`. Apply the seed explicitly via --file,
-- NEVER via migrations apply, e.g.:
--   wrangler d1 execute mossly-content --local --file=scripts/seed.sql
--   wrangler d1 execute mossly-content --remote --file=scripts/seed.sql
`

  // No BEGIN/COMMIT wrapper: D1's `wrangler d1 execute --file` runs the whole file
  // atomically and rejects explicit BEGIN/SAVEPOINT statements on --remote.
  const sql = `${header}\n${rows.join('\n\n')}\n`

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, sql, 'utf8')

  console.log(`Wrote ${rows.length} INSERT statements to ${path.relative(REPO_ROOT, OUTPUT_PATH)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
