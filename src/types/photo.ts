export type PhotoCategory =
  // 'highlights' is a synthetic gallery: never stored in photos.category
  // (isValidCategory validates against CATEGORY_ORDER, which excludes it) --
  // the public API materializes it from rows with is_highlight = 1.
  | 'highlights'
  | 'wildlife'
  | 'bird'
  | 'landscape'
  | 'portrait'
  | 'concert'
  | 'architecture'
  | 'nature'
  | 'product'
  | 'astro'
  | 'sports'
  | 'cat'
  | 'street'
  | 'about'
  | 'projects'

export interface PhotoMetadata {
  camera?: string
  lens?: string
  iso?: number
  aperture?: string
  shutterSpeed?: string
  focalLength?: string
  dateTaken?: string
  location?: string
}

export interface ImageVariant {
  url: string
  width: number
  height: number
  // Not populated by the D1-backed /api/photos response (Phase 3G) or the
  // legacy baked photos.json -- neither carries a per-variant format, and
  // nothing in the front-end reads it. Kept optional rather than removed in
  // case a future caller wants it.
  format?: 'webp' | 'avif' | 'jpg' | 'jpeg' | 'png'
}

export interface Photo {
  id: string
  filename: string
  category: PhotoCategory
  title?: string
  description?: string
  metadata: PhotoMetadata
  variants: {
    medium: ImageVariant
    large: ImageVariant
    original: ImageVariant
    // Native-resolution webp (Phase 3E-4 / 3G). Omitted by the API when the
    // photo hasn't been backfilled with a `full` variant yet (full_key IS
    // NULL in D1) -- callers must fall back to `large`/`original`.
    full?: ImageVariant
  }
  aspectRatio: number
}

export interface Gallery {
  category: PhotoCategory
  displayName: string
  description?: string
  photos: Photo[]
  coverPhoto?: Photo
}

// ---------------------------------------------------------------------------
// Admin API DTOs (Phase 3E-1) — full D1 `photos` row shape, snake_case to
// mirror the schema (migrations/0001_core.sql) directly. This is NOT the
// public projection: admin sees `content_hash`, `deleted_at`, `status`, etc.
// that the public `/api/photos` endpoint (3G) must strip before shipping.
// Exported so the 3E-2/3E-3 front-end phases can reuse these shapes.
// ---------------------------------------------------------------------------

export type PhotoStatus = 'draft' | 'published'

/** Full row shape of the `photos` D1 table, as returned by the admin API. */
export interface AdminPhoto {
  id: string
  content_hash: string | null
  category: PhotoCategory
  title: string
  description: string | null
  filename: string
  status: PhotoStatus
  deleted_at: string | null
  sort_order: number
  /** 0/1 -- SQLite has no boolean. 1 = part of the synthetic highlights gallery. */
  is_highlight: number
  /** Ordering within the highlights gallery, independent of `sort_order`. */
  highlight_order: number

  medium_key: string
  medium_w: number
  medium_h: number
  large_key: string | null
  large_w: number | null
  large_h: number | null
  full_key: string | null
  full_w: number | null
  full_h: number | null
  aspect_ratio: number

  date_taken: string | null
  camera: string | null
  lens: string | null
  iso: number | null
  aperture: string | null
  shutter_speed: string | null
  focal_length: string | null
  location: string | null
  orientation: number | null
  exif_json: string | null

  original_key: string | null
  original_bytes: number | null
  original_w: number
  original_h: number

  created_at: string
  updated_at: string
}

/** Body of `POST /api/admin/photos` — the metadata commit step after the 3 blobs are uploaded. */
export interface PhotoInsert {
  id: string
  content_hash: string
  category: PhotoCategory
  title: string
  description?: string
  filename: string
  aspect_ratio: number

  medium_key: string
  medium_w: number
  medium_h: number
  large_key: string
  large_w: number
  large_h: number

  full_key?: string | null
  full_w?: number | null
  full_h?: number | null

  original_key: string
  original_bytes: number
  original_w: number
  original_h: number

  date_taken?: string
  camera?: string
  lens?: string
  iso?: number
  aperture?: string
  shutter_speed?: string
  focal_length?: string
  exif_json?: unknown
}

/** Body of `PATCH /api/admin/photos/:id`. */
export interface PhotoPatch {
  title?: string
  description?: string | null
  location?: string | null
  category?: PhotoCategory
  status?: PhotoStatus
  is_highlight?: boolean
  // EXIF-ish metadata fields. `''` or `null` clears the column.
  date_taken?: string | null
  camera?: string | null
  lens?: string | null
  iso?: number | string | null
  aperture?: string | null
  shutter_speed?: string | null
  focal_length?: string | null
}

/**
 * Body of `PUT /api/admin/photos/order` (Phase 3F) — the full ordered list of
 * live ids for one category, front-to-back. `sort_order` is set to each id's
 * index in `ids`.
 */
export interface PhotoOrderUpdate {
  category: PhotoCategory
  ids: string[]
}

/**
 * Body of `PUT /api/admin/photos/highlights/order` — the full ordered list of
 * highlighted ids, front-to-back. `highlight_order` is set to each id's index.
 */
export interface HighlightOrderUpdate {
  ids: string[]
}