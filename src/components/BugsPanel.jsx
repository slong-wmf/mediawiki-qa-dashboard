import { useState } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_GROUPS = ['open', 'in-progress', 'stalled', 'needs-triage', 'other'];
const STATUS_META   = {
  'open':         { label: 'Open',         colour: 'bg-blue-500',   text: 'text-blue-300',   border: 'border-blue-600'   },
  'in-progress':  { label: 'In Progress',  colour: 'bg-amber-500',  text: 'text-amber-300',  border: 'border-amber-600'  },
  'stalled':      { label: 'Stalled',      colour: 'bg-gray-500',   text: 'text-gray-300',   border: 'border-gray-600'   },
  'needs-triage': { label: 'Needs Triage', colour: 'bg-purple-500', text: 'text-purple-300', border: 'border-purple-600' },
  'other':        { label: 'Other',        colour: 'bg-slate-500',  text: 'text-slate-300',  border: 'border-slate-600'  },
};

const PRIORITY_META = {
  'unbreak-now':  { label: 'Unbreak Now!', colour: 'text-red-400',    dot: 'bg-red-400'    },
  'needs-triage': { label: 'Needs Triage', colour: 'text-purple-400', dot: 'bg-purple-400' },
  'high':         { label: 'High',         colour: 'text-orange-400', dot: 'bg-orange-400' },
  'normal':       { label: 'Normal',       colour: 'text-gray-300',   dot: 'bg-gray-400'   },
  'low':          { label: 'Low',          colour: 'text-gray-500',   dot: 'bg-gray-500'   },
  'wishlist':     { label: 'Wishlist',     colour: 'text-gray-600',   dot: 'bg-gray-600'   },
};

// ── Sub-components ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="flex gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-700 rounded flex-1" />)}
      </div>
      <div className="h-48 bg-gray-700 rounded" />
    </div>
  );
}

