/// <reference types="@cloudflare/workers-types" />

// Phase 3E-1: Worker admin API — D1 metadata + R2 blob writes.
//
// Routes (all mounted under /api/admin/*, already behind the Access+JWT gate
// in worker.ts by the time control reaches here):
//   GET    /api/admin/photos                    -- all rows, incl. draft + soft-deleted
//   POST   /api/admin/photos/:id/blob/:variant   -- raw bytes -> R2
//   POST   /api/admin/photos                     -- insert metadata row (commit step)
//   PATCH  /api/admin/photos/:id                 -- edit title/description/category/status
//   DELETE /api/admin/photos/:id                 -- soft-delete (deleted_at), keeps R2 objects
//   POST   /api/admin/photos/:id/restore          -- clear deleted_at (un-trash)
//   DELETE /api/admin/photos/:id/permanent        -- hard-delete: R2 objects + D1 row
//                                                    (only allowed on soft-deleted rows)
//
// See docs/phase-3e-plan.md ("3E-1") for the authoritative route schemas.

import type { Env } from './worker'
import type { AdminPhoto, PhotoCategory, PhotoInsert, PhotoOrderUpdate, PhotoStatus } from './types/photo'
import { CATEGORY_ORDER } from './config/images'

type Variant = 'medium' | 'large' | 'full' | 'original'

// D1 caps bound parameters per statement/batch well above this, but batching
// UPDATEs in chunks keeps each `env.DB.batch()` call comfortably small and
// bounds worst-case memory/latency for very large categories.
const ORDER_BATCH_CHUNK_SIZE = 50

// R2 puts are capped well below Workers' request-body limits; this just
// rejects obviously-wrong uploads early via the (client-supplied) Content-Length
// header. Not a hard security boundary -- R2/Workers enforce their own limits too.
const MAX_BLOB_BYTES = 100 * 1024 * 1024 // 100 MB, matches PLAN's "<100 MB" note

// `id` is 16 lowercase hex chars for new uploads (sha256(bytes) prefix), but the
// 83 seeded legacy rows carry their original 32-char MD5 id (see migrations/
// 0001_core.sql's `id` column comment) -- both are valid PKs already in D1, so
// PATCH/DELETE/blob must accept either length or every legacy photo 404s on
// every admin mutation (found while integration-testing 3E-2 against the
// seeded 83; fixed here since it blocks that verification entirely).
const ID_RE = /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/
const CONTENT_HASH_RE = /^[0-9a-f]{64}$/

function jsonError(error: string, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error, ...extra }, { status })
}

function isValidId(id: string): boolean {
  return ID_RE.test(id)
}

function isValidVariant(variant: string): variant is Variant {
  return variant === 'medium' || variant === 'large' || variant === 'full' || variant === 'original'
}

