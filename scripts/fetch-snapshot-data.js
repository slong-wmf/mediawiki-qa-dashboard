#!/usr/bin/env node
/**
 * @file scripts/fetch-snapshot-data.js
 *
 * Server-side data fetcher for the dashboard.
 *
 * Runs in two contexts:
 *   1. Local / GitHub Actions — defaults to writing into <repo>/snapshot-data/
 *      so `npm run build` and the Pages workflow keep working unchanged.
 *   2. Toolforge cron job — SNAPSHOT_OUTPUT_DIR env var points at the NFS
 *      directory the webservice serves from (e.g.
 *      /data/project/mw-qa-dashboard/snapshot-data). The job's container cwd
 *      is /workspace (ephemeral), so an explicit path is required to land
 *      output where the webservice can read it.
 *
 * Calls all four external APIs that the browser cannot access directly and
 * produces pre-shaped JSON files mirroring the exact return shapes of the
 * client service functions, so the frontend can swap seamlessly between
 * live API calls and static JSON reads.
 *
 * Usage:
 *   node scripts/fetch-snapshot-data.js
 *
 * Environment variables (all optional):
 *   PHABRICATOR_TOKEN     — Conduit API token (raises rate limit ceiling)
 *   GITHUB_TOKEN          — GitHub PAT for the mobile-apps fetchers; raises
 *                           the rate limit from 60 req/hr (anon) to 5000 req/hr.
 *                           A no-scope classic PAT or a fine-grained PAT with
 *                           "Public repositories (read-only)" both work.
 *   SNAPSHOT_OUTPUT_DIR   — absolute path to write JSON files into
 *                           (default: <repo>/snapshot-data)
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import {
  buildTodayEntry,
  upsertHistoryEntry,
  backfillFromDailyJobs,
  todayUtcDate,
  HISTORY_DEFAULT_WINDOW_DAYS,
} from './lib/metrics-aggregator.js';
import {
  fetchFlakyTestRows,
  AnubisChallengeError,
} from './lib/flaky-tests-fetcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.SNAPSHOT_OUTPUT_DIR
  ? path.resolve(process.env.SNAPSHOT_OUTPUT_DIR)
  : path.resolve(__dirname, '..', 'snapshot-data');
mkdirSync(OUT_DIR, { recursive: true });

// ── Retry helper ──────────────────────────────────────────────────────────────

/**
 * Fetch with automatic retry on HTTP 429 (rate limit) responses.
 * Respects the Retry-After header when present; otherwise uses exponential
 * back-off starting at 10 s and doubling up to a 120 s cap.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [maxRetries=4]
 * @returns {Promise<Response>}
 */
const USER_AGENT = 'mediawiki-qa-dashboard/1.0 (GitHub Actions snapshot fetcher)';

