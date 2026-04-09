import { useState } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_META = {
  'open':         { label: 'Open',         text: 'text-blue-300',   border: 'border-blue-600'   },
  'in-progress':  { label: 'In Progress',  text: 'text-amber-300',  border: 'border-amber-600'  },
  'stalled':      { label: 'Stalled',      text: 'text-gray-300',   border: 'border-gray-600'   },
  'needs-triage': { label: 'Needs Triage', text: 'text-purple-300', border: 'border-purple-600' },
  'resolved':     { label: 'Resolved',     text: 'text-green-300',  border: 'border-green-600'  },
  'declined':     { label: 'Declined',     text: 'text-gray-400',   border: 'border-gray-600'   },
  'invalid':      { label: 'Invalid',      text: 'text-gray-400',   border: 'border-gray-600'   },
  'wontfix':      { label: 'Won\'t Fix',   text: 'text-gray-400',   border: 'border-gray-600'   },
  'duplicate':    { label: 'Duplicate',    text: 'text-gray-400',   border: 'border-gray-600'   },
};

const SUBTYPE_META = {
  'error':    { label: 'Production Error', text: 'text-red-300',    border: 'border-red-700'    },
  'bug':      { label: 'Bug',              text: 'text-orange-300', border: 'border-orange-700' },
  'security': { label: 'Security',         text: 'text-yellow-300', border: 'border-yellow-700' },
  'default':  { label: 'Task',             text: 'text-gray-300',   border: 'border-gray-600'   },
};

const PRIORITY_META = {
  'unbreak-now':  { label: 'Unbreak Now!', colour: 'text-red-400',    dot: 'bg-red-400'    },
  'needs-triage': { label: 'Needs Triage', colour: 'text-purple-400', dot: 'bg-purple-400' },
  'high':         { label: 'High',         colour: 'text-orange-400', dot: 'bg-orange-400' },
  'normal':       { label: 'Normal',       colour: 'text-gray-300',   dot: 'bg-gray-400'   },
  'low':          { label: 'Low',          colour: 'text-gray-500',   dot: 'bg-gray-500'   },
  'wishlist':     { label: 'Wishlist',     colour: 'text-gray-600',   dot: 'bg-gray-600'   },
};

// ── Sub-components ───────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-12 bg-gray-700 rounded" />
      <div className="h-48 bg-gray-700 rounded" />
    </div>
  );
}

function StatusBadge({ statusRaw }) {
  const m = STATUS_META[statusRaw] ?? { label: statusRaw, text: 'text-gray-300', border: 'border-gray-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border bg-transparent ${m.text} ${m.border}`}>
      {m.label}
    </span>
  );
}

function SubtypeBadge({ subtype }) {
  const m = SUBTYPE_META[subtype] ?? SUBTYPE_META.default;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border bg-transparent ${m.text} ${m.border}`}>
      {m.label}
    </span>
  );
}

function PriorityDot({ priority }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={m.label}>
      <span className={`w-2 h-2 rounded-full inline-block ${m.dot}`} />
      <span className={m.colour}>{m.label}</span>
    </span>
  );
}

/**
 * Shows a human-readable relative time (e.g. "3d ago") with the full
 * date/time as a tooltip.
 */
function RelativeTime({ iso }) {
  if (!iso) return <span className="text-gray-600">—</span>;
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor(diff / 3_600_000);
  const label = d >= 1 ? `${d}d ago` : h >= 1 ? `${h}h ago` : 'just now';
  return <span className="text-gray-400" title={new Date(iso).toLocaleString()}>{label}</span>;
}

// ── Main component ───────────────────────────────────────────────────────────

/**
 * Train Blockers panel.
 *
 * Shows the subtask blockers from the most recently resolved weekly train
 * deployment task, along with the reporter and whoever resolved each blocker.
 *
 * @param {{ trainBlockers: object|null, error: Error|null, loading: boolean }} props
 */
export default function TrainBlockersPanel({ trainBlockers, error, loading }) {
  const [activeStatus, setActiveStatus] = useState(null);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="bg-red-900 border border-red-600 text-red-200 rounded p-3 text-sm">
        Train blockers unavailable: {error.message}
      </div>
    );
  }

  if (!trainBlockers) {
    return <p className="text-gray-500 text-sm italic">No train blocker data available.</p>;
  }

  const { trainTask, blockers, totalBlockers } = trainBlockers;

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = activeStatus
    ? blockers.filter((b) => b.statusRaw === activeStatus)
    : blockers;

  // Sort: unresolved first (by priority desc), then resolved (by close date desc)
  const sorted = [...filtered].sort((a, b) => {
    const aResolved = a.statusRaw === 'resolved';
    const bResolved = b.statusRaw === 'resolved';
    if (aResolved !== bResolved) return aResolved ? 1 : -1;
    if (b.priorityValue !== a.priorityValue) return b.priorityValue - a.priorityValue;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // ── Status summary counts ─────────────────────────────────────────────────
  const resolvedCount   = blockers.filter((b) => b.statusRaw === 'resolved').length;
  const unresolvedCount = totalBlockers - resolvedCount;

  return (
    <div className="space-y-4">

      {/* ── Train task header ── */}
      <div className="bg-gray-700/40 border border-gray-700 rounded p-3 flex items-start justify-between gap-4">
        <div>
          <a
            href={trainTask.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-blue-400 hover:underline"
          >
            {trainTask.version
              ? `MediaWiki ${trainTask.version}`
              : trainTask.title}
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

      {/* ── Headline counts ── */}
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

      {/* ── Empty state ── */}
      {totalBlockers === 0 ? (
        <p className="text-gray-500 text-sm italic">This train had no filed blockers.</p>
      ) : (
        <>
          {/* ── Status filter pills ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeStatus && (
              <button
                onClick={() => setActiveStatus(null)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Clear filter ×
              </button>
            )}
            {[...new Set(blockers.map((b) => b.statusRaw))].map((status) => {
              const count = blockers.filter((b) => b.statusRaw === status).length;
              const m     = STATUS_META[status] ?? { label: status, text: 'text-gray-300', border: 'border-gray-600' };
              const isActive = activeStatus === status;
              return (
                <button
                  key={status}
                  onClick={() => setActiveStatus(isActive ? null : status)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    isActive
                      ? `${m.border} ${m.text} bg-gray-700`
                      : 'border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {m.label ?? status} ({count})
                </button>
              );
            })}
          </div>

          {/* ── Blocker table ── */}
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
                {sorted.map((blocker) => (
                  <tr
                    key={blocker.id}
                    onClick={() => window.open(blocker.url, '_blank', 'noopener')}
                    className="border-b border-gray-700/50 hover:bg-gray-700/40 cursor-pointer transition-colors"
                    title={`Open T${blocker.id} in Phabricator`}
                  >
                    <td className="py-1.5 pr-2 font-mono text-gray-500">
                      T{blocker.id}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-200 max-w-[200px]">
                      <span className="truncate block" title={blocker.title}>
                        {blocker.title}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <SubtypeBadge subtype={blocker.subtype} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <StatusBadge statusRaw={blocker.statusRaw} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <PriorityDot priority={blocker.priority} />
                    </td>
                    <td className="py-1.5 pr-3 text-gray-400">
                      {blocker.authorUsername ?? '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-400">
                      {blocker.closerUsername ?? '—'}
                    </td>
                    <td className="py-1.5">
                      <RelativeTime iso={blocker.closedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Footnote ── */}
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