function isValidCategory(value: unknown): value is PhotoCategory {
  return typeof value === 'string' && (CATEGORY_ORDER as string[]).includes(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

/**
 * Maps a raw image Content-Type to the file extension used in the R2 key.
 * `medium`/`large` are always re-encoded to webp by the client, so their
 * extension is fixed; `original` keeps the uploaded format.
 */
function extForOriginal(contentType: string): string | null {
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg'
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return null
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && /unique constraint failed/i.test(err.message)
}

/**
 * Validates a `POST /api/admin/photos` body. Returns a list of human-readable
 * error strings; an empty list means the body is valid.
 */
function validatePhotoInsert(body: unknown): string[] {
  const errors: string[] = []
  if (typeof body !== 'object' || body === null) {
    return ['body must be a JSON object']
  }
  const b = body as Record<string, unknown>

  if (!isNonEmptyString(b.id) || !isValidId(b.id)) errors.push('id must be 16 lowercase hex chars')
  if (!isNonEmptyString(b.content_hash) || !CONTENT_HASH_RE.test(b.content_hash)) {
    errors.push('content_hash must be a full 64-char lowercase hex sha256')
  }
  if (!isValidCategory(b.category)) errors.push(`category must be one of: ${CATEGORY_ORDER.join(', ')}`)
  if (!isNonEmptyString(b.title)) errors.push('title must be a non-empty string')
  if (!isOptionalString(b.description)) errors.push('description must be a string')
  if (!isNonEmptyString(b.filename)) errors.push('filename must be a non-empty string')
  if (!isFiniteNumber(b.aspect_ratio) || b.aspect_ratio <= 0) errors.push('aspect_ratio must be a positive number')

  if (!isNonEmptyString(b.medium_key)) errors.push('medium_key must be a non-empty string')
  if (!isPositiveInt(b.medium_w)) errors.push('medium_w must be a positive integer')
  if (!isPositiveInt(b.medium_h)) errors.push('medium_h must be a positive integer')

  if (!isNonEmptyString(b.large_key)) errors.push('large_key must be a non-empty string')
  if (!isPositiveInt(b.large_w)) errors.push('large_w must be a positive integer')
  if (!isPositiveInt(b.large_h)) errors.push('large_h must be a positive integer')

  // full is optional/nullable -- backward-compatible with callers that
  // haven't been updated to send it yet.
  if (b.full_key !== undefined && b.full_key !== null && !isNonEmptyString(b.full_key)) {
    errors.push('full_key must be a non-empty string or null')
  }
  if (b.full_w !== undefined && b.full_w !== null && !isPositiveInt(b.full_w)) {
    errors.push('full_w must be a positive integer or null')
  }
  if (b.full_h !== undefined && b.full_h !== null && !isPositiveInt(b.full_h)) {
    errors.push('full_h must be a positive integer or null')
  }

  if (!isNonEmptyString(b.original_key)) errors.push('original_key must be a non-empty string')
  if (!isPositiveInt(b.original_bytes)) errors.push('original_bytes must be a positive integer')
  if (!isPositiveInt(b.original_w)) errors.push('original_w must be a positive integer')
  if (!isPositiveInt(b.original_h)) errors.push('original_h must be a positive integer')

  if (!isOptionalString(b.date_taken)) errors.push('date_taken must be a string')
  if (!isOptionalString(b.camera)) errors.push('camera must be a string')
  if (!isOptionalString(b.lens)) errors.push('lens must be a string')
  if (!isOptionalNumber(b.iso)) errors.push('iso must be a number')
  if (!isOptionalString(b.aperture)) errors.push('aperture must be a string')
  if (!isOptionalString(b.shutter_speed)) errors.push('shutter_speed must be a string')
  if (!isOptionalString(b.focal_length)) errors.push('focal_length must be a string')

  return errors
}

async function listPhotos(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM photos ORDER BY category ASC, sort_order ASC',
  ).all<AdminPhoto>()
  return Response.json({ photos: results ?? [] }, { status: 200 })
}

async function putBlob(request: Request, env: Env, id: string, variant: string): Promise<Response> {
  if (!isValidId(id)) return jsonError('invalid_id', 400)
  if (!isValidVariant(variant)) return jsonError('invalid_variant', 400)

  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > MAX_BLOB_BYTES) {
      return jsonError('too_large', 413)
    }
  }

  if (!request.body) return jsonError('missing_body', 400)

  const contentType = request.headers.get('content-type') ?? 'application/octet-stream'

  let ext: string | null
  let storedContentType: string
  if (variant === 'original') {
    ext = extForOriginal(contentType)
    storedContentType = contentType
  } else {
    // medium/large/full are always client-re-encoded to webp; reject anything
    // else so we never persist a wrong/attacker-controlled Content-Type on a
    // key that is served publicly as image/webp.
    ext = contentType.split(';')[0].trim().toLowerCase() === 'image/webp' ? 'webp' : null
    storedContentType = 'image/webp'
  }
  if (!ext) return jsonError('unsupported_content_type', 400)

  const key = `photos/${id}/${variant}.${ext}`

  await env.IMAGES.put(key, request.body, {
    httpMetadata: {
      contentType: storedContentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  return Response.json({ ok: true, key }, { status: 200 })
}

async function createPhoto(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('invalid_json', 400)
  }

  const errors = validatePhotoInsert(body)
  if (errors.length > 0) {
    return jsonError('validation', 400, { details: errors })
  }
  const input = body as PhotoInsert

  const maxOrderRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM photos WHERE category = ?',
  )
    .bind(input.category)
    .first<{ maxOrder: number }>()
  const sortOrder = (maxOrderRow?.maxOrder ?? -1) + 1

  const exifJson = input.exif_json !== undefined ? JSON.stringify(input.exif_json) : null

  try {
    await env.DB.prepare(
      `INSERT INTO photos (
        id, content_hash, category, title, description, filename, status, sort_order,
        medium_key, medium_w, medium_h, large_key, large_w, large_h,
        full_key, full_w, full_h, aspect_ratio,
        date_taken, camera, lens, iso, aperture, shutter_speed, focal_length, exif_json,
        original_key, original_bytes, original_w, original_h
      ) VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?)`,
    )
      .bind(
        input.id,
        input.content_hash,
        input.category,
        input.title,
        input.description ?? null,
        input.filename,
        'published' satisfies PhotoStatus,
        sortOrder,
        input.medium_key,
        input.medium_w,
        input.medium_h,
        input.large_key,
        input.large_w,
        input.large_h,
        input.full_key ?? null,
        input.full_w ?? null,
        input.full_h ?? null,
        input.aspect_ratio,
        input.date_taken ?? null,
        input.camera ?? null,
        input.lens ?? null,
        input.iso ?? null,
        input.aperture ?? null,
        input.shutter_speed ?? null,
        input.focal_length ?? null,
        exifJson,
        input.original_key,
        input.original_bytes,
        input.original_w,
        input.original_h,
      )
      .run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const existing = await env.DB.prepare('SELECT id, deleted_at FROM photos WHERE content_hash = ?')
        .bind(input.content_hash)
        .first<{ id: string; deleted_at: string | null }>()
      // `deleted` tells the client whether the blocking row is in the Trash --
      // the escape route is Restore or Delete-permanently, not re-upload.
      return jsonError('duplicate', 409, {
        existingId: existing?.id ?? null,
        deleted: !!existing?.deleted_at,
      })
    }
    throw err
  }

  const photo = await env.DB.prepare('SELECT * FROM photos WHERE id = ?')
    .bind(input.id)
    .first<AdminPhoto>()
  return Response.json({ photo }, { status: 201 })
}

