# Phase 3 — Execution Plan (D1 + Access + browser-upload admin + live `/api/photos`)

Derived from `PLAN.md` Phase 3, reconciled against the actual repo state (2026-07-12).
**Goal:** terminal-free photo uploads from a phone (owner DoD 3H). D1 becomes the content
source of truth; an authenticated `/admin/*` page generates variants client-side and uploads
through the Worker; the public front-end flips from baked JSON to live `/api/photos`.

**Verified starting state**
- Phase 2 fully live: `mossly.org` → Worker (200), originals removed, tag `pre-r2-cutover`.
- `src/data/photos.seed.json` = **83 records, full D1-ready shape** (id=frozen md5, `content_hash`,
  `category`, `title`, `filename`, `sort_order`, `aspect_ratio`, `{medium,large,original}_key` + dims,
  `original_bytes`, `metadata.dateTaken`). Seed is pre-baked — no regeneration needed.
- `src/worker.ts`: `/api/*` is a JSON stub. `wrangler.jsonc`: `run_worker_first:["/api/*"]`,
  `IMAGES` R2 binding, `IMAGES_BASE` var. No D1 binding, no `migrations/` yet.
- Front-end still imports `src/data/photos.json` at build time (static).

**Owner decisions locked**
- Admin delete-undo: R2 has **no object versioning** (verified: `wrangler r2 bucket` has `lock`/
  `lifecycle`/`cors`, no `versioning`; R2 offers no S3-style versioning). Open Q3's "enable versioning"
  is **not possible** → replaced by **soft-delete**: `DELETE` flips D1 `status`, R2 objects are kept
  (optional periodic sweep). New uploads' originals thus always have a server-side copy. This is the
  undo path everywhere versioning was cited.
- Admin IdP: **GitHub** (not Google — avoids Google's consent-screen setup; Access has no native
  passkey, GitHub gives passkey-in-practice + trivial OAuth-app setup). Email-OTP is the fallback.
- Open Q7 (confirm GitHub account + Zero Trust team name): trivial, needed just before 3C.

---

## Unit sequence & sittings

| Unit | What | Owner needed? | User impact | Revert |
|---|---|---|---|---|
| **3A** | D1 create + `0001_core.sql` (incl. `original_w/_h`) | no | none | drop DB (additive) |
| **3B** | Seed 83 rows from `photos.seed.json` | no | none | re-seed (idempotent) |
| **3C** | Cloudflare Access app (GitHub IdP, path-scoped) | **YES** | none | disable app |
| **3D** | Worker JWT validation (`jose`) on `/api/admin/*` | no | none | revert commit |
| **3E** | Client-side variant pipeline + upload admin | no | none (new page) | revert commit |
| **3F** | Reorder → D1 (`PUT /api/admin/photos/order`) | no | none | revert commit |
| **3G** | Flip public read to `await fetch('/api/photos')` | no | **yes** (data path) | redeploy pinned Ph2 Worker |
| **3H** | Owner definition-of-done: phone upload in <2 min | **YES** | — | — |
| **3I** | Deletions (sharp, `/__order`, retired JSON) | no | none | git history |

**Sitting plan (recommended):**
1. **Sitting 1 (agent-only):** 3A + 3B. Ship D1 + seed, verified remote. Stop point.
2. **Sitting 2 (owner spike):** 3C — the Google OAuth + Access setup. Its own sitting per PLAN.
3. **Sitting 3 (agent):** 3D + skeleton of the admin API routes, tested on `wrangler dev` (Miniflare D1+R2).
4. **Sitting 4 (agent, largest):** 3E client pipeline (8–12h estimate) + 3F reorder.
5. **Sitting 5:** 3G flip public read + parity check + 3H owner phone test, then 3I deletions.

---

## 3A — D1 provisioning + core schema

**Steps**
1. `npx wrangler d1 create mossly-content` → paste `database_id` into `wrangler.jsonc`:
   ```jsonc
   "d1_databases": [{ "binding": "DB", "database_name": "mossly-content", "database_id": "<id>" }]
   ```
