import { useState, useMemo } from 'react';
import { PanelSkeleton } from './shared/Skeleton.jsx';
import { TrainTaskHeader } from './TrainBlockersPanel/TrainTaskHeader.jsx';
import { BlockerStatusFilter } from './TrainBlockersPanel/BlockerStatusFilter.jsx';
import { BlockerTable } from './TrainBlockersPanel/BlockerTable.jsx';

/**
 * Train Blockers panel.
 *
 * Shows the subtask blockers from the most recently resolved weekly train
 * deployment task, along with the reporter and whoever resolved each blocker.
 *
 * The outer Panel (in App.jsx) already renders the error banner and loading
 * skeleton for us, so this component only needs to handle the "no data yet"
 * fallback and delegate UI to its TrainBlockersPanel/ subcomponents.
 *
 * @param {{ trainBlockers: object|null, error: Error|null, loading: boolean }} props
 */
export default function TrainBlockersPanel({ trainBlockers, error, loading }) {
  const [activeStatus, setActiveStatus] = useState(null);

  const blockerList = Array.isArray(trainBlockers?.blockers) ? trainBlockers.blockers : [];

  // Sort: unresolved first (by priority desc), then resolved (by close date desc).
  // Memoised so filter toggles don't re-sort an unchanged blocker list.
  const sorted = useMemo(() => {
    if (!blockerList.length) return [];
    const filtered = activeStatus
      ? blockerList.filter((b) => b.statusRaw === activeStatus)
      : blockerList;
    return [...filtered].sort((a, b) => {
      const aResolved = a.statusRaw === 'resolved';
      const bResolved = b.statusRaw === 'resolved';
      if (aResolved !== bResolved) return aResolved ? 1 : -1;
      if (b.priorityValue !== a.priorityValue) return b.priorityValue - a.priorityValue;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [blockerList, activeStatus]);

  const resolvedCount = useMemo(
    () => blockerList.filter((b) => b.statusRaw === 'resolved').length,
    [blockerList],
  );

  if (loading) return <PanelSkeleton />;
  // Errors/empty data fall through to the empty-state message — the outer
  // Panel wrapper still shows the red banner for the caller.
  if (error || !trainBlockers || !trainBlockers.trainTask) {
    return <p className="text-gray-500 text-sm italic">No train blocker data available.</p>;
  }

  const { trainTask, totalBlockers = 0 } = trainBlockers;
  const unresolvedCount = totalBlockers - resolvedCount;

  return (
    <div className="space-y-4">

      <TrainTaskHeader trainTask={trainTask} />

      {/* Headline counts */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-white leading-none">{totalBlockers}</p>
          <p className="text-xs text-gray-400 mt-0.5">total blockers</p>
        </div>
        <div className="text-right text-xs text-gray-500 leading-snug">
          <span className="text-green-400 font-medium">{resolvedCount}</span> resolved
          <br />
          <span className={unresolvedCount > 0 ? 'text-amber-400 font-medium' : 'text-gray-500'}>
            {unresolvedCount}
          </span> unresolved
        </div>
      </div>

      {totalBlockers === 0 ? (
        <p className="text-gray-500 text-sm italic">This train had no filed blockers.</p>
      ) : (
        <>
          <BlockerStatusFilter
            blockers={blockerList}
            activeStatus={activeStatus}
            onChange={setActiveStatus}
          />
          <BlockerTable blockers={sorted} />
        </>
      )}

      <p className="text-xs text-gray-600 leading-snug border-l-2 border-gray-700 pl-2">
        Blockers are subtasks of the previous week's resolved{' '}
        <a
          href={trainTask.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-300 underline"
        >
          train deployment task
        </a>{' '}
        on Phabricator.
      </p>

    </div>
  );
}
