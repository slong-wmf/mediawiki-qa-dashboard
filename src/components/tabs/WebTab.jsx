/**
 * "Web" tab — houses the existing MediaWiki/Wikimedia desktop+mobile-web QA
 * panels (Pass/Fail, Coverage, Automated Tests, Job Total Time, Active Bugs,
 * Train Blockers). The component is purely presentational: it receives all
 * the data it needs as props from App.jsx, which owns useDashboardData(), so
 * the data hook is not duplicated when the WebTab is hidden.
 *
 * Steward filter lives inside this tab because it only narrows MediaWiki
 * extension data — no meaning on the iOS/Android tabs.
 */

import { useState, useMemo, useCallback } from 'react';
import { Panel } from '../shared/Panel.jsx';
import PassFailPanel from '../PassFailPanel.jsx';
import CoveragePanel from '../CoveragePanel.jsx';
import ExecutionTimePanel from '../ExecutionTimePanel.jsx';
import BugsPanel from '../BugsPanel.jsx';
import TrainBlockersPanel from '../TrainBlockersPanel.jsx';
import AutomatedTestsPanel from '../AutomatedTestsPanel.jsx';
import TrendsPanel from '../TrendsPanel.jsx';
import FlakyTestsPanel from '../FlakyTestsPanel.jsx';
import { StewardFilter } from '../CoveragePanel/StewardFilter.jsx';
import { uniqueStewards } from '../../services/maintainers.js';

/**
 * @param {{
 *   data: ReturnType<import('../../hooks/useDashboardData.js').useDashboardData>,
 * }} props
 */
export function WebTab({ data }) {
  const {
    builds,
    jenkinsFailedJobs,
    coverage,
    bugs,
    trainBlockers,
    maintainers,
    automatedTests,
    metricsHistory,
    flakyTests,
    initialLoading,
    jenkinsLoading,
    errors,
    refreshJobList,
    jobListLoading,
    jobListError,
    loading,
  } = data;

  // Shared steward filter — narrows Pass/Fail Rates, Code Coverage, and
  // the Automated Tests inventory. Local to this tab because the filter has
  // no meaning on the iOS/Android tabs.
  const [activeStewards, setActiveStewards] = useState([]);
  const stewardList = useMemo(
    () => (maintainers instanceof Map ? uniqueStewards(maintainers) : []),
    [maintainers],
  );
  const handleStewardChange = useCallback((next) => setActiveStewards(next), []);

  return (
    <>
      {/* Trends Over Time — full-width above the steward-filtered group. Not
          steward-filtered because the metrics are dashboard-wide aggregates. */}
      <Panel
        title="Trends Over Time"
        loading={initialLoading}
        error={errors.metricsHistory}
        source="snapshot history"
      >
        <TrendsPanel
          data={metricsHistory}
          loading={initialLoading}
          error={errors.metricsHistory}
        />
      </Panel>

      {/* Steward-filtered group: Pass/Fail, Coverage, and Automated Tests */}
      <section
        aria-label="Pass/Fail, Code Coverage, and Automated Tests"
        className="mt-6 rounded border border-gray-700 bg-gray-800/40 p-4"
      >
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
            Pass / Fail, Coverage &amp; Automated Tests
          </h2>
          <StewardFilter
            maintainers={maintainers}
            maintainersError={errors.maintainers}
            stewardList={stewardList}
            activeStewards={activeStewards}
            onChange={handleStewardChange}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel
            title="Pass / Fail Rates"
            loading={initialLoading || jenkinsLoading}
            error={errors.jenkins}
            source="Jenkins"
            action={
              <>
                {jobListError && (
                  <span className="text-xs text-red-400" title={jobListError.message}>
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
            <PassFailPanel
              builds={builds}
              error={errors.jenkins}
              loading={initialLoading || jenkinsLoading}
              activeStewards={activeStewards}
              maintainers={maintainers}
            />
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
              activeStewards={activeStewards}
            />
          </Panel>
        </div>

        <div className="mt-6">
          <Panel
            title="Automated Tests Inventory"
            loading={initialLoading}
            error={errors.automatedTests}
            source="browser-test-scanner"
          >
            <AutomatedTestsPanel
              data={automatedTests}
              error={null}
              loading={initialLoading}
              maintainers={maintainers}
              activeStewards={activeStewards}
            />
          </Panel>
        </div>
      </section>

      {/* Flaky Tests — full-width below the steward-filtered group. The
          flaky_tests table doesn't carry MediaWiki extension attribution we
          can map to maintainers, so it's not steward-filtered. */}
      <div className="mt-6">
        <Panel
          title="Flaky Tests"
          loading={initialLoading}
          error={errors.flakyTests}
          source="releng-data Datasette"
        >
          <FlakyTestsPanel
            data={flakyTests}
            loading={initialLoading}
            error={errors.flakyTests}
          />
        </Panel>
      </div>

      {/* Job Total Time — outside the steward wrapper so it remains unaffected. */}
      <div className="mt-6">
        <Panel
          title="Job Total Time"
          loading={initialLoading || jenkinsLoading}
          error={errors.jenkins}
          source="Jenkins"
        >
          <ExecutionTimePanel
            builds={builds}
            error={errors.jenkins}
            loading={initialLoading || jenkinsLoading}
          />
        </Panel>
      </div>

      {/* Bugs row (full width) */}
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

      {/* Train blockers row (full width) */}
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
    </>
  );
}

export default WebTab;
