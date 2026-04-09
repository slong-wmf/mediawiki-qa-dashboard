import { StatusBadge } from '../shared/StatusBadge.jsx';
import { PriorityDot } from '../shared/PriorityDot.jsx';
import { RelativeTime } from '../shared/RelativeTime.jsx';
import { TagList } from './TagList.jsx';

/**
 * Active Bugs table — sorted rows with clickable/keyboard-accessible rows
 * that open the Phabricator task in a new tab. The T# column has its own
 * anchor so assistive tech users can focus it directly.
 */
export function BugsTable({ tasks }) {
  const openTask = (url) => window.open(url, '_blank', 'noopener,noreferrer');

  if (tasks.length === 0) {
    return <p className="text-gray-500 text-sm italic">No tasks match the current filter.</p>;
  }

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-72">
      <table className="w-full text-xs text-left">
        <thead className="sticky top-0 bg-gray-800">
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="pb-1 pr-2 font-medium w-12">T#</th>
            <th className="pb-1 pr-2 font-medium">Title</th>
            <th className="pb-1 pr-2 font-medium w-24">Status</th>
            <th className="pb-1 pr-2 font-medium w-24">Priority</th>
            <th className="pb-1 pr-2 font-medium">Tags</th>
            <th className="pb-1 font-medium w-16">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              onClick={() => openTask(task.url)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openTask(task.url);
                }
              }}
              tabIndex={0}
              aria-label={`Open T${task.id} — ${task.title}`}
              className="border-b border-gray-700/40 hover:bg-gray-700/40 cursor-pointer transition-colors focus:outline-none focus:bg-gray-700/40"
              title={`Open T${task.id} on Phabricator`}
            >
              <td className="py-1.5 pr-2 text-gray-500 font-mono">
                <a
                  href={task.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-blue-400 transition-colors"
                >
                  T{task.id}
                </a>
              </td>
              <td className="py-1.5 pr-2 text-gray-200 max-w-[160px]">
                <span className="block truncate" title={task.title}>
                  {task.isNew && (
                    <span className="mr-1 text-green-500 font-semibold" title="Filed this week">NEW</span>
                  )}
                  {task.title}
                </span>
              </td>
              <td className="py-1.5 pr-2"><StatusBadge status={task.statusGroup} /></td>
              <td className="py-1.5 pr-2"><PriorityDot priority={task.priority} /></td>
              <td className="py-1.5 pr-2 max-w-[180px]">
                <TagList names={task.projectNames ?? []} count={task.projectCount ?? 0} />
              </td>
              <td className="py-1.5 text-right">
                <RelativeTime iso={task.modifiedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
