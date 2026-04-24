/**
 * Tests for server.js — the Express static-file server used on Toolforge.
 *
 * Spins up the real server on an OS-assigned port (PORT=0) with both DIST_DIR
 * and SNAPSHOT_DIR pointed at temporary directories containing fixture files.
 * Verifies:
 *   - /data/<file>     → 200 from SNAPSHOT_DIR
 *   - /data/<missing>  → 404 (not SPA-fallback)
 *   - /                → 200 with index.html from DIST_DIR
 *   - /spa/route       → 200 with index.html (SPA fallback)
 *   - PORT env var honoured
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let server;
let baseUrl;
let snapshotTmpDir;
let distTmpDir;

beforeAll(async () => {
  // Fixture: snapshot dir with one JSON file
  snapshotTmpDir = mkdtempSync(path.join(tmpdir(), 'mwqa-snapshot-'));
  writeFileSync(
    path.join(snapshotTmpDir, 'fixture.json'),
    JSON.stringify({ ok: true, source: 'test-fixture' }),
  );

  // Fixture: dist dir with a marker index.html
  distTmpDir = mkdtempSync(path.join(tmpdir(), 'mwqa-dist-'));
  writeFileSync(
    path.join(distTmpDir, 'index.html'),
    '<!doctype html><html><body data-test="dist-fixture">ok</body></html>',
  );

  process.env.SNAPSHOT_DIR = snapshotTmpDir;
  process.env.DIST_DIR = distTmpDir;
  process.env.PORT = '0'; // ask kernel for a free port

  // Dynamic import so server.js sees the env vars set above.
  const mod = await import('../../server.js');
  server = mod.server;

  // server.listen is invoked at import time but binding is async.
  if (!server.listening) {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  }
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (snapshotTmpDir) rmSync(snapshotTmpDir, { recursive: true, force: true });
  if (distTmpDir) rmSync(distTmpDir, { recursive: true, force: true });
  delete process.env.SNAPSHOT_DIR;
  delete process.env.DIST_DIR;
  delete process.env.PORT;
});

describe('server.js — Toolforge static server', () => {
  it('listens on a port assigned via PORT env var', () => {
    expect(server.address().port).toBeGreaterThan(0);
  });

  it('serves a snapshot fixture at /data/<file> from SNAPSHOT_DIR', async () => {
    const res = await fetch(`${baseUrl}/data/fixture.json`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, source: 'test-fixture' });
  });

  it('returns a JSON 404 for a missing snapshot file (not SPA fallback)', async () => {
    const res = await fetch(`${baseUrl}/data/does-not-exist.json`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'not_found' });
  });

  it('serves index.html at /', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-test="dist-fixture"');
  });

  it('falls back to index.html for SPA client-side routes', async () => {
    const res = await fetch(`${baseUrl}/some/spa/route`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-test="dist-fixture"');
  });
});
