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

/**
 * Shape a raw Conduit task record into the dashboard's internal model.
 *
 * @param {object} raw           - Raw task object from maniphest.search
 * @param {number} cutoffEpoch   - Unix epoch; tasks created after this are "new"
 * @param {Object} phidToName    - Map of project PHID → display name (from project.search)
 */
export function shapeTask(raw, cutoffEpoch, phidToName = {}) {
  const fields      = raw.fields ?? {};
  const statusRaw   = fields.status?.value ?? 'open';
  const priorityVal = fields.priority?.value ?? 50;
  const createdEp   = fields.dateCreated   ?? 0;
  const modifiedEp  = fields.dateModified  ?? 0;
  const prio        = mapPriority(priorityVal);
  const title       = fields.name ?? '(no title)';

  // Resolve project PHIDs to human-readable names (requires attachments[projects]=1
  // in the maniphest.search request and a prior project.search call to build phidToName).
  const projectPHIDs = raw.attachments?.projects?.projectPHIDs ?? [];
  const projectNames = projectPHIDs
    .map((phid) => phidToName[phid])
    .filter(Boolean);

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
    projectNames,        // display names of all Phabricator project tags on this task
    projectCount: projectPHIDs.length, // total tag count (non-zero even when names failed to resolve)
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
/**
 * Resolve an array of project PHIDs to a { phid → name } map via project.search.
 * Silently returns an empty map on failure so the rest of the fetch can proceed.
 *
 * @param {string[]} phids
 * @returns {Promise<Object>}
 */
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
    // Project name resolution is best-effort; tasks will fall back to showing
    // a raw tag count instead of names. Log in dev so developers can diagnose.
    if (import.meta.env.DEV) {
      console.warn('[phabricator] project.search failed — tag names unavailable:', err?.message ?? err);
    }
    return {};
  }
}

export async function fetchRecentBugs() {
  const cutoffEpoch = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
  const rawTasks    = []; // collect raw Conduit records before shaping
  let   after       = null;
  let   hasMore     = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      'constraints[modifiedStart]':    String(cutoffEpoch),
      // Only fetch tasks filed as Bug Reports or Production Errors.
      // Security subtypes are excluded — they are not publicly viewable outside the foundation.
      'constraints[subtypes][0]':      'bug',
      'constraints[subtypes][1]':      'error',
      'order':                         'updated',
      'limit':                         String(PAGE_LIMIT),
      // Request the projects attachment so we can show Phabricator tags per task.
      // Resolving the PHIDs to names is done in a single batch call after pagination.
      'attachments[projects]':         '1',
    });

    // Include all broad status categories — we filter closed ones client-side
    // so we don't need to enumerate every possible open status name.
    // (Wikimedia has custom statuses; we exclude by known closed values below.)

    if (after) params.set('after', after);

    const result = await conduit('maniphest.search', params);
    const raw    = Array.isArray(result.data) ? result.data : [];
    rawTasks.push(...raw);

    const cursor = result.cursor ?? {};
    after    = cursor.after ?? null;
    hasMore  = Boolean(after);

    // Stop early if the last page was a partial page (no more results)
    if (raw.length < PAGE_LIMIT) { hasMore = false; break; }
    if (!after) break;
  }

  // Resolve all unique project PHIDs to names in a single batch request.
  const allPHIDs = [...new Set(
    rawTasks.flatMap((t) => t.attachments?.projects?.projectPHIDs ?? []),
  )];
  const phidToName = await resolveProjectNames(allPHIDs);

  // Shape all tasks now that we have the full PHID→name map, then filter closed ones.
  const allTasks = rawTasks
    .map((t) => shapeTask(t, cutoffEpoch, phidToName))
    .filter((task) => !CLOSED_STATUSES.has(task.statusRaw));

  return {
    tasks:        allTasks,
    totalFetched: allTasks.length,
    hasMore,
    cutoffDate:   new Date(cutoffEpoch * 1000).toISOString(),
  };
}

// ── Train Blockers ──────────────────────────────────────────────────────────

