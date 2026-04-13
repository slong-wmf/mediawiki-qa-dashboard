import { useState, useMemo, useCallback } from 'react';
import { isActiveOnWikipedia } from './../data/activeExtensions.js';
import { uniqueStewards } from './../services/maintainers.js';
import { COVERAGE_BUCKETS } from './../constants/coverage.js';
import { truncate } from './../utils/format.js';
import { PanelSkeleton } from './shared/Skeleton.jsx';
import { ErrorBanner } from './shared/ErrorBanner.jsx';
import { ScopeFilter } from './CoveragePanel/ScopeFilter.jsx';
import { StewardFilter } from './CoveragePanel/StewardFilter.jsx';
import { MedianHeadline } from './CoveragePanel/MedianHeadline.jsx';
import { NoCoverageNote } from './CoveragePanel/NoCoverageNote.jsx';
import { ChartViewToggle } from './CoveragePanel/ChartViewToggle.jsx';
import { CoverageTable } from './CoveragePanel/CoverageTable.jsx';
import { CoverageBarChart } from './CoveragePanel/CoverageBarChart.jsx';
import { BucketCards } from './CoveragePanel/BucketCards.jsx';

/**
 * Code Coverage panel orchestrator.
 *
 * Owns all filter/view state (scope, steward, chart view, active bucket)
 * and derives the filtered extension lists with useMemo. Rendering is
 * delegated to the subcomponents in ./CoveragePanel/.
 *
 * @param {{
 *   coverage: { core, extensions }|null,
 *   error: Error|null,
 *   loading: boolean,
 *   maintainers: Map|null,
 *   maintainersError: Error|null,
 * }} props
 */
export default function CoveragePanel({
  coverage,
  error,
  loading,
  maintainers = null,
  maintainersError = null,
}) {
  const [activeBucket,  setActiveBucket]  = useState(null);
  const [chartView,     setChartView]     = useState('table'); // 'top' | 'lowest' | 'table'
  const [wikiOnly,      setWikiOnly]      = useState(true);
  const [activeSteward, setActiveSteward] = useState(null);

  // Hooks must run unconditionally before any early returns. Wrapped in
  // useMemo so the fallback `[]` does not churn downstream memo dependencies
  // on every render when coverage is null.
  const allExtensions = useMemo(() => coverage?.extensions ?? [], [coverage]);

  const isValidMap = maintainers instanceof Map;

  const stewardList = useMemo(
    () => (isValidMap ? uniqueStewards(maintainers) : []),
    [isValidMap, maintainers],
  );

  const extensions = useMemo(
    () => (wikiOnly ? allExtensions.filter((e) => isActiveOnWikipedia(e.name)) : allExtensions),
    [allExtensions, wikiOnly],
  );

  const filteredExtensions = useMemo(() => {
    if (!activeSteward || !isValidMap) return extensions;
    return extensions.filter((e) => maintainers.get(e.name)?.steward === activeSteward);
  }, [extensions, activeSteward, isValidMap, maintainers]);

  const withCoverage = useMemo(
    () => filteredExtensions.filter((e) => e.coverage_pct > 0),
    [filteredExtensions],
  );

  const chartExtensions = useMemo(() => {
    const sorted = [...withCoverage].sort((a, b) =>
      chartView === 'lowest' ? a.coverage_pct - b.coverage_pct : b.coverage_pct - a.coverage_pct,
    );
    return sorted.slice(0, 15).map((e) => ({ ...e, label: truncate(e.name, 18) }));
  }, [withCoverage, chartView]);

  // Median across extensions that have any coverage data.
  const medianCoverage = useMemo(() => {
    const sorted = [...withCoverage].map((e) => e.coverage_pct).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }, [withCoverage]);

  const allTableExtensions = useMemo(
    () => [...filteredExtensions].sort((a, b) => b.coverage_pct - a.coverage_pct),
    [filteredExtensions],
  );

  // Average computed against extensions with coverage > 0 to match the
  // median's inclusion rule (otherwise 0% entries drag the number down).
  const avg = useMemo(() => {
    if (!withCoverage.length) return 0;
    return Math.round(
      withCoverage.reduce((s, e) => s + e.coverage_pct, 0) / withCoverage.length,
    );
  }, [withCoverage]);

  const bucketExtensions = useMemo(() => {
    if (activeBucket === null) return null;
    return filteredExtensions
      .filter(COVERAGE_BUCKETS[activeBucket].filter)
      .sort((a, b) => b.coverage_pct - a.coverage_pct);
  }, [activeBucket, filteredExtensions]);

  const handleWikiOnlyChange = useCallback((next) => {
    setWikiOnly(next);
    setActiveBucket(null);
    setActiveSteward(null);
  }, []);

  const handleStewardChange = useCallback((next) => {
    setActiveSteward(next);
    setActiveBucket(null);
  }, []);

  if (loading) return <PanelSkeleton />;
  if (error)   return <ErrorBanner source="Coverage index" error={error} />;
  if (!coverage) {
    return <p className="text-gray-500 text-sm italic">No coverage data loaded yet.</p>;
  }

  const total = filteredExtensions.length;
  const hasZeroCoverageForSteward =
    activeSteward && filteredExtensions.some((e) => e.coverage_pct === 0);

  return (
    <div className="space-y-4">

      <ScopeFilter
        wikiOnly={wikiOnly}
        onChange={handleWikiOnlyChange}
        allCount={allExtensions.length}
        wikipediaCount={extensions.length}
      />

      <StewardFilter
        maintainers={maintainers}
        maintainersError={maintainersError}
        stewardList={stewardList}
        activeSteward={activeSteward}
        onChange={handleStewardChange}
      />

      <MedianHeadline
        median={medianCoverage}
        coveredCount={withCoverage.length}
        wikiOnly={wikiOnly}
        activeSteward={activeSteward}
      />

      {hasZeroCoverageForSteward && <NoCoverageNote stewardName={activeSteward} />}

      {activeBucket === null && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-400">
              {chartView === 'table'
                ? `${filteredExtensions.length} extensions — click a row to open`
                : `${chartView === 'lowest' ? 'Lowest' : 'Top'} 15 extensions by coverage — click a bar to open`}
            </p>
            <ChartViewToggle view={chartView} onChange={setChartView} />
          </div>

          {chartView === 'table'
            ? <CoverageTable extensions={allTableExtensions} />
            : <CoverageBarChart data={chartExtensions} />}
        </div>
      )}

      {activeBucket !== null && bucketExtensions && (
        <div>
          <p className="text-xs text-gray-400 mb-1">
            {bucketExtensions.length} extension{bucketExtensions.length !== 1 ? 's' : ''} —{' '}
            <button
              type="button"
              onClick={() => setActiveBucket(null)}
              className="text-blue-400 hover:underline"
            >
              ← back to chart
            </button>
          </p>
          <CoverageTable extensions={bucketExtensions} maxHeightClass="max-h-48" />
        </div>
      )}

      <BucketCards
        extensions={filteredExtensions}
        activeBucket={activeBucket}
        onSelect={setActiveBucket}
      />
      <p className="text-xs text-gray-500 text-center">
        {total} extensions · avg {avg}% · click a card to browse
      </p>

    </div>
  );
}