async function fetchWithRetry(url, options = {}, maxRetries = 4) {
  const mergedOptions = {
    ...options,
    headers: { 'User-Agent': USER_AGENT, ...(options.headers ?? {}) },
  };
  let delay = 10_000; // ms — initial back-off
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, mergedOptions);
    if (res.status !== 429) return res;

    if (attempt === maxRetries) return res; // let caller handle the 429

    // Honour Retry-After if the server provides it (value is seconds)
    const retryAfter = res.headers.get('Retry-After');
    const wait = retryAfter ? parseInt(retryAfter, 10) * 1_000 : delay;
    console.warn(`  ⏳ 429 from ${new URL(url).hostname} — waiting ${Math.round(wait / 1000)}s before retry ${attempt + 1}/${maxRetries}…`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    delay = Math.min(delay * 2, 120_000);
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const JENKINS_BASE    = 'https://integration.wikimedia.org/ci';
const PHAB_BASE       = 'https://phabricator.wikimedia.org/api';
const PHAB_TOKEN      = process.env.PHABRICATOR_TOKEN ?? '';
const LOOKBACK_DAYS   = 7;
const PAGE_LIMIT      = 100;
const MAX_PAGES       = 2;
const BUILDS_PER_JOB  = 20;
const JENKINS_VIEWS   = ['Selenium', 'selenium-daily'];
const TRAIN_PHID      = 'PHID-PROJ-fmcvjrkfvvzz3gxavs3a';

// GitHub mobile-app fetchers. Output shapes match
// src/services/github/{workflows,releases,testInventory}.js exactly so the
// frontend swaps seamlessly between live API calls and these snapshots.
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN    = process.env.GITHUB_TOKEN ?? '';
const GITHUB_REPOS = {
  ios:     { fullName: 'wikimedia/wikipedia-ios',          owner: 'wikimedia', name: 'wikipedia-ios' },
  android: { fullName: 'wikimedia/apps-android-wikipedia', owner: 'wikimedia', name: 'apps-android-wikipedia' },
};

// Mirrors MATCHERS in src/services/github/testInventory.js. Duplicated rather
// than imported to keep this script self-contained — its existing style is to
// inline small lookup tables. If either repo reorganises its test directories,
// update both copies.
const GITHUB_TEST_MATCHERS = {
  ios: [
    { kind: 'ui',   prefix: 'WikipediaUITests/',   exts: ['.swift'] },
    { kind: 'unit', prefix: 'WikipediaUnitTests/', exts: ['.swift'] },
  ],
  android: [
    { kind: 'ui',   prefix: 'app/src/androidTest/', exts: ['.kt', '.java'] },
    { kind: 'unit', prefix: 'app/src/test/',        exts: ['.kt', '.java'] },
  ],
};

const CLOSED_STATUSES = new Set([
  'resolved', 'declined', 'invalid', 'wontfix', 'spite', 'duplicate',
]);

const PRIORITY_MAP = {
  100: { label: 'Unbreak Now!', key: 'unbreak-now' },
  90:  { label: 'Needs Triage', key: 'needs-triage' },
  80:  { label: 'High',         key: 'high' },
  50:  { label: 'Normal',       key: 'normal' },
  25:  { label: 'Low',          key: 'low' },
  0:   { label: 'Wishlist',     key: 'wishlist' },
};

const STATUS_GROUPS = {
  'open':         'open',
  'in-progress':  'in-progress',
  'stalled':      'stalled',
  'needs-triage': 'needs-triage',
};

const STATUS_LABELS = {
  'open':         'Open',
  'in-progress':  'In Progress',
  'stalled':      'Stalled',
  'needs-triage': 'Needs Triage',
  'other':        'Other',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function save(filename, data) {
  const outPath = path.join(OUT_DIR, filename);
  writeFileSync(outPath, JSON.stringify(data));
  console.log(`  ✓ ${filename} (${Buffer.byteLength(JSON.stringify(data))} bytes)`);
}

function mapPriority(value) {
  return PRIORITY_MAP[value] ?? { label: `P${value}`, key: `p${value}` };
}

function statusGroup(raw) {
  return STATUS_GROUPS[raw] ?? 'other';
}

function normaliseStatus(result) {
  if (result === 'SUCCESS') return 'passed';
  if (result === 'FAILURE' || result === 'UNSTABLE') return 'failed';
  return 'other';
}

function extractTestCounts(actions) {
  if (!Array.isArray(actions)) return null;
  const ta = actions.find((a) => a._class === 'hudson.tasks.junit.TestResultAction');
  if (!ta || ta.totalCount == null) return null;
  const total   = ta.totalCount;
  const failed  = ta.failCount  ?? 0;
  const skipped = ta.skipCount  ?? 0;
  const passed  = Math.max(0, total - failed - skipped);
  return { total, failed, skipped, passed };
}

// ── Phabricator Conduit helper ────────────────────────────────────────────────

async function conduit(method, params) {
  if (PHAB_TOKEN) params.set('api.token', PHAB_TOKEN);
  params.set('__conduit__', '1');

  const res = await fetchWithRetry(`${PHAB_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) throw new Error(`Phabricator ${method} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error_code) throw new Error(`Conduit error [${json.error_code}]: ${json.error_info}`);
  if (!json.result)    throw new Error(`Phabricator ${method} returned no result`);
  return json.result;
}

// ── Jenkins ───────────────────────────────────────────────────────────────────

async function fetchJenkinsData() {
  console.log('\n📦 Jenkins: fetching jobs and builds from views...');

  const actionFields = 'actions[_class,totalCount,failCount,skipCount]';
  const buildFields  = `builds[number,result,duration,timestamp,url,${actionFields}]{0,${BUILDS_PER_JOB}}`;
  const tree = `views[name,jobs[name,url,${buildFields}]]`;
  const url  = `${JENKINS_BASE}/api/json?tree=${encodeURIComponent(tree)}`;

  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Jenkins: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const wanted = new Set(JENKINS_VIEWS);
  const jobs   = [];
  const builds = [];
  const seen   = new Set();

  for (const view of data.views ?? []) {
    if (!wanted.has(view.name)) continue;
    for (const job of view.jobs ?? []) {
      if (!job.name || seen.has(job.name)) continue;
      seen.add(job.name);
      const hasTestReport = job.name.startsWith('selenium-daily-beta-');
      jobs.push({ label: job.name, slug: job.name, hasTestReport });

      const jobUrl = `${JENKINS_BASE}/job/${job.name}/`;
      for (const b of job.builds ?? []) {
        if (b.result == null) continue;
        builds.push({
          job:              job.name,
          job_url:          jobUrl,
          build_url:        b.url ?? jobUrl,
          status:           normaliseStatus(b.result),
          duration_seconds: b.duration > 0 ? Math.round(b.duration / 1000) : 0,
          timestamp:        new Date(b.timestamp).toISOString(),
          tests:            hasTestReport ? extractTestCounts(b.actions) : null,
        });
      }
    }
  }

  if (!jobs.length) throw new Error('No jobs returned from any Jenkins view');
  console.log(`  Found ${jobs.length} jobs, ${builds.length} total builds`);
  return { jobs, builds, failedJobs: [] };
}

// ── Coverage ──────────────────────────────────────────────────────────────────

function parseCoverageHTML(html, baseSection) {
  const { document } = parseHTML(html);
  return Array.from(document.querySelectorAll('tr'))
    .map((row) => {
      const meter  = row.querySelector('meter');
      const nameEl = row.querySelector('.cover-item-name a');
      const mtimeEl = row.querySelector('.cover-item-mtime');
      if (!meter || !nameEl) return null;
      const name = nameEl.textContent.trim();
      return {
        name,
        coverage_pct: parseInt(meter.getAttribute('value'), 10),
        last_updated: mtimeEl?.textContent.trim() ?? null,
        page_url:   `https://doc.wikimedia.org/${baseSection}/${name}/`,
        clover_url: `https://doc.wikimedia.org/${baseSection}/${name}/clover.xml`,
      };
    })
    .filter(Boolean);
}

async function fetchCoverage() {
  console.log('\n📦 Coverage: fetching from doc.wikimedia.org...');
  const [coreRes, extRes] = await Promise.all([
    fetchWithRetry('https://doc.wikimedia.org/cover/'),
    fetchWithRetry('https://doc.wikimedia.org/cover-extensions/'),
  ]);

  if (!coreRes.ok) throw new Error(`Coverage core: ${coreRes.status} ${coreRes.statusText}`);
  if (!extRes.ok)  throw new Error(`Coverage extensions: ${extRes.status} ${extRes.statusText}`);

  const [coreHtml, extHtml] = await Promise.all([coreRes.text(), extRes.text()]);

  const coreRows  = parseCoverageHTML(coreHtml, 'cover');
  const extensions = parseCoverageHTML(extHtml, 'cover-extensions');
  const core = coreRows.find((r) => r.name === 'mediawiki-core') ?? null;

  if (extensions.length === 0) throw new Error('Coverage index returned no extension data');

  console.log(`  core: ${core ? `${core.coverage_pct}%` : 'not found'}, extensions: ${extensions.length}`);
  return { core, extensions };
}

// ── Phabricator bugs ──────────────────────────────────────────────────────────

async function resolveProjectNames(phids) {
  if (!phids.length) return {};
  const params = new URLSearchParams({ limit: String(phids.length) });
  phids.forEach((phid) => params.append('constraints[phids][]', phid));
  try {
    const result = await conduit('project.search', params);
    return Object.fromEntries(
      (result.data ?? []).map((p) => [p.phid, p.fields?.name ?? p.phid]),
    );
  } catch (err) {
    console.warn(`  ⚠ project.search failed: ${err.message}`);
    return {};
  }
}

function shapeTask(raw, cutoffEpoch, phidToName = {}) {
  const fields      = raw.fields ?? {};
  const statusRaw   = fields.status?.value ?? 'open';
  const priorityVal = fields.priority?.value ?? 50;
  const createdEp   = fields.dateCreated  ?? 0;
  const modifiedEp  = fields.dateModified ?? 0;
  const prio        = mapPriority(priorityVal);
  const title       = fields.name ?? '(no title)';
  const projectPHIDs = raw.attachments?.projects?.projectPHIDs ?? [];
  const projectNames = projectPHIDs.map((phid) => phidToName[phid]).filter(Boolean);
  const sg = statusGroup(statusRaw);

  return {
    id:            raw.id,
    phid:          raw.phid,
    title,
    statusRaw,
    statusGroup:   sg,
    statusLabel:   fields.status?.name ?? STATUS_LABELS[sg] ?? statusRaw,
    priority:      prio.key,
    priorityLabel: prio.label,
    priorityValue: priorityVal,
    url:           `https://phabricator.wikimedia.org/T${raw.id}`,
    createdAt:     new Date(createdEp  * 1000).toISOString(),
    modifiedAt:    new Date(modifiedEp * 1000).toISOString(),
    isNew:         createdEp >= cutoffEpoch,
    projectNames,
    projectCount:  projectPHIDs.length,
  };
}

async function fetchRecentBugs() {
  console.log('\n📦 Phabricator: fetching recent bugs...');
  const cutoffEpoch = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
  const rawTasks = [];
  let after   = null;
  let hasMore = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      'constraints[modifiedStart]': String(cutoffEpoch),
      'constraints[subtypes][0]':   'bug',
      'constraints[subtypes][1]':   'error',
      'order':                      'updated',
      'limit':                      String(PAGE_LIMIT),
      'attachments[projects]':      '1',
    });
    if (after) params.set('after', after);

    const result = await conduit('maniphest.search', params);
    const raw    = Array.isArray(result.data) ? result.data : [];
    rawTasks.push(...raw);

    const cursor = result.cursor ?? {};
    after   = cursor.after ?? null;
    hasMore = Boolean(after);
    if (raw.length < PAGE_LIMIT) { hasMore = false; break; }
    if (!after) break;
  }

  const allPHIDs   = [...new Set(rawTasks.flatMap((t) => t.attachments?.projects?.projectPHIDs ?? []))];
  const phidToName = await resolveProjectNames(allPHIDs);

  const allTasks = rawTasks
    .map((t) => shapeTask(t, cutoffEpoch, phidToName))
    .filter((task) => !CLOSED_STATUSES.has(task.statusRaw));

  console.log(`  ${allTasks.length} open tasks, hasMore: ${hasMore}`);
  return { tasks: allTasks, totalFetched: allTasks.length, hasMore, cutoffDate: new Date(cutoffEpoch * 1000).toISOString() };
}

