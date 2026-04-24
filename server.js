/**
 * @file server.js
 *
 * Minimal static-file server for the Toolforge deployment of mw-qa-dashboard.
 *
 * Serves two trees:
 *   /            → built Vite assets in DIST_DIR (default: ./dist)
 *   /data/*      → JSON snapshots in SNAPSHOT_DIR  (default: ./snapshot-data)
 *
 * Snapshots are decoupled from the build so the Toolforge cron job
 * (scripts/fetch-snapshot-data.js, scheduled every 6 h) can refresh data
 * without rebuilding the app. On Toolforge both DIST_DIR and SNAPSHOT_DIR
 * sit on the tool's NFS-mounted $HOME so the webservice and job share them.
 *
 * Listens on process.env.PORT (Toolforge sets this to 8000 on Kubernetes)
 * or 8000 by default.
 *
 * Environment variables:
 *   PORT          — TCP port to bind (default 8000)
 *   DIST_DIR      — absolute path to the Vite build output (default ./dist)
 *   SNAPSHOT_DIR  — absolute path to snapshot JSON directory (default ./snapshot-data)
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.PORT) || 8000;
const distDir = process.env.DIST_DIR
  ? path.resolve(process.env.DIST_DIR)
  : path.join(__dirname, 'dist');
const snapshotDir = process.env.SNAPSHOT_DIR
  ? path.resolve(process.env.SNAPSHOT_DIR)
  : path.join(__dirname, 'snapshot-data');

const app = express();
app.disable('x-powered-by');

// Snapshot data — written by the Toolforge cron job, refreshed independently
// from the build. Missing files return 404 (express.static defaults to
// fallthrough: true, then the SPA fallback below short-circuits /data/* to a
// JSON 404 instead of serving index.html).
app.use('/data', express.static(snapshotDir, { maxAge: '5m' }));

// Built Vite assets (HTML, JS, CSS, images). index.html is auto-served at /.
app.use(express.static(distDir, { maxAge: '1h', index: 'index.html' }));

// SPA fallback for client-side routes. Anything that wasn't matched above
// (and isn't a /data/* path that already 404'd) gets index.html so the React
// router can take over. /data/* gets a JSON 404 instead.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/data/')) {
    return res.status(404).json({ error: 'not_found', path: req.path });
  }
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) next(err);
  });
});

const server = app.listen(port, () => {
  const actualPort = server.address().port;
  console.log(`mw-qa-dashboard listening on port ${actualPort}`);
  console.log(`  dist:     ${distDir}`);
  console.log(`  snapshot: ${snapshotDir}`);
});

// Graceful shutdown for Kubernetes rolling restarts on Toolforge.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`Received ${signal}, closing HTTP server…`);
    server.close(() => process.exit(0));
  });
}

export { app, server };
