/**
 * @file automatedTests.js
 * Service module for the browser-test-scanner inventory of automated tests.
 *
 * Data source: the scanner (gitlab.wikimedia.org/repos/test-platform/misc-scripts/
 * browser-test-scanner) runs daily on Toolforge. It writes a `summary.json` and
 * publishes it to a MediaWiki page whose title ends in `.json` — MediaWiki
 * serves such pages as raw JSON via ?action=raw, giving us a stable
 * machine-readable URL.
 *
 * MediaWiki's Action API supports CORS with origin=*, but the `action=raw`
 * endpoint (index.php) does not, so we route through the Vite proxy
 * /api/mw-raw → https://www.mediawiki.org at dev time.
 */

import { USE_STATIC_DATA, fetchStaticJson } from './staticData.js';

const JSON_PAGE_TITLE = 'Wikimedia_Quality_Services/Automated_tests_available/data.json';
const LIVE_URL = `/api/mw-raw/w/index.php?title=${encodeURIComponent(JSON_PAGE_TITLE)}&action=raw`;

/**
 * @typedef {Object} AutomatedTestRepo
 * @property {string}  name                 Short extension / project name (e.g. "AbuseFilter")
 * @property {string}  repoPath             Full repo path as emitted by the scanner (may equal name)
 * @property {'wdio'|'cypress'|'other'} framework
 * @property {string|null} mediawikiVersion
 * @property {string|null} frameworkVersion
 * @property {boolean} gatedSelenium        Whether the repo runs in the gated selenium pipeline
 * @property {boolean} daily                Whether the repo has a daily Jenkins job
 * @property {Array<DailyJob>} dailyJobs    Last-7-day pass/total counts per daily Jenkins job
 * @property {number}  testCount
 * @property {Array<{ name: string }>} tests
 */

/**
 * @typedef {Object} DailyJob
 * @property {string} name
 * @property {string} url
 * @property {number} passes
 * @property {number} fails
 * @property {number} total
 * @property {Array<'P'|'F'>} results  Oldest → newest
 */

/**
 * @typedef {Object} AutomatedTestsData
 * @property {string|null} generatedAt     ISO timestamp of the scanner run, when emitted
 * @property {number}      repoCount
 * @property {number}      testCount
 * @property {Array<AutomatedTestRepo>} repos
 */

/**
 * Normalise a framework string from the scanner into our internal enum.
 *
 * The scanner uses whatever the repo's package.json / tooling advertises,
 * which in practice is some variant of "webdriverio" or "cypress". Anything
 * else falls through as 'other' so future scanner output does not silently
 * drop rows.
 *
 * @param {unknown} raw
 * @returns {'wdio'|'cypress'|'other'}
 */
export function normaliseFramework(raw) {
  if (typeof raw !== 'string') return 'other';
  const v = raw.toLowerCase().trim();
  if (v === 'wdio' || v === 'webdriverio' || v === 'webdriver') return 'wdio';
  if (v === 'cypress') return 'cypress';
  return 'other';
}

/**
 * Derive the short extension/project name from a repo path such as
 * "mediawiki/extensions/AbuseFilter". The scanner sometimes emits the full
 * path and sometimes just the name, so we accept both.
 *
 * @param {string} raw
 * @returns {string}
 */
export function shortRepoName(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const trimmed = raw.trim();
  const lastSlash = trimmed.lastIndexOf('/');
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
}

/**
 * Normalise a single repo entry from whatever shape the scanner emitted into
 * the dashboard's canonical {@link AutomatedTestRepo}. Missing fields default
 * to null / false / []; a malformed row never throws.
 *
 * @param {object} raw
 * @returns {AutomatedTestRepo|null}
 */
function normaliseRepo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const repoPath = typeof raw.repo === 'string'
    ? raw.repo
    : typeof raw.name === 'string' ? raw.name : '';
  const name = shortRepoName(repoPath);
  if (!name) return null;

  const tests = Array.isArray(raw.tests)
    ? raw.tests
        .map((t) => {
          if (typeof t === 'string') return { name: t };
          if (t && typeof t === 'object' && typeof t.name === 'string') return { name: t.name };
          return null;
        })
        .filter(Boolean)
    : [];

  return {
    name,
    repoPath: repoPath || name,
    framework: normaliseFramework(raw.framework ?? raw.kind ?? raw.type),
    mediawikiVersion:  typeof raw.mediawikiVersion  === 'string' ? raw.mediawikiVersion  : null,
    frameworkVersion:  typeof raw.frameworkVersion  === 'string' ? raw.frameworkVersion
                     : typeof raw.wdioVersion       === 'string' ? raw.wdioVersion
                     : typeof raw.cypressVersion    === 'string' ? raw.cypressVersion
                     : null,
    gatedSelenium:     Boolean(raw.gatedSelenium ?? raw.gated ?? false),
    daily:             Boolean(raw.daily ?? (Array.isArray(raw.dailyJobs) && raw.dailyJobs.length > 0)),
    dailyJobs:         Array.isArray(raw.dailyJobs) ? raw.dailyJobs : [],
    testCount:         typeof raw.testCount === 'number'
                         ? raw.testCount
                         : tests.length,
    tests,
  };
}

/**
 * Normalise the scanner's top-level JSON envelope into {@link AutomatedTestsData}.
 * Accepts both `{ repos: [...] }` and `{ repos: { repoName: {...} } }` shapes
 * to stay forgiving of future scanner revisions.
 *
 * @param {unknown} json
 * @returns {AutomatedTestsData}
 */
export function normaliseEnvelope(json) {
  const envelope = (json && typeof json === 'object') ? json : {};
  const rawRepos = envelope.repos;
  let repoList = [];
  if (Array.isArray(rawRepos)) {
    repoList = rawRepos;
  } else if (rawRepos && typeof rawRepos === 'object') {
    repoList = Object.entries(rawRepos).map(([key, value]) => ({
      repo: value?.repo ?? value?.name ?? key,
      ...value,
    }));
  }

  const repos = repoList.map(normaliseRepo).filter(Boolean);
  const testCount = typeof envelope.testCount === 'number'
    ? envelope.testCount
    : repos.reduce((n, r) => n + r.testCount, 0);
  const repoCount = typeof envelope.repoCount === 'number'
    ? envelope.repoCount
    : repos.length;

  return {
    generatedAt: typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null,
    repoCount,
    testCount,
    repos,
  };
}

/**
 * Fetch and normalise the browser-test-scanner inventory.
 *
 * Live mode hits the MediaWiki JSON page via /api/mw-raw (Vite proxy). Static
 * mode reads the pre-generated snapshot at /data/automated-tests.json.
 *
 * @returns {Promise<AutomatedTestsData>}
 */
export async function fetchAutomatedTests() {
  if (USE_STATIC_DATA) return fetchStaticJson('automated-tests.json');

  const res = await fetch(LIVE_URL);
  if (res.status === 404) {
    throw new Error(
      'Scanner JSON page not found — browser-test-scanner has not yet published ' +
      `${JSON_PAGE_TITLE}. The human page (Automated_tests_available) still exists, ` +
      'but this panel needs the machine-readable subpage.',
    );
  }
  if (!res.ok) {
    throw new Error(`Automated tests fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return normaliseEnvelope(json);
}