// ── Phabricator train blockers ────────────────────────────────────────────────

async function resolveUsernames(phids) {
  if (!phids.length) return {};
  const params = new URLSearchParams({ limit: String(phids.length) });
  phids.forEach((phid) => params.append('constraints[phids][]', phid));
  try {
    const result = await conduit('user.search', params);
    return Object.fromEntries(
      (result.data ?? []).map((u) => [u.phid, { username: u.fields?.username ?? null, realName: u.fields?.realName ?? null }]),
    );
  } catch (err) {
    console.warn(`  ⚠ user.search failed: ${err.message}`);
    return {};
  }
}

function shapeBlockerTask(raw, phidToUser) {
  const fields      = raw.fields ?? {};
  const priorityVal = fields.priority?.value ?? 50;
  const prio        = mapPriority(priorityVal);
  const closedEp    = fields.dateClosed ?? null;
  const toUsername  = (phid) => (phid ? (phidToUser[phid]?.username ?? null) : null);

  return {
    id:             raw.id,
    phid:           raw.phid,
    title:          fields.name ?? '(no title)',
    url:            `https://phabricator.wikimedia.org/T${raw.id}`,
    statusRaw:      fields.status?.value ?? 'open',
    statusLabel:    fields.status?.name  ?? 'Open',
    priority:       prio.key,
    priorityLabel:  prio.label,
    priorityValue:  priorityVal,
    subtype:        fields.subtype ?? 'default',
    authorUsername: toUsername(fields.authorPHID),
    closerUsername: toUsername(fields.closerPHID),
    ownerUsername:  toUsername(fields.ownerPHID),
    createdAt:      new Date((fields.dateCreated ?? 0) * 1000).toISOString(),
    closedAt:       closedEp ? new Date(closedEp * 1000).toISOString() : null,
  };
}