function StatusBadge({ group }) {
  const m = STATUS_META[group] ?? STATUS_META.other;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${m.text} ${m.border} bg-transparent`}>
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

function RelativeTime({ iso }) {
  if (!iso) return <span className="text-gray-600">—</span>;
  const diff = Date.now() - new Date(iso).getTime();
  const h    = Math.floor(diff / 3_600_000);
  const d    = Math.floor(diff / 86_400_000);
  const label = d >= 1 ? `${d}d ago` : h >= 1 ? `${h}h ago` : 'just now';
  return <span className="text-gray-400" title={new Date(iso).toLocaleString()}>{label}</span>;
}

// ── Main component ──────────────────────────────────────────────────────────

/**
 * Phabricator Bugs panel.
 *
 * Shows open Phabricator tasks modified within the past 7 days, grouped and
 * filterable by status.  Tasks with bug-signal keywords in their title are
 * flagged separately as "suspected bugs".
 *
 * ⚠ Limitation: Bugs noted in *comments* on existing tasks cannot be detected
 * via the Conduit API without downloading every transaction; this panel surfaces
 * title-keyword matches as a proxy and notes the gap explicitly.
 *
 * @param {{ bugs: { tasks, totalFetched, hasMore, cutoffDate }|null, error: Error|null, loading: boolean }} props
 */
export default function BugsPanel({ bugs, error, loading }) {
  const [activeGroup, setActiveGroup] = useState(null); // status group filter
  const [showAll,     setShowAll]     = useState(false); // toggle suspected-bugs-only vs all

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="bg-red-900 border border-red-600 text-red-200 rounded p-3 text-sm">
        Phabricator data unavailable: {error.message}
      </div>
    );
  }

  if (!bugs || bugs.tasks.length === 0) {
    return (
      <p className="text-gray-500 text-sm italic">
        No open tasks modified in the past 7 days.
      </p>
    );
  }

  const { tasks, totalFetched, hasMore, cutoffDate } = bugs;

  // ── Aggregates ──────────────────────────────────────────────────────────
  const countByGroup = Object.fromEntries(
    STATUS_GROUPS.map((g) => [g, tasks.filter((t) => t.statusGroup === g).length]),
  );
  const suspectedBugs = tasks.filter((t) => t.isSuspectedBug);
  const newTaskCount  = tasks.filter((t) => t.isNew).length;

  // ── Filtered table rows ──────────────────────────────────────────────────
  const baseList = showAll ? tasks : suspectedBugs.length > 0 ? suspectedBugs : tasks;
  const filtered = activeGroup
    ? baseList.filter((t) => t.statusGroup === activeGroup)
    : baseList;
  // Sort: unbreak-now first, then by most recently modified
  const sorted = [...filtered].sort((a, b) => {
    if (b.priorityValue !== a.priorityValue) return b.priorityValue - a.priorityValue;
    return new Date(b.modifiedAt) - new Date(a.modifiedAt);
  });

  return (
    <div className="space-y-4">

      {/* ── Headline counts ── */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-3xl font-bold text-white leading-none">{totalFetched}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            open tasks active in the past 7 days
            {hasMore && <span className="text-amber-400"> (200+ — showing first 200)</span>}
          </p>
        </div>
        <div className="text-right text-xs text-gray-500 leading-snug">
          <span className="text-amber-300 font-medium">{suspectedBugs.length}</span> suspected bugs
          <br />
          <span className="text-green-400 font-medium">{newTaskCount}</span> newly filed this week
        </div>
      </div>

      {/* ── Status group cards ── */}
      <div className="grid grid-cols-4 gap-2 text-xs text-center">
        {STATUS_GROUPS.filter((g) => countByGroup[g] > 0).map((g) => {
          const m       = STATUS_META[g];
          const isActive = activeGroup === g;
          return (
            <button
              key={g}
              onClick={() => setActiveGroup(isActive ? null : g)}
              title={`Filter to ${m.label} tasks`}
              className={`rounded p-2 border transition-colors ${
                isActive
                  ? `${m.border} ${m.text} bg-gray-700`
                  : 'border-gray-700 text-gray-400 bg-gray-700/40 hover:bg-gray-700'
              }`}
            >
              <div className={`text-base font-bold ${isActive ? m.text : 'text-gray-200'}`}>
                {countByGroup[g]}
              </div>
              <div className="mt-0.5 leading-tight">{m.label}</div>
            </button>
          );
        })}
      </div>

      {/* ── Scope toggle + filter bar ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
          <button
            onClick={() => setShowAll(false)}
            className={`px-2 py-0.5 transition-colors ${
              !showAll ? 'bg-amber-700 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
            title="Show only tasks with bug-signal keywords in their title"
          >
            Suspected bugs ({suspectedBugs.length})
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`px-2 py-0.5 transition-colors ${
              showAll ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
            title="Show all open tasks modified this week"
          >
            All tasks ({totalFetched})
          </button>
        </div>
        {activeGroup && (
          <button
            onClick={() => setActiveGroup(null)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Clear filter ×
          </button>
        )}
      </div>

      {/* ── Limitation note ── */}
      <p className="text-xs text-gray-600 leading-snug border-l-2 border-gray-700 pl-2">
        <span className="text-gray-500">⚠ Bugs noted in comments</span> on existing tasks cannot
        be detected via the Phabricator API without fetching every transaction.
        "Suspected bugs" are flagged by title keywords only — check individual tasks
        for in-thread bug reports.
      </p>

      {/* ── Task table ── */}
      {sorted.length === 0 ? (
        <p className="text-gray-500 text-sm italic">No tasks match the current filter.</p>
      ) : (
        <div className="overflow-y-auto max-h-72">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="pb-1 pr-2 font-medium w-12">T#</th>
                <th className="pb-1 pr-2 font-medium">Title</th>
                <th className="pb-1 pr-2 font-medium w-28">Status</th>
                <th className="pb-1 pr-2 font-medium w-28">Priority</th>
                <th className="pb-1 font-medium w-16">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => window.open(task.url, '_blank', 'noopener')}
                  className="border-b border-gray-700/40 hover:bg-gray-700/40 cursor-pointer transition-colors"
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
                  <td className="py-1.5 pr-2 text-gray-200 max-w-xs">
                    <span className="block truncate" title={task.title}>
                      {task.isSuspectedBug && !showAll && (
                        <span className="text-amber-400 mr-1" title="Suspected bug (keyword match)">🐛</span>
                      )}
                      {task.isNew && (
                        <span className="mr-1 text-green-500 font-semibold" title="Filed this week">NEW</span>
                      )}
                      {task.title}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <StatusBadge group={task.statusGroup} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <PriorityDot priority={task.priority} />
                  </td>
                  <td className="py-1.5 text-right">
                    <RelativeTime iso={task.modifiedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      )}

    </div>
  );
}
