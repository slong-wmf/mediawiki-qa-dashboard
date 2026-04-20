/**
 * Five-up headline stat cards summarising the inventory. `visible` reflects the
 * current framework/search filters; `total` is the unfiltered post-steward
 * baseline. When they differ, each card shows "X of Y" so filters don't make
 * the numbers lie.
 */
export function StatsCards({ visible, total }) {
  const cards = [
    { label: 'Repos',   value: visible.repoCount,    of: total.repoCount,    colour: 'text-blue-300' },
    { label: 'Tests',   value: visible.testCount,    of: total.testCount,    colour: 'text-blue-300' },
    { label: 'WDIO',    value: visible.wdioCount,    of: total.wdioCount,    colour: 'text-emerald-300' },
    { label: 'Cypress', value: visible.cypressCount, of: total.cypressCount, colour: 'text-indigo-300' },
    { label: 'Gated',   value: visible.gatedCount,   of: total.gatedCount,   colour: 'text-amber-300' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
      {cards.map((c) => {
        const filtered = c.value !== c.of;
        return (
          <div
            key={c.label}
            className="rounded p-2 bg-gray-700/50"
            title={filtered ? `${c.label}: ${c.value} of ${c.of}` : `${c.label}: ${c.value}`}
          >
            <div className={`font-bold text-base ${c.colour}`}>
              {c.value}
              {filtered && <span className="text-gray-500 font-normal"> of {c.of}</span>}
            </div>
            <div className="text-gray-400">{c.label}</div>
          </div>
        );
      })}
    </div>
  );
}
