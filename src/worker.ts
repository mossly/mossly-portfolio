interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  IMAGES: unknown // R2 bucket binding, used in later phases
  IMAGES_BASE: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      // Placeholder for Phase 3+ API routes.
      return Response.json({ ok: true, stub: true, path: url.pathname }, { status: 200 })
    }
    // Non-/api/* requests are served from static assets (run_worker_first only lists /api/*),
    // but keep this fallback so the Worker is correct if invoked for any other path.
    return env.ASSETS.fetch(request)
  },
}
