/**
 * Phase 3E-3: upload processing Web Worker.
 *
 * Runs the CPU-heavy per-file pipeline off the main thread: sha256 id, upright
 * decode + downscale, webp encode (@jsquash/webp, WASM), EXIF extraction
 * (exifr). See docs/phase-3e-plan.md ("3E-3") for the authoritative pipeline.
 *
 * Type-checked by its own `tsc -p tsconfig.worker.json` program (see that
 * file) -- this file runs in a DedicatedWorkerGlobalScope, whose
 * `self`/`postMessage` typings (lib "WebWorker") conflict with the
 * main-thread DOM lib used by admin/main.ts if both were type-checked in the
 * same program, hence the split program instead of a same-program mix.
 *
 * Desktop Chromium/Firefox target only -- no Safari/HEIC fallback (see plan).
 */
/// <reference lib="webworker" />

// Import the encode submodule directly (not the `@jsquash/webp` barrel) so
// the unused `decode` codec (and its ~140 KB wasm) isn't pulled into the bundle.
import encodeWebp from '@jsquash/webp/encode'
import { parse as parseExif } from 'exifr'
import type {
  EncodedVariant,
  ExtractedMetadata,
  MainToWorkerMessage,
  OriginalVariant,
  ProcessedPhoto,
  WorkerToMainMessage,
} from './upload-types'

// Longest-side targets (matches sharp's `.resize(maxDim, maxDim, { fit: 'inside' })`
// used by migrate-to-r2.ts for the seeded 83), not raw widths -- see targetWidthFor().
const MEDIUM_MAX_DIM = 1200
const MEDIUM_QUALITY = 75
const LARGE_MAX_DIM = 2560
const LARGE_QUALITY = 80
// Native resolution (no resize), higher quality tier -- crisp full-res web
// viewing at a fraction of the original JPEG's size.
const FULL_QUALITY = 85

function post(message: WorkerToMainMessage, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) postMessage(message, transfer)
  else postMessage(message)
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Draws an upright, already-resized ImageBitmap into an OffscreenCanvas and reads back raw pixels. */
function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const drawCtx = canvas.getContext('2d')
  if (!drawCtx) throw new Error('2d context unavailable in worker')
  drawCtx.drawImage(bitmap, 0, 0)
  return drawCtx.getImageData(0, 0, bitmap.width, bitmap.height)
}

/**
 * Computes the resizeWidth to pass to createImageBitmap so the result matches
 * sharp's `.resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })`
 * (the behavior migrate-to-r2.ts uses for the seeded 83): scale by the longest
 * side, and never upscale a source smaller than `maxDim`.
 */
function targetWidthFor(originalWidth: number, originalHeight: number, maxDim: number): number {
  const scale = Math.min(1, maxDim / Math.max(originalWidth, originalHeight))
  return Math.round(originalWidth * scale)
}

/**
 * Upright decode + downscale to `targetWidth` (pre-computed by `targetWidthFor`
 * from the true original dimensions), encode to webp at `quality`. Closes the
 * intermediate bitmap. Logs (doesn't throw) if the decoded width drifts from
 * the request -- Chromium/Firefox honor resizeWidth exactly in practice, but
 * this is a cheap safety net per the plan.
 */