async function fetchTrainBlockers() {
  console.log('\n📦 Phabricator: fetching train blockers...');

  const trainParams = new URLSearchParams({
    'constraints[projects][0]': TRAIN_PHID,
    'constraints[subtypes][0]': 'release',
    'constraints[statuses][0]': 'resolved',
    'order':                    'newest',
    'limit':                    '1',
  });
  const trainResult = await conduit('maniphest.search', trainParams);
  const trainRaw    = trainResult.data ?? [];
  if (!trainRaw.length) throw new Error('No resolved train tasks found');

  const trainRawTask  = trainRaw[0];
  const trainFields   = trainRawTask.fields ?? {};
  const trainClosedEp = trainFields.dateClosed ?? null;

  const blockerParams = new URLSearchParams({ limit: '100' });
  blockerParams.append('constraints[parentIDs][]', String(trainRawTask.id));
  const blockerResult = await conduit('maniphest.search', blockerParams);
  const blockerRaw    = Array.isArray(blockerResult.data) ? blockerResult.data : [];

  const allUserPHIDs = [...new Set([
    trainFields.closerPHID,
    ...blockerRaw.flatMap((t) => { const f = t.fields ?? {}; return [f.authorPHID, f.closerPHID, f.ownerPHID]; }),
  ].filter(Boolean))];

  const phidToUser = await resolveUsernames(allUserPHIDs);

  const trainCloserPhid = trainFields.closerPHID ?? null;
  const trainTask = {
    id:             trainRawTask.id,
    title:          trainFields.name ?? '(no title)',
    url:            `https://phabricator.wikimedia.org/T${trainRawTask.id}`,
    version:        trainFields['custom.release.version'] ?? null,
    closedAt:       trainClosedEp ? new Date(trainClosedEp * 1000).toISOString() : null,
    closerUsername: trainCloserPhid ? (phidToUser[trainCloserPhid]?.username ?? null) : null,
  };

  const blockers = blockerRaw.map((t) => shapeBlockerTask(t, phidToUser));
  console.log(`  Train task T${trainTask.id}, ${blockers.length} blockers`);
  return { trainTask, blockers, totalBlockers: blockers.length };
}

