# Phase 3E — Detailed execution plan (browser upload admin)

Workflow-ready decomposition of the admin upload feature. Hand each sub-unit (3E-1/2/3) to a
subagent as its own PR. Reconciled with two owner decisions (2026-07-13):

- **Desktop-only.** Owner is a professional photographer uploading **curated JPEG exports from a
  Windows desktop** (Chrome/Edge). All mobile/iOS-Safari/HEIC handling from the original PLAN is
  **dropped** — no phone DoD, no Safari canvas footgun workarounds, no `libheif`.
- **Fully serverless.** No new TrueNAS service. The Cloudflare **Worker** is the backend; **R2** =
  image bytes, **D1** = metadata. Pocket ID (on TrueNAS) is auth only, already live. The admin page +
  image processing run in the **browser**; only writes go through the Worker.

Prereqs already shipped: 3A (D1 schema, incl. `deleted_at`), 3B (83 seeded), 3C (Access/Pocket ID),
3D (Worker JWT gate on `/api/admin/*`, currently returning a `501` stub after auth passes).

---

## Sub-unit map (3 PRs)

```
3E-1  Worker admin API + D1/R2 wiring   (backend; defines the contract)   ──┐
                                                                            ├─ must land first
3E-2  Admin page shell + management UI  (read / edit / publish / delete)  ──┤   then B in parallel
3E-3  Client upload pipeline           (decode → webp → upload)           ──┘
```
Workflow: **3E-1 first** (contract), then **3E-2 ‖ 3E-3** in parallel against that contract
(worktree-isolated). Review each; Fable-review 3E-3 (encoding/orientation footguns). Merge order
3E-1 → 3E-2 → 3E-3, deploy, run the desktop DoD (§DoD).

---

## Locked defaults (set so this is dispatch-ready; flip only if you disagree)

| Decision | Default | Why |
|---|---|---|
| webp quality | medium **q75 @ 1200px**, large **q80 @ 2560px** | matches `migrate-to-r2.ts` — the 83 already use these |
| Encoder | **`@jsquash/webp`** (WASM, in a Web Worker) | consistent, tunable quality > `canvas.toBlob` (native encoder varies); Safari-safety no longer the reason but quality still is |
| Accepted inputs | **JPEG + PNG** | pro exports JPEG; `createImageBitmap` can't decode TIFF/RAW anyway |
| Delete | **soft-delete** (`deleted_at` timestamp, keep R2 objects) | R2 has no versioning; retained objects are the undo. Restore route: **defer** (manual D1 `UPDATE deleted_at=NULL` suffices for now) |
| Dedup | client pre-check vs loaded grid ids **+** server 409 on `content_hash` | cheap client guard; server is the authority |

---

## 3E-1 — Worker admin API + D1/R2 wiring (backend, no UI)

**Files:** `src/worker.ts` (replace the `501` stub with a router for `/api/admin/*`, keeping the existing
auth gate + localhost bypass in front), a new `src/admin-api.ts` (handlers), `src/types/photo.ts`
(shared DTOs). Set `IMAGES: R2Bucket` in the `Env` interface (currently `unknown`).

**R2 keys** (unchanged from PLAN §2C): `photos/<id>/{medium,large}.webp`, `photos/<id>/original.<ext>`.
All `put`s use `httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' }`.

### Routes (all behind Access + Worker JWT; `:id` = 16-hex, validate)

**`GET /api/admin/photos`** — admin grid; returns **all** rows incl. `draft` + soft-deleted.
- 200 `{ photos: AdminPhoto[] }` — full row shape (admin sees `content_hash`, `deleted_at`, `status`, etc.; this is NOT the public projection).

**`POST /api/admin/photos/:id/blob/:variant`** — raw image bytes → R2. `variant ∈ {medium,large,original}`.
- Request body = raw bytes; `Content-Type: image/webp` (medium/large) or the original's type (e.g. `image/jpeg`).
- Handler: `env.IMAGES.put('photos/'+id+'/'+variant+'.'+ext, request.body, {...immutable...})`. `ext` = `webp` for variants; derive `jpg`/`png` from content-type for `original`.
- 200 `{ ok:true, key }` · 400 bad id/variant · 413 over size limit. Idempotent (id=content-hash → identical bytes overwrite the same key harmlessly).

**`POST /api/admin/photos`** — insert the metadata row (the commit step).
- Body `PhotoInsert` (JSON): `id, content_hash (full sha256), category, title, description?, filename, aspect_ratio, medium_key, medium_w, medium_h, large_key, large_w, large_h, original_key, original_bytes, original_w, original_h, date_taken?, camera?, lens?, iso?, aperture?, shutter_speed?, focal_length?, exif_json?`.
- Handler: validate `category` against the single-source category list (PLAN 1F); `sort_order = (SELECT COALESCE(MAX(sort_order),-1)+1 FROM photos WHERE category=?)`; `status='published'`; INSERT.
- 201 `{ photo: AdminPhoto }` · **409 `{ error:'duplicate', existingId }`** if `content_hash` UNIQUE conflict · 400 validation.

**`PATCH /api/admin/photos/:id`** — edit `{ title?, description?, category?, status? }`; `updated_at=now`.
- 200 `{ photo }` · 404 absent.

**`DELETE /api/admin/photos/:id`** — soft-delete: `SET deleted_at = strftime(...,'now')`. Keep R2 objects.
- 200 `{ ok:true }` · 404 absent. (Public `/api/photos` in 3G filters `deleted_at IS NULL AND status='published'`.)

