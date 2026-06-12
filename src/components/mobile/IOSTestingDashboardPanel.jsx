/**
 * iOS-specific testing dashboard built from wikipedia-ios GitHub Actions data.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  FAILED_RESULT_BUNDLE_WINDOW_DAYS,
  IOS_TESTING_WINDOW_DAYS,
} from '../../services/github/iosTestingCore.js';

const DISPLAYED_COVERAGE_TARGETS = [
  { id: 'wikipediaApp', name: 'Wikipedia.app', color: '#60a5fa' },
  { id: 'wmfFramework', name: 'WMF.framework', color: '#f59e0b' },
  { id: 'wmfComponents', name: 'WMFComponents', color: '#34d399' },
  { id: 'wmfData', name: 'WMFData', color: '#f472b6' },
];

function pct(value) {
  return value == null ? '--' : `${value.toFixed(1)}%`;
}

function signedPct(value) {
  if (value == null) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function deltaClasses(value) {
  if (value == null) return 'text-gray-400';
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-red-300';
  return 'text-gray-300';
}

function shortDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function bytesLabel(bytes) {
  if (!bytes) return '0 B';
  const mb = bytes / 1_048_576;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function conclusionClasses(conclusion) {
  if (conclusion === 'success') return 'bg-emerald-900/60 text-emerald-200';
  if (conclusion === 'failure' || conclusion === 'timed_out') return 'bg-red-900/60 text-red-200';
  return 'bg-gray-700 text-gray-300';
}

function buildCoverageChartRows(suites) {
  const byDay = new Map();
  for (const suite of suites) {
    for (const point of suite.points ?? []) {
      const key = point.day ?? point.date?.slice(0, 10);
      if (!key) continue;
      if (!byDay.has(key)) byDay.set(key, { day: key, label: shortDate(point.date) });
      const row = byDay.get(key);
      for (const target of DISPLAYED_COVERAGE_TARGETS) {
        const value = point.targets?.[target.name];
        if (value == null) continue;
        const existingValue = row[target.id];
        row[target.id] = existingValue == null ? value : Math.max(existingValue, value);
      }
    }
  }
  return [...byDay.values()]
    .filter((row) => DISPLAYED_COVERAGE_TARGETS.some((target) => row[target.id] != null))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function buildCoverageTargetCards(chartRows) {
  return DISPLAYED_COVERAGE_TARGETS.map((target) => {
    const points = chartRows
      .map((row) => ({ date: row.day, value: row[target.id] }))
      .filter((point) => point.value != null);
    if (points.length === 0) return null;

    const first = points[0];
    const latest = points[points.length - 1];
    return {
      id: target.id,
      title: target.name,
      current: latest.value,
      delta: Math.round((latest.value - first.value) * 100) / 100,
      points: points.length,
    };
  }).filter(Boolean);
}

function CoverageTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs shadow-lg">
      <p className="text-white font-medium mb-1">{label}</p>
      {payload
        .filter((item) => item.value != null)
        .sort((a, b) => {
          const delta = Number(b.value) - Number(a.value);
          if (delta !== 0) return delta;
          return String(a.name).localeCompare(String(b.name));
        })
        .map((item) => (
          <p key={item.dataKey} style={{ color: item.color }}>
            {item.name}: {pct(Number(item.value))}
          </p>
        ))}
    </div>
  );
}

/**
 * @param {{
 *   data: {
 *     coverage: Array,
 *     coverageStatus?: { reason?: string|null },
 *     stability: Array,
 *     resultBundles: Array,
 *     videos?: Array,
 *     windowDays?: number,
 *     resultBundleWindowDays?: number,
 *   } | null,
 *   error: Error|null,
 *   loading: boolean,
 * }} props
 */
