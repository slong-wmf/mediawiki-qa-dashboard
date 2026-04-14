import { useEffect, useMemo, useState } from 'react';
import { fetchBuildConsoleTail } from '../../services/jenkins.js';
import { USE_STATIC_DATA } from '../../services/staticData.js';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY  = 24 * MS_PER_HOUR;
const MS_7D       = 7 * MS_PER_DAY;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

/** Local-midnight timestamp for the calendar day containing `ms`. */
function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Build a 7×24 grid of failure counts covering the last 7 calendar days.
 * `grid[dayIdx][hourIdx]` where `dayIdx=0` is 6 days ago and `dayIdx=6` is
 * today; `hourIdx` is the hour of day in local time (0..23).
 *
 * Failures outside the 7-day calendar window are ignored.
 *
 * @param {Array<{timestamp: string}>} failedBuilds
 * @param {number} now  Reference time in ms (allows deterministic tests).
 * @returns {number[][]}  7-row × 24-col 2-D array of failure counts.
 */
export function buildWeeklyHourlyBreakdown(failedBuilds, now = Date.now()) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const todayStart = startOfLocalDay(now);
  for (const b of failedBuilds) {
    const t = new Date(b.timestamp).getTime();
    if (Number.isNaN(t)) continue;
    const buildDayStart = startOfLocalDay(t);
    const daysBack = Math.round((todayStart - buildDayStart) / MS_PER_DAY);
    if (daysBack < 0 || daysBack > 6) continue;
    const dayIdx  = 6 - daysBack;
    const hourIdx = new Date(t).getHours();
    if (hourIdx >= 0 && hourIdx < 24) grid[dayIdx][hourIdx] += 1;
  }
  return grid;
}

/** Tailwind class for a breakdown cell based on failure count. */
function cellClass(count) {
  if (count === 0) return 'bg-gray-700/40';
  if (count === 1) return 'bg-red-900';
  if (count === 2) return 'bg-red-700';
  if (count <= 4)  return 'bg-red-500';
  return 'bg-red-400';
}

/** Tailwind badge colour for a build status. */
function statusBadge(status) {
  if (status === 'passed') return 'bg-green-700 text-green-100';
  if (status === 'failed') return 'bg-red-700  text-red-100';
  return 'bg-gray-600 text-gray-100';
}

