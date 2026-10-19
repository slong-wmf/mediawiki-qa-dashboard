import { TrendChart } from './TrendsPanel/TrendChart.jsx';
import { COVERAGE_THRESHOLDS } from '../constants/coverage.js';
import { PanelSkeleton } from './shared/Skeleton.jsx';
import { ErrorBanner } from './shared/ErrorBanner.jsx';

/**
 * On this date the last Beta Cluster daily jobs (selenium-daily-beta-*) left
 * the scanner inventory. After this date, only Catalyst daily jobs remain.
 * For this reason, the daily metrics change in one step on this date.
 */
export const CATALYST_ONLY_SINCE = '2026-09-16';

const CHARTS = [
  {
    key: 'dailyPassRate',
    title: '% Daily Tests Passing',
    accessor: (e) => e.dailyPassRate?.pct,
    format: 'percent',
    threshold: COVERAGE_THRESHOLDS.target,
    colour: '#60a5fa',
  },
  {
    key: 'coverage',
    title: 'Code Coverage (Extensions Avg)',
    accessor: (e) => e.coverage?.extensionsAvg,
    format: 'percent',
    threshold: COVERAGE_THRESHOLDS.target,
    colour: '#a78bfa',
  },
  {
    key: 'e2eTestCount',
    title: 'E2E Tests Available',
    accessor: (e) => e.e2eTestCount?.total,
    format: 'integer',
    colour: '#34d399',
  },
  {
    key: 'dailyTestRunCount',
    title: 'Tests Running Daily',
    accessor: (e) => e.dailyTestRunCount,
    format: 'integer',
    colour: '#fbbf24',
  },
];

/**
 * @param {{
 *   data: import('../services/metricsHistory.js').MetricsHistory|null,
 *   loading: boolean,
 *   error: Error|null,
 * }} props
 */
export default function TrendsPanel({ data, loading, error }) {
  if (loading) return <PanelSkeleton />;
  if (error) return <ErrorBanner source="snapshot history" error={error} />;

  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const spansCatalystSwitch =
    entries.some((e) => e?.date < CATALYST_ONLY_SINCE) &&
    entries.some((e) => e?.date >= CATALYST_ONLY_SINCE);

  if (entries.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-gray-400">
          No history yet — first snapshot will arrive on the next cron run.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          The Toolforge cron writes <code className="font-mono">metrics-history.json</code> every 6 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Rolling {data.windowDays}-day history aggregated from the snapshot fetcher.
        Backfilled days (older than the first cron run) carry only the pass-rate metric.
      </p>
      {spansCatalystSwitch && (
        <p className="text-xs text-gray-400">
          On {CATALYST_ONLY_SINCE} the Beta Cluster{' '}
          <span className="font-mono">selenium-daily-beta-*</span> jobs dropped out of the
          inventory, so daily jobs now run only on Catalyst. The daily pass rate and
          daily-run counts before and after that date are not directly comparable.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {CHARTS.map((c) => (
          <TrendChart
            key={c.key}
            title={c.title}
            entries={entries}
            accessor={c.accessor}
            format={c.format}
            threshold={c.threshold}
            colour={c.colour}
          />
        ))}
      </div>
    </div>
  );
}
