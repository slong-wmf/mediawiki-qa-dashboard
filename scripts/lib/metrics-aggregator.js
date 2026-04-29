/**
 * @file metrics-aggregator.js
 *
 * Pure helpers that derive a single day's metric snapshot from the freshly
 * fetched dashboard data, plus utilities for maintaining a rolling-history
 * file that the Trends Over Time panel renders.
 *
 * Kept in scripts/lib/ — and free of side effects — so vitest can import it
 * directly without running the snapshot fetcher's main(). The Toolforge cron
 * imports this module, calls the aggregators on its in-memory results, and
 * upserts today's entry into snapshot-data/metrics-history.json.
 */

const HISTORY_WINDOW_DAYS = 90;
const MS_PER_DAY = 86_400_000;

/**
 * Aggregate per-day pass/fail/total counts across every daily Jenkins job
 * surfaced by the browser-test-scanner. Uses the most recent element of each
 * job's 7-day `results` array (oldest → newest). Returns null when there are
 * no daily jobs to aggregate (e.g. failed automated-tests fetch).
 *
 * @param {{repos?: Array}|null} automatedTests
 * @returns {{pct: number, passes: number, fails: number, total: number}|null}
 */
export function aggregateDailyTestStats(automatedTests) {
  if (!automatedTests || !Array.isArray(automatedTests.repos)) return null;
  let passes = 0;
  let fails = 0;
  let total = 0;
  let sawAny = false;
  for (const repo of automatedTests.repos) {
    for (const job of repo.dailyJobs ?? []) {
      sawAny = true;
      passes += Number(job.passes) || 0;
      fails += Number(job.fails) || 0;
      total += Number(job.total) || 0;
    }
  }
  if (!sawAny) return null;
  const pct = total > 0 ? Math.round((passes / total) * 1000) / 10 : 0;
  return { pct, passes, fails, total };
}

/**
 * Sum the test count across repos partitioned by framework. WDIO and Cypress
 * are E2E by definition; everything else falls under `other` and is excluded
 * from the E2E total.
 *
 * @param {{repos?: Array}|null} automatedTests
 * @returns {{wdio: number, cypress: number, total: number}|null}
 */
export function aggregateE2ETestCount(automatedTests) {
  if (!automatedTests || !Array.isArray(automatedTests.repos)) return null;
  let wdio = 0;
  let cypress = 0;
  for (const repo of automatedTests.repos) {
    const count = Number(repo.testCount) || 0;
    if (repo.framework === 'wdio') wdio += count;
    else if (repo.framework === 'cypress') cypress += count;
  }
  return { wdio, cypress, total: wdio + cypress };
}

/**
 * Sum the daily test-run count across all daily jobs (the `total` field on
 * each dailyJob row, summed across the most recent day's results).
 *
 * @param {{repos?: Array}|null} automatedTests
 * @returns {number|null}
 */
export function aggregateDailyTestRunCount(automatedTests) {
  const stats = aggregateDailyTestStats(automatedTests);
  return stats ? stats.total : null;
}

/**
 * Compute a simple (unweighted) average coverage % for core and extensions.
 * Extensions with `coverage_pct: 0` and no `last_updated` are skipped because
 * they typically reflect un-built repos rather than a real zero.
 *
 * @param {{core?: object|null, extensions?: Array}|null} coverage
 * @returns {{coreAvg: number|null, extensionsAvg: number|null, extensionsCount: number}|null}
 */
export function aggregateCoverage(coverage) {
  if (!coverage) return null;
  const coreAvg =
    coverage.core && typeof coverage.core.coverage_pct === 'number'
      ? coverage.core.coverage_pct
      : null;
  const extensions = Array.isArray(coverage.extensions) ? coverage.extensions : [];
  const valid = extensions.filter(
    (e) => typeof e.coverage_pct === 'number' && (e.coverage_pct > 0 || e.last_updated),
  );
  const extensionsAvg = valid.length
    ? Math.round((valid.reduce((s, e) => s + e.coverage_pct, 0) / valid.length) * 10) / 10
    : null;
  return { coreAvg, extensionsAvg, extensionsCount: valid.length };
}

/**
 * Build the full "today" entry for the metrics-history file from the
 * snapshot script's in-memory fetch results. Any field whose source data is
 * missing falls through as null so the chart can render a gap rather than
 * misreporting zero.
 *
 * @param {{automatedTests?: object|null, coverage?: object|null, date?: string}} input
 * @returns {object}
 */
