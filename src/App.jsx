import { useDashboardData } from './hooks/useDashboardData.js';
import { Panel } from './components/shared/Panel.jsx';
import PassFailPanel from './components/PassFailPanel.jsx';
import CoveragePanel from './components/CoveragePanel.jsx';
import ExecutionTimePanel from './components/ExecutionTimePanel.jsx';
import BugsPanel from './components/BugsPanel.jsx';
import TrainBlockersPanel from './components/TrainBlockersPanel.jsx';
import { USE_STATIC_DATA } from './services/staticData.js';

/**
 * Format a Date into HH:MM:SS local time.
 */
function formatTime(date) {
  if (!date) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Root dashboard component. Owns data fetching and passes slices to each panel.
 */
export default function App() {
  const {
    builds,
    jenkinsFailedJobs,
    coverage,
    bugs,
    trainBlockers,
    maintainers,
    lastRefreshed,
    loading,
    initialLoading,
    jenkinsLoading,
    errors,
    refresh,
    refreshJobList,
    jobListLoading,
    jobListError,
  } = useDashboardData();

  const refreshIntervalMin = Math.round(
    (Number(import.meta.env.VITE_REFRESH_INTERVAL_MS) || 3_600_000) / 60_000,
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-gray-950 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-white">
          MediaWiki Testing Dashboard
        </h1>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>
            Last refreshed:{' '}
            <span className="text-gray-200 font-mono">{formatTime(lastRefreshed)}</span>
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                       text-white text-sm rounded transition-colors"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* ── Snapshot notice (GitHub Pages static build only) ── */}
      {USE_STATIC_DATA && (
        <div className="bg-amber-900/40 border-b border-amber-700/50 px-6 py-2 text-xs text-amber-300 flex items-center gap-2">
          <span>⚡</span>
          <span>
            <strong>Snapshot data</strong> — generated {lastRefreshed ? lastRefreshed.toLocaleString() : '…'}.
            {' '}For live data, run the dashboard locally or deploy to Vercel.
          </span>
        </div>
      )}

      {/* ── Main panels ── */}
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <Panel
            title="Pass / Fail Rates"
            loading={initialLoading || jenkinsLoading}
            error={errors.jenkins}
            source="Jenkins"
            action={
              <>
                {jobListError && (
                  <span
                    className="text-xs text-red-400"
                    title={jobListError.message}
                  >
                    Fetch failed
                  </span>
                )}
                <button
                  onClick={refreshJobList}
                  disabled={jobListLoading || loading || jenkinsLoading}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600
                             disabled:opacity-50 text-gray-300 rounded transition-colors"
                >
                  {jobListLoading ? 'Fetching…' : 'Fetch Job Information'}
                </button>
              </>
            }
          >
            {jenkinsFailedJobs?.length > 0 && !errors.jenkins && (
              <div
                className="mb-3 rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-300"
                title={jenkinsFailedJobs.map((j) => `${j.label}: ${j.error}`).join('\n')}
              >
                <span className="font-medium">Partial data:</span>{' '}
                {jenkinsFailedJobs.length} job{jenkinsFailedJobs.length !== 1 ? 's' : ''} failed to load
                ({jenkinsFailedJobs.slice(0, 3).map((j) => j.label).join(', ')}
                {jenkinsFailedJobs.length > 3 ? `, +${jenkinsFailedJobs.length - 3} more` : ''})
              </div>
            )}
            <PassFailPanel builds={builds} error={errors.jenkins} loading={initialLoading || jenkinsLoading} />
          </Panel>

          <Panel
            title="Code Coverage"
            loading={initialLoading}
            error={errors.coverage}
            source="Coverage index"
          >
            <CoveragePanel
              coverage={coverage}
              error={errors.coverage}
              loading={initialLoading}
              maintainers={maintainers}
              maintainersError={errors.maintainers}
            />
          </Panel>

          <Panel
            title="Job Total Time"
            loading={initialLoading || jenkinsLoading}
            error={errors.jenkins}
            source="Jenkins"
          >
            <ExecutionTimePanel builds={builds} error={errors.jenkins} loading={initialLoading || jenkinsLoading} />
          </Panel>

        </div>

        {/* ── Bugs row (full width) ── */}
        <div className="mt-6">
          <Panel
            title="Active Bugs · Past 7 Days"
            loading={initialLoading}
            error={errors.phabricator}
            source="Phabricator"
          >
            <BugsPanel bugs={bugs} error={errors.phabricator} loading={initialLoading} />
          </Panel>
        </div>

        {/* ── Train blockers row (full width) ── */}
        <div className="mt-6">
          <Panel
            title="Train Blockers · Previous Release"
            loading={initialLoading}
            error={errors.trainBlockers}
            source="Phabricator"
          >
            <TrainBlockersPanel
              trainBlockers={trainBlockers}
              error={errors.trainBlockers}
              loading={initialLoading}
            />
          </Panel>
        </div>

      </main>

      {/* ── Footer ── */}
      <footer className="bg-gray-950 border-t border-gray-700 px-6 py-3 text-xs text-gray-500 flex items-center justify-between">
        <span>Data sources: Jenkins · doc.wikimedia.org · Phabricator</span>
        <span>Refresh interval: {refreshIntervalMin} min</span>
      </footer>

    </div>
  );
}
