/**
 * @file jenkins.js
 * Service module for the Wikimedia Jenkins CI REST API.
 * Jenkins does not send CORS headers, so all requests go through
 * the Vite proxy at /api/jenkins → https://integration.wikimedia.org/ci
 *
 * No authentication is required — the Jenkins instance is publicly readable.
 */

const BASE_URL = '/api/jenkins';

/**
 * The two Jenkins views that contain the Selenium jobs tracked by this dashboard.
 * Used by fetchTrackedJobs() to build a dynamic job list at runtime.
 */
const JENKINS_VIEWS = ['Selenium', 'selenium-daily'];

/**
 * Default (static) job list used when fetchTrackedJobs() has not been called.
 *
 * Jobs sourced from the Selenium and Selenium-daily Jenkins views:
 *   https://integration.wikimedia.org/ci/view/Selenium/
 *   https://integration.wikimedia.org/ci/view/selenium-daily/
 *
 * Only jobs that had at least one build as of 2026-04-03 are included.
 *
 * `hasTestReport: true` means the job publishes a JUnit TestResultAction,
 * allowing test-level pass/fail counts to be surfaced in addition to the
 * overall job result. Jobs without this flag report job-level results only.
 */
export const DEFAULT_TRACKED_JOBS = [
  // ── Core Selenium (Quibble) ────────────────────────────────────────────────
  { label: 'Selenium PHP 8.1',         slug: 'quibble-composer-mysql-php81-selenium',              hasTestReport: false },
  { label: 'Selenium PHP 8.2',         slug: 'quibble-composer-mysql-php82-selenium',              hasTestReport: false },
  { label: 'Selenium PHP 8.3',         slug: 'quibble-composer-mysql-php83-selenium',              hasTestReport: false },
  { label: 'Selenium Vendor PHP 8.1',  slug: 'quibble-vendor-mysql-php81-selenium',               hasTestReport: false },
  { label: 'Selenium Vendor PHP 8.3',  slug: 'quibble-vendor-mysql-php83-selenium',               hasTestReport: false },
  { label: 'Selenium Gated Ext',       slug: 'quibble-with-gated-extensions-selenium-php83',      hasTestReport: false },
  { label: 'Wikibase Selenium',        slug: 'wikibase-selenium',                                 hasTestReport: false },
  // ── Selenium-daily (beta cluster, per-extension WDIO) ─────────────────────
  // These jobs publish a JUnit TestResultAction — test-level counts are available.
  { label: 'AdvancedSearch (daily)',   slug: 'selenium-daily-beta-AdvancedSearch',                hasTestReport: true  },
  { label: 'CampaignEvents (daily)',   slug: 'selenium-daily-beta-CampaignEvents',                hasTestReport: true  },
  { label: 'CentralNotice (daily)',    slug: 'selenium-daily-beta-CentralNotice',                 hasTestReport: true  },
  { label: 'Echo (daily)',             slug: 'selenium-daily-beta-Echo',                          hasTestReport: true  },
  { label: 'Math (daily)',             slug: 'selenium-daily-beta-Math',                          hasTestReport: true  },
  { label: 'Minerva (daily)',          slug: 'selenium-daily-beta-Minerva',                       hasTestReport: true  },
  { label: 'Newsletter (daily)',       slug: 'selenium-daily-beta-Newsletter',                    hasTestReport: true  },
  { label: 'Popups (daily)',           slug: 'selenium-daily-beta-Popups',                        hasTestReport: true  },
  { label: 'RelatedArticles (daily)',  slug: 'selenium-daily-beta-RelatedArticles',               hasTestReport: true  },
  { label: 'TwoColConflict (daily)',   slug: 'selenium-daily-beta-TwoColConflict',                hasTestReport: true  },
  { label: 'VisualEditor (daily)',     slug: 'selenium-daily-beta-VisualEditor',                  hasTestReport: true  },
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
 * hasTestReport is inferred from the job name: jobs matching the
 * `selenium-daily-beta-*` pattern publish a JUnit TestResultAction; all others
 * report job-level results only.
 *
 * @returns {Promise<Array<{ label: string, slug: string, hasTestReport: boolean }>>}
 * @throws {Error} When all view requests fail or the combined result is empty.
 */
export async function fetchTrackedJobs() {
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
      // selenium-daily-beta-* jobs publish a JUnit TestResultAction
      hasTestReport: job.name.startsWith('selenium-daily-beta-'),
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
 * If individual jobs fail they are silently skipped so a single unavailable
 * job does not blank the entire panel.
 *
 * @param {Array} [jobs=DEFAULT_TRACKED_JOBS] - Job list to fetch. Defaults to the
 *   static DEFAULT_TRACKED_JOBS list. Pass the result of fetchTrackedJobs() to use
 *   a dynamically fetched list instead.
 * @returns {Promise<Array<{
 *   job: string,
 *   status: 'passed'|'failed'|'other',
 *   duration_seconds: number,
 *   timestamp: string
 * }>>}
 * @throws {Error} Only when every single job fails (total outage).
 */
export async function fetchRecentBuilds(jobs = DEFAULT_TRACKED_JOBS) {
  const results = await Promise.allSettled(jobs.map(fetchJobBuilds));

  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const failed    = results.filter((r) => r.status === 'rejected');

  if (succeeded.length === 0) {
    // Surface the first error so the panel shows a meaningful message
    throw failed[0].reason;
  }

  if (failed.length > 0) {
    // Log partial failures to the console without breaking the UI
    failed.forEach((r) => console.warn('[jenkins.js] Partial fetch failure:', r.reason?.message));
  }

  // Flatten all job arrays and sort by timestamp descending
  return succeeded
    .flatMap((r) => r.value)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
