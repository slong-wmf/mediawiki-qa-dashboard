import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/** Format duration_seconds into a human-readable string like "1m 34s" or "45s". */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Skeleton loader for the panel. */
function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-48 bg-gray-700 rounded"></div>
      <div className="h-3 bg-gray-700 rounded w-full"></div>
      <div className="h-3 bg-gray-700 rounded w-4/5"></div>
    </div>
  );
}

const JOB_COLORS  = { Passed: '#22c55e', Failed: '#ef4444', Other: '#94a3b8' };
const TEST_COLORS = { Passed: '#22c55e', Failed: '#ef4444', Skipped: '#94a3b8' };
const STATUS_MAP  = { Passed: 'passed', Failed: 'failed', Other: 'other' };

/**
 * Pass/Fail Rates panel.
 *
 * Shows two views, toggled at the top:
 *
 *  • "Job results" — one data point per build (did the whole Jenkins job pass?).
 *    All Selenium jobs contribute. This is a CI health signal.
 *
 *  • "Test results" — aggregated WDIO test counts from the selenium-daily-beta-*
 *    jobs, which publish a JUnit TestResultAction. Shows how many individual
 *    browser test cases passed/failed/skipped across recent runs.
 *    Quibble and Wikibase selenium jobs do NOT publish test-level reports to
 *    Jenkins, so they only appear in the Job results view.
 *
 * @param {{ builds: Array, error: Error|null, loading: boolean }} props
 */
