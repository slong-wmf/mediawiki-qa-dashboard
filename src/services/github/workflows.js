/**
 * @file workflows.js
 *
 * GitHub Actions workflow-run health for one of the mobile-app repos.
 * Live mode hits api.github.com directly (CORS-enabled, anonymous quota
 * 60 req/hr per IP — sufficient for a dashboard that fetches once on load).
 * Static mode reads `${platform}-workflows.json` written by the Toolforge
 * snapshot job, which uses the GITHUB_TOKEN env var to lift the quota to
 * 5000 req/hr.
 *
 * Returned shape is fully aggregated so the panel stays presentational:
 *   {
 *     runs: Array<NormalizedRun>,
 *     byWorkflow: Record<string, { n, passed, failed, avgDurationMs }>,
 *     fetchedAt: string (ISO),
 *   }
 */

import { USE_STATIC_DATA, fetchStaticJson } from '../staticData.js';
import { repoFor, GITHUB_API_BASE } from './repos.js';

/**
 * @typedef {Object} NormalizedRun
 * @property {number}      id
 * @property {string}      name             Workflow display name.
 * @property {string}      status           queued | in_progress | completed | …
 * @property {string|null} conclusion       success | failure | cancelled | skipped | timed_out | action_required | null
 * @property {string}      created_at       ISO timestamp when the run was queued.
 * @property {string|null} run_started_at   ISO timestamp when execution began (may lag created_at).
 * @property {string}      updated_at       ISO timestamp of the last status update.
 * @property {string}      html_url         Link to the run on GitHub.
 * @property {string}      head_branch      Branch the workflow ran against.
 * @property {string}      event            Trigger (push, pull_request, schedule, …).
 * @property {number}      run_attempt      Re-run count (1 = first attempt).
 * @property {number|null} duration_ms      Derived from run_started_at→updated_at; null if either timestamp missing.
 */

/**
 * Normalise a single GitHub Actions run record to a stable shape that does
 * not change when GitHub adds new fields to the response.
 *
 * @param {object} raw  A raw entry from `workflow_runs` in the API response.
 * @returns {NormalizedRun}
 */
export function normalizeRun(raw) {
  const start = raw.run_started_at ?? raw.created_at;
  const end = raw.updated_at;
  let duration_ms = null;
  if (start && end) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      duration_ms = endMs - startMs;
    }
  }
  return {
    id: raw.id,
    name: raw.name ?? '(unnamed workflow)',
    status: raw.status ?? 'unknown',
    conclusion: raw.conclusion ?? null,
    created_at: raw.created_at,
    run_started_at: raw.run_started_at ?? null,
    updated_at: raw.updated_at,
    html_url: raw.html_url,
    head_branch: raw.head_branch ?? null,
    event: raw.event ?? null,
    run_attempt: raw.run_attempt ?? 1,
    duration_ms,
  };
}

/**
 * Aggregate normalised runs into per-workflow stats. Used by both the live
 * service and the snapshot script so the on-disk JSON shape matches what the
 * panel receives in dev mode.
 *
 * @param {NormalizedRun[]} runs
 * @returns {Record<string, { n: number, passed: number, failed: number, avgDurationMs: number|null }>}
 */
export function aggregateByWorkflow(runs) {
  /** @type {Record<string, { n: number, passed: number, failed: number, totalDurationMs: number, durationCount: number }>} */
  const acc = {};
  for (const run of runs) {
    const key = run.name;
    if (!acc[key]) {
      acc[key] = { n: 0, passed: 0, failed: 0, totalDurationMs: 0, durationCount: 0 };
    }
    const bucket = acc[key];
    bucket.n += 1;
    if (run.conclusion === 'success') bucket.passed += 1;
    else if (run.conclusion === 'failure' || run.conclusion === 'timed_out') bucket.failed += 1;
    if (typeof run.duration_ms === 'number') {
      bucket.totalDurationMs += run.duration_ms;
      bucket.durationCount += 1;
    }
  }
  /** @type {Record<string, { n: number, passed: number, failed: number, avgDurationMs: number|null }>} */
  const out = {};
  for (const [name, bucket] of Object.entries(acc)) {
    out[name] = {
      n: bucket.n,
      passed: bucket.passed,
      failed: bucket.failed,
      avgDurationMs: bucket.durationCount > 0
        ? Math.round(bucket.totalDurationMs / bucket.durationCount)
        : null,
    };
  }
  return out;
}

/**
 * Fetch recent GitHub Actions workflow runs for a mobile-app repo.
 *
 * In static mode this returns the pre-shaped JSON written by the Toolforge
 * snapshot job. In live mode it hits api.github.com directly — no auth token
 * is sent (PATs must never ship in client JS), so dev requests count against
 * the anonymous IP quota of 60 req/hr.
 *
 * @param {'ios' | 'android'} platform
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ runs: NormalizedRun[], byWorkflow: ReturnType<typeof aggregateByWorkflow>, fetchedAt: string }>}
 */
export async function fetchRecentWorkflowRuns(platform, opts = {}) {
  if (USE_STATIC_DATA) return fetchStaticJson(`${platform}-workflows.json`);

  const { limit = 30 } = opts;
  const repo = repoFor(platform);
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/actions/runs?per_page=${limit}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub Actions runs (${repo.fullName}): ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const runs = Array.isArray(json.workflow_runs) ? json.workflow_runs.map(normalizeRun) : [];
  return {
    runs,
    byWorkflow: aggregateByWorkflow(runs),
    fetchedAt: new Date().toISOString(),
  };
}
