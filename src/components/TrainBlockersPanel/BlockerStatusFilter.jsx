import { STATUS_META } from '../../constants/phabricator.js';

/**
 * Row of pill-shaped status filters. Each pill shows "{label} ({count})"
 * and toggles its corresponding status filter on/off when clicked.
 *
 * @param {{
 *   blockers: Array,
 *   activeStatus: string|null,
 *   onChange: (status: string|null) => void,
 * }} props
 */
export function BlockerStatusFilter({ blockers, activeStatus, onChange }) {
  const statuses = [...new Set(blockers.map((b) => b.statusRaw))];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {activeStatus && (
        <button
          onClick={() => onChange(null)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Clear filter ×
        </button>
      )}
      {statuses.map((status) => {
        const count    = blockers.filter((b) => b.statusRaw === status).length;
        const m        = STATUS_META[status] ?? { label: status, text: 'text-gray-300', border: 'border-gray-600' };
        const isActive = activeStatus === status;
        return (
          <button
            key={status}
            onClick={() => onChange(isActive ? null : status)}
            aria-pressed={isActive}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              isActive
                ? `${m.border} ${m.text} bg-gray-700`
                : 'border-gray-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {m.label} ({count})
          </button>
        );
      })}
    </div>
  );
}
