/**
 * @file metricsHistory.js
 * Service module for the rolling-history file produced by the Toolforge cron
 * (scripts/fetch-snapshot-data.js). The file holds up to 90 daily aggregates
 * across the four metrics surfaced by the Trends Over Time panel.
 *
 * Unlike the other services this one has no live API counterpart — the data
 * only exists as the snapshot artifact written by the cron, so it is always
 * fetched from /data/metrics-history.json regardless of VITE_STATIC_DATA mode.
 * In dev the Vite middleware in vite.config.js serves /data/* from
 * snapshot-data/. In prod, server.js does the same from NFS.
 *
 * A missing file is treated as "no history yet" (returns an empty entries
 * array) rather than throwing, so the panel can render its own empty state
 * instead of the generic ErrorBanner.
 */

const HISTORY_URL = '/data/metrics-history.json';

/**
 * @typedef {Object} MetricsHistoryEntry
 * @property {string} date                          YYYY-MM-DD (UTC)
 * @property {{pct: number, passes: number, fails: number, total: number}|null} dailyPassRate
 * @property {{coreAvg: number|null, extensionsAvg: number|null, extensionsCount: number}|null} coverage
 * @property {{wdio: number, cypress: number, total: number}|null} e2eTestCount
 * @property {number|null} dailyTestRunCount
 */

/**
 * @typedef {Object} MetricsHistory
 * @property {string|null} generatedAt   ISO timestamp of the most recent cron run
 * @property {number} windowDays         Rolling window the cron prunes against
 * @property {Array<MetricsHistoryEntry>} entries  Sorted ascending by date
 */

/**
 * Fetch the rolling-history aggregate. Returns an empty envelope when the
 * file is absent (Toolforge cron has not run yet, or local dev without the
 * snapshot script having been run).
 *
 * @returns {Promise<MetricsHistory>}
 */
export async function fetchMetricsHistory() {
  const res = await fetch(HISTORY_URL);
  if (res.status === 404) {
    return { generatedAt: null, windowDays: 90, entries: [] };
  }
  if (!res.ok) {
    throw new Error(`Metrics history fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return {
    generatedAt: json.generatedAt ?? null,
    windowDays: typeof json.windowDays === 'number' ? json.windowDays : 90,
    entries: Array.isArray(json.entries) ? json.entries : [],
  };
}
