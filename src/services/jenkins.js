/**
 * @file jenkins.js
 * Service module for the Wikimedia Jenkins CI REST API.
 * Jenkins does not send CORS headers, so all requests go through
 * the Vite proxy at /api/jenkins → https://integration.wikimedia.org/ci
 *
 * No authentication is required — the Jenkins instance is publicly readable.
 */

import { USE_STATIC_DATA, fetchStaticJson } from './staticData.js';

const BASE_URL = '/api/jenkins';

/**
 * The two Jenkins views that contain the Selenium jobs tracked by this dashboard.
 * Used by fetchTrackedJobs() to build a dynamic job list at runtime.
 */
const JENKINS_VIEWS = ['Selenium', 'selenium-daily'];

/**
 * Name prefix of the daily per-repo Selenium jobs. These jobs run on Catalyst.
 * The Beta Cluster jobs (selenium-daily-beta-*) do not exist now.
 */
export const DAILY_JOB_PREFIX = 'catalyst-daily-';

/**
 * Default (static) job list used when fetchTrackedJobs() has not been called.
 *
 * Jobs sourced from the Selenium and Selenium-daily Jenkins views:
 *   https://integration.wikimedia.org/ci/view/Selenium/
 *   https://integration.wikimedia.org/ci/view/selenium-daily/
 *
 * This list includes only the jobs that had one or more builds by 2026-10-19.
 *
 * `hasTestReport: true` means the job publishes a JUnit TestResultAction,
 * allowing test-level pass/fail counts to be surfaced in addition to the
 * overall job result. Jobs without this flag report job-level results only.
 */
export const DEFAULT_TRACKED_JOBS = [
  // ── Core Selenium (Quibble) ────────────────────────────────────────────────
  { label: 'Selenium PHP 8.3',           slug: 'quibble-composer-mysql-php83-selenium',        hasTestReport: false },
  { label: 'Selenium Vendor PHP 8.3',    slug: 'quibble-vendor-mysql-php83-selenium',          hasTestReport: false },
  { label: 'Selenium Gated Ext',         slug: 'quibble-with-gated-extensions-selenium-php83', hasTestReport: false },
  // ── Selenium-daily (Catalyst, per-repo WDIO) ───────────────────────────────
  // All these jobs, except termbox and Wikibase, publish a JUnit TestResultAction.
  { label: 'AbuseFilter (daily)',        slug: 'catalyst-daily-AbuseFilter',                   hasTestReport: true  },
  { label: 'AchievementBadges (daily)',  slug: 'catalyst-daily-AchievementBadges',             hasTestReport: true  },
  { label: 'AdvancedSearch (daily)',     slug: 'catalyst-daily-AdvancedSearch',                hasTestReport: true  },
  { label: 'CampaignEvents (daily)',     slug: 'catalyst-daily-CampaignEvents',                hasTestReport: true  },
  { label: 'Cargo (daily)',              slug: 'catalyst-daily-Cargo',                         hasTestReport: true  },
  { label: 'CentralNotice (daily)',      slug: 'catalyst-daily-CentralNotice',                 hasTestReport: true  },
  { label: 'CodeMirror (daily)',         slug: 'catalyst-daily-CodeMirror',                    hasTestReport: true  },
  { label: 'CommunityRequests (daily)',  slug: 'catalyst-daily-CommunityRequests',             hasTestReport: true  },
  { label: 'ContactPage (daily)',        slug: 'catalyst-daily-ContactPage',                   hasTestReport: true  },
  { label: 'core (daily)',               slug: 'catalyst-daily-core',                          hasTestReport: true  },
  { label: 'Echo (daily)',               slug: 'catalyst-daily-Echo',                          hasTestReport: true  },
  { label: 'ElectronPdfService (daily)', slug: 'catalyst-daily-ElectronPdfService',            hasTestReport: true  },
  { label: 'examples (daily)',           slug: 'catalyst-daily-examples',                      hasTestReport: true  },
  { label: 'GlobalWatchlist (daily)',    slug: 'catalyst-daily-GlobalWatchlist',               hasTestReport: true  },
  { label: 'Math (daily)',               slug: 'catalyst-daily-Math',                          hasTestReport: true  },
  { label: 'Newsletter (daily)',         slug: 'catalyst-daily-Newsletter',                    hasTestReport: true  },
  { label: 'PageTriage (daily)',         slug: 'catalyst-daily-PageTriage',                    hasTestReport: true  },
  { label: 'ParserMigration (daily)',    slug: 'catalyst-daily-ParserMigration',               hasTestReport: true  },
  { label: 'Popups (daily)',             slug: 'catalyst-daily-Popups',                        hasTestReport: true  },
  { label: 'ProofreadPage (daily)',      slug: 'catalyst-daily-ProofreadPage',                 hasTestReport: true  },
  { label: 'ReportIncident (daily)',     slug: 'catalyst-daily-ReportIncident',                hasTestReport: true  },
  { label: 'RevisionSlider (daily)',     slug: 'catalyst-daily-RevisionSlider',                hasTestReport: true  },
  { label: 'Sanctions (daily)',          slug: 'catalyst-daily-Sanctions',                     hasTestReport: true  },
  { label: 'TemplateData (daily)',       slug: 'catalyst-daily-TemplateData',                  hasTestReport: true  },
  { label: 'TemplateWizard (daily)',     slug: 'catalyst-daily-TemplateWizard',                hasTestReport: true  },
  { label: 'termbox (daily)',            slug: 'catalyst-daily-termbox',                       hasTestReport: false },
  { label: 'TwoColConflict (daily)',     slug: 'catalyst-daily-TwoColConflict',                hasTestReport: true  },
  { label: 'VisualEditor (daily)',       slug: 'catalyst-daily-VisualEditor',                  hasTestReport: true  },
  { label: 'Wikibase (daily)',           slug: 'catalyst-daily-Wikibase',                      hasTestReport: false },
  // This job also runs daily on Catalyst. It does not publish a JUnit report.
  { label: 'WikiLambda E2E (daily)',     slug: 'wikilambda-catalyst-end-to-end-daily',         hasTestReport: false },
];

