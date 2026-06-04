/**
 * @file iosTesting.js
 *
 * GitHub Actions testing dashboard data for wikimedia/wikipedia-ios.
 *
 * Live browser mode can fetch public workflow-run and artifact metadata. It
 * cannot download artifact archives because GitHub requires an authenticated
 * request for archive_download_url, so coverage points are populated by the
 * snapshot script and read from ios-testing.json in static mode.
 */

import { USE_STATIC_DATA, fetchStaticJson } from '../staticData.js';
import { repoFor, GITHUB_API_BASE } from './repos.js';
import { normalizeRun } from './workflows.js';
import {
  buildIosTestingDashboard,
  IOS_TESTING_WINDOW_DAYS,
} from './iosTestingCore.js';

const TEST_WORKFLOW_NAMES = new Set([
  'Run Unit Tests',
  'Run UI Tests',
  'Run E2E Tests',
]);

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub iOS testing data: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchRuns(repo, params) {
  const search = new URLSearchParams({ per_page: '100', ...params });
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/actions/runs?${search}`;
  const json = await fetchJson(url);
  return Array.isArray(json.workflow_runs)
    ? json.workflow_runs.map(normalizeRun).filter((run) => TEST_WORKFLOW_NAMES.has(run.name))
    : [];
}

async function fetchArtifacts(repo) {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/actions/artifacts?per_page=100`;
  const json = await fetchJson(url);
  return Array.isArray(json.artifacts) ? json.artifacts : [];
}

/**
 * Fetch iOS testing dashboard data.
 *
 * @returns {Promise<object>}
 */
export async function fetchIosTestingDashboard() {
  if (USE_STATIC_DATA) return fetchStaticJson('ios-testing.json');

  const repo = repoFor('ios');
  const [pullRequestRuns, mainRuns, artifacts] = await Promise.all([
    fetchRuns(repo, { event: 'pull_request' }),
    fetchRuns(repo, { branch: 'main' }),
    fetchArtifacts(repo),
  ]);

  const generatedAt = new Date().toISOString();
  return buildIosTestingDashboard({
    runs: [...pullRequestRuns, ...mainRuns],
    artifacts,
    coverageStatus: {
      available: false,
      reason: 'Coverage artifact ZIP downloads require authenticated snapshot data. Live browser mode only fetches public GitHub run and artifact metadata.',
    },
    generatedAt,
    now: new Date(generatedAt),
    windowDays: IOS_TESTING_WINDOW_DAYS,
  });
}