### Verification (wrangler dev — Miniflare D1+R2, localhost JWT bypass)
Document a curl sequence in the PR: POST blob → confirm object via `env.IMAGES.get`; POST metadata → row in local D1; re-POST same `content_hash` → **409**; GET lists it; PATCH mutates; DELETE sets `deleted_at`. No `--remote`, no deploy.

---

## 3E-2 — Admin page shell + management UI (read / edit / publish / delete)

**Files:** `admin/index.html`, `admin/main.ts` (+ styles). Add `admin: path.resolve(__dirname,'admin/index.html')`
to `vite.config.ts` `rollupOptions.input` (built path `/admin/` → matches the Access scope). **Do NOT**
add `/admin/*` to `run_worker_first` (static asset; only `/api/admin/*` is Worker code).

**Behavior:**
- On load, `fetch('/api/admin/photos')` — the browser already carries the Access session (page is behind
  Access), so the request is authorized automatically. Render a grid **grouped by category**, visually
  distinguishing `draft` and soft-deleted rows.
- Per-photo actions: edit title/description/category → `PATCH`; publish/unpublish toggle → `PATCH {status}`;
  delete → `DELETE` behind an **in-page confirm** (NOT `window.confirm()` — native dialogs block/annoy).
- Reuse Tailwind/DaisyUI; functional over fancy. **No image processing here** (that's 3E-3) — this PR can
  ship with a placeholder "Upload" area that 3E-3 fills in.

**Verification:** `wrangler dev`; open `/admin` on localhost; grid renders the seeded 83; edit a title →
persists on reload; toggle publish; soft-delete moves a row to the deleted state.

---

## 3E-3 — Client-side upload pipeline (image processing + upload)

**Deps (browser):** `@jsquash/webp`, `exifr`. **Files:** `admin/upload-worker.ts` (Web Worker — CPU work
off the main thread), upload orchestration in `admin/main.ts`.

**Per-file pipeline (in the Web Worker):**
1. `const buf = await file.arrayBuffer()`; `content_hash = hex(SHA-256(buf))` (via `crypto.subtle.digest`);
   `id = content_hash.slice(0,16)`.
2. **Client dedup pre-check:** if `id` ∈ the grid's loaded ids → report `duplicate`, skip processing
   (server still enforces 409 as the authority).
3. **Upright decode + downscale:** `createImageBitmap(file, { imageOrientation:'from-image', resizeWidth:2560, resizeQuality:'high' })`
   for `large`; a second decode at `resizeWidth:1200` for `medium`. Pixels come out upright — do **not**
   also apply exifr rotation. `bitmap.close()` between variants. (Desktop Chromium/Firefox support the
   resize options; keep a light assertion `bitmap.width ≈ requested` and log if off — no stepped-canvas
   fallback needed since Safari is out of scope.)
4. **Original dimensions:** capture from a metadata-only read (`exifr` `ImageWidth`/`ImageHeight`) or a
   no-resize `createImageBitmap` — needed for `original_w/_h`. `aspect_ratio = original_w/original_h`.
5. **Encode** `medium` (q75) and `large` (q80) with `@jsquash/webp` `encode()`.
6. **EXIF:** `exifr.parse(file, { pick:['DateTimeOriginal','Model','LensModel','ISO','FNumber','ExposureTime','FocalLength'] })`
   → map to `{ dateTaken, camera, lens, iso, aperture, shutterSpeed, focalLength }` (same fields the 83 seed
   carries). Keep the full parsed object for `exif_json`.

**Main-thread orchestration:**
- Drag-drop zone + file input (`accept="image/jpeg,image/png"`, multi-file). A queue with **per-file state**:
  `processing → uploading → done | duplicate | error`.
- Per processed file: `POST` the 3 blobs (`medium`, `large`, `original`) → then `POST /api/admin/photos`
  (metadata). On **409** mark `duplicate`; on 201 prepend the returned row to the grid (no reload/redeploy).
- Surface errors per-file; a failed blob upload leaves no D1 row (metadata POST is last), so retry is clean.

**Verification (owner's actual desktop browser — Chrome/Edge on Windows — via `wrangler dev`):**
- Drag a real exported JPEG → 3 objects at `photos/<id>/{medium,large}.webp` + `original.jpg` in local R2,
  one D1 row, appears in the grid.
- Re-drag the same file → `duplicate` (client warn + server 409), no dup objects/rows.
- A **portrait** JPEG → variants are stored **upright** (check webp dimensions orient correctly).
- Batch of ~10 → all process without freezing the UI (Web Worker keeps the main thread responsive).

---

## Definition of done (replaces the old phone DoD — GATING)

**Desktop, no terminal, no redeploy:** owner opens `mossly.org/admin` (Pocket ID passkey login) →
drags a folder's worth of exported JPEGs → they process in-browser, upload, and appear in the **public**
gallery after 3G — in one sitting, from the workstation. (Until 3G flips the public read, "appears in the
public gallery" is validated against the admin grid + a manual `/api/photos` check.)

---

## After 3E
- **3F** — reorder in the admin (SortableJS → `PUT /api/admin/photos/order` → single `db.batch` of `sort_order` updates). Small; can fold into 3E-2's UI or its own PR.
- **3G** — flip the public front-end from baked `photos.json` to `await fetch('/api/photos')` (see main plan; the only user-facing change; parity-diff before flip).
- **3I** — retire `sharp`, `process-images.ts`, `/__order`, and the static JSON once D1 is the proven source of truth.