async function updatePhoto(request: Request, env: Env, id: string): Promise<Response> {
  if (!isValidId(id)) return jsonError('invalid_id', 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('invalid_json', 400)
  }
  if (typeof body !== 'object' || body === null) return jsonError('validation', 400)
  const patch = body as Record<string, unknown>

  const setClauses: string[] = []
  const values: unknown[] = []

  if ('title' in patch) {
    if (!isNonEmptyString(patch.title)) return jsonError('validation', 400, { details: ['title must be a non-empty string'] })
    setClauses.push('title = ?')
    values.push(patch.title)
  }
  if ('description' in patch) {
    if (patch.description !== null && typeof patch.description !== 'string') {
      return jsonError('validation', 400, { details: ['description must be a string or null'] })
    }
    setClauses.push('description = ?')
    values.push(patch.description)
  }
  if ('category' in patch) {
    if (!isValidCategory(patch.category)) {
      return jsonError('validation', 400, { details: [`category must be one of: ${CATEGORY_ORDER.join(', ')}`] })
    }
    setClauses.push('category = ?')
    values.push(patch.category)
  }
  if ('status' in patch) {
    if (patch.status !== 'draft' && patch.status !== 'published') {
      return jsonError('validation', 400, { details: ['status must be "draft" or "published"'] })
    }
    setClauses.push('status = ?')
    values.push(patch.status)
  }

  if (setClauses.length === 0) {
    return jsonError('validation', 400, { details: ['no updatable fields provided'] })
  }

  setClauses.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  values.push(id)

  const result = await env.DB.prepare(`UPDATE photos SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()

  if (result.meta.changes === 0) {
    return jsonError('not_found', 404)
  }

  const photo = await env.DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<AdminPhoto>()
  return Response.json({ photo }, { status: 200 })
}

/**
 * Validates a `PUT /api/admin/photos/order` body. Returns a list of
 * human-readable error strings; an empty list means the body is valid.
 */
function validateOrderUpdate(body: unknown): string[] {
  const errors: string[] = []
  if (typeof body !== 'object' || body === null) {
    return ['body must be a JSON object']
  }
  const b = body as Record<string, unknown>

  if (!isValidCategory(b.category)) {
    errors.push(`category must be one of: ${CATEGORY_ORDER.join(', ')}`)
  }
  if (!Array.isArray(b.ids)) {
    errors.push('ids must be an array')
  } else if (!b.ids.every(isNonEmptyString)) {
    errors.push('ids must be an array of non-empty strings')
  }

  return errors
}

/**
 * Persists a new front-to-back order for one category: `sort_order` becomes
 * each id's index in `ids`. Runs as chunked `env.DB.batch()` calls -- each
 * batch is a single D1 round trip with an implicit transaction. The
 * `WHERE category = ?` guard means a stale id (already moved to another
 * category, or never existed) simply matches zero rows rather than
 * corrupting another category's ordering or failing the request.
 */
async function reorderPhotos(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('invalid_json', 400)
  }

  const errors = validateOrderUpdate(body)
  if (errors.length > 0) {
    return jsonError('validation', 400, { details: errors })
  }
  const { category, ids } = body as PhotoOrderUpdate

  let updated = 0
  for (let start = 0; start < ids.length; start += ORDER_BATCH_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + ORDER_BATCH_CHUNK_SIZE)
    const statements = chunk.map((id, i) =>
      env.DB.prepare(
        `UPDATE photos
         SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND category = ?`,
      ).bind(start + i, id, category),
    )
    const results = await env.DB.batch(statements)
    for (const result of results) updated += result.meta.changes
  }

  return Response.json({ ok: true, updated }, { status: 200 })
}

async function deletePhoto(env: Env, id: string): Promise<Response> {
  if (!isValidId(id)) return jsonError('invalid_id', 400)

  const result = await env.DB.prepare(
    `UPDATE photos
     SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  )
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return jsonError('not_found', 404)
  }

  return Response.json({ ok: true }, { status: 200 })
}