export default function PassFailPanel({ builds, error, loading }) {
  const [activeStatus, setActiveStatus] = useState(null);
  const [view, setView]                 = useState('jobs'); // 'jobs' | 'tests'

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="bg-red-900 border border-red-600 text-red-200 rounded p-3 text-sm">
        Jenkins data unavailable: {error.message}
      </div>
    );
  }

  // ── Job-level aggregates ─────────────────────────────────────────────────
  const passed = builds.filter((b) => b.status === 'passed').length;
  const failed = builds.filter((b) => b.status === 'failed').length;
  const other  = builds.filter((b) => b.status === 'other').length;

  const jobPieData = [
    { name: 'Passed', value: passed },
    { name: 'Failed', value: failed },
    ...(other > 0 ? [{ name: 'Other', value: other }] : []),
  ].filter((d) => d.value > 0);

  // ── Test-level aggregates (selenium-daily-beta-* only) ───────────────────
  const buildsWithTests = builds.filter((b) => b.tests !== null);
  const testTotals = buildsWithTests.reduce(
    (acc, b) => {
      acc.passed  += b.tests.passed;
      acc.failed  += b.tests.failed;
      acc.skipped += b.tests.skipped;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0 },
  );
  const testPieData = [
    { name: 'Passed',  value: testTotals.passed  },
    { name: 'Failed',  value: testTotals.failed  },
    ...(testTotals.skipped > 0 ? [{ name: 'Skipped', value: testTotals.skipped }] : []),
  ].filter((d) => d.value > 0);

  const hasTestData = buildsWithTests.length > 0;

  // ── Table rows ───────────────────────────────────────────────────────────
  const tableBuilds =
    view === 'tests'
      ? buildsWithTests
      : activeStatus
        ? builds.filter((b) => b.status === STATUS_MAP[activeStatus])
        : builds;

  const handleSliceClick = (entry) => {
    if (view === 'jobs') setActiveStatus((prev) => (prev === entry.name ? null : entry.name));
  };

  const pieData   = view === 'tests' ? testPieData   : jobPieData;
  const pieColors = view === 'tests' ? TEST_COLORS   : JOB_COLORS;

  return (
    <div className="space-y-3">

      {/* ── View toggle ── */}
      <div className="flex items-center justify-between">
        <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
          <button
            onClick={() => { setView('jobs'); setActiveStatus(null); }}
            className={`px-2 py-0.5 transition-colors ${
              view === 'jobs' ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
            title="Job-level pass/fail: did the Jenkins job succeed or fail?"
          >
            Job results
          </button>
          <button
            onClick={() => { setView('tests'); setActiveStatus(null); }}
            className={`px-2 py-0.5 transition-colors ${
              view === 'tests' ? 'bg-indigo-700 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
            title="Test-level results: aggregated WDIO test case counts from selenium-daily-beta-* jobs"
          >
            Test results
          </button>
        </div>
        <span className="text-xs text-gray-500">
          {view === 'jobs'
            ? `${builds.length} builds`
            : hasTestData
              ? `${buildsWithTests.length} builds · ${testTotals.passed + testTotals.failed + testTotals.skipped} tests`
              : 'no test data'}
        </span>
      </div>

      {/* ── Explanation banner ── */}
      <p className="text-xs text-gray-500 leading-snug">
        {view === 'jobs' ? (
          <>
            <span className="text-gray-400 font-medium">Job pass/fail</span>
            {' '}— whether each Selenium Jenkins job succeeded or failed overall.
            Includes all jobs from the Selenium &amp; Selenium-daily views.
          </>
        ) : (
          <>
            <span className="text-indigo-300 font-medium">Test-level results</span>
            {' '}— individual WDIO browser test cases from the{' '}
            <span className="text-gray-300">selenium-daily-beta-*</span> jobs, which
            publish a JUnit report. Quibble and Wikibase selenium jobs do not publish
            test-level reports to Jenkins and are excluded here.
          </>
        )}
      </p>

      {pieData.length === 0 ? (
        <p className="text-gray-500 text-sm italic">
          {view === 'tests' ? 'No test-report data in recent builds.' : 'No build data available.'}
        </p>
      ) : (
        <>
          {view === 'jobs' && activeStatus && (
            <div className="flex items-center justify-between text-xs text-gray-400 bg-gray-700/50 rounded px-3 py-1.5">
              <span>Filtered: <span className="text-white font-medium">{activeStatus}</span> builds</span>
              <button
                onClick={() => setActiveStatus(null)}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear ×
              </button>
            </div>
          )}

          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                onClick={handleSliceClick}
                style={{ cursor: view === 'jobs' ? 'pointer' : 'default' }}
              >
                {pieData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={pieColors[entry.name] ?? '#94a3b8'}
                    opacity={
                      view === 'tests' || !activeStatus || activeStatus === entry.name ? 1 : 0.35
                    }
                    stroke={view === 'jobs' && activeStatus === entry.name ? '#fff' : 'none'}
                    strokeWidth={view === 'jobs' && activeStatus === entry.name ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
                formatter={(val, name) => [
                  `${val} ${view === 'tests' ? 'tests' : 'builds'}`,
                  name,
                ]}
              />
              <Legend
                formatter={(value) => (
                  <span
                    className={`text-xs select-none ${view === 'jobs' ? 'cursor-pointer' : ''}`}
                    style={{ color: view === 'jobs' && activeStatus === value ? '#fff' : '#d1d5db' }}
                    onClick={() => view === 'jobs' && handleSliceClick({ name: value })}
                  >
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </>
      )}

      {/* ── Table ── */}
      {tableBuilds.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">
            {view === 'tests'
              ? `${tableBuilds.length} build${tableBuilds.length !== 1 ? 's' : ''} with test reports — click a row to open in Jenkins`
              : activeStatus
                ? `${tableBuilds.length} ${activeStatus.toLowerCase()} build${tableBuilds.length !== 1 ? 's' : ''} — click a row to open in Jenkins`
                : `${tableBuilds.length} build${tableBuilds.length !== 1 ? 's' : ''} — click a row to open in Jenkins`}
          </p>
          <div className="overflow-x-auto overflow-y-auto max-h-72">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="pb-1 pr-3 font-medium">Job</th>
                <th className="pb-1 pr-3 font-medium">
                  {view === 'tests' ? 'Tests P/F/S' : 'Status'}
                </th>
                <th className="pb-1 pr-3 font-medium">Duration</th>
                <th className="pb-1 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {tableBuilds.map((build, i) => (
                <tr
                  key={i}
                  onClick={() => window.open(build.build_url, '_blank', 'noopener')}
                  className="border-b border-gray-700/50 hover:bg-gray-700/40 cursor-pointer transition-colors"
                  title={`Open build in Jenkins: ${build.build_url}`}
                >
                  <td className="py-1.5 pr-3 text-gray-300 max-w-[120px]">
                    <a
                      href={build.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-blue-400 hover:underline transition-colors truncate block"
                      title={build.job}
                    >
                      {build.job}
                    </a>
                  </td>
                  <td className="py-1.5 pr-3">
                    {view === 'tests' && build.tests ? (
                      <span className="font-mono">
                        <span className="text-green-400">{build.tests.passed}</span>
                        <span className="text-gray-500">/</span>
                        <span className="text-red-400">{build.tests.failed}</span>
                        <span className="text-gray-500">/</span>
                        <span className="text-gray-400">{build.tests.skipped}</span>
                      </span>
                    ) : (
                      <span className={`font-medium ${
                        build.status === 'passed' ? 'text-green-400'
                        : build.status === 'failed' ? 'text-red-400'
                        : 'text-gray-400'
                      }`}>
                        {build.status}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-400 font-mono">
                    {formatDuration(build.duration_seconds)}
                  </td>
                  <td className="py-1.5 text-gray-400">
                    {new Date(build.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {view === 'tests' && (
            <p className="text-xs text-gray-600 mt-1">P = passed · F = failed · S = skipped</p>
          )}
        </div>
      )}
    </div>
  );
}
