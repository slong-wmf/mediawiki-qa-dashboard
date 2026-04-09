import { RelativeTime } from '../shared/RelativeTime.jsx';

/**
 * Panel header showing the linked train deployment task, its version,
 * and when/by whom it was closed.
 */
export function TrainTaskHeader({ trainTask }) {
  return (
    <div className="bg-gray-700/40 border border-gray-700 rounded p-3 flex items-start justify-between gap-4">
      <div>
        <a
          href={trainTask.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-blue-400 hover:underline"
        >
          {trainTask.version ? `MediaWiki ${trainTask.version}` : trainTask.title}
        </a>
        <p className="text-xs text-gray-500 mt-0.5">{trainTask.title}</p>
      </div>
      <div className="text-right text-xs text-gray-500 shrink-0">
        {trainTask.closedAt && (
          <span>
            Closed <RelativeTime iso={trainTask.closedAt} />
          </span>
        )}
        {trainTask.closerUsername && (
          <p className="text-gray-600 mt-0.5">by {trainTask.closerUsername}</p>
        )}
      </div>
    </div>
  );
}
