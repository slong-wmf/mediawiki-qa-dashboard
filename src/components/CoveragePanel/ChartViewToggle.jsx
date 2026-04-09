/**
 * Segmented "Top 15 / Lowest 15 / Table" toggle above the coverage chart.
 */
export function ChartViewToggle({ view, onChange }) {
  return (
    <div className="flex rounded overflow-hidden border border-gray-600 text-xs" role="group" aria-label="Chart view">
      <button
        onClick={() => onChange('top')}
        aria-pressed={view === 'top'}
        className={`px-2 py-0.5 transition-colors ${
          view === 'top' ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
        }`}
      >
        Top 15
      </button>
      <button
        onClick={() => onChange('lowest')}
        aria-pressed={view === 'lowest'}
        className={`px-2 py-0.5 transition-colors ${
          view === 'lowest' ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
        }`}
      >
        Lowest 15
      </button>
      <button
        onClick={() => onChange('table')}
        aria-pressed={view === 'table'}
        className={`px-2 py-0.5 transition-colors ${
          view === 'table' ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
        }`}
      >
        Table
      </button>
    </div>
  );
}
