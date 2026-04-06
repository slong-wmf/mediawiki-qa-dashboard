import { useDashboardData } from './hooks/useDashboardData.js';
import PassFailPanel from './components/PassFailPanel.jsx';
import CoveragePanel from './components/CoveragePanel.jsx';
import ExecutionTimePanel from './components/ExecutionTimePanel.jsx';
import BugsPanel from './components/BugsPanel.jsx';

/**
 * Skeleton placeholder shown while data is loading.
 */
function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="h-4 bg-gray-700 rounded w-1/3"></div>
      <div className="h-48 bg-gray-700 rounded"></div>
      <div className="h-3 bg-gray-700 rounded w-2/3"></div>
      <div className="h-3 bg-gray-700 rounded w-1/2"></div>
    </div>
  );
}

/**
 * Error banner shown when a data source has failed.
 */
function ErrorBanner({ source, error }) {
  if (!error) return null;
  return (
    <div className="bg-red-900 border border-red-600 text-red-200 rounded p-3 text-sm mb-4">
      <span className="font-semibold">{source} unavailable:</span>{' '}
      {error.message ?? 'Unknown error'}
    </div>
  );
}

/**
 * Generic panel wrapper with title, skeleton, and error state handling.
 *
 * @param {ReactNode} [action] - Optional element rendered in the panel header
 *   to the right of the title (e.g. a contextual action button).
 */
function Panel({ title, loading, error, source, action, children }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          {title}
        </h2>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <div className="p-4">
        {error && <ErrorBanner source={source} error={error} />}
        {loading ? <PanelSkeleton /> : children}
      </div>
    </div>
  );
}

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
    coverage,
    bugs,
    lastRefreshed,
    loading,
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

      {/* ── Main panels ── */}
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <Panel
            title="Pass / Fail Rates"
            loading={loading || jenkinsLoading}
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
            <PassFailPanel builds={builds} error={errors.jenkins} loading={loading || jenkinsLoading} />
          </Panel>

          <Panel
            title="Code Coverage"
            loading={loading}
            error={errors.coverage}
            source="Coverage index"
          >
            <CoveragePanel coverage={coverage} error={errors.coverage} loading={loading} />
          </Panel>

          <Panel
            title="Job Total Time"
            loading={loading || jenkinsLoading}
            error={errors.jenkins}
            source="Jenkins"
          >
            <ExecutionTimePanel builds={builds} error={errors.jenkins} loading={loading || jenkinsLoading} />
          </Panel>

        </div>

        {/* ── Bugs row (full width) ── */}
        <div className="mt-6">
          <Panel
            title="Active Bugs · Past 7 Days"
            loading={loading}
            error={errors.phabricator}
            source="Phabricator"
          >
            <BugsPanel bugs={bugs} error={errors.phabricator} loading={loading} />
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