// ── Automated tests inventory (browser-test-scanner) ─────────────────────────

const AUTOMATED_TESTS_URL =
  'https://www.mediawiki.org/w/index.php' +
  '?title=Wikimedia_Quality_Services/Automated_tests_available/data.json&action=raw';

function normaliseTestFramework(raw) {
  if (typeof raw !== 'string') return 'other';
  const v = raw.toLowerCase().trim();
  if (v === 'wdio' || v === 'webdriverio' || v === 'webdriver') return 'wdio';
  if (v === 'cypress') return 'cypress';
  return 'other';
}

function shortRepoName(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const trimmed = raw.trim();
  const lastSlash = trimmed.lastIndexOf('/');
  return lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
}

function normaliseTestRepo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const repoPath = typeof raw.repo === 'string'
    ? raw.repo
    : typeof raw.name === 'string' ? raw.name : '';
  const name = shortRepoName(repoPath);
  if (!name) return null;
  const tests = Array.isArray(raw.tests)
    ? raw.tests
        .map((t) => (typeof t === 'string' ? { name: t, daily: false }
                   : t && typeof t === 'object' && typeof t.name === 'string'
                     ? { name: t.name, daily: Boolean(t.daily) }
                     : null))
        .filter(Boolean)
    : [];
  return {
    name,
    repoPath: repoPath || name,
    url: typeof raw.url === 'string' && raw.url.trim() ? raw.url : null,
    framework: normaliseTestFramework(raw.framework ?? raw.kind ?? raw.type),
    mediawikiVersion:  typeof raw.mediawikiVersion  === 'string' ? raw.mediawikiVersion  : null,
    frameworkVersion:  typeof raw.frameworkVersion  === 'string' ? raw.frameworkVersion
                     : typeof raw.wdioVersion       === 'string' ? raw.wdioVersion
                     : typeof raw.cypressVersion    === 'string' ? raw.cypressVersion
                     : null,
    gatedSelenium:     Boolean(raw.gatedSelenium ?? raw.gated ?? false),
    daily:             Boolean(raw.daily ?? (Array.isArray(raw.dailyJobs) && raw.dailyJobs.length > 0)),
    dailyJobs:         Array.isArray(raw.dailyJobs) ? raw.dailyJobs : [],
    testCount:         typeof raw.testCount === 'number' ? raw.testCount : tests.length,
    tests,
  };
}

// ── Flaky tests (releng-data Datasette) ──────────────────────────────────────

const FLAKY_TESTS_URL =
  'https://releng-data.wmcloud.org/flaky_tests.json?sql='
  + encodeURIComponent('select * from flaky_tests order by count desc;')
  + '&_shape=array';

// releng-data.wmcloud.org sits behind Anubis bot-protection that blocks
// non-browser User-Agents at the edge. Coordinated allowlisting (by Toolforge
// source IP) is the long-term fix — see Task: ask the releng-data operators
// to allowlist the mw-qa-dashboard tool's IP. Until then the call below will
// soft-fail and the dashboard will render its empty state.
//
// We use the script-wide self-identifying User-Agent (defined above) so the
// operators can find our requests in their access logs when arranging the
// allowlist; spoofing a browser UA would obscure who we are.

async function fetchFlakyTests() {
  console.log('\n📦 Flaky tests: fetching from releng-data.wmcloud.org…');
  // fetchFlakyTestRows raises a typed AnubisChallengeError when the upstream
  // serves a bot-challenge page instead of JSON, so the per-source catch
  // below can surface a loud, actionable message instead of an opaque
  // "Unexpected token '<'" parse error.
  const rows = await fetchFlakyTestRows(FLAKY_TESTS_URL, {
    headers: { Accept: 'application/json' },
    fetchImpl: (url, opts) => fetchWithRetry(url, opts),
  });
  console.log(`  ${rows.length} flaky test rows`);
  return { generatedAt: new Date().toISOString(), rows };
}

