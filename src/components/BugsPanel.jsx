import { useState, useMemo } from 'react';
import { PanelSkeleton } from './shared/Skeleton.jsx';
import { ErrorBanner } from './shared/ErrorBanner.jsx';
import { STATUS_GROUPS } from '../constants/phabricator.js';
import { BugStatusCards } from './BugsPanel/BugStatusCards.jsx';
import { BugsTable } from './BugsPanel/BugsTable.jsx';

/**
 * Phabricator Bugs panel.
 *
 * Shows open Phabricator tasks with subtype "bug" or "error" modified within
 * the past 7 days, grouped and filterable by status. Security subtypes are
 * excluded — they are not publicly viewable outside the foundation.
 *
 * @param {{
 *   bugs: { tasks, totalFetched, hasMore, cutoffDate }|null,
 *   error: Error|null,
 *   loading: boolean,
 * }} props
 */
export default function BugsPanel({ bugs, error, loading }) {
  const [activeGroup, setActiveGroup] = useState(null);

  // Precompute the filtered + sorted rows so filter toggles don't re-sort
  // an unchanged list on every render.
  const sortedTasks = useMemo(() => {
    if (!bugs) return [];
    const filtered = activeGroup
      ? bugs.tasks.filter((t) => t.statusGroup === activeGroup)
      : bugs.tasks;
    // Sort: highest priority first, then most recently modified
    return [...filtered].sort((a, b) => {
      if (b.priorityValue !== a.priorityValue) return b.priorityValue - a.priorityValue;
      return new Date(b.modifiedAt) - new Date(a.modifiedAt);
    });
  }, [bugs, activeGroup]);

  const countByGroup = useMemo(() => {
    if (!bugs) return {};
    return Object.fromEntries(
      STATUS_GROUPS.map((g) => [g, bugs.tasks.filter((t) => t.statusGroup === g).length]),
    );
  }, [bugs]);

  const newTaskCount = useMemo(
    () => (bugs ? bugs.tasks.filter((t) => t.isNew).length : 0),
    [bugs],
  );

  if (loading) return <PanelSkeleton />;
  // Show the inline error banner when used without the outer Panel wrapper
  // (e.g. in component tests). The wrapper in App.jsx also renders its own
  // banner, so this only fires when rendered standalone.
  if (error) return <ErrorBanner source="Phabricator" error={error} />;
  if (!bugs || bugs.tasks.length === 0) {
    return (
      <p className="text-gray-500 text-sm italic">
        No open tasks modified in the past 7 days.
      </p>
    );
  }

  const { totalFetched, hasMore } = bugs;

  return (
    <div className="space-y-4">

      {/* Headline counts */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-3xl font-bold text-white leading-none">{totalFetched}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            active bug{totalFetched !== 1 ? 's' : ''} in the past 7 days
            {hasMore && <span className="text-amber-400"> (200+ — showing first 200)</span>}
          </p>
        </div>
        <div className="text-right text-xs text-gray-500 leading-snug">
          <span className="text-green-400 font-medium">{newTaskCount}</span> newly filed this week
        </div>
      </div>

      <BugStatusCards
        countByGroup={countByGroup}
        activeGroup={activeGroup}
        onChange={setActiveGroup}
      />

      {activeGroup && (
        <div className="flex justify-end">
          <button
            onClick={() => setActiveGroup(null)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Clear filter ×
          </button>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs text-gray-600 leading-snug border-l-2 border-gray-700 pl-2">
          <span className="text-gray-500">Active</span> = modified within the past 7 days
          and not in a resolved, declined, invalid, wontfix, spite, or duplicate state.
        </p>
        <p className="text-xs text-gray-600 leading-snug border-l-2 border-gray-700 pl-2">
          Tasks with subtype <em>Bug Report</em> or <em>Production Error</em>,
          modified in the past 7 days and not closed.
          Security tasks are excluded as they are not publicly viewable.
        </p>
      </div>

      <BugsTable tasks={sortedTasks} />

      {hasMore && (
        <p className="text-xs text-gray-600 text-center mt-2">
          Showing first 200 results. Visit{' '}
          <a
            href="https://phabricator.wikimedia.org/maniphest/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            Phabricator Maniphest
          </a>{' '}
          for the full list.
        </p>
      )}

    </div>
  );
}
