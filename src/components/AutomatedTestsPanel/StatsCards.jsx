/**
 * Four-up headline stat cards summarising the scanner inventory:
 * total repos, total tests, WDIO vs Cypress split, and gated-selenium count.
 */
export function StatsCards({ repoCount, testCount, wdioCount, cypressCount, gatedCount }) {
  const cards = [
    { label: 'Repos',   value: repoCount,    colour: 'text-blue-300' },
    { label: 'Tests',   value: testCount,    colour: 'text-blue-300' },
    { label: 'WDIO',    value: wdioCount,    colour: 'text-emerald-300' },
    { label: 'Cypress', value: cypressCount, colour: 'text-indigo-300' },
    { label: 'Gated',   value: gatedCount,   colour: 'text-amber-300' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded p-2 bg-gray-700/50"
          title={`${c.label}: ${c.value}`}
        >
          <div className={`font-bold text-base ${c.colour}`}>{c.value}</div>
          <div className="text-gray-400">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
