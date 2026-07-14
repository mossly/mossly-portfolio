/// <reference types="@cloudflare/workers-types" />

import { isValidAccessRequest } from './auth'
import { handleAdminApi } from './admin-api'
import { handlePublicPhotos } from './public-api'

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  IMAGES: R2Bucket
  IMAGES_BASE: string
  DB: D1Database
  ACCESS_AUD: string
  ACCESS_TEAM_DOMAIN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Phase 3G: public, unauthenticated read -- mounted ahead of the
    // /api/admin/* gate below since it needs none of that gating.
    if (url.pathname === '/api/photos' && request.method === 'GET') {
      return handlePublicPhotos(env)
    }

    if (url.pathname.startsWith('/api/admin/')) {
      // Local-dev bypass: only when the request's own hostname is localhost/127.0.0.1.
      // This is a per-request check (hostname varies per request), not a startup-time
      // one -- a public request can never carry a localhost hostname, so this cannot
      // leak into production regardless of env vars.
      const isLocalDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

      if (!isLocalDev) {
        const authorized = await isValidAccessRequest(
          request,
          env.ACCESS_TEAM_DOMAIN,
          env.ACCESS_AUD,
        )
        if (!authorized) {
          return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }
      }

      // Auth passed (or localhost dev bypass) -- dispatch to the real admin router.
      return handleAdminApi(request, env, url)
    }

    if (url.pathname.startsWith('/api/')) {
      // Placeholder for Phase 3+ public API routes.
      return Response.json({ ok: true, stub: true, path: url.pathname }, { status: 200 })
    }

    // Non-/api/* requests are served from static assets (run_worker_first only lists /api/*),
    // but keep this fallback so the Worker is correct if invoked for any other path.
    return env.ASSETS.fetch(request)
  },
}