async function fetchAutomatedTests() {
  console.log('\n📦 Automated tests: fetching from mediawiki.org…');
  const res = await fetchWithRetry(AUTOMATED_TESTS_URL);
  if (!res.ok) throw new Error(`Automated tests fetch failed: ${res.status} ${res.statusText}`);

  const envelope = await res.json();
  const rawRepos = envelope?.repos;
  const repoList = Array.isArray(rawRepos)
    ? rawRepos
    : rawRepos && typeof rawRepos === 'object'
      ? Object.entries(rawRepos).map(([key, value]) => ({
          repo: value?.repo ?? value?.name ?? key,
          ...value,
        }))
      : [];
  const repos = repoList.map(normaliseTestRepo).filter(Boolean);
  const testCount = typeof envelope?.testCount === 'number'
    ? envelope.testCount
    : repos.reduce((n, r) => n + r.testCount, 0);
  const repoCount = typeof envelope?.repoCount === 'number' ? envelope.repoCount : repos.length;
  const generatedAt = typeof envelope?.generatedAt === 'string' ? envelope.generatedAt : null;

  console.log(`  ${repos.length} repos, ${testCount} tests`);
  return { generatedAt, repoCount, testCount, repos };
}

// ── Maintainers ───────────────────────────────────────────────────────────────

