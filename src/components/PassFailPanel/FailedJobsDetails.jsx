import { useEffect, useMemo, useState } from 'react';
import { fetchBuildConsoleTail } from '../../services/jenkins.js';
import { USE_STATIC_DATA } from '../../services/staticData.js';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_24H      = 24 * MS_PER_HOUR;

// Module-level cache so toggling the expansion (or remounting a card) doesn't
// re-fetch the same consoleText. Keyed by build URL.
const consoleTailCache = new Map();

/** Test hook — clears the module-level console-tail cache. */
export function __resetConsoleTailCache() {
  consoleTailCache.clear();
}

/**
 * Parse the trailing build number from a Jenkins build URL.
 * e.g. ".../job/<slug>/42/" → "42". Returns null if no number is found.
 */
function parseBuildNumber(buildUrl) {
  if (!buildUrl) return null;
  const m = String(buildUrl).match(/\/(\d+)\/?$/);
  return m ? m[1] : null;
}

/**
 * Render a short relative timestamp like "2h ago" / "14m ago".
 */
function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/**
 * Build 24 contiguous hour-slot counts for a single job's failed builds.
 * Index 0 is the oldest (23 hours ago), index 23 is the current hour.
 *
 * @param {Array<{timestamp: string}>} failedBuilds
 * @param {number} now  Reference time in ms (allows deterministic tests).
 * @returns {number[]}  length-24 array of failure counts per hour slot.
 */
export function buildHourlyBreakdown(failedBuilds, now = Date.now()) {
  const counts = new Array(24).fill(0);
  for (const b of failedBuilds) {
    const t = new Date(b.timestamp).getTime();
    if (Number.isNaN(t)) continue;
    const ageMs = now - t;
    if (ageMs < 0 || ageMs >= MS_24H) continue;
    const slot = 23 - Math.floor(ageMs / MS_PER_HOUR);
    if (slot >= 0 && slot < 24) counts[slot] += 1;
  }
  return counts;
}

/** Tailwind class for a breakdown cell based on failure count. */
function cellClass(count) {
  if (count === 0) return 'bg-gray-700/40';
  if (count === 1) return 'bg-red-900';
  if (count === 2) return 'bg-red-700';
  if (count <= 4)  return 'bg-red-500';
  return 'bg-red-400';
}

/**
 * Lazy-loaded tail of the most recent failed build's console log.
 *
 * @param {{ buildUrl: string }} props
 */
