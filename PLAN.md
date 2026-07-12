# mossly-portfolio — Final Implementation Plan

**One-paragraph overview.** This plan turns a static Vite/TS photo site into a self-serviceable "base of operations" — a polished portfolio plus a blog and editable projects page — backed entirely by Cloudflare free tiers (one Worker with Static Assets, R2, D1, Access) with MEGA S4 as an optional cold archive for originals. It is sequenced for minimal migration risk, in the order already agreed with the owner: **Phase 1** is pure git-revertable polish on the existing pipeline; **Phase 2** moves image bytes to R2, adds a ~2560px `large` lightbox variant, and cuts the site over from Cloudflare Pages to a Worker — while the front-end data stays **static baked JSON** (only the URLs change), so the storage move and the domain cutover never coincide with an app-logic change; **Phase 3** introduces D1 + Cloudflare Access + the client-side upload admin and flips the front-end to a live `/api/photos` read, retiring the sharp pipeline and the dev-only `/__order`; **Phase 4** adds blog + projects content on the same foundation. The irreplaceable assets — the 83 photo IDs, their per-category order, and the original bytes — are protected by redundant copies (frozen JSON + git history tag + D1 export, with MEGA as an extra tier) and no destructive step happens until its replacement is verified live. Every phase is split into independently deployable sub-units, each with its own revert point, so the owner can stop after any sitting with the site whole.

Absolute repo root: `C:\Users\mossa\Desktop\programming\mossly-portfolio`.

---

## Guiding invariants (thread through every phase)

1. **The site is deployable/revertable after every sub-unit, not just every phase.** New infra is committed at the latest phase that needs it: R2 + Worker in Phase 2, D1 + Access in Phase 3, nothing new in Phase 4.
2. **The 83 legacy `md5` IDs are frozen opaque PKs.** They are the join key for order data and the R2 key. New admin uploads use `sha256(bytes)[:16]`; mixed ID schemes are fine because the ID is opaque and `content_hash` (full sha256, UNIQUE) is the dedupe key — a legacy photo re-uploaded via admin gets a new id but collides on `content_hash` (409). Re-keying the 83 to content hashes is deliberately **not** done: it would move R2 objects and remap order for zero user benefit.
3. **No destructive step before its replacement is verified, and no bytes deleted before git history preserves them.** Originals leave the deploy only after R2 serving is verified live **and** a git tag holds the bytes. The MEGA cold archive is an **independent parallel chore**, not a gate on the cutover (git history is the interim archive).
4. **Fewer moving parts wins ties.** One `posts` table for blog+projects; variants as inline columns; no `categories` table; through-Worker uploads (no presigned/CORS/S3 signing); webp-only variants (no AVIF; HDR deferred but pre-paid — originals stored in R2 as the future regeneration source, see Out of Scope); D1 Time Travel instead of a backup cron until there is irreplaceable content.

---

## Phase 0 — Confirm the deployment substrate (S, no code, ~1h)

**Goal.** Know exactly how the site ships before touching infra, because Phase 2's cutover swaps what `mossly.org` points at, and rollback depends on knowing the current binding.

**Facts from recon (brief A §1, corroborated `roadmap.md:11,160`):** no `wrangler.*`, no `.github/`, no `_redirects`/`_headers`, no deploy script; `git remote` = `github.com/mossly/mossly-portfolio`; `dist/` gitignored and untracked. Conclusion: **Cloudflare Pages connected to GitHub via the dashboard**, build `npm run build`, output `dist/`, domain `mossly.org`. This is an assumption to confirm, not a verified in-repo fact. [assumption]

**Prerequisite.** Local `wrangler` must be authenticated: run `npx wrangler login` (opens a browser OAuth flow) **or** read the facts straight off the dashboard. If neither the CLI nor the dashboard is available, Phase 0 stalls — do this first.

**Tasks.**
- `npx wrangler whoami` then `npx wrangler pages project list` — confirm the active CF account/token and the Pages project. If unauthenticated, read the equivalent facts from the dashboard instead.
- Dashboard → Workers & Pages: record project name, production branch, and the **DNS/custom-domain binding for `mossly.org` and `www`** (which CNAME/proxy points where). Screenshot it.
- Record the **account plan tier** (Free vs Pro) — fixes the Worker request-body limit (100 MB on Free/Pro; brief B §2/§5) and whether WAF/HMAC is available (Pro only).
- Record account ID + zone.

**Acceptance.** A short note (`docs/deploy.md`, or the Phase-1 commit body) states: platform, build cmd, output dir, branch, plan tier, and the current apex/www binding.

**Verification.** `wrangler pages project list` shows the project, or the owner reads the project type off the dashboard.

**Rollback.** N/A (read-only).

**Open-question dependency.** If the dashboard shows this is already a Worker (not Pages), Phase 2's cutover shrinks to "add bindings + deploy"; note it and proceed.

---

## Phase 1 — Polish that survives the migration (M, existing Pages pipeline, ~6–10h / one weekend)

**Goal.** Fix every backlog item that is independent of where images live, so the migration starts from a clean base. Zero new infra; deploys via the current pipeline; each lettered group is its own commit and independently revertable.

### 1A. Freeze the photo IDs (do first — migration-critical, ~15m)
The ID-instability bug (`scripts/process-images.ts:130` computes `id = md5(`${category}-${filename}`)` **before** the macron rename at :138–146) means any reprocessing orphans `photo-order.json`. We do not fix the algorithm (the pipeline dies in Phase 3). Instead:
- Copy `src/data/photos.json` → `src/data/photos.frozen.json` and commit it. This is the authoritative old-ID→content map that Phase 2/3 migration reads.
- Do **not** re-run `npm run process-images` before Phase 2. If unavoidable, add a guard that reuses existing IDs by matching on the *sanitized* filename.

**Acceptance.** `photos.frozen.json` committed with all 83 records.

### 1B. Kill the 404s and dead metadata (~30m)
- Remove `<link rel="preload" href="/fonts/inter-var.woff2">` and the `dns-prefetch`/`preconnect` to `fonts.googleapis.com` from `index.html`, `about.html`, `projects.html` (no `/fonts/` dir exists; brief A §3 — 404 every load).
- Fix `<meta name="theme-color">` to a light value (site is DaisyUI `lofi`).

**Acceptance.** DevTools Network shows zero 404s on all three pages; no request to `fonts.googleapis.com`.

### 1C. Fix the lint toolchain (~1h)
- Delete `.eslintrc.cjs`; add `eslint.config.js` (ESLint 9 flat config) wiring `@typescript-eslint/parser` + plugin. Update `package.json`: `"lint": "eslint src"`.

**Acceptance.** `npm run lint` exits 0; `npm run build` (`tsc && vite build`) still passes.

