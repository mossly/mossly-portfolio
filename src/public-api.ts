/// <reference types="@cloudflare/workers-types" />

// Phase 3G: public read endpoint -- GET /api/photos. No auth (unlike
// admin-api.ts's /api/admin/* routes); this is the data path the front-end
// gallery fetches at runtime instead of importing the baked src/data/photos.json.
//
// Response shape MUST stay byte-shape-compatible with src/data/photos.json --
// gallery-manager.ts casts the fetched body straight to
// `Record<PhotoCategory, Photo[]>`. See docs/phase-3-plan.md ("3G" and its
// "/api/photos response shape") for the authoritative contract.

import type { Env } from './worker'
import type { AdminPhoto, ImageVariant, Photo, PhotoCategory, PhotoMetadata } from './types/photo'

// The projection pulled from D1 -- an explicit column list (not `SELECT *`)
// so admin-only columns (content_hash, original_bytes, status, deleted_at,
// exif_json, orientation, location, created_at/updated_at, sort_order) can
// never leak into the public response even if AdminPhoto grows a column later.
type PublicPhotoRow = Pick<
  AdminPhoto,
  | 'id'
  | 'category'
  | 'title'
  | 'description'
  | 'filename'
  | 'aspect_ratio'
  | 'medium_key'
  | 'medium_w'
  | 'medium_h'
  | 'large_key'
  | 'large_w'
  | 'large_h'
  | 'full_key'
  | 'full_w'
  | 'full_h'
  | 'original_key'
  | 'original_w'
  | 'original_h'
  | 'date_taken'
  | 'camera'
  | 'lens'
  | 'iso'
  | 'aperture'
  | 'shutter_speed'
  | 'focal_length'
>

const PUBLIC_COLUMNS = [
  'id',
  'category',
  'title',
  'description',
  'filename',
  'aspect_ratio',
  'medium_key',
  'medium_w',
  'medium_h',
  'large_key',
  'large_w',
  'large_h',
  'full_key',
  'full_w',
  'full_h',
  'original_key',
  'original_w',
  'original_h',
  'date_taken',
  'camera',
  'lens',
  'iso',
  'aperture',
  'shutter_speed',
  'focal_length',
].join(', ')

function variantUrl(imagesBase: string, key: string): string {
  return `${imagesBase}/${key}`
}

/**
 * Maps one D1 row (public projection) to the public `Photo` shape consumed
 * by the front-end. `full` is included only when `full_key` is populated --
 * rows not yet backfilled with the native-res variant simply omit it, and
 * the lightbox falls back to `large`/`original` (see lightbox.ts).
 */
function toPublicPhoto(row: PublicPhotoRow, imagesBase: string): Photo {
  const variants: Photo['variants'] = {
    medium: {
      url: variantUrl(imagesBase, row.medium_key),
      width: row.medium_w,
      height: row.medium_h,
    },
    large: {
      url: variantUrl(imagesBase, row.large_key ?? row.medium_key),
      width: row.large_w ?? row.medium_w,
      height: row.large_h ?? row.medium_h,
    },
    original: {
      url: variantUrl(imagesBase, row.original_key ?? row.medium_key),
      width: row.original_w,
      height: row.original_h,
    },
  }

  if (row.full_key) {
    const full: ImageVariant = {
      url: variantUrl(imagesBase, row.full_key),
      width: row.full_w ?? row.original_w,
      height: row.full_h ?? row.original_h,
    }
    variants.full = full
  }

  const metadata: PhotoMetadata = {}
  if (row.date_taken) metadata.dateTaken = row.date_taken
  if (row.camera) metadata.camera = row.camera
  if (row.lens) metadata.lens = row.lens
  if (row.iso !== null) metadata.iso = row.iso
  if (row.aperture) metadata.aperture = row.aperture
  if (row.shutter_speed) metadata.shutterSpeed = row.shutter_speed
  if (row.focal_length) metadata.focalLength = row.focal_length

  return {
    id: row.id,
    filename: row.filename,
    category: row.category,
    title: row.title || undefined,
    description: row.description ?? undefined,
    metadata,
    variants,
    aspectRatio: row.aspect_ratio,
  }
}

/**
 * `GET /api/photos` -- all published, non-deleted photos, grouped by
 * category, ordered by `sort_order` within each category. Public, no auth
 * (mounted before the `/api/admin/*` gate in worker.ts).
 *
 * Cache-Control is short (60s): admin edits (publish/delete/reorder) should
 * surface on the public site without a redeploy, so we don't want a stale
 * CDN/browser cache masking that for long.
 */
export async function handlePublicPhotos(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLUMNS} FROM photos
     WHERE deleted_at IS NULL AND status = 'published'
     ORDER BY category ASC, sort_order ASC`,
  ).all<PublicPhotoRow>()

  const grouped: Partial<Record<PhotoCategory, Photo[]>> = {}
  for (const row of results ?? []) {
    const category = row.category
    const photo = toPublicPhoto(row, env.IMAGES_BASE)
    if (!grouped[category]) grouped[category] = []
    grouped[category]!.push(photo)
  }

  return Response.json(grouped, {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=60' },
  })
}
