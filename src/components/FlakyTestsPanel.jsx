import { useMemo } from 'react';
import { PanelSkeleton } from './shared/Skeleton.jsx';
import { ErrorBanner } from './shared/ErrorBanner.jsx';
import { FlakyByRepoTable } from './FlakyTestsPanel/FlakyByRepoTable.jsx';

const SOURCE_URL =
  'https://releng-data.wmcloud.org/flaky_tests.json?sql=select+*+from+flaky_tests+order+by+count+desc%3B&_shape=array';

/**
 * Group flaky-test rows by their repo (falling back to job name, then
 * "(unknown)") so each table row represents one project. Within each bucket
 * we keep the original rows so the expanded view can list individual tests.
 *
 * @param {Array<import('../services/flakyTests.js').FlakyTestRow>} rows
 */
function groupRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.repo ?? r.job ?? '(unknown)';
    if (!map.has(key)) map.set(key, { key, totalCount: 0, tests: [] });
    const bucket = map.get(key);
    bucket.totalCount += r.count;
    bucket.tests.push(r);
  }
  return [...map.values()];
}

/**
 * Flaky Tests panel. Reads /data/flaky-tests.json (snapshot only) and groups
 * the rows by repo/job for an at-a-glance view of the noisiest projects.
 *
 * @param {{
 *   data: import('../services/flakyTests.js').FlakyTestsData|null,
 *   loading: boolean,
 *   error: Error|null,
 * }} props
 */
export default function FlakyTestsPanel({ data, loading, error }) {
  const rows = useMemo(
    () => (Array.isArray(data?.rows) ? data.rows : []),
    [data],
  );
  const groups = useMemo(() => groupRows(rows), [rows]);
  const totalOccurrences = useMemo(
    () => rows.reduce((acc, r) => acc + r.count, 0),
    [rows],
  );

  if (loading) return <PanelSkeleton />;
  if (error) return <ErrorBanner source="Flaky tests" error={error} />;

  if (!data || rows.length === 0) {
    return (
      <p className="text-gray-500 text-sm italic">
        No flaky tests recorded yet.{' '}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          View source →
        </a>
      </p>
    );
  }

  const stats = [
    { label: 'Flaky tests',          value: rows.length,         colour: 'text-rose-300' },
    { label: 'Total occurrences',    value: totalOccurrences,    colour: 'text-rose-300' },
    { label: 'Repos / jobs affected', value: groups.length,      colour: 'text-amber-300' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {stats.map((s) => (
          <div key={s.label} className="rounded p-2 bg-gray-700/50">
            <div className={`font-bold text-base ${s.colour}`}>{s.value}</div>
            <div className="text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        {groups.length} repo{groups.length !== 1 ? 's' : ''} reporting flaky tests — click a row to view individual test names and per-test counts.
      </p>

      <FlakyByRepoTable groups={groups} />

      <p className="text-xs text-gray-500 text-center">
        Source:{' '}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          releng-data.wmcloud.org / flaky_tests
        </a>
        {data.generatedAt && (
          <>
            {' · snapshot '}
            <span className="font-mono">{data.generatedAt}</span>
          </>
        )}
      </p>
    </div>
  );
}
