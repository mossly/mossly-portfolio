// Phase 3E-3: message protocol shared between admin/main.ts (main thread) and
// admin/upload-worker.ts (Web Worker). Kept in its own file, with no DOM- or
// WebWorker-scope globals, so both sides can import it without pulling
// worker-only lib types into the main-thread type-check (see tsconfig.json's
// `exclude` note for why upload-worker.ts itself is excluded from `tsc`).

/** A single resized+encoded raster variant produced by the worker. */
export interface EncodedVariant {
  bytes: ArrayBuffer
  width: number
  height: number
}

/** The original file's bytes, passed through untouched (no re-encode). */
export interface OriginalVariant {
  bytes: ArrayBuffer
  width: number
  height: number
  contentType: string
  /** File extension (no dot) derived from contentType, e.g. "jpg", "png". */
  ext: string
}

/** EXIF fields mapped to the same shape the 83 seeded photos carry. */
export interface ExtractedMetadata {
  dateTaken?: string
  camera?: string
  lens?: string
  iso?: number
  aperture?: string
  shutterSpeed?: string
  focalLength?: string
}

/** Full processing result for one file, ready to upload. */
export interface ProcessedPhoto {
  id: string
  contentHash: string
  filename: string
  aspectRatio: number
  medium: EncodedVariant
  large: EncodedVariant
  /** Native-resolution webp (quality 85) -- crisp full-res web viewing. */
  full: EncodedVariant
  original: OriginalVariant
  metadata: ExtractedMetadata
  /** Full parsed EXIF object (for the `exif_json` column), or null if unreadable. */
  exifJson: unknown
}

/** Main thread -> worker: process one file. `jobId` is a main-thread-assigned
 * tracking id (not the photo id, which isn't known until the hash is computed). */
export interface ProcessJobMessage {
  type: 'process'
  jobId: string
  file: File
  /** Snapshot of ids already known to the grid, for the client dedup pre-check. */
  existingIds: string[]
}

export type MainToWorkerMessage = ProcessJobMessage

export type WorkerToMainMessage =
  | { type: 'duplicate'; jobId: string; id: string }
  | { type: 'error'; jobId: string; message: string }
  | { type: 'result'; jobId: string; photo: ProcessedPhoto }
