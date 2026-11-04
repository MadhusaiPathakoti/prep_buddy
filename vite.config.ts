import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Runs the Vercel-style functions in /api under `npm run dev`, so Gemini-backed features work
 * locally without the Vercel CLI. Reads GEMINI_API_KEY / GEMINI_MODEL from .env.local (never shipped
 * to the browser — it only lives in the dev server's process).
 */
function localApi(): Plugin {
  return {
    name: 'prepbuddy-local-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL']) {
        if (env[key] && !process.env[key]) process.env[key] = env[key]
      }

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const match = url.pathname.match(/^\/api\/([A-Za-z0-9_-]+)$/)
        if (!match) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`)
          let body: unknown
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk as Buffer)
            const raw = Buffer.concat(chunks).toString('utf8')
            try {
              body = raw ? JSON.parse(raw) : undefined
            } catch {
              body = raw
            }
          }
          const vreq = Object.assign(req, { query: Object.fromEntries(url.searchParams), body })
          const vres = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return vres
            },
            json(payload: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(payload))
            },
          })
          await mod.default(vreq, vres)
        } catch (err) {
          res.statusCode = err instanceof Error && /Failed to load url|Cannot find/.test(err.message) ? 404 : 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Function failed' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
})