/**
 * Un-trashes a soft-deleted photo: clears `deleted_at` so the row is live
 * again and its `content_hash` once more represents an active photo. Safe to
 * call on a live row (no-op restore) -- only a missing id is an error.
 */
async function restorePhoto(env: Env, id: string): Promise<Response> {
  if (!isValidId(id)) return jsonError('invalid_id', 400)

  const result = await env.DB.prepare(
    `UPDATE photos
     SET deleted_at = NULL,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  )
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return jsonError('not_found', 404)
  }

  const photo = await env.DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<AdminPhoto>()
  return Response.json({ ok: true, photo }, { status: 200 })
}

/**
 * Hard-deletes a photo: removes its R2 objects AND the D1 row, freeing the
 * `content_hash` for a clean re-upload. Only allowed on rows that are already
 * soft-deleted -- a live photo must be trashed first (two-step guard so a
 * single click can never irreversibly destroy a live photo).
 */
async function permanentDeletePhoto(env: Env, id: string): Promise<Response> {
  if (!isValidId(id)) return jsonError('invalid_id', 400)

  const row = await env.DB.prepare(
    'SELECT deleted_at, medium_key, large_key, full_key, original_key FROM photos WHERE id = ?',
  )
    .bind(id)
    .first<{
      deleted_at: string | null
      medium_key: string
      large_key: string | null
      full_key: string | null
      original_key: string | null
    }>()

  if (!row) return jsonError('not_found', 404)
  if (!row.deleted_at) return jsonError('not_trashed', 409)

  // R2 first, D1 second: if the R2 delete fails we still have the row (and
  // can retry); a dangling row is recoverable, orphaned-but-unreferenced R2
  // objects after a lost row would not be.
  const keys = [row.medium_key, row.large_key, row.full_key, row.original_key].filter(
    (key): key is string => !!key,
  )
  if (keys.length > 0) {
    await env.IMAGES.delete(keys)
  }

  await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run()

  return Response.json({ ok: true }, { status: 200 })
}

/**
 * Routes `/api/admin/*` requests. Called from worker.ts only after the
 * Access+JWT gate (or the localhost dev bypass) has already authorized the
 * request -- this function assumes the caller is trusted.
 */
export async function handleAdminApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url
  const { method } = request

  if (pathname === '/api/admin/photos') {
    if (method === 'GET') return listPhotos(env)
    if (method === 'POST') return createPhoto(request, env)
    return jsonError('method_not_allowed', 405)
  }

  if (pathname === '/api/admin/photos/order') {
    if (method === 'PUT') return reorderPhotos(request, env)
    return jsonError('method_not_allowed', 405)
  }

  const blobMatch = pathname.match(/^\/api\/admin\/photos\/([^/]+)\/blob\/([^/]+)$/)
  if (blobMatch) {
    const [, id, variant] = blobMatch
    if (method !== 'POST') return jsonError('method_not_allowed', 405)
    return putBlob(request, env, id, variant)
  }

  const restoreMatch = pathname.match(/^\/api\/admin\/photos\/([^/]+)\/restore$/)
  if (restoreMatch) {
    if (method !== 'POST') return jsonError('method_not_allowed', 405)
    return restorePhoto(env, restoreMatch[1])
  }

  const permanentMatch = pathname.match(/^\/api\/admin\/photos\/([^/]+)\/permanent$/)
  if (permanentMatch) {
    if (method !== 'DELETE') return jsonError('method_not_allowed', 405)
    return permanentDeletePhoto(env, permanentMatch[1])
  }

  const idMatch = pathname.match(/^\/api\/admin\/photos\/([^/]+)$/)
  if (idMatch) {
    const [, id] = idMatch
    if (method === 'PATCH') return updatePhoto(request, env, id)
    if (method === 'DELETE') return deletePhoto(env, id)
    return jsonError('method_not_allowed', 405)
  }

  return jsonError('not_found', 404)
}
