import { useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { isActiveOnWikipedia, GENERATED_DATE } from '../data/activeExtensions.js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from 'recharts';

/**
 * Portal-based tooltip — renders into document.body so it is never clipped
 * by ancestor overflow:hidden or z-index stacking contexts.
 */
function InfoTooltip({ label, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos]         = useState({ top: 0, left: 0 });
  const triggerRef            = useRef(null);

  const show = useCallback(() => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      // Position the tooltip below-right of the trigger, clamped to viewport
      const TOOLTIP_W = 272;
      const left = Math.min(r.left, window.innerWidth - TOOLTIP_W - 8);
      setPos({ top: r.bottom + 6, left });
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="underline decoration-dotted cursor-help"
      >
        {label}
      </span>
      {visible && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 272 }}
          className="rounded bg-gray-900 border border-gray-600 p-3 text-xs text-gray-200 shadow-2xl leading-snug pointer-events-none"
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Skeleton loader. */
function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-16 bg-gray-700 rounded w-1/3 mx-auto"></div>
      <div className="h-48 bg-gray-700 rounded"></div>
      <div className="h-3 bg-gray-700 rounded w-1/2"></div>
    </div>
  );
}

function coverageColour(pct) {
  if (pct >= 80) return 'text-green-400';
  if (pct >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function barHex(pct) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#f59e0b';
  return '#ef4444';
}

function short(name, max = 18) {
  return name.length > max ? name.slice(0, max) + '…' : name;
}

/** Bucket labels and their filter predicates for the stat cards. */
const BUCKETS = [
  { label: '≥ 80%',  colour: 'text-green-400', filter: (e) => e.coverage_pct >= 80 },
  { label: '60–79%', colour: 'text-amber-400',  filter: (e) => e.coverage_pct >= 60 && e.coverage_pct < 80 },
  { label: '< 60%',  colour: 'text-red-400',    filter: (e) => e.coverage_pct > 0 && e.coverage_pct < 60 },
  { label: '0%',     colour: 'text-gray-400',   filter: (e) => e.coverage_pct === 0 },
];

/**
 * Custom tooltip for the bar chart showing name + % and a click hint.
 */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs shadow-lg">
      <p className="text-white font-medium mb-0.5">{d.name}</p>
      <p className="text-gray-300">{d.coverage_pct}% coverage</p>
      <p className="text-gray-400 mt-1">Updated: {d.last_updated}</p>
      <p className="text-blue-400 mt-1">↗ Click to open coverage page</p>
    </div>
  );
}

/**
 * Code Coverage panel.
 *
 * Interactions:
 * - Click a stat card to see a detail table of extensions in that bucket.
 * - Click any bar to open that extension's coverage page on doc.wikimedia.org.
 * - Click the mediawiki-core headline to open its coverage page.
 *
 * @param {{ coverage: { core, extensions }|null, error: Error|null, loading: boolean }} props
 */
