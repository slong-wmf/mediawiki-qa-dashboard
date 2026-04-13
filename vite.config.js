import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // When building for GitHub Pages (VITE_STATIC_DATA=true), set the base path
  // to the repository name so asset URLs resolve correctly under the subdirectory.
  // In dev and Vercel deployments the base stays at '/' (the default).
  base: process.env.VITE_STATIC_DATA === 'true' ? '/mediawiki-qa-dashboard/' : '/',
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
    },
  },
})
