import { StatusBadge, SubtypeBadge } from '../shared/StatusBadge.jsx';
import { PriorityDot } from '../shared/PriorityDot.jsx';
import { RelativeTime } from '../shared/RelativeTime.jsx';

/**
 * Sticky-header table of train blocker subtasks. Rows are fully keyboard-
 * accessible — each renders as role="button" with tabIndex=0 and opens the
 * Phabricator task on Enter/Space.
 */
export function BlockerTable({ blockers }) {
  const openBlocker = (url) => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-72">
      <table className="w-full text-xs text-left">
        <thead className="sticky top-0 bg-gray-800">
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="pb-1 pr-2 font-medium w-12">T#</th>
            <th className="pb-1 pr-3 font-medium">Title</th>
            <th className="pb-1 pr-3 font-medium">Type</th>
            <th className="pb-1 pr-3 font-medium">Status</th>
            <th className="pb-1 pr-3 font-medium">Priority</th>
            <th className="pb-1 pr-3 font-medium">Reporter</th>
            <th className="pb-1 pr-3 font-medium">Resolved by</th>
            <th className="pb-1 font-medium">Closed</th>
          </tr>
        </thead>
        <tbody>
          {blockers.map((blocker) => (
            <tr
              key={blocker.id}
              onClick={() => openBlocker(blocker.url)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openBlocker(blocker.url);
                }
              }}
              tabIndex={0}
              aria-label={`Open T${blocker.id} — ${blocker.title}`}
              className="border-b border-gray-700/50 hover:bg-gray-700/40 cursor-pointer transition-colors focus:outline-none focus:bg-gray-700/40"
              title={`Open T${blocker.id} in Phabricator`}
            >
              <td className="py-1.5 pr-2 font-mono text-gray-500">T{blocker.id}</td>
              <td className="py-1.5 pr-3 text-gray-200 max-w-[200px]">
                <span className="truncate block" title={blocker.title}>
                  {blocker.title}
                </span>
              </td>
              <td className="py-1.5 pr-3"><SubtypeBadge subtype={blocker.subtype} /></td>
              <td className="py-1.5 pr-3"><StatusBadge status={blocker.statusRaw} /></td>
              <td className="py-1.5 pr-3"><PriorityDot priority={blocker.priority} /></td>
              <td className="py-1.5 pr-3 text-gray-400">{blocker.authorUsername ?? '—'}</td>
              <td className="py-1.5 pr-3 text-gray-400">{blocker.closerUsername ?? '—'}</td>
              <td className="py-1.5"><RelativeTime iso={blocker.closedAt} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
