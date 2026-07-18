import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import { promises as fs } from 'fs'

const ORDER_FILE = path.resolve(__dirname, 'src/data/photo-order.json')

function photoOrderPlugin(): Plugin {
  return {
    name: 'photo-order',
    apply: 'serve',
    handleHotUpdate(ctx) {
      // Don't trigger HMR when we write the order file ourselves — the gallery
      // re-renders in place, so a reload would just cause a flash.
      if (path.resolve(ctx.file) === ORDER_FILE) return []
      return undefined
    },
    configureServer(server) {
      server.middlewares.use('/__order', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('expected { [category]: string[] }')
          }
          let current: Record<string, string[]> = {}
          try {
            current = JSON.parse(await fs.readFile(ORDER_FILE, 'utf8'))
          } catch {}
          const merged = { ...current, ...parsed }
          await fs.writeFile(ORDER_FILE, JSON.stringify(merged, null, 2) + '\n')
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          res.statusCode = 400
          res.end(String(err instanceof Error ? err.message : err))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [photoOrderPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        about: path.resolve(__dirname, 'about.html'),
        projects: path.resolve(__dirname, 'projects.html'),
        // Static asset only (built to /admin/) -- NOT added to run_worker_first
        // in wrangler.jsonc; only /api/admin/* is Worker code (see phase-3e-plan.md).
        admin: path.resolve(__dirname, 'admin/index.html'),
      },
      output: {
        manualChunks: {
          vendor: ['photoswipe'],
        },
      },
    },
  },
  worker: {
    // admin/upload-worker.ts dynamically imports one of two @jsquash/webp wasm
    // codec chunks (SIMD vs non-SIMD) at runtime -- code-splitting requires ES
    // module output; Vite's default 'iife' worker format doesn't support it.
    format: 'es',
  },
  server: {
    port: 3000,
    open: true,
    // The public site now fetches /api/photos at runtime (Phase 3G), but the
    // Vite dev server has no /api/* handler -- unproxied, it would return
    // index.html and the gallery's `res.json()` would throw into an empty
    // state. Proxy /api to a local `wrangler dev` (default :8787), which serves
    // the real Worker + D1. So for public-site dev, run `wrangler dev`
    // alongside `vite` (or just use `wrangler dev`, which serves the built app
    // directly and needs no proxy).
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