2. Create `migrations/0001_core.sql` = the `photos` DDL from PLAN.md §"migrations/0001_core.sql"
   (PK `id`, `content_hash UNIQUE`, `category`, `title`, `filename`, `status` CHECK, `sort_order`,
   `medium_key`+dims, `large_key`+dims (nullable), `aspect_ratio`, EXIF columns, `original_key`,
   `original_bytes`, `created_at`/`updated_at`, indexes `idx_photos_cat_order`, `idx_photos_status`)
   **PLUS two columns the PLAN DDL omits — `original_w INTEGER NOT NULL`, `original_h INTEGER NOT NULL`**
   (Fable blocker #1: `lightbox.ts` feeds `variants.original.{width,height}` to PhotoSwipe; the public
   `photos.json` has them, the seed doesn't — add now, one line, vs a migration+backfill later).
   Cheaper to also make them nullable if any future upload can't supply dims, but the pipeline (3E) can
   always capture original dims, so NOT NULL is correct.
3. Apply: `wrangler d1 migrations apply mossly-content --local` then `--remote`.
   (No R2 versioning step — R2 has none; delete-undo is soft-delete, see 3E.)
4. Add `DB: D1Database` to the `Env` interface in `src/worker.ts` (type only; no logic yet).

**Acceptance:** `wrangler d1 execute mossly-content --remote --command "SELECT name FROM sqlite_master WHERE type='table'"` lists `photos`; `d1_migrations` tracks `0001`; `PRAGMA table_info(photos)` includes `original_w`/`original_h`.
**Revert:** DB is additive; `wrangler d1 delete` if abandoning. Nothing user-facing.

## 3B — Seed the 83 photos into D1

**Steps**
1. `scripts/seed-d1.ts` (tsx): read `src/data/photos.seed.json`; for each record emit a parameterized
   `INSERT INTO photos (...) VALUES (...)`. Map metadata to the dedicated columns:
   `dateTaken`→`date_taken`, `camera`→`camera`, `lens`→`lens`, `iso`→`iso`, `aperture`→`aperture`,
   `shutterSpeed`→`shutter_speed`, `focalLength`→`focal_length` (**68/83 records carry full EXIF** — the
   "only dateTaken" impression came from inspecting the first record, a stripped portrait). Also stash the
   whole `metadata` object in `exif_json` as the catch-all. Set `status='published'`. `original_bytes` from seed.
   - **`original_w`/`original_h`:** NOT in `photos.seed.json` — **join them from `src/data/photos.json`**
     (`variants.original.{width,height}`, keyed by `id`) in the seed script (Fable blocker #1). Fail loud
     if any of the 83 ids is missing original dims.
   - **ID note:** seed IDs are full 32-hex md5 (frozen legacy), not truncated — insert as-is (opaque PK).
2. Generate `seed.sql` (or use `db.batch`), apply `--local` first, eyeball, then `--remote`.

**Acceptance (gating per PLAN 3B):**
- `SELECT count(*) FROM photos` = **83**.
- every `content_hash` non-null + UNIQUE (no insert conflict).
- per-category `sort_order` matches the **computed** pre-migration order = `photo-order.json` index
  **plus source-order fallback** for categories absent from that file (don't diff against the file alone).
**Revert:** idempotent re-seed; `DELETE FROM photos` to reset.

## 3C — Cloudflare Access (GitHub IdP — owner picks GitHub over Google)

**Decision:** IdP = **GitHub**, not Google. Rationale: Cloudflare Access can't simplify the
Google side — the OAuth **consent-screen** setup (Cloud project, scopes, publishing/test-users) is
all Google-side pain that Access doesn't touch. Cloudflare Access has **no native passkey login**;
GitHub-as-IdP is a ~2-min OAuth app with no consent screen, and GitHub can itself be passkey-locked,
giving tap-to-login in practice. (Email One-Time PIN — zero IdP setup — is the fallback if GitHub
ever annoys.) The IdP choice is **cosmetic to the code**: Access injects the same
`Cf-Access-Jwt-Assertion` regardless; 3D only checks `iss`/`aud`/`exp` + email claim.

GitHub click-path:
1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**: name + homepage URL
   (`https://mossly.org`) + **Authorization callback URL** = the exact value CF shows in step 2.
   Get Client ID; generate a client secret.
2. Zero Trust → Settings → Authentication → Login methods → **Add → GitHub** (paste client id+secret;
   CF displays the callback URL to paste back into step 1).
3. Zero Trust → Access → Applications → Add → Self-hosted; domains **`mossly.org/admin`** AND
   **`mossly.org/api/admin`**; policy Allow, **Emails** = owner's GitHub-account email only
   (or GitHub login rule).
4. Record **AUD tag** → `wrangler.jsonc [vars] ACCESS_AUD`; `ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com`.

**Blocker to confirm first (open Q7, now trivial):** which GitHub account + the Zero Trust team name.
**GitHub email footgun (Fable #4):** the `Emails` Allow rule matches the account's **verified primary
email**. If "Keep my email addresses private" is on (GitHub gives a `…@users.noreply.github.com`) or the
primary differs from what you allowlist, the rule silently never matches → locked out. Check GitHub →
Settings → Emails first; prefer a **GitHub login/username rule** over an email rule to sidestep this.
**Interim login test:** the acceptance below can't run until 3E serves `/admin`. In Sitting 2, validate
login end-to-end by temporarily scoping the Access app to an existing path (e.g. `mossly.org/about`),
confirm the GitHub redirect works, then re-scope to `/admin` + `/api/admin`.
**Acceptance:** hitting `mossly.org/admin` (once 3E exists) forces GitHub login; other paths untouched.

## 3D — Worker JWT validation (defense-in-depth)

- Add `jose` (dep). On every `/api/admin/*`: validate `Cf-Access-Jwt-Assertion` header (NOT the cookie).
  Fetch JWKS from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, cache in-isolate, match `kid`;
  verify `iss`, `aud=ACCESS_AUD`, `exp`. Fail → **403**.
- **Local-dev bypass (footgun-free, PLAN §Local dev):** skip JWT check ONLY when
  `new URL(request.url).hostname ∈ {localhost, 127.0.0.1}`. **Per-request** guard (not startup — hostname
  is per-request, Fable #7): the check lives inline in the admin handler; any non-local hostname with no
  valid JWT falls through to the 403. No env-var bypass.
- **Disable the `workers.dev` URL (Fable #3):** add `"workers_dev": false` to `wrangler.jsonc` (and turn
  off preview URLs). Otherwise `mossly-portfolio.<sub>.workers.dev/admin/` serves the admin HTML with no
  Access in front of it. The Worker JWT check still fail-closes `/api/admin/*` there, but the page
  shouldn't be reachable, and it prevents testing the gating curl against the wrong host.
- `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` in `[vars]` (non-secret). No secret in repo.

**Gating check:** `curl https://mossly.org/api/admin/photos` with no JWT → **403 from the Worker**
(must target `mossly.org`, not `*.workers.dev`).

## 3E — Client-side image pipeline + admin (largest unit, ~8–12h)

> **Detailed, workflow-ready decomposition: see [`docs/phase-3e-plan.md`](./phase-3e-plan.md).**
> Owner decisions (2026-07-13) folded in there: **desktop-only** (pro photographer uploading curated
> JPEG exports from a Windows workstation — all mobile/iOS-Safari/HEIC handling **dropped**, no phone
> DoD); **fully serverless** (no TrueNAS backend — Worker + R2 + D1). Split into 3 PRs: 3E-1 Worker
> admin API (contract) → 3E-2 management UI ‖ 3E-3 upload pipeline. The bullets below are the original
> spec, retained for reference; the 3e doc supersedes them where they differ.

- New static page `admin/index.html` → Vite input key `admin/index` (so built path is `/admin/`,
  matching the Access scope). Add `admin: path.resolve(__dirname,'admin/index.html')` to `vite.config.ts`
  `rollupOptions.input`. **Do NOT add `/admin/*` to `run_worker_first`** (Fable #7): the admin HTML/JS
  are static assets served by `env.ASSETS.fetch`; routing them through the Worker burns an invocation per
  asset for no reason. Only `/api/admin/*` needs Worker code, and that's already covered by `/api/*`.
- On file select (PLAN §3E, order matters — Safari footguns):
  1. `id = sha256(await file.arrayBuffer())` → 16 hex (fixes ID-instability; dedupe key).
  2. `createImageBitmap(file, {imageOrientation:'from-image', resizeWidth, resizeQuality:'high'})` —
     pixels come out upright; do NOT also apply exifr rotation. Decode `large` (2560) first,
     `bitmap.close()` between variants (Safari ~16.7 Mpx² canvas cap).
     - **Safari resize footgun (Fable #6 — iPhone is the 3H DoD):** Safari has been buggy/late on the
       `resizeWidth`/`resizeQuality` options — it may return a full-res (→ cap-blowing) or unresized
       bitmap silently. **Feature-detect:** compare the returned `bitmap.width` to `resizeWidth`; if it
       didn't resize, fall back to a stepped `<canvas>` downscale. Must be tested on **real iOS Safari**,
       not desktop Chrome, before Sitting 4 is called done.
     - **Capture original dimensions here** (natural width/height of the source) and POST them with the
       metadata — they populate `original_w/_h` (3A) for new uploads.
  3. Encode with **`@jsquash/webp`** (WASM) in a Web Worker — NOT `canvas.toBlob('image/webp')`
     (Safari silently emits giant PNG).
  4. EXIF via `exifr.parse(file,{pick:[...]})` for metadata only (variants written orientation=1).
  5. HEIC: feature-detect; if `createImageBitmap` throws on `.heic` → "convert to JPEG or use Safari".
  6. Upload each variant **and the untouched original** through the Worker (`bucket.put`, all <100 MB).
- Admin API routes (Worker, all Access+JWT):
  `POST /api/admin/photos/:id/blob/:variant` (×3), `POST /api/admin/photos` (409 on `content_hash`,
  `sort_order=max+1`), `PATCH /api/admin/photos/:id`, `DELETE /api/admin/photos/:id` (**soft-delete:
  flip D1 `status` to a `deleted` value / drop from published; keep R2 objects** — R2 has no versioning,
  so retaining the objects is the undo, and for new uploads R2 is the sole server-side copy of the
  original. Optional later: a manual sweep to hard-delete truly-unwanted objects), `GET /api/admin/photos`
  (incl. drafts + soft-deleted, so they can be restored).
  - **RESOLVED + SHIPPED:** soft-delete uses a nullable **`deleted_at`** timestamp column (already in
    `migrations/0001_core.sql`, applied to remote D1). `status` CHECK stays `('draft','published')`.
- Test fully offline via `wrangler dev` (Miniflare emulates D1+R2); read path via `env.IMAGES.get`
  binding (public `images.mossly.org` URL not emulated locally).

## 3F — Reorder → D1

- SortableJS in admin (fix the un-awaited `attachSortable` + un-removed doc click listener when porting).
- `PUT /api/admin/photos/order` body `{category, ids:[...]}` → single
  `db.batch([...UPDATE photos SET sort_order=? WHERE id=?...])`. Chunk if a category >~50.

## 3G — Flip public front-end to live data (the only user-facing change)

- `src/utils/gallery-manager.ts` (path corrected — Fable #5, not `src/services/`): replace **both**
  `import photosData from '../data/photos.json'` **and** `import photoOrderData from '../data/photo-order.json'`
  with `await fetch('/api/photos')`. Order is now baked into D1 `sort_order`, so **`applyOrder()`
  (lines ~40, ~59) and the whole order-merge path are deleted** — the API already returns ordered rows.
  Convert eager singleton + sync constructor to **async init**; await in callers (`gallery.ts`). This is
  also where static `index.html` category markup → runtime render from the single category const (from 1F).
- Worker `GET /api/photos`: all `published`, ordered `(category, sort_order)`, variant URLs → `IMAGES_BASE`.
  **Contract (Fable #5): byte-shape-compatible with the current `photos.json`** — a
  **grouped `Record<PhotoCategory, Photo[]>` envelope** (gallery-manager casts the import to exactly this),
  NOT a flat array; variants nested under `variants.{medium,large,original}` **each with `{url,width,height}`**
  (incl. `original` dims — blocker #1); `metadata` in **camelCase** (`dateTaken`, `shutterSpeed`, …) mapped
  from the snake_case D1 columns. **Projection excludes `content_hash`, `original_bytes`, `status`,
  and any admin-only column.** The PLAN's response example shows a single photo; the actual payload is the
  category→array map. Diff the live `/api/photos` against the baked `photos.json` for byte-parity before flip.
- **Fallback:** keep a last-known-good static `photos.json` snapshot; if `/api/photos` fails, roll back by
  redeploying the pinned Phase-2 Worker version (CF deployment history).

**Acceptance:** public gallery renders from `/api/photos`; a photo added via admin appears **without redeploy**.

## 3H — Owner definition-of-done (GATING) — REVISED (desktop)

Superseded by the desktop pivot (2026-07-13, see [`phase-3e-plan.md`](./phase-3e-plan.md) §DoD): from the
**Windows workstation**, open `mossly.org/admin` → **Pocket ID passkey login** → drag exported JPEGs →
they process in-browser + upload + appear in the public gallery (after 3G), **no terminal, no redeploy**.
Mobile/HEIC/Safari are out of scope. Exercise in the owner's real desktop browser (Chrome/Edge).

## 3I — Deletions (after 3G verified as source of truth)

`scripts/process-images.ts` + `process-images` npm script; `sharp` dep; `vite.config.ts` `/__order`
middleware; `gallery-manager` `saveOrder()`→`/__order`; dev-only public-gallery sortable in `gallery.ts`;
retire `photos.json`/`photos.seed.json`/`photo-order.json`/`photos.frozen.json` (git history keeps them);
one-off `migrate-to-r2.ts`/`seed-d1.ts`. Also sweep the still-present **`src/components/theme-toggle.ts`**
(Phase 1E claimed its deletion but it's still in the tree — Fable #7). Do NOT git-history-purge originals yet.

---

## New/changed deps for Phase 3
Add: `jose`, `@jsquash/webp` (browser), `@cloudflare/workers-types` (D1/R2 types) — dev.
`wrangler` is **already installed (^4)**. **`@cloudflare/vite-plugin` is NOT installed and NOT needed**
(Fable #7): the repo builds with plain `tsc && vite build` + a hand-set `assets.directory:"./dist"` +
`wrangler deploy`, which works. Don't half-adopt the plugin; if ever adopted deliberately, then remove
`assets.directory` per PLAN 2A's config-authority rule. `exifr` moves Node→browser. `sortablejs` stays
(now admin). Remove in 3I: `sharp`.

## Backup discipline
Before every `migrations apply --remote`: `wrangler d1 export mossly-content --remote --output backup-YYYYMMDD.sql`.
Do the restore drill once (export → import to local copy → confirm 83 rows). D1 Time Travel is the primary DR.
