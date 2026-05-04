/**
 * @file flakyTests.js
 * Service module for the flaky-tests inventory produced by the Toolforge cron
 * (scripts/fetch-snapshot-data.js). The cron queries the Wikimedia Datasette at
 * releng-data.wmcloud.org for `select * from flaky_tests order by count desc`
 * and writes the result to /data/flaky-tests.json.
 *
 * Like metricsHistory.js, this service has no live API counterpart — the
 * upstream Datasette is gated by Anubis bot-protection that the browser
 * cannot pass, so the snapshot is the only source. The USE_STATIC_DATA flag
 * is intentionally ignored: the snapshot path is the same in every mode.
 *
 * A missing file is treated as "no flaky tests reported yet" (returns an empty
 * rows array) rather than throwing, so the panel can render its own empty
 * state instead of the generic ErrorBanner.
 */

const FLAKY_URL = '/data/flaky-tests.json';

/**
 * @typedef {Object} FlakyTestRow
 *   Permissive shape — passes through any column the Datasette table emits.
 * @property {string|null} name   Test name (best-effort: name | test_name | test)
 * @property {string|null} repo   Repo (best-effort: repo | project | repository)
 * @property {string|null} job    Jenkins job (best-effort: job | build_name | jenkins_job)
 * @property {number}      count  Required — flaky-occurrence count
 * @property {Object}      raw    Original row, preserved for forward compatibility
 */

/**
 * @typedef {Object} FlakyTestsData
 * @property {string|null} generatedAt       ISO timestamp the snapshot was written
 * @property {Array<FlakyTestRow>} rows
 */

/**
 * Parse the Jenkins job name out of the `Example` HTML anchor the Datasette
 * row carries — its href looks like
 * `https://integration.wikimedia.org/ci/job/<job-name>/<build>/`. Returns
 * null when the input doesn't match that pattern so the caller can fall back.
 *
 * @param {string|null|undefined} example
 * @returns {string|null}
 */
export function parseJobFromExample(example) {
  if (typeof example !== 'string' || !example) return null;
  const match = example.match(/\/ci\/job\/([^/"<>\s]+)/);
  return match ? match[1] : null;
}

/**
 * Permissive normaliser. The only required field is a numeric `count`;
 * everything else is best-effort with fallbacks across the column names the
 * Datasette table uses. As of writing the live schema is:
 *   Count, Test Name, Example, Most recent flake
 * but the lowercase / underscore variants are accepted too in case the table
 * ever picks up additional columns. The original row is preserved on `raw`
 * so future fields can be surfaced without changing this function.
 *
 * @param {unknown} raw
 * @returns {FlakyTestRow|null}
 */
export function normaliseRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rawCount = raw.Count ?? raw.count;
  const count = typeof rawCount === 'number' ? rawCount : Number(rawCount);
  if (!Number.isFinite(count)) return null;

  const name = raw['Test Name'] ?? raw.name ?? raw.test_name ?? raw.test ?? null;
  const repo = raw.repo ?? raw.project ?? raw.repository ?? null;
  const job  = raw.job ?? raw.build_name ?? raw.jenkins_job
            ?? parseJobFromExample(raw.Example ?? raw.example)
            ?? null;

  return { name, repo, job, count, raw };
}

/**
 * Fetch the flaky-tests snapshot. Returns an empty envelope when the file is
 * absent (Toolforge cron has not run yet, or local dev without the snapshot
 * script having been run).
 *
 * @returns {Promise<FlakyTestsData>}
 */
export async function fetchFlakyTests() {
  const res = await fetch(FLAKY_URL);
  if (res.status === 404) return { generatedAt: null, rows: [] };
  if (!res.ok) {
    throw new Error(`Flaky tests fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const rawRows = Array.isArray(json?.rows)
    ? json.rows
    : Array.isArray(json) ? json : [];
  return {
    generatedAt: typeof json?.generatedAt === 'string' ? json.generatedAt : null,
    rows: rawRows.map(normaliseRow).filter(Boolean),
  };
}
