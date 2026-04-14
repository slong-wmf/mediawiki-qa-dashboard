import { useId, useRef, useState, useEffect } from 'react';

/**
 * Steward multi-select dropdown. A compact button shows the current selection;
 * clicking opens a floating checklist. Renders a loading placeholder or error
 * message when maintainer data is still arriving or failed to load.
 *
 * @param {{ activeStewards: string[] }} props
 */
export function StewardFilter({
  maintainers,
  maintainersError,
  stewardList,
  activeStewards,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const listId = useId();

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!maintainers && !maintainersError) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Loading steward info…</span>
      </div>
    );
  }

  if (maintainersError) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400" title={maintainersError.message}>
          Steward info unavailable
        </span>
      </div>
    );
  }

  const toggle = (steward) => {
    if (activeStewards.includes(steward)) {
      onChange(activeStewards.filter((s) => s !== steward));
    } else {
      onChange([...activeStewards, steward]);
    }
  };

  const buttonLabel =
    activeStewards.length === 0
      ? 'All stewards'
      : activeStewards.length === 1
      ? activeStewards[0]
      : `${activeStewards.length} stewards`;

  return (
    <div className="flex items-center gap-2" ref={containerRef}>
      <span className="text-xs text-gray-500">Steward:</span>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          className="flex items-center gap-1 text-xs rounded border border-gray-600 bg-gray-800 text-gray-300 px-2 py-0.5 hover:border-gray-500 transition-colors max-w-[220px]"
        >
          <span className="truncate">{buttonLabel}</span>
          <svg className="shrink-0 w-3 h-3 text-gray-500" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Select stewards"
            className="absolute z-20 mt-1 w-64 max-h-56 overflow-y-auto rounded border border-gray-600 bg-gray-850 shadow-lg"
            style={{ backgroundColor: '#1a1f2e' }}
          >
            {stewardList.map((s) => {
              const checked = activeStewards.includes(s);
              return (
                <label
                  key={s}
                  role="option"
                  aria-selected={checked}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/60 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s)}
                    className="accent-blue-500 shrink-0"
                  />
                  <span className="leading-snug">{s}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {activeStewards.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          aria-label="Clear steward filter"
        >
          Clear ×
        </button>
      )}
    </div>
  );
}
