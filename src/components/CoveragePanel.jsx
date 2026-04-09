import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isActiveOnWikipedia, GENERATED_DATE } from '../data/activeExtensions.js';
import { fetchMaintainers, uniqueStewards } from '../services/maintainers.js';
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
 * Custom tooltip for the bar chart showing name + %.
 * The click hint has been intentionally removed — the header label already
 * says "click a bar to open".
 */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs shadow-lg">
      <p className="text-white font-medium mb-0.5">{d.name}</p>
      <p className="text-gray-300">{d.coverage_pct}% coverage</p>
      <p className="text-gray-400 mt-1">Updated: {d.last_updated}</p>
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
  const [activeBucket,     setActiveBucket]     = useState(null);
  const [chartView,        setChartView]         = useState('table'); // 'top' | 'lowest' | 'table'
  const [wikiOnly,         setWikiOnly]          = useState(true);   // default: Wikipedia-deployed only
  const [activeSteward,    setActiveSteward]     = useState(null);   // steward name filter
  const [maintainers,      setMaintainers]       = useState(null);   // Map<extName, {steward,maintainer}>
  const [maintLoading,     setMaintLoading]      = useState(false);
  const [maintError,       setMaintError]        = useState(null);

  // Hooks must run unconditionally before any early returns.
  const { core, extensions: allExtensions } = coverage ?? { core: null, extensions: [] };

  // Auto-fetch steward data on mount so the steward filter is ready without
  // requiring the user to click a separate button.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setMaintLoading(true);
      setMaintError(null);
      try {
        const data = await fetchMaintainers();
        if (!cancelled) setMaintainers(data);
      } catch (err) {
        if (!cancelled) setMaintError(err);
      } finally {
        if (!cancelled) setMaintLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Derived steward list (sorted, unique)
  const stewardList = useMemo(
    () => maintainers ? uniqueStewards(maintainers) : [],
    [maintainers],
  );

  // Apply the Wikipedia-only filter when enabled.
  const extensions = useMemo(
    () => wikiOnly ? allExtensions.filter((e) => isActiveOnWikipedia(e.name)) : allExtensions,
    [allExtensions, wikiOnly],
  );

  // Apply the steward filter (requires maintainers to be loaded).
  const filteredExtensions = useMemo(() => {
    if (!activeSteward || !maintainers) return extensions;
    return extensions.filter((e) => {
      const entry = maintainers.get(e.name);
      return entry?.steward === activeSteward;
    });
  }, [extensions, activeSteward, maintainers]);

  const withCoverage = useMemo(
    () => filteredExtensions.filter((e) => e.coverage_pct > 0),
    [filteredExtensions],
  );

  const chartExtensions = useMemo(() => {
    const sorted = [...withCoverage].sort((a, b) =>
      chartView === 'lowest' ? a.coverage_pct - b.coverage_pct : b.coverage_pct - a.coverage_pct,
    );
    return sorted.slice(0, 15).map((e) => ({ ...e, label: short(e.name) }));
  }, [withCoverage, chartView]);

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

  const total   = filteredExtensions.length;
  const avg     = Math.round(filteredExtensions.reduce((s, e) => s + e.coverage_pct, 0) / (total || 1));

  // Median coverage across extensions that have any coverage data (pct > 0).
  const medianCoverage = useMemo(() => {
    const sorted = [...withCoverage].map((e) => e.coverage_pct).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }, [withCoverage]);

  // Detail table shown when a stat card is active
  const bucketExtensions = activeBucket
    ? filteredExtensions.filter(BUCKETS[activeBucket].filter).sort((a, b) => b.coverage_pct - a.coverage_pct)
    : null;

  // All-extensions sorted table (used in 'table' chart view)
  const allTableExtensions = useMemo(
    () => [...filteredExtensions].sort((a, b) => b.coverage_pct - a.coverage_pct),
    [filteredExtensions],
  );

  const openExtension = (pageUrl) => window.open(pageUrl, '_blank', 'noopener');

  return (
    <div className="space-y-4">

      {/* ── Scope filter ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
          <button
            onClick={() => { setWikiOnly(true); setActiveBucket(null); setActiveSteward(null); }}
            className={`px-2 py-0.5 transition-colors ${
              wikiOnly ? 'bg-indigo-700 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
            title="Show only extensions deployed on en.wikipedia.org"
          >
            Wikipedia only
          </button>
          <button
            onClick={() => { setWikiOnly(false); setActiveBucket(null); setActiveSteward(null); }}
            className={`px-2 py-0.5 transition-colors ${
              !wikiOnly ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
            title="Show all extensions tracked on doc.wikimedia.org"
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

      {/* ── Steward filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {maintLoading && (
          <span className="text-xs text-gray-500">Loading steward info…</span>
        )}
        {maintError && (
          <span className="text-xs text-red-400" title={maintError.message}>
            Steward info unavailable
          </span>
        )}
        {maintainers && (
          <>
            <span className="text-xs text-gray-500">Steward:</span>
            <select
              value={activeSteward ?? ''}
              onChange={(e) => { setActiveSteward(e.target.value || null); setActiveBucket(null); }}
              className="text-xs rounded border border-gray-600 bg-gray-800 text-gray-300 px-1 py-0.5 max-w-[200px]"
            >
              <option value="">All stewards</option>
              {stewardList.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {activeSteward && (
              <button
                onClick={() => setActiveSteward(null)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear ×
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Median headline ── */}
      {medianCoverage !== null ? (
        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
            Median coverage
            {wikiOnly ? ' · Wikipedia extensions' : ' · all extensions'}
            {activeSteward ? ` · ${activeSteward}` : ''}
          </p>
          <p className={`text-5xl font-bold ${coverageColour(medianCoverage)}`}>
            {medianCoverage}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            across {withCoverage.length} extension{withCoverage.length !== 1 ? 's' : ''} with coverage data
          </p>
        </div>
      ) : (
        <p className="text-gray-500 text-sm italic text-center">No coverage data available</p>
      )}

      {/* ── No-coverage note for steward filter ── */}
      {activeSteward && filteredExtensions.some((e) => e.coverage_pct === 0) && (
        <div className="rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-300 leading-snug space-y-1">
          <p className="font-medium">
            Some extensions owned by <span className="text-white">{activeSteward}</span> have no coverage data (0%).
          </p>
          <p className="text-amber-400/80">
            To add test coverage, see the MediaWiki documentation:
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-400/80">
            <li>
              <a
                href="https://www.mediawiki.org/wiki/Continuous_integration/Code_coverage"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-200 transition-colors"
              >
                CI code coverage overview
              </a>
              {' '}— how coverage is collected and published
            </li>
            <li>
              <a
                href="https://www.mediawiki.org/wiki/Manual:PHP_unit_testing/Writing_unit_tests_for_extensions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-200 transition-colors"
              >
                PHPUnit for extensions
              </a>
              {' '}— generating Clover XML coverage reports
            </li>
            <li>
              <a
                href="https://www.mediawiki.org/wiki/Selenium/Node.js"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-200 transition-colors"
              >
                Selenium / Node.js (JUnit)
              </a>
              {' '}— browser test coverage via JUnit XML
            </li>
          </ul>
        </div>
      )}

      {/* ── Chart / Table toggle + view ── */}
      {!activeBucket && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">
              {chartView === 'table'
                ? `${filteredExtensions.length} extensions — click a row to open`
                : `${chartView === 'lowest' ? 'Lowest' : 'Top'} 15 extensions by coverage — click a bar to open`}
            </p>
            <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
              <button
                onClick={() => setChartView('top')}
                className={`px-2 py-0.5 transition-colors ${
                  chartView === 'top' ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                Top 15
              </button>
              <button
                onClick={() => setChartView('lowest')}
                className={`px-2 py-0.5 transition-colors ${
                  chartView === 'lowest' ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                Lowest 15
              </button>
              <button
                onClick={() => setChartView('table')}
                className={`px-2 py-0.5 transition-colors ${
                  chartView === 'table' ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                Table
              </button>
            </div>
          </div>

          {chartView === 'table' ? (
            /* ── Full extension table ── */
            <div className="overflow-y-auto max-h-56">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 bg-gray-800">
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="pb-1 pr-3 font-medium">Extension</th>
                    <th className="pb-1 pr-3 font-medium">Coverage</th>
                    <th className="pb-1 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {allTableExtensions.map((ext, i) => (
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
          ) : (
            /* ── Bar chart (Top 15 or Lowest 15) ── */
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
          )}
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
          const count = filteredExtensions.filter(bucket.filter).length;
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