async function fetchMaintainers() {
  console.log('\n📦 Maintainers: fetching from mediawiki.org...');
  const url = 'https://www.mediawiki.org/w/api.php?action=parse&page=Developers/Maintainers&prop=text&format=json&origin=*';
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Maintainers fetch failed: ${res.status} ${res.statusText}`);

  const json = await res.json();
  const html = json?.parse?.text?.['*'];
  if (!html) throw new Error('Maintainers page returned no HTML content');

  const { document } = parseHTML(html);
  const result = {};

  for (const table of document.querySelectorAll('table.wikitable')) {
    const headerRow = table.querySelector('tr');
    if (!headerRow) continue;
    const headers = [...headerRow.querySelectorAll('th')].map((th) => th.textContent.trim().toLowerCase());
    const idxSteward    = headers.findIndex((h) => h.includes('steward'));
    const idxMaintainer = headers.findIndex((h) => h.includes('individual'));
    if (idxSteward < 0) continue;

    for (const row of table.querySelectorAll('tr')) {
      const cells   = [...row.querySelectorAll('td')];
      if (!cells.length) continue;
      const extLink = cells[0]?.querySelector('a[href*="Extension:"]');
      if (!extLink) continue;
      const extName    = extLink.textContent.trim();
      const steward    = cells[idxSteward]?.textContent?.trim()   ?? '';
      const maintainer = idxMaintainer >= 0 ? cells[idxMaintainer]?.textContent?.trim() ?? '' : '';
      result[extName] = { steward, maintainer };
    }
  }

  console.log(`  ${Object.keys(result).length} extensions parsed`);
  // Return a plain object — JSON can't serialize Map, frontend reconstructs via new Map(Object.entries(json))
  return result;
}

// ── GitHub (mobile apps) ─────────────────────────────────────────────────────

function ghHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
  };
}

// The four functions below (normalizeRun, aggregateByWorkflow,
// normalizeRelease, lastReleaseAgeDays, buildTestInventory) intentionally
// mirror their src/services/github/* counterparts byte-for-byte so the
// snapshot JSON has the exact shape the live service would return. Keep
// them in sync if either side changes.

function normalizeRun(raw) {
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

function aggregateByWorkflow(runs) {
  const acc = {};
  for (const run of runs) {
    const key = run.name;
    if (!acc[key]) acc[key] = { n: 0, passed: 0, failed: 0, totalDurationMs: 0, durationCount: 0 };
    const bucket = acc[key];
    bucket.n += 1;
    if (run.conclusion === 'success') bucket.passed += 1;
    else if (run.conclusion === 'failure' || run.conclusion === 'timed_out') bucket.failed += 1;
    if (typeof run.duration_ms === 'number') {
      bucket.totalDurationMs += run.duration_ms;
      bucket.durationCount += 1;
    }
  }
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

function normalizeRelease(raw) {
  return {
    id: raw.id,
    tag_name: raw.tag_name ?? '',
    name: raw.name ?? raw.tag_name ?? '(untitled)',
    published_at: raw.published_at ?? null,
    author: raw.author?.login ?? null,
    html_url: raw.html_url ?? '',
    prerelease: Boolean(raw.prerelease),
    draft: Boolean(raw.draft),
  };
}

function lastReleaseAgeDays(releases, now = new Date()) {
  const published = releases
    .filter((r) => !r.draft && r.published_at)
    .map((r) => Date.parse(r.published_at))
    .filter((t) => Number.isFinite(t));
  if (published.length === 0) return null;
  const newest = Math.max(...published);
  const diffMs = now.getTime() - newest;
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function buildTestInventory(treeResponse, platform, repoFullName, now = new Date()) {
  const matchers = GITHUB_TEST_MATCHERS[platform];
  if (!matchers) throw new Error(`No test matchers for platform: ${platform}`);
  const tree = Array.isArray(treeResponse?.tree) ? treeResponse.tree : [];

  let uiTests = 0;
  let unitTests = 0;
  const byDir = new Map();

  for (const entry of tree) {
    if (entry.type !== 'blob') continue;
    const path = entry.path;
    if (typeof path !== 'string') continue;

    for (const rule of matchers) {
      if (!path.startsWith(rule.prefix)) continue;
      if (!rule.exts.some((ext) => path.endsWith(ext))) continue;

      if (rule.kind === 'ui') uiTests += 1;
      else if (rule.kind === 'unit') unitTests += 1;

      const lastSlash = path.lastIndexOf('/');
      const dir = lastSlash > 0 ? path.slice(0, lastSlash) : path;
      const existing = byDir.get(dir);
      if (existing) existing.count += 1;
      else byDir.set(dir, { count: 1, kind: rule.kind });
      break;
    }
  }

  const byDirectory = [...byDir.entries()]
    .map(([path, { count, kind }]) => ({ path, count, kind }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  return {
    repo: repoFullName,
    generatedAt: now.toISOString(),
    totals: { uiTests, unitTests, total: uiTests + unitTests },
    byDirectory,
  };
}

async function fetchGitHubWorkflowRuns(repo, limit = 30) {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/actions/runs?per_page=${limit}`;
  const res = await fetchWithRetry(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub Actions runs (${repo.fullName}): ${res.status} ${res.statusText}`);
  const json = await res.json();
  const runs = Array.isArray(json.workflow_runs) ? json.workflow_runs.map(normalizeRun) : [];
  return {
    runs,
    byWorkflow: aggregateByWorkflow(runs),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchGitHubReleases(repo, limit = 10) {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/releases?per_page=${limit}`;
  const res = await fetchWithRetry(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub Releases (${repo.fullName}): ${res.status} ${res.statusText}`);
  const json = await res.json();
  const releases = Array.isArray(json) ? json.map(normalizeRelease) : [];
  return {
    releases,
    lastReleaseAgeDays: lastReleaseAgeDays(releases),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchGitHubTestInventory(repo, platform) {
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/git/trees/HEAD?recursive=1`;
  const res = await fetchWithRetry(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub repo tree (${repo.fullName}): ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.truncated) {
    // GitHub caps the recursive tree at ~100k entries. Both target repos are
    // far smaller, but warn loudly if it ever happens so counts aren't
    // silently undercounted.
    console.warn(`  ⚠ ${repo.fullName} tree was truncated by GitHub — counts may be incomplete`);
  }
  return buildTestInventory(json, platform, repo.fullName);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Fetching snapshot data...');
  console.log(`   Output: ${OUT_DIR}/`);
  if (PHAB_TOKEN) console.log('   Phabricator token: provided');
  else             console.log('   Phabricator token: not set (using anonymous rate limit)');
  if (GITHUB_TOKEN) console.log('   GitHub token: provided (5000 req/hr quota)');
  else              console.log('   GitHub token: not set (anonymous 60 req/hr quota — fine for 6 calls)');

  const errors = [];

  // Jenkins jobs + builds (single request)
  let jobs = [];
  try {
    const { jobs: j, builds, failedJobs } = await fetchJenkinsData();
    jobs = j;
    save('jenkins-jobs.json', jobs);
    save('jenkins-builds.json', { builds, failedJobs });
  } catch (err) {
    console.error(`  ✗ Jenkins failed: ${err.message}`);
    errors.push('jenkins-jobs', 'jenkins-builds');
    save('jenkins-jobs.json', []);
    save('jenkins-builds.json', { builds: [], failedJobs: [] });
  }

  // Coverage
  let coverageSnapshot = null;
  try {
    coverageSnapshot = await fetchCoverage();
    save('coverage.json', coverageSnapshot);
  } catch (err) {
    console.error(`  ✗ Coverage failed: ${err.message}`);
    errors.push('coverage');
    save('coverage.json', { core: null, extensions: [] });
  }

  // Phabricator bugs
  try {
    const bugs = await fetchRecentBugs();
    save('phabricator-bugs.json', bugs);
  } catch (err) {
    console.error(`  ✗ Phabricator bugs failed: ${err.message}`);
    errors.push('phabricator-bugs');
    save('phabricator-bugs.json', { tasks: [], totalFetched: 0, hasMore: false, cutoffDate: new Date().toISOString() });
  }

  // Train blockers
  try {
    const train = await fetchTrainBlockers();
    save('phabricator-train.json', train);
  } catch (err) {
    console.error(`  ✗ Train blockers failed: ${err.message}`);
    errors.push('phabricator-train');
    save('phabricator-train.json', null);
  }

  // Maintainers
  try {
    const maintainers = await fetchMaintainers();
    save('maintainers.json', maintainers);
  } catch (err) {
    console.error(`  ✗ Maintainers failed: ${err.message}`);
    errors.push('maintainers');
    save('maintainers.json', {});
  }

  // Automated tests inventory (browser-test-scanner)
  let automatedTestsSnapshot = null;
  try {
    automatedTestsSnapshot = await fetchAutomatedTests();
    save('automated-tests.json', automatedTestsSnapshot);
  } catch (err) {
    console.error(`  ✗ Automated tests failed: ${err.message}`);
    errors.push('automated-tests');
    save('automated-tests.json', { generatedAt: null, repoCount: 0, testCount: 0, repos: [] });
  }

  // Rolling-history aggregate for the Trends Over Time panel. Reads any
  // existing metrics-history.json from OUT_DIR (Toolforge NFS in prod), upserts
  // today's entry by UTC date, prunes entries older than the rolling window,
  // and writes back. On first run (no existing file), seed up to 6 historical
  // entries from the dailyJobs.results 7-day pass/fail flags so day-1 users
  // see a populated trend instead of a single dot.
  try {
    const historyPath = path.join(OUT_DIR, 'metrics-history.json');
    let existingEntries = null;
    if (existsSync(historyPath)) {
      try {
        const parsed = JSON.parse(readFileSync(historyPath, 'utf-8'));
        if (parsed && Array.isArray(parsed.entries)) existingEntries = parsed.entries;
      } catch (parseErr) {
        console.warn(`  ⚠ metrics-history.json was malformed; rebuilding (${parseErr.message})`);
      }
    }

    const today = buildTodayEntry({
      automatedTests: automatedTestsSnapshot,
      coverage: coverageSnapshot,
      date: todayUtcDate(),
    });

    let entries = existingEntries ?? backfillFromDailyJobs(automatedTestsSnapshot);
    entries = upsertHistoryEntry(entries, today);

    save('metrics-history.json', {
      generatedAt: new Date().toISOString(),
      windowDays: HISTORY_DEFAULT_WINDOW_DAYS,
      entries,
    });
  } catch (err) {
    console.error(`  ✗ Metrics history failed: ${err.message}`);
    errors.push('metrics-history');
  }

  // Flaky tests (releng-data Datasette)
  try {
    const flaky = await fetchFlakyTests();
    save('flaky-tests.json', flaky);
  } catch (err) {
    if (err instanceof AnubisChallengeError) {
      console.error('\n🚨 ANUBIS BLOCK DETECTED — flaky-tests bypass has regressed:');
      console.error(`   ${err.message}`);
      errors.push('flaky-tests:anubis-blocked');
    } else {
      console.error(`  ✗ Flaky tests failed: ${err.message}`);
      errors.push('flaky-tests');
    }
    save('flaky-tests.json', { generatedAt: null, rows: [] });
  }

  // GitHub mobile apps — three endpoints per platform. Each call wrapped in
  // its own try/catch so a failure on one source doesn't blank the others
  // (matches the per-source isolation pattern Jenkins/Phabricator use above).
  console.log('\n📦 GitHub: fetching mobile-app data...');
  for (const [platform, repo] of Object.entries(GITHUB_REPOS)) {
    try {
      const data = await fetchGitHubWorkflowRuns(repo);
      save(`${platform}-workflows.json`, data);
    } catch (err) {
      console.error(`  ✗ ${platform} workflows failed: ${err.message}`);
      errors.push(`${platform}-workflows`);
      save(`${platform}-workflows.json`, {
        runs: [], byWorkflow: {}, fetchedAt: new Date().toISOString(),
      });
    }

    try {
      const data = await fetchGitHubReleases(repo);
      save(`${platform}-releases.json`, data);
    } catch (err) {
      console.error(`  ✗ ${platform} releases failed: ${err.message}`);
      errors.push(`${platform}-releases`);
      save(`${platform}-releases.json`, {
        releases: [], lastReleaseAgeDays: null, fetchedAt: new Date().toISOString(),
      });
    }

    try {
      const data = await fetchGitHubTestInventory(repo, platform);
      save(`${platform}-test-inventory.json`, data);
    } catch (err) {
      console.error(`  ✗ ${platform} test inventory failed: ${err.message}`);
      errors.push(`${platform}-test-inventory`);
      save(`${platform}-test-inventory.json`, {
        repo: repo.fullName,
        generatedAt: new Date().toISOString(),
        totals: { uiTests: 0, unitTests: 0, total: 0 },
        byDirectory: [],
      });
    }
  }

  // Metadata
  save('snapshot-meta.json', { generatedAt: new Date().toISOString() });

  console.log('\n' + (errors.length === 0 ? '✅ All snapshots written.' : `⚠️  Done with ${errors.length} error(s): ${errors.join(', ')}`));
}

main().catch((err) => { console.error(err); process.exit(1); });