### 1D. Front-end lifecycle bugs (~2h)
- `gallery.ts renderAllGalleries`: `.destroy()` the previous `LazyLoad` before creating a new one on resize re-render; remove the orphaned constructor instance.
- `app.ts`: remove the `beforeunload` listener (breaks bfcache).
- `gallery.ts destroy()`: remove the leaked document-level click listener.
- Strip `console.log` noise (gate behind `import.meta.env.DEV` or delete).
- Add keyboard focus + Enter/Space activation to gallery tiles — kept as a cheap, user-facing portfolio-quality win (#14).

**Acceptance.** bfcache restore works (DevTools → Application → Back-forward cache → Test); resize 10× → LazyLoad instance count stays at 1; gallery tiles are keyboard-operable.

### 1E. Trim dead weight (~1h)
- Restrict DaisyUI `themes` config to `["lofi"]` (currently pulls all 35 via `daisyui/themes.css`).
- Delete `src/components/theme-toggle.ts` (dead) and its imports. (The *feature* — dark/light toggle — is deferred, not maintained as broken code. See Out of Scope.)
- Stop the front-end importing/shipping `blurDataUrl` (~35 KB, unused); drop it from the type as optional. Physical removal happens in Phase 2's data rewrite. Leave the values in `photos.frozen.json` untouched.
- In `config/images.ts` set `IMAGE_FORMATS = ['webp']` (avif never generated).

**Acceptance.** Production JS/CSS bundle shrinks (record before/after `dist` size); site visually identical.

### 1F. De-duplicate the category list — TS runtime only (~1h)
- The category list is duplicated 4 places (`gallery-manager.ts:72-75`, `config/images.ts:7-22` GALLERY_CONFIG, `types/photo.ts:1-15` union, and hardcoded markup in `index.html`). Collapse the **three TS runtime copies to one exported const** they all import (the TS union type in `types/photo.ts` stays as the compile-time type). This is load-bearing: Phase 3 admin can add/rename categories, and one source prevents drift.
- **The static `index.html` copy is deliberately not touched here** — a static HTML file cannot import a TS const, and Phase 3 turns the gallery dynamic (rendered from the single const at runtime), which retires that copy naturally. Noted, not silently dropped.
- **FOUC critical CSS extraction is cut** (see Out of Scope): the copy-paste across 3 files works, and consolidating it is craftsmanship that neither survives nor blocks the migration.

**Acceptance.** Category runtime list defined once across the three TS sites; `index.html` copy explicitly deferred to Phase 3.

### 1G. Repo hygiene + dep placement (~30m)
- `git rm --cached` tracked `.DS_Store` and `.vite/deps`; add `.DS_Store`, `.vite/`, `.wrangler/` to `.gitignore` (last one pre-empts Phase 2 local state).
- Move `sharp`, `typescript`, `vite`, `@types/sortablejs` from `dependencies` → `devDependencies`. (`daisyui`, `photoswipe`, `vanilla-lazyload`, `sortablejs` stay in deps — they ship to the browser.)

**Acceptance.** `git ls-files | grep -E '\.DS_Store|\.vite'` empty; `npm ci && npm run build` succeeds.

**Deliberately NOT fixed in Phase 1** (obviated later): `/__order` CSRF (#7 — endpoint is `apply:'serve'`, never in prod, deleted Phase 3); 299 MB originals / lightbox multi-MB downloads (#3 — the entire point of Phase 2); `variants.*.url`, `gallery-manager.ts` import path (Phase 2/3).

**Phase 1 verification (whole phase).** `npm ci && npm run build && npm run lint` all green; deploy to the existing Pages pipeline; smoke-test all three pages + lightbox on the live URL; Network panel clean; visual-parity screenshots before/after.

**Rollback.** Each group is its own commit; `git revert` individually. Pages dashboard "rollback to previous deployment" as backstop. No infra, no data touched.

---

## Phase 2 — R2 + `large` variant + Worker cutover (L, split into 4 shippable units)

**Goal.** Images serve from R2; a new `large` (~2560px webp) variant backs the lightbox; 299 MB of originals leave the git working tree and the deploy; the site moves from Pages to a **Worker with Static Assets**. **The front-end data stays static baked JSON** — only the variant URLs change (now absolute R2 URLs). No D1, no `/api/photos`, no async fetch conversion yet. This decouples the bytes migration + domain cutover from the app-mechanism change (Phase 3). The MEGA cold archive is a **parallel, non-blocking chore** (2G) — git history is the gating archive for deletion.

The four independently deployable units: **2A–2C** (Worker skeleton + R2 stand-up, no user impact), **2D–2E** (backfill + repoint, still on `*.workers.dev`), **2F** (domain cutover), **2G** (MEGA archive, any time). Each can be a stopping point.

### 2A. Stand up the Worker skeleton (no cutover yet, ~2h)
- Add `@cloudflare/vite-plugin` (v1.0 GA; Vite 6 supported [platform brief B §1]). **Config authority is explicit to avoid the two-sources trap:** you hand-author `wrangler.jsonc` with every field **except** `assets.directory`; the plugin injects only `assets.directory` at build time from the client build output. Do not set `assets.directory` yourself. The plugin detects the MPA from the existing `build.rollupOptions.input` — keep the current entry-point keys exactly as in `vite.config.ts` (verify: the three HTML entries index/about/projects).
- Create `src/worker.ts`. `wrangler.jsonc` (you own all keys shown; plugin adds `assets.directory`):
  ```jsonc
  {
    "main": "src/worker.ts",
    "compatibility_date": "2026-01-01",
    "assets": {
      "binding": "ASSETS",
      "not_found_handling": "404-page",   // MPA with real 404s, NOT SPA mode
      "run_worker_first": ["/api/*"]      // Worker code paths; grows in Ph3/Ph4
    },
    "r2_buckets": [{ "binding": "IMAGES", "bucket_name": "mossly-images" }],
    "vars": { "IMAGES_BASE": "https://images.mossly.org" }
  }
  ```
- Add a real `public/404.html`.
- In Phase 2 the Worker's `fetch` handler is a stub for future `/api/*`. Static hits never invoke it.
- **Verify on the throwaway `mossly-portfolio.<subdomain>.workers.dev` URL first.** The custom domain is untouched until 2F. This is the entire safety margin.

> **Note on legacy-URL redirects:** the `/images/*` and `/processed/*` 301 shims from the previous draft are **cut**. The site "historically didn't get used," so indexed/bookmarked deep links to those paths are unlikely, and under `not_found_handling:"404-page"` a static miss serves the 404 page without invoking the Worker anyway. If CF analytics show real post-cutover hits to those paths, add the shims reactively by listing `/images/*`,`/processed/*` in `run_worker_first` and emitting 301s (open question 6).

### 2B. Provision R2 (~30m)
- `wrangler r2 bucket create mossly-images` (Standard storage; free tier 10 GB / 1M Class-A / 10M Class-B / zero egress — brief B §2; ~350 MB total for variants + originals of the 83 is far under 10 GB).
- Bind a **public custom domain** `images.mossly.org` to the bucket (puts objects behind the CDN; `cacheControl` set at write governs edge cache; zero egress). On Free, a public custom-domain bucket is effectively open-read — acceptable for public portfolio images (HMAC-gated private R2 needs Pro/WAF; brief B §5).

**Acceptance.** A hand-uploaded test object is fetchable at `https://images.mossly.org/<key>` with a long `cache-control`.

### 2C. R2 key layout (id-only, immutable)
Keys are **ID-only** (no category in the path), so re-categorizing in Phase 3 never moves objects. All objects written with `Cache-Control: public, max-age=31536000, immutable` + correct `contentType` at `put` time.
```
photos/<id>/medium.webp        # ~1200px  (grid + lightbox placeholder/msrc)
photos/<id>/large.webp         # ~2560px  (NEW — optional responsive srcset rung)
photos/<id>/original.<ext>     # untouched source bytes — LIGHTBOX SOURCE (quality) + archive/regeneration
posts/<post-id>/cover.webp     # Phase 4  (keyed by post id, not slug — see schema)
posts/<post-id>/img-<n>.webp   # Phase 4 inline body images
```
`<id>` = the frozen legacy ID for the 83; `sha256(bytes)[:16]` for new uploads. **Originals ARE stored in R2** (`photos/<id>/original.<ext>`) — not linked from any page (the lightbox uses `large`), but kept so any future variant regeneration (notably **HDR** — see Out of Scope) is a script over one bucket instead of a hunt through local drives. ~300 MB for the 83 + ~4 MB per new upload ≈ ~2,500 photos of headroom in the 10 GB free tier. The bucket is public-read via `images.mossly.org`, so originals are fetchable by anyone who knows the key — same exposure as the current site, which serves originals to every lightbox click. Git history and MEGA remain the cold-archive tiers. Because new IDs are content hashes, changed content → new key → automatic cache-busting. **Immutable-cache caveat:** overwrites of the *same* key and DELETEs are **not** edge-cache-busted (a deleted `photos/<id>/*.webp` may serve stale up to the TTL). This is accepted for a low-traffic portfolio; on the rare admin delete/replace, purge that path from the R2/dashboard cache manually if immediacy matters (see 3E/DELETE).

### 2D. One-time migration script `scripts/migrate-to-r2.ts` (tsx, Node, ~2–4h)
Runs from the operator's machine while `public/images/` is still present. Reuses the existing `sharp` toolchain for this last local backfill (a deterministic 83-file batch beats clicking a browser 83 times; the browser pipeline is Phase 3). For each record in `photos.frozen.json`:
1. Read the original from `public/images/<category>/<filename>`.
2. Compute `content_hash = sha256(originalBytes)` (full hex).
3. Generate `large` (2560px webp, q≈80); reuse the existing `medium` from `public/processed/<category>/medium/*.webp` (or regenerate at 1200px q≈75 for consistency).
4. `put` both variants to R2 at `photos/<id>/{medium,large}.webp` with immutable cache + `contentType: image/webp`, **plus the untouched original at `photos/<id>/original.<ext>`** (correct `image/jpeg`/`image/png` contentType), via the S3 API (`@aws-sdk/client-s3` or `aws4fetch`, used only in this Node script — not shipped) or `wrangler r2 object put`.
5. Emit **two** files, so no admin-only field ships to the browser:
   - `src/data/photos.json` (**public shape, replaces the old one**): variants nested under `variants.{medium,large,original}` with absolute `images.mossly.org` URLs, `aspectRatio`, `metadata`. Includes `variants.original` (url + dims — the lightbox source). **No `content_hash`, no `blurDataUrl`.**
   - `src/data/photos.seed.json` (**Phase-3 D1 seed only, not imported by the front-end**): adds `content_hash`, `sort_order` per category (derived from `photo-order.json` index, source-order fallback mirroring `gallery-manager.ts:40-49`), and variant dimensions.

**Idempotency.** Re-runnable: `put` overwrites (strongly consistent); same keys every run. Run against **local Miniflare R2 first** (`wrangler dev`), eyeball a few images, then `--remote`.

### 2E. Repoint the front-end (minimal diff, still static, ~2–3h)
- Replace `src/data/photos.json` with the generated public file — `gallery-manager.ts` **still imports it at build time**; only the data content (URLs) changes, not the mechanism.
- Update `src/types/photo.ts`: `variants` becomes `{ medium, large, original }`; drop `blurDataUrl`. (`content_hash` is **not** on the public type — it lives only in `photos.seed.json`.) **`original` is retained on the public type** — the lightbox serves it (owner decision: image quality is a priority; full-res originals are the lightbox source, acceptable now that R2's zero-egress CDN carries the bytes and the repo is debloated).
- `lightbox.ts:154-160`: keep building `dataSource.src` from `photo.variants.original.url` (full resolution), but **load it cleanly**: set `msrc: photo.variants.medium.url` so PhotoSwipe shows the already-cached grid image instantly as a placeholder while the original streams in (no blank multi-MB wait). Optionally add `srcset` (`large` 2560w + `original`) with `sizes` so phones/small viewports can fetch `large` instead of a 20–40 MB original while capable displays and zoom still get the original — a bandwidth nicety, not a quality downgrade on desktop. **`large` therefore becomes an optional responsive/srcset rung rather than the lightbox target** (still generated in 2D; skippable if we accept originals-everywhere).
- `gallery.ts:391,396-397`: `mediumUrl` is now already absolute; verify no code assumes a leading `/`.

**Acceptance.** Gallery grid loads mediums from `images.mossly.org`; lightbox shows the medium instantly then swaps to the **full-resolution original** (sharp on zoom); DevTools shows all image requests to `images.mossly.org` and none carrying a `content_hash` field.

### 2F. Cutover sequence (careful part, ~1–2h)
1. **Precondition:** 2D verified on `*.workers.dev`.
2. **Tag `pre-r2-cutover`** on the commit that still contains originals + baked JSON, and push it. Single-command escape hatch; also the archive that authorizes deletion in 2H.
3. Deploy the Worker (still on `*.workers.dev`); full smoke test: every category page loads from R2, lightbox opens `large`, 404 page works.
4. **Move the custom domain.** Dashboard → bind `mossly.org` and `www` to the Worker. This is the cutover moment; edge routing propagates in seconds. *(This is a live DNS change — see 2F click-path below.)*
5. **Keep the Pages project intact but disabled** as the one-click rollback target for ~2 weeks, then delete.
6. Watch analytics ~30 min for a 404 spike.

**2F click-path (the DNS cutover, spelled out):** Dashboard → **Workers & Pages** → your Worker → **Settings → Domains & Routes → Add → Custom domain** → enter `mossly.org`, confirm; repeat for `www.mossly.org`. Cloudflare updates the proxied DNS records automatically. To roll back: same screen on the **Pages** project re-adds the domains (or remove them from the Worker), instant.

### 2G. MEGA S4 cold archive (parallel, non-blocking, ~2–3h — do any time)
**This does not gate the cutover or any deletion** — git history (tag `pre-r2-cutover`) already preserves every original byte. MEGA is a second, off-git archive tier for durability, run whenever convenient. Use the rclone **S3 backend against MEGA S4** — the legacy `mega` backend is unreliable in 2026 (402/PoW failures, rclone #8758; brief C §4). MEGA console → enable S4 → create bucket `portfolio-originals` → mint S4 access key + secret. `rclone config` → `s3` → provider Other → `endpoint <region>.s4.mega.io` + matching `region`.
```
rclone copy "C:\Users\mossa\Desktop\programming\mossly-portfolio\public\images" \
  mega-s4:portfolio-originals/images --progress --transfers 4 --immutable --s3-no-check-bucket
```
Use `copy`, **never** `sync --delete`. MEGA S4 doesn't preserve mtime (`X-Amz-Meta-Mtime` unsupported) — harmless for an immutable archive; rely on size/ETag.

**Archive verification:** `rclone check "public/images" mega-s4:portfolio-originals/images --size-only` → zero differences; spot-download 3 files, `sha256sum` against local originals → byte-identical; confirm file count.

### 2H. Deletions (after 2F verified + 48h soak)
- `git rm -r public/images` and `public/processed` — **safe because the `pre-r2-cutover` tag in git history holds the bytes**; MEGA completion is not required first.
- `scripts/process-images.ts` + the `process-images` npm script are **kept** until Phase 3 proves the browser pipeline; delete the *originals* now, the *script* in Phase 3.
- `blurDataUrl` already dropped in 2E. **`variants.original` is kept** (the lightbox source).
- Do **NOT** purge originals from git history (no `filter-branch`/BFG) until well after Phase 3 — history is the ultimate rollback.

**CV pdf, logo, favicon stay in `public/`** (tiny, not part of the image migration).

**Phase 2 verification.** Live `mossly.org` served by the Worker; every image request to `images.mossly.org`; lightbox = `large` variant; `dist/` no longer contains `images/`/`processed/` (deploy drops ~310 MB → ~10 MB); Lighthouse LCP improved; the disabled Pages project still deployable.

**Rollback.** Re-bind `mossly.org`/`www` to the Pages project in the dashboard (instant). R2 additions are non-destructive to the old system. `git checkout pre-r2-cutover` restores originals + baked JSON; Pages rebuilds. Nothing lost.

---

## Phase 3 — D1 + Cloudflare Access + admin + live `/api/photos` (L, split into shippable units)

**Goal.** Introduce D1 as the content source of truth, an authenticated `/admin/*` page (client-side variant generation, per agreed architecture) behind Cloudflare Access, and flip the public front-end from baked JSON to a live `/api/photos` read. Retires the dev-only `/__order` and the sharp pipeline. This is the only phase that changes the app's data mechanism, isolated behind Access with a static-snapshot fallback.

Shippable units: **3A–3B** (D1 stand-up + seed, no user impact), **3C–3D** (Access + JWT, stand up on `*.workers.dev`), **3E–3F** (admin upload + reorder), **3G** (flip public read). Do the Access spike (3C) as its own sitting **before** building the admin UI that depends on it.

### 3A. D1 provisioning + core schema (~1h)
- `wrangler d1 create mossly-content` → paste `database_id` into `wrangler.jsonc` (`[[d1_databases]] binding="DB"`).
- Apply `migrations/0001_core.sql` (full DDL below) via `wrangler d1 migrations apply --local` then `--remote`.

### 3B. Seed the 83 photos + order into D1 (~2h)
- `scripts/seed-d1.ts` (or generated `seed.sql`): read `photos.seed.json` (carries `content_hash` + `sort_order` + dims). Emit one `INSERT` per photo with the **frozen legacy ID** as PK, `content_hash`, `sort_order` per category, variant keys/dims, `original_key`, EXIF from `metadata`.
- Apply: `wrangler d1 execute mossly-content --remote --file=seed.sql`.

**Acceptance.** `SELECT count(*) FROM photos` = 83; every `content_hash` non-null + unique; per-category ordering matches the **computed** pre-migration order — i.e. compare against `photo-order.json` entries **plus the documented source-order fallback** for categories absent from that file (a raw diff against the file alone would false-flag those categories; recon A §2).

### 3C. Cloudflare Access — spike this first (Zero Trust Free, ≤50 users, $0; brief B §4, ~2–4h)
Concrete click-path (do it as a standalone spike; the previous draft's one-liner hides an afternoon of setup):
1. **Google OAuth client** — Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application. Add authorized redirect URI `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback` (copy the exact value Cloudflare shows in step 2 — do not hand-type it). Save the client ID + secret.
2. **Add Google as a login method** — Cloudflare **Zero Trust → Settings → Authentication → Login methods → Add → Google**; paste client ID + secret; Cloudflare displays the exact redirect URI to paste back into step 1.
3. **Create the Access application** — Zero Trust → **Access → Applications → Add an application → Self-hosted**. Set application domain(s) to path-scope **`mossly.org/admin`** and **`mossly.org/api/admin`** (add both). Policy: **Allow**, include rule = **Emails** → the owner's Google address only.
4. **Record the AUD tag** — the application's **Application Audience (AUD) Tag** (Overview / Additional settings) → put it in `wrangler.jsonc [vars]` as `ACCESS_AUD`; put `<your-team>.cloudflareaccess.com` as `ACCESS_TEAM_DOMAIN`.

Access intercepts those two paths at the edge, forces Google login, injects `Cf-Access-Jwt-Assertion`; all other paths pass through untouched.

### 3D. Worker JWT validation (defense-in-depth, ~1h)
On every `/api/admin/*` request the Worker independently validates the **`Cf-Access-Jwt-Assertion` header** (not the `CF_Authorization` cookie), using `jose`:
- Fetch JWKS from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`; **cache in-isolate**, match by `kid` (keys rotate ~6-weekly; never hard-code).
- Verify `iss = https://<team>.cloudflareaccess.com`, `aud = ACCESS_AUD`, `exp`. On failure → **403**.
- `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` in `[vars]` (non-secret). No token/secret in the repo.

Even if the Access path were misconfigured, unauthenticated `/api/admin/*` fails JWT validation in the Worker → fail-closed.

### 3E. Client-side image pipeline (replaces sharp, per agreed architecture; brief C §1-3, ~8–12h)
Static admin page served at **`/admin/index.html`** (Vite input key `admin/index`, so the built asset path is `/admin/` — matching the Access scope and `run_worker_first`; a bare `/admin.html` would sit outside both). On file select:
1. **ID = content hash:** `id = sha256(await file.arrayBuffer())` truncated to 16 hex. Fixes ID-instability permanently; dedupes re-uploads (requires https — Cloudflare provides it).
2. **Decode + downscale in one step:** `createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth, resizeQuality: 'high' })` — pixels come out **upright**; do **not** also apply exifr rotation (double-rotate hazard). Never materialize a full-res bitmap (Safari canvas area cap ~16.7 Mpx²). Decode `large` (2560) first, `bitmap.close()` between variants.
3. **Encode with `@jsquash/webp`** (WASM, q≈80/2560, q≈75/1200) in a Web Worker — **not** `canvas.toBlob('image/webp')`, which Safari silently turns into a giant PNG (brief C §1).
4. **EXIF via `exifr.parse(file, { pick: [...] })`** for metadata only. Variants are written orientation=1.
5. **HEIC:** feature-detect; if `.heic` and `createImageBitmap` throws, show "convert to JPEG or use Safari." No `libheif-js` bundled yet (owner can set iPhone to "Most Compatible"; open question 2).
6. Upload each variant **and the untouched original file** **through the Worker** (`bucket.put`) — variants <5 MB, originals typically 5–50 MB, all far under the 100 MB Worker body limit → no presigned URLs, no R2 CORS, no S3 signing. Storing the original (`photos/<id>/original.<ext>`) is deliberate future-proofing: it is the only server-side copy of a new upload's source bytes, and the input for any later variant regeneration (HDR, new formats) without depending on the owner's local file organization.

Flow: generate variants → `POST /api/admin/photos/:id/blob/:variant` (×3: `medium`, `large`, `original`) → `POST /api/admin/photos` (metadata; 409 if `content_hash` exists → dedupe) → refresh grid.

### 3F. Reorder → D1 (replaces `/__order`, ~2h)
Reuse SortableJS in the admin UI (fix #8 — the un-awaited `attachSortable` + un-removed document click listener — carried into admin). Persist via `PUT /api/admin/photos/order` with the full ordered ID array. Worker does a **single `db.batch([...UPDATE photos SET sort_order=? WHERE id=?...])`** — one round trip, implicit transaction, under the 50-query/invocation and 100k-writes/day Free caps (brief B §3). Chunk if a category exceeds ~50 photos.

### 3G. Flip the public front-end to live data (~2h)
- `gallery-manager.ts`: replace `import photosData from '../data/photos.json'` with `await fetch('/api/photos')`. Convert the eager singleton (:125) + synchronous constructor (:16-19) to an **async init**; callers in `gallery.ts` await it. This is also where the static `index.html` category markup (deferred in 1F) is replaced by runtime rendering from the single category const.
- **Fallback:** keep a last-known-good static `photos.json` snapshot; if `/api/photos` fails, the simplest rollback is redeploying the Phase-2 Worker version (pinned in CF deployment history).

**Acceptance.** Public gallery renders from `/api/photos`; adding a photo via admin appears on the public site **without a rebuild/redeploy**.

### 3H. Owner definition-of-done (gating, not just engineer checks)
- **Terminal-free phone upload:** on a phone, the owner opens `mossly.org/admin`, logs in with Google, selects a photo from the camera roll, and it appears in the public gallery — **in under ~2 minutes, no terminal, no code**. This is the whole point of the project and is a **gating** acceptance test, not a nicety.
- If HEIC blocks this on the owner's phone, resolve open question 2 (Most-Compatible JPEG vs bundling `libheif-js`) before declaring Phase 3 done.

### 3I. Deletions (Phase 3)
- `scripts/process-images.ts` + `process-images` npm script (replaced by browser pipeline).
- `sharp` (dep — pipeline retired); Node-side `exifr` role changes to **browser** dependency.
- `vite.config.ts` `/__order` middleware (:17-44) — the CSRF-open dev endpoint (#7).
- `gallery-manager.ts:55-68` `saveOrder()` → repointed to `/api/admin/photos/order`; `gallery.ts:236-267` dev-only `attachSortable` public-gallery path removed (moves into admin).
- `src/data/photos.json`, `photo-order.json`, `photos.frozen.json`, `photos.seed.json` — retire once D1 is verified source of truth (git history retains them as migration records).
- `scripts/migrate-to-r2.ts` + `seed-d1.ts` after they've run (git history retains).
- Add deps: `@cloudflare/vite-plugin`, `wrangler` (dev), `jose`, `@jsquash/webp`. `sortablejs` stays (now admin).

**Phase 3 verification.** Unauthenticated `/admin` → Google login; `curl https://mossly.org/api/admin/photos` with no JWT → **403 from the Worker** (not just Access) — this is a **gating** check. Upload a portrait iPhone JPEG in Chrome → upright in gallery + lightbox, correct EXIF, `medium`+`large`+`original` in R2, row in D1, `id`=sha256 prefix. Re-upload identical file → 409 dedupe, no duplicate R2 objects. Drag-reorder → `sort_order` persists across reload; no `/__order` request anywhere. Delete → gone from gallery + R2 (original still in git history/MEGA). Full flow testable offline via `wrangler dev` (Miniflare emulates D1+R2). `grep` confirms `process-images.ts`, `/__order`, `sharp` gone.

**Rollback.** Admin is additive; disabling the Access app / reverting the admin entry leaves the public site untouched. `/api/admin/*` fails closed (Worker 403). Public read path: redeploy the pinned Phase-2 Worker version (static JSON) for one-click revert. Restore from D1 Time Travel / export for any admin-write corruption.

---

## Phase 4 — Blog + editable projects (M, ~6–10h)

**Goal.** Markdown blog posts and an editable projects page on the same foundation. No new infra.

### 4A. Content schema (deferred until now)
Apply `migrations/0002_content.sql` (full DDL below) — **one `posts` table** with a `kind` discriminator (`'blog'|'project'`), a **stable surrogate `id` PK** and a separate `UNIQUE slug`, created only now (not shipped unused in Phase 3).

### 4B. Public rendering + routing
- **Routing:** add `/blog/*` to `run_worker_first` so individual post pages (`/blog/:slug`) are **Worker-rendered** with per-post OG tags — a static MPA under `404-page` has no per-slug file, so crawler-visible OG meta and permalinks require this. List pages `blog.html` and `projects.html` remain static and fetch their lists.
- `GET /api/posts?kind=blog&status=published`, `GET /api/posts/:slug`, `GET /api/posts?kind=project`.
- Markdown rendered **in the Worker at request time** with a small dependency (`marked` or `markdown-it`) → HTML. **Content is single-author and trusted, so HTML sanitization is deliberately not added** (no DOM-free sanitizer is a first-class citizen in `workerd`, and the author is the only writer). Raw HTML in the owner's own markdown passes through; the earlier `<script>`-sanitization acceptance criterion is dropped as out of scope. Keep `body_md` ≤2 MB (D1 row/BLOB cap); embedded images go to R2 (`posts/<post-id>/img-<n>.webp`), referenced by URL — never base64 in D1.
- New pages: `blog.html` (list) + the Worker-rendered post template; `projects.html` converts from hardcoded HTML to fetching `/api/posts?kind=project` (the owner's stated current focus — `roadmap.md`). Low-traffic site; start request-time render, add Cache API only if latency shows (open question 5).

### 4C. Admin CRUD (reuse Phase-3 auth + shell)
`POST/PATCH/DELETE /api/admin/posts[/:slug]`, `PUT /api/admin/posts/order` (batched reorder). Markdown textarea + live preview + draft/publish toggle (sets `published_at`); cover image via the Phase-3 upload pipeline. Boring on purpose. Because the PK is a surrogate `id`, renaming a post's `slug` does not orphan its R2 assets (keyed by `id`); if a published slug changes, emit a 301 old→new in the `/blog/*` handler.

### 4D. SEO baseline (cheap, rides along)
`GET /sitemap.xml` generated from D1 (published posts + galleries); OG tags per post (via 4B Worker render). Structured data / analytics deferred (Out of Scope).

### 4E. Owner definition-of-done (gating)
- **Terminal-free publish:** the owner writes a blog post in the admin markdown editor, adds a cover image, toggles publish, and it appears at `/blog/<slug>` with correct OG tags — **no terminal, no redeploy**. Gating test.

**Acceptance.** Create draft → not on public list; publish → appears with `published_at`; body image loads from R2, no base64 in D1 (`SELECT length(body_md)` sane); edit a project → live on `/projects` without redeploy; `/blog/:slug` renders with OG tags; `sitemap.xml` complete.

**Rollback.** Additive table; keep `projects.html` static content as a fallback until the D1-backed route is proven; disabling the blog nav link + reverting `projects.html` restores Phase-3 state. D1 Time Travel / export covers content restore.

---

## D1 schema (full DDL)

Applied via `wrangler d1 migrations` (numbered files in `migrations/`, tracked in `d1_migrations`). Row/BLOB cap 2 MB, 100 bound params/query (brief B §3): markdown inline is fine; **binaries never in D1**. **No `categories` table** — `category` is a `TEXT` column validated app-side against the single-source list from Phase 1F. **Variants are inline columns** (fixed 2-variant set). **Blog + projects share one `posts` table** via `kind`.

### `migrations/0001_core.sql` (Phase 3)
```sql
CREATE TABLE photos (
  id            TEXT PRIMARY KEY,               -- legacy md5 (83) | sha256(bytes)[:16] (new)
  content_hash  TEXT UNIQUE,                    -- full sha256 hex; dedupe key (409 on re-upload); NEVER shipped to public API
  category      TEXT NOT NULL,                  -- validated app-side against single-source list
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT,
  filename      TEXT NOT NULL,                  -- original filename, display/archive reference
  status        TEXT NOT NULL DEFAULT 'published'
                CHECK (status IN ('draft','published')),
  sort_order    INTEGER NOT NULL DEFAULT 0,     -- order within category (replaces photo-order.json)

  -- R2 variant pointers (keys derivable from id; stored explicit + with dims)
  medium_key    TEXT NOT NULL,                  -- photos/<id>/medium.webp
  medium_w      INTEGER NOT NULL,
  medium_h      INTEGER NOT NULL,
  large_key     TEXT,                           -- photos/<id>/large.webp; NULL until generated
  large_w       INTEGER,
  large_h       INTEGER,
  aspect_ratio  REAL NOT NULL,

  -- EXIF (all nullable; pixels are baked upright, orientation is metadata only)
  date_taken    TEXT,                           -- ISO8601
  camera        TEXT,
  lens          TEXT,
  iso           INTEGER,
  aperture      TEXT,
  shutter_speed TEXT,
  focal_length  TEXT,
  location      TEXT,
  orientation   INTEGER,                        -- raw EXIF 1-8, informational
  exif_json     TEXT,                           -- catch-all for anything not columnised

  original_key  TEXT,                           -- photos/<id>/original.<ext> in R2 (regeneration source; not in public API)
  original_bytes INTEGER,                       -- size traceability (also archived: MEGA/git history)

  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_photos_cat_order ON photos(category, sort_order);
CREATE INDEX idx_photos_status    ON photos(status);
```

### `migrations/0002_content.sql` (Phase 4)
```sql
CREATE TABLE posts (
  id            TEXT PRIMARY KEY,               -- stable surrogate (e.g. random 16-hex); R2 keys use THIS, not slug
  slug          TEXT NOT NULL UNIQUE,           -- url segment; may be renamed without orphaning assets/links
  kind          TEXT NOT NULL CHECK (kind IN ('blog','project')),
  title         TEXT NOT NULL,
  summary       TEXT,
  body_md       TEXT NOT NULL DEFAULT '',       -- <2MB; images are R2 URLs, never base64
  cover_key     TEXT,                           -- optional R2 key: posts/<id>/cover.webp
  -- project-only fields (NULL for blog)
  tech          TEXT,                           -- JSON array of strings
  repo_url      TEXT,
  live_url      TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_posts_kind_status ON posts(kind, status, sort_order);
CREATE INDEX idx_posts_pub         ON posts(kind, status, published_at DESC);
```
`updated_at` is set by the API on write (no SQLite update trigger; explicit is better).

---

## R2 key layout

Single bucket `mossly-images`, public read via custom domain `images.mossly.org`. **ID-only, immutable keys**, written with `Cache-Control: public, max-age=31536000, immutable` + `contentType`.
```
photos/<id>/medium.webp        # ~1200px
photos/<id>/large.webp         # ~2560px  (lightbox)
photos/<id>/original.<ext>     # source bytes (not linked from pages; regeneration/HDR insurance)
posts/<post-id>/cover.webp     # Phase 4 cover (keyed by post id, not slug)
posts/<post-id>/img-<n>.webp   # Phase 4 inline body images
```
Originals live in R2 alongside variants (see 2C rationale); git history + MEGA are the cold-archive tiers. URLs composed as `${IMAGES_BASE}/<key>` where `IMAGES_BASE=https://images.mossly.org`. Immutable cache is not busted on DELETE / same-key overwrite (accepted; manual purge on the rare admin delete-replace).

---

## API route table

Same-origin on `mossly.org`. `run_worker_first` makes listed paths hit Worker code; HTML/assets serve statically at zero invocation cost. Evolves per phase: `["/api/*"]` (Ph2) → `+ ["/admin/*"]` (Ph3) → `+ ["/blog/*"]` (Ph4). All JSON; timestamps ISO8601.

### Public (no auth)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/photos` | none | All `published` photos grouped by category, ordered `(category, sort_order)`, variant URLs → `images.mossly.org`. Optional `?category=<slug>`. **Projection excludes `content_hash` and any admin-only column.** |
| GET | `/api/photos/:id` | none | Single photo (deep link); 404 if draft/absent. |
| GET | `/api/posts?kind=blog&status=published` | none | Published blog list (no `body_md`). Phase 4. |
| GET | `/api/posts?kind=project` | none | Published projects, `sort_order ASC`. Phase 4. |
| GET | `/api/posts/:slug` | none | Single published post/project incl. rendered body. Phase 4. |
| GET | `/blog/:slug` | none | Worker-rendered HTML page with per-post OG tags. Phase 4. |
| GET | `/sitemap.xml` | none | Generated from D1. Phase 4. |

**`/api/photos` response shape** — variants stay **nested under `variants`**, matching the existing front-end accessors (`gallery.ts:391` reads `photo.variants.medium.url`; `lightbox.ts` reads `photo.variants.*.url`); the 3G import→fetch swap is then a drop-in:
```json
{
  "id": "0d76ac47bb3b036b",
  "category": "about",
  "title": "Aaron Moss",
  "aspectRatio": 1.536,
  "variants": {
    "medium":   { "url": "https://images.mossly.org/photos/0d76.../medium.webp",  "width":1200, "height":781 },
    "large":    { "url": "https://images.mossly.org/photos/0d76.../large.webp",   "width":2560, "height":1666 },
    "original": { "url": "https://images.mossly.org/photos/0d76.../original.jpg", "width":6000, "height":3904 }
  },
  "metadata": { "dateTaken":"2025-06-24T13:20:12.174Z", "camera":null, "iso":null }
}
```

### Admin (Cloudflare Access + Worker JWT validation; served under `/admin/*`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/photos` | Access+JWT | All photos incl. drafts (admin grid). |
| POST | `/api/admin/photos/:id/blob/:variant` | Access+JWT | Raw image body (`variant` ∈ `medium\|large\|original`) → `bucket.put(photos/<id>/<variant>.<ext>, {immutable})`; webp for variants, source contentType for `original`. Called 3×/upload. |
| POST | `/api/admin/photos` | Access+JWT | Insert metadata row; 409 if `content_hash` exists; `sort_order`=max+1 for category. |
| PATCH | `/api/admin/photos/:id` | Access+JWT | Edit title/description/category (re-categorize)/status. |
| DELETE | `/api/admin/photos/:id` | Access+JWT | Delete row + R2 objects (medium+large+original); optional edge-cache purge. R2 versioning (open question 3) is the undo. |
| PUT | `/api/admin/photos/order` | Access+JWT | Body `{category, ids:[...]}` → single `db.batch()` UPDATE `sort_order`=index. Replaces `/__order`. |
| POST | `/api/admin/posts` | Access+JWT | Create draft (blog or project). Phase 4. |
| PATCH | `/api/admin/posts/:slug` | Access+JWT | Edit; sets `published_at` on status→published; 301 on slug change. Phase 4. |
| DELETE | `/api/admin/posts/:slug` | Access+JWT | Delete post + R2 assets. Phase 4. |
| PUT | `/api/admin/posts/order` | Access+JWT | Batched reorder. Phase 4. |
| POST | `/api/admin/posts/:slug/asset` | Access+JWT | Upload cover / body image webp → `posts/<post-id>/*` → returns `{url}`. Phase 4. |

The admin HTML itself is served as a static asset at **`/admin/index.html`** (Vite input key `admin/index`), so both the Access scope (`/admin`) and `run_worker_first` (`/admin/*`) match it.

---

## Auth flow (concrete)

1. Browser requests `/admin/` → **Cloudflare Access** (self-hosted app, path-scoped to `/admin` + `/api/admin`) intercepts at the edge → Google OIDC login → sets `CF_Authorization` cookie + injects `Cf-Access-Jwt-Assertion` on subsequent requests.
2. `/admin/index.html` static asset serves (Access gates it at the edge before the asset returns).
3. Admin JS calls `/api/admin/*`; Access injects the JWT header; the Worker (`run_worker_first`) **validates the header** (`jose`: JWKS by `kid` from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, cached; verify `iss`/`aud`/`exp`) before touching D1/R2. Public `/api/*` skips the JWT check.
4. **Defense-in-depth:** a misconfigured Access path still can't reach write routes — the Worker fails closed (403) without a valid JWT header (validate the header, **not** the cookie).

Non-secret config (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) in `wrangler.jsonc` `[vars]`. Google OAuth client secret lives only in the Zero Trust dashboard. No token/secret in the repo.

---

## Content migration runbook (83 photos + order data)

**Prereqs.** Phase 1F done (`photos.frozen.json` committed, 83 frozen md5 IDs); originals still in `public/images/`.

**Phase 2 (bytes → R2; data stays static):**
1. Provision R2 `mossly-images` + custom domain `images.mossly.org` (2B).
2. Run `scripts/migrate-to-r2.ts` (2D): for each of 83 records — read original, compute `content_hash`, generate `large` + carry `medium`, `put` both to `photos/<frozen-id>/{medium,large}.webp` plus the original to `photos/<frozen-id>/original.<ext>` (immutable), emit **public `photos.json` (no `content_hash`)** and **`photos.seed.json` (with `content_hash` + `sort_order` + dims)**. Local Miniflare first, then `--remote`. Idempotent.
3. Replace `src/data/photos.json`; update `photo.ts` types; repoint `lightbox.ts` to `large` (2E).
4. Tag + push `pre-r2-cutover`; deploy Worker; verify on `*.workers.dev`; move domain (2F).
5. After 48h soak: `git rm -r public/images public/processed` (2H) — bytes safe in the tag. **MEGA archive (2G) runs in parallel, any time — it does not gate this.** Do not purge git history.

**Phase 3 (metadata → D1; flip to live):**
6. `wrangler d1 create mossly-content`; apply `0001_core.sql`.
7. Run `scripts/seed-d1.ts` (3B): read `photos.seed.json`, `INSERT` 83 rows — frozen ID as PK, `content_hash`, `category`, `title`, EXIF, variant keys/dims, `aspect_ratio`, `sort_order`. `--remote`.
8. Verify: `count(*)`=83; `content_hash` all non-null + UNIQUE; per-category ordering diff-clean vs the **computed** order (file entries + source-order fallback).
9. Flip `gallery-manager.ts` to `await fetch('/api/photos')` (3G). Verify parity vs the baked snapshot, then retire `photos.json`/`photos.seed.json`/`photo-order.json`/`photos.frozen.json` from the tree (git history keeps them).

**Rollback at any step:** originals safe in git history (tag) + MEGA; baked JSON snapshot restorable; Pages project warm for 2 weeks; D1/R2 additions non-destructive to the old path.

---

## Local dev workflow (wrangler dev with R2 + D1)

- `@cloudflare/vite-plugin` runs Vite inside `workerd` (production parity, HMR, real bindings). One command: `npm run dev`.
- Miniflare auto-creates **local D1** (real SQLite under `.wrangler/state/v3/d1/...`) and **local R2** blobs under `.wrangler/state` — the full admin flow (upload → R2 + D1) is testable offline (brief B §3).
- **Seed local:** `wrangler d1 execute mossly-content --local --file=migrations/0001_core.sql` then a `seed.sql` derived from `photos.seed.json`.
- **Reset:** delete `.wrangler/state` (gitignored — Phase 1G).
- **Gotcha:** a truly *public* R2 custom-domain URL is not emulated locally. Dev the read path via the **binding** (`env.IMAGES.get`); `images.mossly.org` is only exercised against remote.
- **Admin auth in dev (footgun-free):** Access can't gate `localhost`, so there is **no env-var auth bypass** (a single mis-set var would expose write routes to the internet). Instead the Worker skips the JWT check **only when `new URL(request.url).hostname` is `localhost`/`127.0.0.1`** — a value a public request can never carry, so the bypass cannot ship to `mossly.org`. Belt-and-braces: the Worker `throw`s at startup if that local-mode branch is ever reachable on a non-local hostname. The prod check `curl https://mossly.org/api/admin/photos → 403` is a **gating** test, not just an acceptance note.

---

## Backup / restore & disaster recovery

- **D1 Time Travel (default, zero ops):** D1 provides built-in point-in-time restore (~30-day window) — the primary recovery path for admin-write corruption, no cron to build or maintain.
- **Manual export before every migration:** `wrangler d1 export mossly-content --remote --output backup-YYYYMMDD.sql` immediately before each `migrations apply`. Store alongside the git tag / MEGA archive. **Restore drill once (Phase 3):** export → re-import to a local copy → confirm 83 rows.
- **A scheduled export cron is deferred** (Task Scheduler) until there is genuinely irreplaceable content in D1 — until then Time Travel + pre-migration exports cover it (avoids standing ops burden; open question 5).
- **R2 durability + versioning:** optionally enable **object versioning** on `mossly-images` (open question 3) so an accidental admin overwrite/delete is recoverable; otherwise git-history/MEGA originals + regeneration is the recovery path (variants are reproducible from the in-bucket originals).
- **Originals in R2** (`photos/<id>/original.<ext>`) = the hot regeneration source: any future format migration (HDR gain-map JPEG, AVIF, next thing) is one script over one bucket, independent of the owner's local file organization. For **new admin uploads** this is the only server-side copy of the source bytes — periodically `rclone copy` the `photos/` prefix's originals to MEGA to extend the cold archive past the initial 83.
- **MEGA archive / git history** = cold-storage tiers for originals; git tag `pre-r2-cutover` is the fastest full-site rollback.

---

## Master deletion list (what dies, and when)

| Item | Phase | Reason |
|---|---|---|
| `/fonts/inter-var.woff2` preload, googleapis dns-prefetch | 1B | 404 / unused |
| tracked `.DS_Store`, `.vite/deps` | 1G | build junk |
| `.eslintrc.cjs` | 1C | ESLint 9 flat config |
| `beforeunload` listener (`app.ts`) | 1D | breaks bfcache |
| leaked LazyLoad instance + orphan constructor instance | 1D | memory leak |
| leaked document click listener in `destroy()` | 1D | leak |
| `theme-toggle.ts` | 1E | dead code |
| 34 unused DaisyUI themes | 1E | bundle bloat |
| `blurDataUrl` (front-end use) | 1E | unused; physical drop 2E |
| `IMAGE_FORMATS` avif entry | 1E | never generated |
| duplicated category list (3 TS sites) | 1F | single source of truth |
| duplicated category markup in `index.html` | 3G | retired when gallery goes dynamic |
| `blurDataUrl` (physical) | 2E | unused (originals kept — lightbox source) |
| `public/images/` (299 MB), `public/processed/` (11 MB) | 2H | → R2 + git-history/MEGA (after 48h soak) |
| `scripts/process-images.ts` + `process-images` script | 3I | replaced by browser pipeline |
| `sharp` (dep) | 3I | pipeline retired |
| `vite.config.ts` `/__order` middleware (:17-44) | 3I | replaced by D1 order API |
| `gallery-manager.ts:55-68` `saveOrder()` → `/__order` | 3I | repointed to `/api/admin/photos/order` |
| `gallery.ts:236-267` dev-only public-gallery sortable | 3I | reorder moves to admin |
| `photos.json`, `photos.seed.json`, `photo-order.json`, `photos.frozen.json` | 3I | D1 is source of truth (history retains) |
| one-off `migrate-to-r2.ts`, `seed-d1.ts` | after use | migration records in git history |
| hardcoded `projects.html` content | 4 | editable from D1 |
| git history purge of originals (`filter-branch`/BFG) | post-Phase-3, optional | keep history as rollback first |

**Dependency net:** remove `sharp`, `@types/sortablejs`, and any `jsdom`/`@types/jsdom` if unused (verify). Add `@cloudflare/vite-plugin`, `wrangler` (dev), `jose`, `@jsquash/webp`, a markdown renderer (Phase 4). `exifr` moves Node-side → browser-side. `sortablejs`, `photoswipe`, `vanilla-lazyload`, `daisyui` stay.

---

## Out of scope (explicitly NOT building)

- **Re-sequencing admin before the storage migration** — the owner signed off on the order (polish → R2 → admin → blog); Phase 2/3 are split into small revertable units and stood up on `*.workers.dev` first to shorten time-to-first-upload without relitigating the agreed sequence.
- **Server-side / sharp-behind-Worker image pipeline or Cloudflare Images** — the agreed architecture is client-side variant generation (kills the rebuild-per-photo problem); kept.
- **HTML sanitizer for markdown** — content is single-author and trusted; no DOM-free sanitizer is added.
- **Legacy `/images/*` `/processed/*` 301 redirect shims** — cut (site historically unused); added reactively only if analytics show real hits.
- **FOUC critical-CSS consolidation** — copy-paste works; craftsmanship that neither survives nor blocks the migration.
- **Dark/light theme toggle** — dead stub deleted (1E); feature deferred.
- **Categories table / many-to-many tagging / multi-category filter** — `category` is validated app-side TEXT; one photo → one category.
- **libheif-js / in-browser HEIC decode** — owner uploads JPEG or uses Safari; revisit if HEIC becomes routine (open question 2).
- **Presigned R2 uploads / multipart** — unnecessary under the 100 MB Worker limit; unreachable escape hatch only.
- **AVIF variants** — webp-only for now.
- **HDR variants** — explicitly deferred, deliberately enabled later. The owner wants the site HDR-capable eventually. Facts that shape this: WebP is 8-bit SDR-only, and **browser canvas APIs tone-map HDR sources to SDR on decode**, so the Phase-3 client-side pipeline can never emit HDR — HDR variants (ISO 21496-1 gain-map JPEG "Ultra HDR", or 10-bit AVIF) must be regenerated from originals by a local batch script (libvips/libultrahdr) when the time comes. The plan pre-pays exactly two cheap accommodations: **originals stored in R2** (`photos/<id>/original.<ext>` — the regeneration input) and a schema that takes an `hdr_key`-style column in a one-line migration. Serving later = `<picture>` with HDR source + webp fallback. Also note: existing SDR captures can't become HDR retroactively — this applies to future work shot in HEIC/RAW and exported with a gain map.
- **Scheduled D1 backup cron** — D1 Time Travel + pre-migration exports until there is irreplaceable content.
- **Two-scheme ID consolidation** — mixed frozen-md5 / sha256 IDs are sound (dedupe is via `content_hash`); unifying would re-key R2 for zero benefit.
- **Auto-screenshot tooling, advanced gallery search/sort/counts, virtual scroll, service worker, lightbox preload** — roadmap wants; none block the base-of-operations goal.
- **Analytics, error tracking, structured data** — Phase 4 does sitemap + OG only.
- **Client galleries, e-commerce, print/licensing, social embeds, comments** — out entirely.
- **Unit/E2E suite, pre-commit hooks** — verification is manual smoke tests + owner-DoD by design (solo operator).
- **innerHTML title-interpolation hardening** — self-authored data, low risk.
- **Moving CV/logo/favicon to R2** — tiny, in `public/`.
- **git-history purge of originals** — deferred well past Phase 3 so history stays as rollback.

---

## Open questions for the owner (genuinely owner-level decisions)

1. **Deployment substrate (Phase 0):** confirm the site is Cloudflare **Pages-from-GitHub** and the account **plan tier** (Free vs Pro), and report the exact `mossly.org`/`www` custom-domain binding. Blocks the Phase-2 cutover shape and its rollback.
2. **HEIC uploads — RESOLVED:** owner will mostly upload JPEG. No `libheif-js`; the 3E feature-detect + "convert to JPEG" message covers the stray HEIC. Revisit only if the HDR era (see Out of Scope) makes HEIC/gain-map sources routine.
3. **R2 object versioning:** enable on `mossly-images` for undo-safety on admin overwrites/deletes? Small storage cost, stronger DR.
4. **MEGA S4 region + keys (non-blocking):** which endpoint is nearest (`eu-central-1` Amsterdam, `eu-central-2` Bettembourg, `ca-central-1` Montreal, `ca-west-1` Vancouver)? You mint the S4 access key/secret in the MEGA console. This archive does not gate the cutover.
5. **Blog render + backup:** request-time Worker render (recommended start) vs pre-render on save? And confirm D1 Time Travel + pre-migration exports are enough for now (vs a scheduled export task).
6. **Legacy URL references:** are there external/SEO-indexed links to `/images/*` or `/processed/*` that must 301, or is it safe to leave them 404 (shims cut) and add reactively only if analytics show hits?
7. **Draft-vs-published default + Zero Trust identity:** photos default `published`, posts default `draft` — confirm. And which Google account (personal vs Workspace) + Zero Trust team name to allowlist for `/admin`?

---

**Migration-risk one-liner.** The only irreplaceable assets are the ID↔order↔content join for the 83 photos and the original bytes; both are protected by redundant copies (frozen JSON + git-history tag + MEGA archive + D1 Time Travel/export) before any deletion, the storage move (Phase 2) never coincides with the app-mechanism change (Phase 3), each phase is split into small independently-revertable units, and no destructive step happens until its replacement is verified live behind a tagged, dashboard-revertable checkpoint.
