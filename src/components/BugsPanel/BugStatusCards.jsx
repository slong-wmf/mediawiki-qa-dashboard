import { STATUS_GROUPS, STATUS_META } from '../../constants/phabricator.js';

/**
 * Row of clickable status-group cards (Open / In Progress / Stalled / …).
 * Clicking a card filters the bugs table; clicking the active card clears it.
 *
 * @param {{
 *   countByGroup: Record<string, number>,
 *   activeGroup: string|null,
 *   onChange: (group: string|null) => void,
 * }} props
 */
export function BugStatusCards({ countByGroup, activeGroup, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-xs text-center">
      {STATUS_GROUPS.filter((g) => countByGroup[g] > 0).map((g) => {
        const m        = STATUS_META[g];
        const isActive = activeGroup === g;
        return (
          <button
            key={g}
            onClick={() => onChange(isActive ? null : g)}
            aria-pressed={isActive}
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
  );
}
