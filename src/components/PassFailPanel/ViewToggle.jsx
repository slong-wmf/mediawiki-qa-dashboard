/**
 * Segmented toggle between "Job results" and "Test results" views.
 * Extracted so the main panel can stay focused on orchestration.
 */
export function ViewToggle({ view, onChange, buildCount, buildsWithTestsCount, totalTests }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
        <button
          onClick={() => onChange('jobs')}
          aria-pressed={view === 'jobs'}
          className={`px-2 py-0.5 transition-colors ${
            view === 'jobs' ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
          }`}
          title="Job-level pass/fail: did the Jenkins job succeed or fail?"
        >
          Job results
        </button>
        <button
          onClick={() => onChange('tests')}
          aria-pressed={view === 'tests'}
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
          ? `${buildCount} builds`
          : buildsWithTestsCount > 0
            ? `${buildsWithTestsCount} builds · ${totalTests} tests`
            : 'no test data'}
      </span>
    </div>
  );
}
