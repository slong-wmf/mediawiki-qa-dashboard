import { useState, useMemo, useCallback } from 'react';
import { ErrorBanner } from './shared/ErrorBanner.jsx';
import { ViewToggle } from './PassFailPanel/ViewToggle.jsx';
import { PassFailPie } from './PassFailPanel/PassFailPie.jsx';
import { BuildsTable } from './PassFailPanel/BuildsTable.jsx';

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

const STATUS_MAP = { Passed: 'passed', Failed: 'failed', Other: 'other' };

/**
 * Pass/Fail Rates panel.
 *
 * Two views, toggled at the top:
 *  • "Job results" — one data point per build (did the whole Jenkins job pass?).
 *  • "Test results" — aggregated WDIO test counts from the selenium-daily-beta-*
 *    jobs, which publish a JUnit TestResultAction.
 *
 * @param {{ builds: Array, error: Error|null, loading: boolean }} props
 */
export default function PassFailPanel({ builds, error, loading }) {
  const [activeStatus, setActiveStatus] = useState(null);
  const [view,         setView]         = useState('jobs'); // 'jobs' | 'tests'

  // Job-level pie data — one slice per status.
  const jobPieData = useMemo(() => {
    const passed = builds.filter((b) => b.status === 'passed').length;
    const failed = builds.filter((b) => b.status === 'failed').length;
    const other  = builds.filter((b) => b.status === 'other').length;
    return [
      { name: 'Passed', value: passed },
      { name: 'Failed', value: failed },
      ...(other > 0 ? [{ name: 'Other', value: other }] : []),
    ].filter((d) => d.value > 0);
  }, [builds]);

  // Test-level aggregates (selenium-daily-beta-* only).
  const { buildsWithTests, testTotals, testPieData } = useMemo(() => {
    const withTests = builds.filter((b) => b.tests !== null);
    const totals    = withTests.reduce(
      (acc, b) => {
        acc.passed  += b.tests.passed;
        acc.failed  += b.tests.failed;
        acc.skipped += b.tests.skipped;
        return acc;
      },
      { passed: 0, failed: 0, skipped: 0 },
    );
    const data = [
      { name: 'Passed',  value: totals.passed  },
      { name: 'Failed',  value: totals.failed  },
      ...(totals.skipped > 0 ? [{ name: 'Skipped', value: totals.skipped }] : []),
    ].filter((d) => d.value > 0);
    return { buildsWithTests: withTests, testTotals: totals, testPieData: data };
  }, [builds]);

  // Build list driving the table — depends on view + active filter.
  const tableBuilds = useMemo(() => {
    if (view === 'tests') return buildsWithTests;
    if (activeStatus)     return builds.filter((b) => b.status === STATUS_MAP[activeStatus]);
    return builds;
  }, [view, builds, buildsWithTests, activeStatus]);

  const handleSliceClick = useCallback((name) => {
    setActiveStatus((prev) => (prev === name ? null : name));
  }, []);

  const handleViewChange = useCallback((next) => {
    setView(next);
    setActiveStatus(null);
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <ErrorBanner source="Jenkins" error={error} />;

  const pieData = view === 'tests' ? testPieData : jobPieData;

  return (
    <div className="space-y-3">

      <ViewToggle
        view={view}
        onChange={handleViewChange}
        buildCount={builds.length}
        buildsWithTestsCount={buildsWithTests.length}
        totalTests={testTotals.passed + testTotals.failed + testTotals.skipped}
      />

      {/* Explanation banner */}
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

          <PassFailPie
            pieData={pieData}
            view={view}
            activeStatus={activeStatus}
            onSliceClick={handleSliceClick}
          />
        </>
      )}

      {tableBuilds.length > 0 && (
        <>
          <p className="text-xs text-gray-500 mb-1">
            {view === 'tests'
              ? `${tableBuilds.length} build${tableBuilds.length !== 1 ? 's' : ''} with test reports — click a row to open in Jenkins`
              : activeStatus
                ? `${tableBuilds.length} ${activeStatus.toLowerCase()} build${tableBuilds.length !== 1 ? 's' : ''} — click a row to open in Jenkins`
                : `${tableBuilds.length} build${tableBuilds.length !== 1 ? 's' : ''} — click a row to open in Jenkins`}
          </p>
          <BuildsTable builds={tableBuilds} view={view} />
        </>
      )}
    </div>
  );
}