export function IOSTestingDashboardPanel({ data, error, loading }) {
  if (loading || error) return null;

  const suites = data?.coverage ?? [];
  const stability = data?.stability ?? [];
  const resultBundles = data?.resultBundles ?? [];
  const videos = data?.videos ?? [];
  const videosByRunId = new Map();
  for (const video of videos) {
    const key = String(video.runId);
    if (!videosByRunId.has(key)) videosByRunId.set(key, []);
    videosByRunId.get(key).push(video);
  }
  const failedBundles = resultBundles
    .filter((bundle) => bundle.runConclusion && bundle.runConclusion !== 'success');
  const chartRows = buildCoverageChartRows(suites);
  const windowDays = data?.windowDays ?? IOS_TESTING_WINDOW_DAYS;
  const resultBundleWindowDays = data?.resultBundleWindowDays ?? FAILED_RESULT_BUNDLE_WINDOW_DAYS;
  const latestCards = buildCoverageTargetCards(chartRows);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded p-3 bg-gray-700/50">
          <div className="text-lg font-bold text-blue-300">{latestCards.length}</div>
          <div className="text-gray-400">coverage targets</div>
        </div>
        <div className="rounded p-3 bg-gray-700/50">
          <div className="text-lg font-bold text-emerald-300">
            {pct(stability.find((item) => item.id === 'unit')?.rate)}
          </div>
          <div className="text-gray-400">unit PR stability</div>
        </div>
        <div className="rounded p-3 bg-gray-700/50">
          <div className="text-lg font-bold text-pink-300">
            {pct(stability.find((item) => item.id === 'ui')?.rate)}
          </div>
          <div className="text-gray-400">UI nightly stability</div>
        </div>
        <div className="rounded p-3 bg-gray-700/50">
          <div className="text-lg font-bold text-red-300">{failedBundles.length}</div>
          <div className="text-gray-400">failed result bundles</div>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-200">{windowDays}-day coverage deltas</h3>
          <span className="text-xs text-gray-500">{chartRows.length} days</span>
        </div>
        {chartRows.length === 0 ? (
          <p className="text-xs italic text-gray-500 py-10 text-center">
            {data?.coverageStatus?.reason ?? 'No coverage artifact points are available in this snapshot.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartRows} margin={{ top: 4, right: 12, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CoverageTooltip />} />
              {DISPLAYED_COVERAGE_TARGETS.map((target) => (
                <Line
                  key={target.id}
                  type="monotone"
                  dataKey={target.id}
                  name={target.name}
                  stroke={target.color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {latestCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
          {latestCards.map((suite) => (
            <div key={suite.id} className="rounded border border-gray-700 bg-gray-700/20 p-3">
              <div className="text-xs text-gray-400 truncate" title={suite.title}>{suite.title}</div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-base font-semibold text-gray-100">{pct(suite.current)}</span>
                <span className={`text-sm font-medium ${deltaClasses(suite.delta)}`}>
                  {signedPct(suite.delta)}
                </span>
              </div>
              <div className="text-[10px] text-gray-600 mt-1">{suite.points} artifact points</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Test stability by workflow</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {stability.map((item) => {
            const rate = item.rate ?? 0;
            return (
              <div key={item.id} className="rounded border border-gray-700 bg-gray-700/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-200">{item.title}</span>
                  <span className="text-sm font-semibold text-gray-100">{pct(item.rate)}</span>
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                  {item.stabilityLabel ?? 'PR stability'}
                </div>
                <div className="mt-2 h-2 rounded bg-gray-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.max(0, Math.min(rate, 100))}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {item.successes} passed / {item.failures} failed
                  {item.ignoredRuns ? ` / ${item.ignoredRuns} ignored` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
          Failed UI result bundles - last {resultBundleWindowDays} days
        </p>
        {failedBundles.length === 0 ? (
          <p className="text-sm text-gray-400">
            No failed UI or E2E result bundles found in the last {resultBundleWindowDays} days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="text-left py-1 pr-2 font-medium">Suite</th>
                  <th className="text-left py-1 px-2 font-medium">Run</th>
                  <th className="text-left py-1 px-2 font-medium">Result</th>
                  <th className="text-right py-1 px-2 font-medium">Artifact</th>
                  <th className="text-left py-1 pl-2 font-medium">Recordings</th>
                </tr>
              </thead>
              <tbody className="text-gray-200">
                {failedBundles.map((bundle) => {
                  const bundleVideos = bundle.videos ?? videosByRunId.get(String(bundle.runId)) ?? [];
                  return (
                    <tr key={`${bundle.kind}-${bundle.runId}`} className="border-b border-gray-800 last:border-0 hover:bg-gray-700/30 align-top">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{bundle.suite}</td>
                      <td className="py-1.5 px-2">
                        <a
                          href={bundle.runUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-300 hover:text-blue-200 hover:underline"
                        >
                          {bundle.runId}
                        </a>
                        <div className="text-[10px] text-gray-500">{shortDate(bundle.createdAt)} / {bundle.branch}</div>
                      </td>
                      <td className="py-1.5 px-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] ${conclusionClasses(bundle.runConclusion)}`}>
                          {bundle.runConclusion}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums" title={bundle.artifactName}>
                        {bytesLabel(bundle.artifactSizeBytes)}
                      </td>
                      <td className="py-1.5 pl-2 text-gray-400 min-w-64">
                        {bundleVideos.length === 0 ? (
                          <span>{bundle.note}</span>
                        ) : (
                          <div className="grid gap-2">
                            <div className="text-[10px] text-gray-500">{bundle.note}</div>
                            {bundleVideos.map((video) => (
                              <div key={video.id} className="max-w-80">
                                <video
                                  controls
                                  preload="metadata"
                                  className="w-full bg-black aspect-video rounded border border-gray-700"
                                  src={video.path}
                                />
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
                                  <span>{bytesLabel(video.bytes)}</span>
                                  <span className="truncate max-w-56" title={video.sourceName}>{video.sourceName}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default IOSTestingDashboardPanel;
