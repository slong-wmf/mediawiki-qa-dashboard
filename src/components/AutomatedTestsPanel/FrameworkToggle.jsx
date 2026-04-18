const OPTIONS = [
  { key: 'all',     label: 'All' },
  { key: 'wdio',    label: 'WDIO' },
  { key: 'cypress', label: 'Cypress' },
];

/**
 * Segmented control that narrows the repos table to a single framework.
 * Matches the visual style of PassFailPanel/ViewToggle.
 */
export function FrameworkToggle({ value, onChange, counts }) {
  return (
    <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
      {OPTIONS.map((opt) => {
        const selected = value === opt.key;
        const count = counts?.[opt.key];
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={selected}
            className={`px-2 py-0.5 transition-colors ${
              selected ? 'bg-indigo-700 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {opt.label}
            {typeof count === 'number' && (
              <span className="ml-1 text-gray-400">({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
