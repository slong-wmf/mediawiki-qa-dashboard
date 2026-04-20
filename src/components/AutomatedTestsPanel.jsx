import { useMemo, useState } from 'react';
import { PanelSkeleton } from './shared/Skeleton.jsx';
import { ErrorBanner } from './shared/ErrorBanner.jsx';
import { StatsCards } from './AutomatedTestsPanel/StatsCards.jsx';
import { FrameworkToggle } from './AutomatedTestsPanel/FrameworkToggle.jsx';
import { TestsTable } from './AutomatedTestsPanel/TestsTable.jsx';

const WIKI_PAGE_URL = 'https://www.mediawiki.org/wiki/Wikimedia_Quality_Services/Automated_tests_available';

/**
 * Narrow the repos list to those owned by one of the selected stewards.
 * Repos whose short name is not in the maintainers map are excluded whenever
 * a steward filter is active (they cannot be attributed to a steward).
 *
 * Exported for unit testing.
 *
 * @param {Array} repos
 * @param {string[]} activeStewards
 * @param {Map|null} maintainers
 * @returns {Array}
 */
export function filterReposBySteward(repos, activeStewards, maintainers) {
  if (!activeStewards?.length) return repos;
  if (!(maintainers instanceof Map)) return repos;
  const stewardSet = new Set(activeStewards);
  return repos.filter((r) => stewardSet.has(maintainers.get(r.name)?.steward));
}

/**
 * Automated Tests Inventory panel.
 *
 * Renders the output of the browser-test-scanner: a per-repo list of WDIO /
 * Cypress tests with framework version, MediaWiki version, gated-selenium
 * status, test count, and the individual test names.
 *
 * Integrates with the shared Steward filter owned by App.jsx — `activeStewards`
 * and `maintainers` arrive as props and narrow the repo list in the same way
 * PassFailPanel and CoveragePanel do.
 *
 * @param {{
 *   data: import('../services/automatedTests.js').AutomatedTestsData|null,
 *   error: Error|null,
 *   loading: boolean,
 *   maintainers?: Map|null,
 *   activeStewards?: string[],
 * }} props
 */
export default function AutomatedTestsPanel({
  data,
  error,
  loading,
  maintainers = null,
  activeStewards = [],
}) {
  const [framework, setFramework] = useState('all');
  const [query, setQuery] = useState('');

  const allRepos = Array.isArray(data?.repos) ? data.repos : [];

  const stewardFilteredRepos = useMemo(
    () => filterReposBySteward(allRepos, activeStewards, maintainers),
    [allRepos, activeStewards, maintainers],
  );

  const { counts, totals } = useMemo(() => {
    const c = { all: stewardFilteredRepos.length, wdio: 0, cypress: 0 };
    let testCount = 0;
    let gatedCount = 0;
    for (const r of stewardFilteredRepos) {
      if (r.framework === 'wdio') c.wdio++;
      else if (r.framework === 'cypress') c.cypress++;
      testCount += r.testCount ?? 0;
      if (r.gatedSelenium) gatedCount++;
    }
    return {
      counts: c,
      totals: {
        repoCount: c.all,
        testCount,
        wdioCount: c.wdio,
        cypressCount: c.cypress,
        gatedCount,
      },
    };
  }, [stewardFilteredRepos]);

  const frameworkFilteredRepos = useMemo(() => {
    if (framework === 'all') return stewardFilteredRepos;
    return stewardFilteredRepos.filter((r) => r.framework === framework);
  }, [stewardFilteredRepos, framework]);

  const visibleRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return frameworkFilteredRepos;
    return frameworkFilteredRepos
      .map((repo) => {
        const matching = (repo.tests ?? []).filter((t) =>
          t.name.toLowerCase().includes(q),
        );
        if (matching.length === 0) return null;
        return { ...repo, tests: matching, testCount: matching.length };
      })
      .filter(Boolean);
  }, [frameworkFilteredRepos, query]);

  if (loading) return <PanelSkeleton />;
  if (error)   return <ErrorBanner source="Automated tests inventory" error={error} />;
  if (!data) {
    return <p className="text-gray-500 text-sm italic">No automated-tests data loaded yet.</p>;
  }

  if (!allRepos.length) {
    return (
      <p className="text-gray-500 text-sm italic">
        No repos reported by the scanner.{' '}
        <a href={WIKI_PAGE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          View wiki page →
        </a>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <StatsCards
        repoCount={totals.repoCount}
        testCount={totals.testCount}
        wdioCount={totals.wdioCount}
        cypressCount={totals.cypressCount}
        gatedCount={totals.gatedCount}
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-400">
          {visibleRepos.length} repo{visibleRepos.length !== 1 ? 's' : ''} — click a row to view test names
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search test names…"
            className="rounded border border-gray-600 bg-gray-700/40 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-500 focus:border-blue-400 focus:outline-none w-48"
          />
          <FrameworkToggle value={framework} onChange={setFramework} counts={counts} />
        </div>
      </div>

      {visibleRepos.length > 0 ? (
        <TestsTable repos={visibleRepos} forceExpand={query.trim().length > 0} />
      ) : (
        <p className="text-gray-500 text-xs italic">
          {query.trim()
            ? `No tests match “${query.trim()}”.`
            : 'No repos match the current filter.'}
        </p>
      )}

      <p className="text-xs text-gray-500 text-center">
        Source:{' '}
        <a href={WIKI_PAGE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          Wikimedia Quality Services / Automated tests available
        </a>
        {data.generatedAt && (
          <>
            {' · generated '}
            <span className="font-mono">{data.generatedAt}</span>
          </>
        )}
      </p>
    </div>
  );
}