/**
 * Project PHID for "Train Deployments" on Wikimedia Phabricator.
 * Used as a stable constraint for finding weekly train tasks, more reliable
 * than a full-text search on the task title.
 */
const TRAIN_DEPLOYMENTS_PHID = 'PHID-PROJ-fmcvjrkfvvzz3gxavs3a';

/**
 * Resolve an array of user PHIDs to a { phid → { username, realName } } map
 * via user.search.  Silently returns an empty map on failure so the rest of
 * the fetch can proceed.
 *
 * @param {string[]} phids
 * @returns {Promise<Object>}
 */
async function resolveUsernames(phids) {
  if (!phids.length) return {};
  const params = new URLSearchParams({ limit: String(phids.length) });
  phids.forEach((phid) => params.append('constraints[phids][]', phid));
  try {
    const result = await conduit('user.search', params);
    return Object.fromEntries(
      (result.data ?? []).map((u) => [
        u.phid,
        { username: u.fields?.username ?? null, realName: u.fields?.realName ?? null },
      ]),
    );
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[phabricator] user.search failed — usernames unavailable:', err?.message ?? err);
    }
    return {};
  }
}

/**
 * Shape a raw Conduit task record into the blocker model used by TrainBlockersPanel.
 *
 * @param {object} raw          - Raw task object from maniphest.search
 * @param {Object} phidToUser   - Map of user PHID → { username, realName }
 * @returns {object}
 */
function shapeBlockerTask(raw, phidToUser) {
  const fields      = raw.fields ?? {};
  const priorityVal = fields.priority?.value ?? 50;
  const prio        = mapPriority(priorityVal);
  const closedEp    = fields.dateClosed ?? null;

  const toUsername = (phid) => (phid ? (phidToUser[phid]?.username ?? null) : null);

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

/**
 * Fetch the most recently resolved weekly train task and all of its subtask
 * blockers, with author, owner, and closer usernames resolved.
 *
 * Three Conduit calls are made in sequence:
 *   A. maniphest.search — find the last resolved release task in Train Deployments
 *   B. maniphest.search — fetch its child (blocker) tasks
 *   C. user.search      — resolve all author/closer/owner PHIDs to usernames
 *
 * @returns {Promise<{
 *   trainTask: {
 *     id: number, title: string, url: string,
 *     version: string|null, closedAt: string|null, closerUsername: string|null,
 *   },
 *   blockers: Array,
 *   totalBlockers: number,
 * }>}
 */
export async function fetchTrainBlockers() {
  // ── Call A: find the most recently resolved train task ──────────────────
  const trainParams = new URLSearchParams({
    'constraints[projects][0]': TRAIN_DEPLOYMENTS_PHID,
    'constraints[subtypes][0]': 'release',
    'constraints[statuses][0]': 'resolved',
    'order':                    'newest',
    'limit':                    '1',
  });
  const trainResult = await conduit('maniphest.search', trainParams);
  const trainRaw    = trainResult.data ?? [];

  if (!trainRaw.length) {
    throw new Error('No resolved train tasks found');
  }

  const trainRawTask   = trainRaw[0];
  const trainFields    = trainRawTask.fields ?? {};
  const trainClosedEp  = trainFields.dateClosed ?? null;

  // ── Call B: fetch the blocker subtasks ──────────────────────────────────
  const blockerParams = new URLSearchParams({ limit: '100' });
  blockerParams.append('constraints[parentIDs][]', String(trainRawTask.id));
  const blockerResult = await conduit('maniphest.search', blockerParams);
  const blockerRaw    = Array.isArray(blockerResult.data) ? blockerResult.data : [];

  // ── Call C: resolve all user PHIDs to usernames ─────────────────────────
  const allUserPHIDs = [...new Set([
    trainFields.closerPHID,
    ...blockerRaw.flatMap((t) => {
      const f = t.fields ?? {};
      return [f.authorPHID, f.closerPHID, f.ownerPHID];
    }),
  ].filter(Boolean))];

  const phidToUser = await resolveUsernames(allUserPHIDs);

  // ── Shape results ────────────────────────────────────────────────────────
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

  return {
    trainTask,
    blockers,
    totalBlockers: blockers.length,
  };
}
