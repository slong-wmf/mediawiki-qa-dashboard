#!/usr/bin/env node
/**
 * @file scripts/fetch-snapshot-data.js
 *
 * Server-side data fetcher for the GitHub Pages static build.
 *
 * This script runs in GitHub Actions (no CORS restrictions) and calls all
 * four external APIs that the browser cannot access directly. It produces
 * pre-shaped JSON files that mirror the exact return shapes of the client
 * service functions, so the frontend can swap seamlessly between live API
 * calls and static JSON reads.
 *
 * Output directory: ./snapshot-data/
 * The GitHub Actions workflow copies this to dist/data/ after the Vite build.
 *
 * Usage:
 *   node scripts/fetch-snapshot-data.js
 *
 * Environment variables (all optional):
 *   PHABRICATOR_TOKEN   — Conduit API token (raises rate limit ceiling)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const OUT_DIR = './snapshot-data';
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
  const path = `${OUT_DIR}/${filename}`;
  writeFileSync(path, JSON.stringify(data));
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Fetching snapshot data for GitHub Pages build...');
  console.log(`   Output: ${OUT_DIR}/`);
  if (PHAB_TOKEN) console.log(`   Phabricator token: provided (length=${PHAB_TOKEN.length})`);
  else             console.log('   Phabricator token: not set (using anonymous rate limit)');

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
  try {
    const coverage = await fetchCoverage();
    save('coverage.json', coverage);
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

  // Metadata
  save('snapshot-meta.json', { generatedAt: new Date().toISOString() });

  console.log('\n' + (errors.length === 0 ? '✅ All snapshots written.' : `⚠️  Done with ${errors.length} error(s): ${errors.join(', ')}`));
}

main().catch((err) => { console.error(err); process.exit(1); });
