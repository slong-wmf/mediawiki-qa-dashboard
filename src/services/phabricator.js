/**
 * @file phabricator.js
 * Service module for the Phabricator Conduit API.
 * Phabricator does not send CORS headers, so all requests must go through
 * the Vite proxy at /api/phabricator → https://phabricator.wikimedia.org/api.
 *
 * No secret is required for public read-only queries on Wikimedia Phabricator,
 * but a token in VITE_PHABRICATOR_TOKEN will raise the rate-limit ceiling.
 */

const BASE_URL = '/api/phabricator';
const TOKEN    = import.meta.env.VITE_PHABRICATOR_TOKEN ?? '';

/** How many days back to look for recently-active tasks. */
const LOOKBACK_DAYS = 7;

/** Max tasks to retrieve per request (Conduit hard cap is 100 per page). */
const PAGE_LIMIT = 100;

/** Max pages to fetch (keeps total ≤ PAGE_LIMIT * MAX_PAGES = 200 tasks). */
const MAX_PAGES = 2;

// ── Status handling ─────────────────────────────────────────────────────────

/**
 * Statuses that mean the task is definitively closed.
 * Wikimedia Phabricator extends the default set with "spite".
 */
const CLOSED_STATUSES = new Set([
  'resolved', 'declined', 'invalid', 'wontfix', 'spite', 'duplicate',
]);

/**
 * Map a raw Conduit status value to a broad display group used in the panel.
 * @param {string} raw
 * @returns {'open'|'in-progress'|'stalled'|'needs-triage'|'other'}
 */
export function statusGroup(raw) {
  if (raw === 'open')          return 'open';
  if (raw === 'in-progress')   return 'in-progress';
  if (raw === 'stalled')       return 'stalled';
  if (raw === 'needs-triage')  return 'needs-triage';
  return 'other';
}

const STATUS_LABELS = {
  'open':         'Open',
  'in-progress':  'In Progress',
  'stalled':      'Stalled',
  'needs-triage': 'Needs Triage',
  'other':        'Other',
};

// ── Priority handling ───────────────────────────────────────────────────────

const PRIORITY_MAP = {
  100: { label: 'Unbreak Now!', key: 'unbreak-now' },
  90:  { label: 'Needs Triage', key: 'needs-triage' },
  80:  { label: 'High',         key: 'high' },
  50:  { label: 'Normal',       key: 'normal' },
  25:  { label: 'Low',          key: 'low' },
  0:   { label: 'Wishlist',     key: 'wishlist' },
};

export function mapPriority(value) {
  return PRIORITY_MAP[value] ?? { label: `P${value}`, key: `p${value}` };
}

// ── Bug-signal keyword matching ─────────────────────────────────────────────

/**
 * Keywords used to identify likely bug reports among Phabricator tasks.
 *
 * IMPORTANT — title-only matching:
 * This search inspects only the task *title* (subject line). It does NOT scan
 * task descriptions, comments, or any other fields. A task whose title says
 * "Investigate performance" would not be flagged even if every comment describes
 * a crash. Scanning comments would require fetching the full transaction history
 * for every task, which is prohibitively expensive at scale.
 *
 * A task is flagged as a suspected bug when its lowercased title contains any
 * of the strings below. Partial-word matches are intentional for some terms
 * (e.g. "fail" catches "failing", "failure") but avoided for others where they
 * would produce false positives (e.g. "fix " with a trailing space avoids
 * matching "prefix" or "suffix").
 */
const BUG_KEYWORDS = [
  'bug', 'regression', 'broken', 'broke', 'breaks', 'breaking',
  'fail', 'fails', 'failing', 'failure',
  'crash', 'error', 'exception',
  'not working', 'doesn\'t work', 'does not work',
  'unexpected', 'incorrect', 'wrong',
  'fix ', ' fix:', 'hotfix',
];

/**
 * Returns true if the task title contains any bug-signal keywords.
 * @param {string} title
 * @returns {boolean}
 */