export function buildTodayEntry({ automatedTests, coverage, date }) {
  return {
    date: date ?? todayUtcDate(),
    dailyPassRate: aggregateDailyTestStats(automatedTests),
    coverage: aggregateCoverage(coverage),
    e2eTestCount: aggregateE2ETestCount(automatedTests),
    dailyTestRunCount: aggregateDailyTestRunCount(automatedTests),
  };
}

/**
 * Returns the current date as a YYYY-MM-DD string in UTC.
 * @returns {string}
 */
export function todayUtcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Upsert today's entry into the history array (matching by `date`), then
 * drop entries older than the rolling window and sort ascending by date.
 * Mutates the array in place and returns it.
 *
 * @param {Array} entries
 * @param {{date: string}} today
 * @param {{windowDays?: number, now?: Date}} [opts]
 * @returns {Array}
 */
export function upsertHistoryEntry(entries, today, opts = {}) {
  const windowDays = opts.windowDays ?? HISTORY_WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const list = Array.isArray(entries) ? entries : [];
  const idx = list.findIndex((e) => e?.date === today.date);
  if (idx >= 0) list[idx] = today;
  else list.push(today);
  const cutoff = new Date(now.getTime() - windowDays * MS_PER_DAY).toISOString().slice(0, 10);
  return list
    .filter((e) => e?.date && e.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Synthesise up to 7 historical entries from the existing dailyJobs.results
 * arrays. The browser-test-scanner records P/F flags for the last 7 days
 * (oldest → newest); we walk that array per job and roll daily aggregates.
 *
 * Fields without a 7-day source (coverage, E2E count) are null on backfilled
 * entries, which TrendChart renders as gaps. The most-recent day is excluded
 * because the live aggregator already produces it as the canonical "today".
 *
 * @param {{repos?: Array}|null} automatedTests
 * @param {{now?: Date}} [opts]
 * @returns {Array<object>}
 */
export function backfillFromDailyJobs(automatedTests, opts = {}) {
  if (!automatedTests || !Array.isArray(automatedTests.repos)) return [];
  const now = opts.now ?? new Date();
  const dayBuckets = new Map(); // dayOffset → { passes, fails, total }
  for (const repo of automatedTests.repos) {
    for (const job of repo.dailyJobs ?? []) {
      const results = Array.isArray(job.results) ? job.results : [];
      const len = results.length;
      const total = Number(job.total) || 0;
      if (!len || total === 0) continue;
      // The job.passes/fails counts are aggregates for the whole results
      // window — we can't pin per-day pass counts without per-day totals
      // from the scanner. Approximate evenly: each "P" day contributes
      // total/len passes, each "F" contributes total/len fails. Better than
      // dropping the data, and the aggregate over 7 days reconciles back to
      // the underlying counts.
      const perDay = total / len;
      results.forEach((flag, i) => {
        const dayOffset = len - 1 - i; // 0 = most recent
        if (dayOffset === 0) return; // skip "today" — covered by live aggregator
        if (flag !== 'P' && flag !== 'F') return;
        if (!dayBuckets.has(dayOffset)) {
          dayBuckets.set(dayOffset, { passes: 0, fails: 0, total: 0 });
        }
        const bucket = dayBuckets.get(dayOffset);
        bucket.total += perDay;
        if (flag === 'P') bucket.passes += perDay;
        else bucket.fails += perDay;
      });
    }
  }
  const entries = [];
  for (const [dayOffset, bucket] of dayBuckets.entries()) {
    if (bucket.total <= 0) continue;
    const date = new Date(now.getTime() - dayOffset * MS_PER_DAY).toISOString().slice(0, 10);
    const passes = Math.round(bucket.passes);
    const fails = Math.round(bucket.fails);
    const total = Math.round(bucket.total);
    const pct = total > 0 ? Math.round((passes / total) * 1000) / 10 : 0;
    entries.push({
      date,
      dailyPassRate: { pct, passes, fails, total },
      coverage: null,
      e2eTestCount: null,
      dailyTestRunCount: total,
    });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export const HISTORY_DEFAULT_WINDOW_DAYS = HISTORY_WINDOW_DAYS;