export default function CoveragePanel({ coverage, error, loading }) {
  const [activeBucket, setActiveBucket] = useState(null);
  const [showLowest, setShowLowest] = useState(false);
  const [wikiOnly, setWikiOnly] = useState(true); // default: Wikipedia-deployed only

  // Hooks must run unconditionally before any early returns.
  const { core, extensions: allExtensions } = coverage ?? { core: null, extensions: [] };

  // Apply the Wikipedia-only filter when enabled.
  const extensions = useMemo(
    () => wikiOnly ? allExtensions.filter((e) => isActiveOnWikipedia(e.name)) : allExtensions,
    [allExtensions, wikiOnly],
  );

  const withCoverage = useMemo(
    () => extensions.filter((e) => e.coverage_pct > 0),
    [extensions],
  );

  const chartExtensions = useMemo(() => {
    const sorted = [...withCoverage].sort((a, b) =>
      showLowest ? a.coverage_pct - b.coverage_pct : b.coverage_pct - a.coverage_pct,
    );
    return sorted.slice(0, 15).map((e) => ({ ...e, label: short(e.name) }));
  }, [withCoverage, showLowest]);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="bg-red-900 border border-red-600 text-red-200 rounded p-3 text-sm">
        Coverage data unavailable: {error.message}
      </div>
    );
  }

  if (!coverage) {
    return <p className="text-gray-500 text-sm italic">No coverage data loaded yet.</p>;
  }

  // Keep top15 as alias for the chart data (used below)
  const top15 = chartExtensions;

  const total   = extensions.length;
  const avg     = Math.round(extensions.reduce((s, e) => s + e.coverage_pct, 0) / (total || 1));

  // Detail table shown when a stat card is active
  const bucketExtensions = activeBucket
    ? extensions.filter(BUCKETS[activeBucket].filter).sort((a, b) => b.coverage_pct - a.coverage_pct)
    : null;

  const openExtension = (pageUrl) => window.open(pageUrl, '_blank', 'noopener');

  return (
    <div className="space-y-4">

      {/* ── Scope filter ── */}
      <div className="flex items-center justify-between">
        <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
          <button
            onClick={() => { setWikiOnly(true); setActiveBucket(null); }}
            className={`px-2 py-0.5 transition-colors ${
              wikiOnly ? 'bg-indigo-700 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
            title="Show only extensions deployed on en.wikipedia.org"
          >
            Wikipedia only
          </button>
          <button
            onClick={() => { setWikiOnly(false); setActiveBucket(null); }}
            className={`px-2 py-0.5 transition-colors ${
              !wikiOnly ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
            title="Show all 239 extensions tracked on doc.wikimedia.org"
          >
            All ({allExtensions.length})
          </button>
        </div>
        {wikiOnly && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <InfoTooltip label={`${extensions.length} deployed`}>
              <strong className="block text-white mb-1">What does "deployed" mean?</strong>
              These extensions are currently installed on{' '}
              <strong className="text-indigo-300">en.wikipedia.org</strong> per its live
              MediaWiki siteinfo API. All have a verified Gerrit commit within the last
              6 months, confirming active maintenance.
              <br /><br />
              Extensions tracked on doc.wikimedia.org but <em>not</em> in this list are
              deployed on other Wikimedia wikis only, still in development, or legacy.
              Switch to <strong className="text-gray-300">All</strong> to see them.
              <span className="block mt-2 text-gray-400 border-t border-gray-700 pt-1">
                Source: en.wikipedia.org siteinfo API · {GENERATED_DATE}
              </span>
            </InfoTooltip>
            {' '}· as of {GENERATED_DATE}
          </span>
        )}
      </div>

      {/* ── Core headline ── */}
      {core ? (
        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">mediawiki-core</p>
          <a
            href={core.page_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open mediawiki-core coverage on doc.wikimedia.org"
            className={`text-5xl font-bold hover:underline transition-opacity hover:opacity-80 ${coverageColour(core.coverage_pct)}`}
          >
            {core.coverage_pct}%
          </a>
          <p className="text-xs text-gray-500 mt-1">Updated {core.last_updated}</p>
        </div>
      ) : (
        <p className="text-gray-500 text-sm italic text-center">mediawiki-core entry not found</p>
      )}

      {/* ── Top / Lowest extensions bar chart ── */}
      {!activeBucket && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">
              {showLowest ? 'Lowest 15' : 'Top 15'} extensions by coverage — click a bar to open
            </p>
            <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
              <button
                onClick={() => setShowLowest(false)}
                className={`px-2 py-0.5 transition-colors ${
                  !showLowest ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                Top 15
              </button>
              <button
                onClick={() => setShowLowest(true)}
                className={`px-2 py-0.5 transition-colors ${
                  showLowest ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                Lowest 15
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={top15}
              margin={{ top: 4, right: 8, left: -20, bottom: 48 }}
              onClick={(chartData) => {
                if (chartData?.activePayload?.[0]?.payload?.page_url) {
                  openExtension(chartData.activePayload[0].payload.page_url);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9ca3af', fontSize: 8 }}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={80}
                stroke="#22c55e"
                strokeDasharray="4 3"
                label={{ value: '80% target', position: 'insideTopRight', fill: '#22c55e', fontSize: 9 }}
              />
              <Bar dataKey="coverage_pct" radius={[2, 2, 0, 0]}>
                {top15.map((entry, i) => (
                  <Cell key={i} fill={barHex(entry.coverage_pct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Bucket detail table ── */}
      {activeBucket !== null && bucketExtensions && (
        <div className="overflow-y-auto max-h-48">
          <p className="text-xs text-gray-400 mb-1">
            {bucketExtensions.length} extension{bucketExtensions.length !== 1 ? 's' : ''} —{' '}
            <span className="text-blue-400 cursor-pointer hover:underline" onClick={() => setActiveBucket(null)}>
              ← back to chart
            </span>
          </p>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="pb-1 pr-3 font-medium">Extension</th>
                <th className="pb-1 pr-3 font-medium">Coverage</th>
                <th className="pb-1 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {bucketExtensions.map((ext, i) => (
                <tr
                  key={i}
                  onClick={() => openExtension(ext.page_url)}
                  className="border-b border-gray-700/40 hover:bg-gray-700/40 cursor-pointer transition-colors"
                  title={`Open ${ext.name} coverage page`}
                >
                  <td className="py-1 pr-3 text-blue-400 hover:underline">{ext.name}</td>
                  <td className={`py-1 pr-3 font-medium ${coverageColour(ext.coverage_pct)}`}>
                    {ext.coverage_pct}%
                  </td>
                  <td className="py-1 text-gray-500">{ext.last_updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {BUCKETS.map((bucket, i) => {
          const count = extensions.filter(bucket.filter).length;
          const isActive = activeBucket === i;
          return (
            <button
              key={i}
              onClick={() => setActiveBucket(isActive ? null : i)}
              title={`Show extensions with ${bucket.label} coverage`}
              className={`rounded p-2 transition-colors ${
                isActive
                  ? 'bg-gray-600 ring-1 ring-gray-400'
                  : 'bg-gray-700/50 hover:bg-gray-700'
              }`}
            >
              <div className={`font-bold text-base ${bucket.colour}`}>{count}</div>
              <div className="text-gray-400">{bucket.label}</div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 text-center">
        {total} extensions · avg {avg}% · click a card to browse
      </p>

    </div>
  );
}