async function makeVariant(file: File, targetWidth: number, quality: number): Promise<EncodedVariant> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
    resizeWidth: targetWidth,
    resizeQuality: 'high',
  })
  try {
    if (Math.abs(bitmap.width - targetWidth) > 1) {
      console.warn(`[upload-worker] resized width ${bitmap.width} != requested ${targetWidth} for ${file.name}`)
    }
    const imageData = bitmapToImageData(bitmap)
    const encoded = await encodeWebp(imageData, { quality })
    return { bytes: encoded, width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

/**
 * Upright decode at NATIVE resolution (no resizeWidth), encode to webp at
 * `quality`. Used for the `full` variant -- crisp full-res web viewing.
 * Desktop Chromium target only; very large images are fine (no Safari cap
 * concern per the plan).
 */
async function makeFullVariant(file: File, quality: number): Promise<EncodedVariant> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const imageData = bitmapToImageData(bitmap)
    const encoded = await encodeWebp(imageData, { quality })
    return { bytes: encoded, width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

/** True (upright) pixel dimensions of the source file, for original_w/h + aspect_ratio. */
async function readOriginalDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

function extForContentType(contentType: string): string {
  if (contentType === 'image/png') return 'png'
  return 'jpg' // image/jpeg and any other accepted type default to .jpg
}

function formatAperture(fNumber: number | undefined): string | undefined {
  return typeof fNumber === 'number' ? `f/${fNumber}` : undefined
}

function formatShutterSpeed(exposureTime: number | undefined): string | undefined {
  if (typeof exposureTime !== 'number') return undefined
  return exposureTime < 1 ? `1/${Math.round(1 / exposureTime)}s` : `${exposureTime}s`
}

function formatFocalLength(focalLength: number | undefined): string | undefined {
  return typeof focalLength === 'number' ? `${focalLength}mm` : undefined
}

async function extractMetadata(file: File): Promise<{ metadata: ExtractedMetadata; exifJson: unknown }> {
  try {
    const exif = await parseExif(file, {
      pick: ['DateTimeOriginal', 'Model', 'LensModel', 'ISO', 'FNumber', 'ExposureTime', 'FocalLength'],
    })
    if (!exif) return { metadata: {}, exifJson: null }
    const metadata: ExtractedMetadata = {
      dateTaken: exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toISOString() : undefined,
      camera: exif.Model || undefined,
      lens: exif.LensModel || undefined,
      iso: typeof exif.ISO === 'number' ? exif.ISO : undefined,
      aperture: formatAperture(exif.FNumber),
      shutterSpeed: formatShutterSpeed(exif.ExposureTime),
      focalLength: formatFocalLength(exif.FocalLength),
    }
    return { metadata, exifJson: exif }
  } catch (err) {
    console.warn(`[upload-worker] EXIF parse failed for ${file.name}:`, err)
    return { metadata: {}, exifJson: null }
  }
}

async function processFile(file: File, existingIds: string[]): Promise<
  { kind: 'duplicate'; id: string } | { kind: 'ok'; photo: ProcessedPhoto }
> {
  const buf = await file.arrayBuffer()
  const contentHash = await sha256Hex(buf)
  const id = contentHash.slice(0, 16)

  if (existingIds.includes(id)) {
    return { kind: 'duplicate', id }
  }

  // Read the true upright original dimensions first so each variant's target
  // width can be computed longest-side (matches sharp's fit:'inside') and
  // clamped against upscaling small sources (matches withoutEnlargement).
  const [original, { metadata, exifJson }] = await Promise.all([
    readOriginalDimensions(file),
    extractMetadata(file),
  ])

  const mediumWidth = targetWidthFor(original.width, original.height, MEDIUM_MAX_DIM)
  const largeWidth = targetWidthFor(original.width, original.height, LARGE_MAX_DIM)

  const [medium, large, full] = await Promise.all([
    makeVariant(file, mediumWidth, MEDIUM_QUALITY),
    makeVariant(file, largeWidth, LARGE_QUALITY),
    makeFullVariant(file, FULL_QUALITY),
  ])

  const contentType = file.type || 'image/jpeg'
  const originalVariant: OriginalVariant = {
    bytes: buf,
    width: original.width,
    height: original.height,
    contentType,
    ext: extForContentType(contentType),
  }

  const photo: ProcessedPhoto = {
    id,
    contentHash,
    filename: file.name,
    aspectRatio: original.width / original.height,
    medium,
    large,
    full,
    original: originalVariant,
    metadata,
    exifJson,
  }
  return { kind: 'ok', photo }
}

addEventListener('message', async (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data
  if (msg.type !== 'process') return
  const { jobId, file, existingIds } = msg

  try {
    const result = await processFile(file, existingIds)
    if (result.kind === 'duplicate') {
      post({ type: 'duplicate', jobId, id: result.id })
      return
    }
    const { photo } = result
    // Transfer the raw byte buffers instead of structured-cloning them.
    const transfer: Transferable[] = [
      photo.medium.bytes,
      photo.large.bytes,
      photo.full.bytes,
      photo.original.bytes,
    ]
    post({ type: 'result', jobId, photo }, transfer)
  } catch (err) {
    post({ type: 'error', jobId, message: err instanceof Error ? err.message : String(err) })
  }
})
