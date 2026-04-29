import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, statSync, createReadStream } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Dev-only middleware that serves /data/* from snapshot-data/. In prod, the
 * Toolforge express server (server.js) does the same. Without this, dev mode
 * returns 404 for /data/metrics-history.json — the only snapshot source for
 * the Trends panel — so the panel always shows the empty state.
 */
function snapshotDataMiddleware() {
  return {
    name: 'snapshot-data-dev-middleware',
    configureServer(server) {
      const snapshotDir = path.resolve(__dirname, 'snapshot-data')
      server.middlewares.use('/data', (req, res, next) => {
        const requested = path.join(snapshotDir, req.url ?? '')
        if (!requested.startsWith(snapshotDir)) return next()
        if (!existsSync(requested) || !statSync(requested).isFile()) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'not_found', path: req.url }))
          return
        }
        res.setHeader('Content-Type', 'application/json')
        createReadStream(requested).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), snapshotDataMiddleware()],
  // App is served from the domain root on Toolforge
  // (https://mw-qa-dashboard.toolforge.org/), so assets resolve at '/'.
  // VITE_STATIC_DATA still gates client-side static-vs-live data behaviour,
  // independent of the base path.
  base: '/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
  server: {
    proxy: {
      // Wikimedia test coverage index — CORS blocked, no auth required
      '/api/coverage': {
        target: 'https://doc.wikimedia.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/coverage/, ''),
      },
      // Phabricator Conduit API — CORS blocked, must go through server-side proxy
      '/api/phabricator': {
        target: 'https://phabricator.wikimedia.org/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/phabricator/, ''),
      },
      // Wikimedia Jenkins CI — no CORS headers, must go through server-side proxy
      '/api/jenkins': {
        target: 'https://integration.wikimedia.org/ci',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jenkins/, ''),
      },
      // MediaWiki index.php raw endpoint (used for pages with JSON content
      // model, e.g. the browser-test-scanner inventory). action=raw does not
      // send CORS headers, unlike api.php, so we proxy it.
      '/api/mw-raw': {
        target: 'https://www.mediawiki.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mw-raw/, ''),
      },
    },
  },
})
