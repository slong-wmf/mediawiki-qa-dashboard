import { useId } from 'react';

/**
 * Steward select + clear button. Renders a loading placeholder or error
 * message when maintainer data is still arriving or failed to load.
 */
export function StewardFilter({
  maintainers,
  maintainersError,
  stewardList,
  activeSteward,
  onChange,
}) {
  const selectId = useId();

  if (!maintainers && !maintainersError) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">Loading steward info…</span>
      </div>
    );
  }

  if (maintainersError) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-red-400" title={maintainersError.message}>
          Steward info unavailable
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor={selectId} className="text-xs text-gray-500">Steward:</label>
      <select
        id={selectId}
        value={activeSteward ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-xs rounded border border-gray-600 bg-gray-800 text-gray-300 px-1 py-0.5 max-w-[200px]"
      >
        <option value="">All stewards</option>
        {stewardList.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {activeSteward && (
        <button
          onClick={() => onChange(null)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          aria-label="Clear steward filter"
        >
          Clear ×
        </button>
      )}
    </div>
  );
}