/** Format an ISO timestamp as HH:mm:ss in local time. */
function formatHms(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Human label for a (dayIdx, hourIdx) cell given `now`. */
function cellLabel(dayIdx, hourIdx, now) {
  const todayStart = startOfLocalDay(now);
  const cellStart  = todayStart - (6 - dayIdx) * MS_PER_DAY;
  const weekday    = WEEKDAY_LABELS[new Date(cellStart).getDay()];
  return `${weekday} ${String(hourIdx).padStart(2, '0')}:00`;
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
 * Detail list shown when a heatmap cell is selected. Lists every build for
 * the job whose timestamp falls in the selected (day, hour) slot.
 */
function HourDetail({ job, allBuilds, selectedCell, now }) {
  const { day, hour } = selectedCell;
  const todayStart = startOfLocalDay(now);
  const cellStart  = todayStart - (6 - day) * MS_PER_DAY + hour * MS_PER_HOUR;
  const cellEnd    = cellStart + MS_PER_HOUR;
  const label      = cellLabel(day, hour, now);

  const builds = [...allBuilds]
    .filter((b) => {
      if (!b?.timestamp) return false;
      const t = new Date(b.timestamp).getTime();
      return !Number.isNaN(t) && t >= cellStart && t < cellEnd;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div
      className="mt-1 rounded border border-gray-700 bg-gray-900/60 p-2 space-y-1.5"
      data-testid="hour-detail"
    >
      <p className="text-[11px] text-gray-400">
        Builds at <span className="text-gray-200 font-medium">{label}</span>
        {' '}for <span className="text-gray-300">{job}</span>
      </p>
      {builds.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">No builds in this hour</p>
      ) : (
        <ul className="space-y-1">
          {builds.map((b) => {
            const num = parseBuildNumber(b.build_url);
            return (
              <li
                key={b.build_url}
                className="flex items-center gap-2 text-xs"
                data-testid="hour-detail-build"
                data-status={b.status}
              >
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${statusBadge(b.status)}`}
                >
                  {b.status}
                </span>
                <a
                  href={b.build_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  build {num ?? '#'}
                </a>
                <span className="text-gray-500 font-mono">{formatHms(b.timestamp)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * One card per failed job, with a 7-day × 24-hour breakdown, latest build
 * link, and lazy-loaded console-tail error message.
 */
function FailedJobCard({ job, failedBuilds, allBuilds, now }) {
  const sorted    = useMemo(
    () => [...failedBuilds].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [failedBuilds],
  );
  const mostRecent = sorted[0];
  const breakdown  = useMemo(() => buildWeeklyHourlyBreakdown(sorted, now), [sorted, now]);
  const buildNum   = parseBuildNumber(mostRecent?.build_url);
  const [selectedCell, setSelectedCell] = useState(null);

  const handleCellClick = (day, hour) => {
    setSelectedCell((prev) =>
      prev && prev.day === day && prev.hour === hour ? null : { day, hour },
    );
  };

  return (
    <div className="bg-gray-700/40 border border-gray-600/50 rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-200 truncate" title={job}>
          {job}
        </h4>
        <span className="text-xs font-mono text-red-400 whitespace-nowrap">
          {sorted.length} failure{sorted.length !== 1 ? 's' : ''} / past week
        </span>
      </div>

      <div>
        <p className="text-[11px] text-gray-500 mb-1">
          Failures per hour, last 7 days (top: 6 days ago · bottom: today)
        </p>
        <div
          className="flex flex-col gap-0.5"
          role="img"
          aria-label={`Hourly failure breakdown for ${job}`}
          data-testid="hourly-breakdown"
        >
          {breakdown.map((row, dayIdx) => (
            <div key={dayIdx} className="flex gap-0.5">
              {row.map((count, hourIdx) => {
                const label    = cellLabel(dayIdx, hourIdx, now);
                const selected = selectedCell
                  && selectedCell.day === dayIdx
                  && selectedCell.hour === hourIdx;
                return (
                  <button
                    key={hourIdx}
                    type="button"
                    onClick={() => handleCellClick(dayIdx, hourIdx)}
                    aria-label={`${label} — ${count} failure${count !== 1 ? 's' : ''}`}
                    aria-pressed={selected ? 'true' : 'false'}
                    title={`${label} — ${count} failure${count !== 1 ? 's' : ''}`}
                    data-count={count}
                    data-day={dayIdx}
                    data-hour={hourIdx}
                    className={`h-3 flex-1 rounded-sm ${cellClass(count)} ${
                      selected ? 'ring-1 ring-blue-300' : ''
                    } cursor-pointer hover:brightness-125 transition`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedCell && (
        <HourDetail
          job={job}
          allBuilds={allBuilds}
          selectedCell={selectedCell}
          now={now}
        />
      )}

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
 * Filters the supplied `builds` to status === 'failed' within the past week
 * (last 7 calendar days, local time), groups by job name, and renders one
 * {@link FailedJobCard} per job.
 *
 * @param {{ builds: Array<{
 *   job: string,
 *   build_url: string,
 *   status: 'passed'|'failed'|'other',
 *   timestamp: string,
 * }> }} props
 */
export default function FailedJobsDetails({ builds }) {
  // Resolve "now" once per render so every card uses the same window.
  const now = Date.now();

  const grouped = useMemo(() => {
    const safe = Array.isArray(builds) ? builds : [];
    // Calendar-day cutoff: start of the day 6 days ago in local time.
    const todayStart = startOfLocalDay(now);
    const cutoff     = todayStart - 6 * MS_PER_DAY;
    const failedByJob = new Map();
    const allByJob    = new Map();
    for (const b of safe) {
      if (!b || !b.timestamp) continue;
      const t = new Date(b.timestamp).getTime();
      if (Number.isNaN(t) || t < cutoff) continue;
      const key = b.job ?? 'unknown';
      if (b.status === 'failed') {
        if (!failedByJob.has(key)) failedByJob.set(key, []);
        failedByJob.get(key).push(b);
      }
      if (!allByJob.has(key)) allByJob.set(key, []);
      allByJob.get(key).push(b);
    }
    return [...failedByJob.entries()]
      .map(([job, jobFailed]) => ({
        job,
        failedBuilds: jobFailed,
        allBuilds:    allByJob.get(job) ?? [],
      }))
      .sort((a, b) => b.failedBuilds.length - a.failedBuilds.length);
    // now is intentionally excluded from deps — we want a stable snapshot per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builds]);

  if (grouped.length === 0) {
    return (
      <p
        className="text-xs text-gray-400 italic bg-gray-700/30 border border-gray-700 rounded px-3 py-2"
        data-testid="no-failures"
      >
        No failures in the past week 🎉
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="failed-jobs-details">
      <p className="text-[11px] text-gray-500">
        {grouped.length} job{grouped.length !== 1 ? 's' : ''} with failures in the past
        week
        {USE_STATIC_DATA && ' · error logs unavailable in snapshot mode'}
      </p>
      {grouped.map(({ job, failedBuilds, allBuilds }) => (
        <FailedJobCard
          key={job}
          job={job}
          failedBuilds={failedBuilds}
          allBuilds={allBuilds}
          now={now}
        />
      ))}
    </div>
  );
}