function ConsoleTail({ buildUrl }) {
  const [state, setState] = useState(() => {
    const cached = consoleTailCache.get(buildUrl);
    if (cached) return cached;
    return { status: 'loading', text: null, error: null };
  });

  useEffect(() => {
    const cached = consoleTailCache.get(buildUrl);
    if (cached) {
      setState(cached);
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', text: null, error: null });
    fetchBuildConsoleTail(buildUrl)
      .then((text) => {
        const next = text == null
          ? { status: 'static', text: null, error: null }
          : { status: 'success', text, error: null };
        consoleTailCache.set(buildUrl, next);
        if (!cancelled) setState(next);
      })
      .catch((err) => {
        const next = { status: 'error', text: null, error: err };
        consoleTailCache.set(buildUrl, next);
        if (!cancelled) setState(next);
      });
    return () => { cancelled = true; };
  }, [buildUrl]);

  if (state.status === 'loading') {
    return <p className="text-xs text-gray-500 italic">Loading error log…</p>;
  }
  if (state.status === 'static') {
    return (
      <p className="text-xs text-gray-500 italic">
        Error log not available in snapshot mode —{' '}
        <a
          href={buildUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          open build in Jenkins ↗
        </a>
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="text-xs text-red-400">
        Could not load console log: {state.error?.message ?? 'unknown error'}
      </p>
    );
  }
  return (
    <pre className="text-[11px] leading-snug text-gray-300 bg-gray-900/70 border border-gray-700/70 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
      {state.text}
    </pre>
  );
}

/**
 * One card per failed job, with a 24-hour breakdown, latest build link,
 * and lazy-loaded console-tail error message.
 */
function FailedJobCard({ job, builds, now }) {
  const sorted    = useMemo(
    () => [...builds].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [builds],
  );
  const mostRecent = sorted[0];
  const breakdown  = useMemo(() => buildHourlyBreakdown(sorted, now), [sorted, now]);
  const buildNum   = parseBuildNumber(mostRecent?.build_url);

  return (
    <div className="bg-gray-700/40 border border-gray-600/50 rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-200 truncate" title={job}>
          {job}
        </h4>
        <span className="text-xs font-mono text-red-400 whitespace-nowrap">
          {sorted.length} failure{sorted.length !== 1 ? 's' : ''} / 24h
        </span>
      </div>

      <div>
        <p className="text-[11px] text-gray-500 mb-1">Failures per hour (oldest → newest)</p>
        <div
          className="flex gap-0.5"
          role="img"
          aria-label={`Hourly failure breakdown for ${job}`}
          data-testid="hourly-breakdown"
        >
          {breakdown.map((count, i) => {
            const hoursAgo = 23 - i;
            return (
              <div
                key={i}
                className={`h-3 flex-1 rounded-sm ${cellClass(count)}`}
                title={`${hoursAgo}h ago — ${count} failure${count !== 1 ? 's' : ''}`}
                data-count={count}
              />
            );
          })}
        </div>
      </div>

      {mostRecent && (
        <div className="text-xs text-gray-400">
          Most recent failure:{' '}
          <a
            href={mostRecent.build_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            build {buildNum ?? '#'}
          </a>{' '}
          <span className="text-gray-500">· {relativeTime(mostRecent.timestamp)}</span>
        </div>
      )}

      {mostRecent && <ConsoleTail buildUrl={mostRecent.build_url} />}
    </div>
  );
}

/**
 * Failed-jobs drill-down section for the Pass/Fail Rates panel.
 *
 * Filters the supplied `builds` to status === 'failed' within the past 24
 * hours, groups by job name, and renders one {@link FailedJobCard} per job.
 *
 * @param {{ builds: Array<{
 *   job: string,
 *   build_url: string,
 *   status: 'passed'|'failed'|'other',
 *   timestamp: string,
 * }> }} props
 */
export default function FailedJobsDetails({ builds }) {
  // Resolve "now" once per render so every card uses the same 24h window.
  const now = Date.now();

  const grouped = useMemo(() => {
    const safe = Array.isArray(builds) ? builds : [];
    const cutoff = now - MS_24H;
    const byJob  = new Map();
    for (const b of safe) {
      if (!b || b.status !== 'failed' || !b.timestamp) continue;
      const t = new Date(b.timestamp).getTime();
      if (Number.isNaN(t) || t < cutoff) continue;
      const key = b.job ?? 'unknown';
      if (!byJob.has(key)) byJob.set(key, []);
      byJob.get(key).push(b);
    }
    return [...byJob.entries()]
      .map(([job, jobBuilds]) => ({ job, builds: jobBuilds }))
      .sort((a, b) => b.builds.length - a.builds.length);
    // now is intentionally excluded from deps — we want a stable snapshot per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builds]);

  if (grouped.length === 0) {
    return (
      <p
        className="text-xs text-gray-400 italic bg-gray-700/30 border border-gray-700 rounded px-3 py-2"
        data-testid="no-failures"
      >
        No failures in the past 24 hours 🎉
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="failed-jobs-details">
      <p className="text-[11px] text-gray-500">
        {grouped.length} job{grouped.length !== 1 ? 's' : ''} with failures in the past 24
        hours
        {USE_STATIC_DATA && ' · error logs unavailable in snapshot mode'}
      </p>
      {grouped.map(({ job, builds: jobBuilds }) => (
        <FailedJobCard key={job} job={job} builds={jobBuilds} now={now} />
      ))}
    </div>
  );
}