/** How many recent builds to fetch per job. */
const BUILDS_PER_JOB = 20;

/**
 * Normalise a Jenkins result string to one of: 'passed' | 'failed' | 'other'.
 * @param {string|null} result
 * @returns {'passed'|'failed'|'other'}
 */
export function normaliseStatus(result) {
  if (result === 'SUCCESS') return 'passed';
  if (result === 'FAILURE' || result === 'UNSTABLE') return 'failed';
  return 'other'; // ABORTED, NOT_BUILT, null (still running)
}

/** Public Jenkins base URL used for clickthrough links (never goes through the proxy). */
const JENKINS_PUBLIC_URL = 'https://integration.wikimedia.org/ci';

/**
 * Extract test counts from a build's actions array, if a JUnit TestResultAction
 * is present. Returns null when no test report is attached.
 *
 * @param {Array} actions
 * @returns {{ total: number, failed: number, skipped: number, passed: number }|null}
 */
export function extractTestCounts(actions) {
  if (!Array.isArray(actions)) return null;
  const ta = actions.find((a) => a._class === 'hudson.tasks.junit.TestResultAction');
  if (!ta || ta.totalCount == null) return null;
  const total   = ta.totalCount;
  const failed  = ta.failCount  ?? 0;
  const skipped = ta.skipCount  ?? 0;
  const passed  = Math.max(0, total - failed - skipped);
  return { total, failed, skipped, passed };
}