export function isSuspectedBug(title) {
  const lower = title.toLowerCase();
  return BUG_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── API call helpers ────────────────────────────────────────────────────────

/**
 * POST to a Conduit endpoint via the Vite proxy.
 * @param {string} method  e.g. 'maniphest.search'
 * @param {URLSearchParams} params
 * @returns {Promise<any>}  json.result
 */
async function conduit(method, params) {
  if (TOKEN) params.set('api.token', TOKEN);
  params.set('__conduit__', '1');

  const res = await fetch(`${BASE_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Phabricator ${method} HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.error_code) {
    throw new Error(`Phabricator Conduit error [${json.error_code}]: ${json.error_info}`);
  }
  if (!json.result) {
    throw new Error(`Phabricator ${method} returned no result`);
  }
  return json.result;
}

// ── Shape a raw Conduit task into our internal model ────────────────────────

export function shapeTask(raw, cutoffEpoch) {
  const fields      = raw.fields ?? {};
  const statusRaw   = fields.status?.value ?? 'open';
  const priorityVal = fields.priority?.value ?? 50;
  const createdEp   = fields.dateCreated   ?? 0;
  const modifiedEp  = fields.dateModified  ?? 0;
  const prio        = mapPriority(priorityVal);
  const title       = fields.name ?? '(no title)';

  return {
    id:           raw.id,
    phid:         raw.phid,
    title,
    statusRaw,
    statusGroup:  statusGroup(statusRaw),
    statusLabel:  fields.status?.name ?? STATUS_LABELS[statusGroup(statusRaw)] ?? statusRaw,
    priority:     prio.key,
    priorityLabel: prio.label,
    priorityValue: priorityVal,
    url:          `https://phabricator.wikimedia.org/T${raw.id}`,
    createdAt:    new Date(createdEp  * 1000).toISOString(),
    modifiedAt:   new Date(modifiedEp * 1000).toISOString(),
    // Created within the look-back window = freshly filed
    isNew:        createdEp >= cutoffEpoch,
    isSuspectedBug: isSuspectedBug(title),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch open Phabricator tasks that were modified (or created) within the
 * past LOOKBACK_DAYS days.  Iterates up to MAX_PAGES of results.
 *
 * @returns {Promise<{
 *   tasks: Array,
 *   totalFetched: number,
 *   hasMore: boolean,
 *   cutoffDate: string,
 * }>}
 */
export async function fetchRecentBugs() {
  const cutoffEpoch = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
  const allTasks    = [];
  let   after       = null;
  let   hasMore     = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      'constraints[modifiedStart]': String(cutoffEpoch),
      'order':  'updated',
      'limit':  String(PAGE_LIMIT),
    });

    // Include all broad status categories — we filter closed ones client-side
    // so we don't need to enumerate every possible open status name.
    // (Wikimedia has custom statuses; we exclude by known closed values below.)

    if (after) params.set('after', after);

    const result = await conduit('maniphest.search', params);
    const raw    = Array.isArray(result.data) ? result.data : [];

    for (const t of raw) {
      const task = shapeTask(t, cutoffEpoch);
      // Skip definitively closed tasks
      if (CLOSED_STATUSES.has(task.statusRaw)) continue;
      allTasks.push(task);
    }

    const cursor = result.cursor ?? {};
    after    = cursor.after ?? null;
    hasMore  = Boolean(after);

    // Stop early if the last page was a partial page (no more results)
    if (raw.length < PAGE_LIMIT) { hasMore = false; break; }
    if (!after) break;
  }

  return {
    tasks:        allTasks,
    totalFetched: allTasks.length,
    hasMore,
    cutoffDate:   new Date(cutoffEpoch * 1000).toISOString(),
  };
}

// Keep legacy export so nothing breaks if it's still referenced somewhere
export { fetchRecentBugs as fetchOpenBugs };
