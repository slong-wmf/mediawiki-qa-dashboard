import { formatDuration } from '../../utils/format.js';

/**
 * Build result table shared by the jobs and tests views. In the tests view
 * the status column is replaced by "P/F/S" test counts and the job link
 * points at the lastCompletedBuild's testReport page.
 */
export function BuildsTable({ builds, view }) {
  if (builds.length === 0) return null;

  const openBuild = (url) => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <div>
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
            {builds.map((build) => (
              <tr
                key={build.build_url}
                onClick={() => openBuild(build.build_url)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openBuild(build.build_url);
                  }
                }}
                tabIndex={0}
                aria-label={`Open ${build.job} build in Jenkins`}
                className="border-b border-gray-700/50 hover:bg-gray-700/40 cursor-pointer transition-colors focus:outline-none focus:bg-gray-700/40"
                title={`Open build in Jenkins: ${build.build_url}`}
              >
                <td className="py-1.5 pr-3 text-gray-300 max-w-[120px]">
                  <a
                    href={view === 'tests'
                      ? `${build.job_url}lastCompletedBuild/testReport/`
                      : build.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-blue-400 hover:underline transition-colors truncate block"
                    title={view === 'tests' ? `Open test report for ${build.job}` : build.job}
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
  );
}