/**
 * Fetch builds for a single Jenkins job.
 * Uses the `tree` query parameter to request only the fields we need,
 * and the `{0,N}` slice syntax to limit the number of builds.
 *
 * When the job has `hasTestReport: true` the build data will include a
 * `tests` object with per-build test counts; otherwise `tests` is null.
 *
 * @param {{ label: string, slug: string, hasTestReport: boolean }} job
 * @returns {Promise<Array<{
 *   job: string,
 *   job_url: string,
 *   build_url: string,
 *   status: 'passed'|'failed'|'other',
 *   duration_seconds: number,
 *   timestamp: string,
 *   tests: { total: number, failed: number, skipped: number, passed: number }|null
 * }>>}
 */
async function fetchJobBuilds({ label, slug, hasTestReport }) {
  // Always fetch actions so we can parse test counts when available.
  const actionFields = 'actions[_class,totalCount,failCount,skipCount]';
  const tree = `builds[number,result,duration,timestamp,url,${actionFields}]{0,${BUILDS_PER_JOB}}`;
  const url = `${BASE_URL}/job/${slug}/api/json?tree=${encodeURIComponent(tree)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jenkins job "${label}" returned ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (!Array.isArray(data.builds)) {
    throw new Error(`Jenkins job "${label}" returned unexpected shape`);
  }

  const jobUrl = `${JENKINS_PUBLIC_URL}/job/${slug}/`;

  return data.builds
    .filter((b) => b.result !== null) // skip in-progress builds
    .map((b) => ({
      job: label,
      job_url: jobUrl,
      build_url: b.url ?? jobUrl,
      status: normaliseStatus(b.result),
      duration_seconds: b.duration > 0 ? Math.round(b.duration / 1000) : 0,
      timestamp: new Date(b.timestamp).toISOString(),
      // Test-level counts — only populated for jobs that publish a JUnit report.
      tests: hasTestReport ? extractTestCounts(b.actions) : null,
    }));
}

/**
 * Fetch the current list of tracked jobs dynamically from the Jenkins view APIs.
 *
 * Queries the Selenium and selenium-daily views and merges the results into the
 * same job descriptor format used by fetchRecentBuilds(). This allows the
 * dashboard to pick up newly added or removed jobs without a code change.
 *
 * hasTestReport comes from the job name. Only the Catalyst `catalyst-daily-*`
 * jobs publish a JUnit TestResultAction. All other jobs report job-level
 * results only.
 *
 * @returns {Promise<Array<{ label: string, slug: string, hasTestReport: boolean }>>}
 * @throws {Error} When all view requests fail or the combined result is empty.
 */
export async function fetchTrackedJobs() {
  if (USE_STATIC_DATA) return fetchStaticJson('jenkins-jobs.json');
  const settled = await Promise.allSettled(
    JENKINS_VIEWS.map((view) =>
      fetch(`${BASE_URL}/view/${encodeURIComponent(view)}/api/json?tree=jobs[name,url]`)
        .then((r) => {
          if (!r.ok) throw new Error(`Jenkins view "${view}" returned ${r.status} ${r.statusText}`);
          return r.json();
        })
        .then((data) => (Array.isArray(data.jobs) ? data.jobs : [])),
    ),
  );

  const jobs = settled
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    // Deduplicate — a job can appear in more than one view
    .filter((job, i, arr) => arr.findIndex((j) => j.name === job.name) === i)
    .map((job) => ({
      label: job.name,
      slug: job.name,
      // Only catalyst-daily-* jobs publish a JUnit TestResultAction.
      hasTestReport: job.name.startsWith(DAILY_JOB_PREFIX),
    }));

  if (jobs.length === 0) {
    const reasons = settled
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.message)
      .join('; ');
    throw new Error(`No jobs found in Jenkins views${reasons ? `: ${reasons}` : ''}`);
  }

  return jobs;
}

/**
 * Fetch recent builds across all tracked MediaWiki Jenkins jobs in parallel.
 * If individual jobs fail they are reported alongside the successful builds
 * so a single unavailable job does not blank the entire panel while still
 * letting the UI surface a partial-failure warning.
 *
 * @param {Array} [jobs=DEFAULT_TRACKED_JOBS] - Job list to fetch. Defaults to the
 *   static DEFAULT_TRACKED_JOBS list. Pass the result of fetchTrackedJobs() to use
 *   a dynamically fetched list instead.
 * @returns {Promise<{
 *   builds: Array<{
 *     job: string,
 *     status: 'passed'|'failed'|'other',
 *     duration_seconds: number,
 *     timestamp: string
 *   }>,
 *   failedJobs: Array<{ label: string, error: string }>
 * }>}
 * @throws {Error} Only when every single job fails (total outage).
 */
export async function fetchRecentBuilds(jobs = DEFAULT_TRACKED_JOBS) {
  if (USE_STATIC_DATA) return fetchStaticJson('jenkins-builds.json');
  const results = await Promise.allSettled(jobs.map(fetchJobBuilds));

  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const failed    = results.filter((r) => r.status === 'rejected');

  if (succeeded.length === 0) {
    // Surface the first error so the panel shows a meaningful message
    throw failed[0].reason;
  }

  if (failed.length > 0 && import.meta.env.DEV) {
    // Log partial failures to the console in dev; production surfaces them
    // through the `failedJobs` metadata returned alongside `builds`.
    failed.forEach((r) => console.warn('[jenkins.js] Partial fetch failure:', r.reason?.message));
  }

  // Flatten all job arrays and sort by timestamp descending
  const builds = succeeded
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Extract job labels from rejected reasons. fetchJobBuilds throws errors
  // whose message starts with `Jenkins job "<label>" returned ...`, so we
  // parse that back out for the UI banner.
  const failedJobs = failed.map((r) => {
    const msg   = r.reason?.message ?? String(r.reason);
    const match = msg.match(/^Jenkins job "([^"]+)"/);
    return { label: match ? match[1] : 'unknown', error: msg };
  });

  return { builds, failedJobs };
}

/**
 * Fetch the tail of a build's Jenkins console log. Used by the Failed Jobs
 * drill-down to surface a short error-message excerpt next to each failed job
 * without sending the user off to Jenkins.
 *
 * Accepts the absolute Jenkins `build_url` exposed on each build record
 * (e.g. `https://integration.wikimedia.org/ci/job/<slug>/<n>/`) and rewrites
 * it onto the local `/api/jenkins` proxy path so CORS is not a problem in dev
 * or on Vercel. Returns only the last `lines` non-empty lines because console
 * output can be many MB and only the tail is useful for diagnosing the failure.
 *
 * Returns `null` in static snapshot mode (VITE_STATIC_DATA=true) — live console
 * logs are not captured in the snapshot, so the caller should render a
 * graceful fallback (e.g. "Error log not available in snapshot mode").
 *
 * @param {string} buildUrl      Absolute Jenkins build URL (from build.build_url).
 * @param {object} [options]
 * @param {number} [options.lines=40]   Max tail lines to return.
 * @returns {Promise<string|null>}      Joined tail text, or null in static mode.
 * @throws {Error}                      When the Jenkins request fails.
 */
export async function fetchBuildConsoleTail(buildUrl, { lines = 40 } = {}) {
  if (USE_STATIC_DATA) return null;
  if (!buildUrl || typeof buildUrl !== 'string') {
    throw new Error('fetchBuildConsoleTail: buildUrl is required');
  }

  // Rewrite an absolute integration.wikimedia.org/ci URL onto the proxy path,
  // and tolerate a URL that is already proxy-relative.
  const path = buildUrl
    .replace(/^https?:\/\/integration\.wikimedia\.org\/ci/, '')
    .replace(/^\/api\/jenkins/, '');
  const url = `${BASE_URL}${path.endsWith('/') ? path : path + '/'}consoleText`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jenkins consoleText returned ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const nonEmpty = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0);
  return nonEmpty.slice(-lines).join('\n');
}
