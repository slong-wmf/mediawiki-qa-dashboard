import { Fragment, useState } from 'react';

/**
 * Sortable expandable table grouping flaky tests by repo (with a job-name
 * fallback when the underlying row has no repo column).
 *
 * Columns: Repo / Job, Tests (number of distinct flaky tests in the bucket),
 *          Total Count (sum of flaky-occurrence counts).
 *
 * @param {{
 *   groups: Array<{ key: string, totalCount: number, tests: Array<import('../../services/flakyTests.js').FlakyTestRow> }>,
 * }} props
 */
export function FlakyByRepoTable({ groups }) {
  const [sortKey, setSortKey] = useState('totalCount');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null);

  const sortValue = (g) => {
    if (sortKey === 'testCount') return g.tests.length;
    if (sortKey === 'key') return g.key;
    return g.totalCount;
  };

  const sorted = [...groups].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const av = sortValue(a);
    const bv = sortValue(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const header = (key, label, align = 'left') => {
    const active = sortKey === key;
    const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '';
    return (
      <th
        className={`pb-1 pr-3 font-medium cursor-pointer select-none text-${align} hover:text-gray-200`}
        onClick={() => {
          if (active) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
          else { setSortKey(key); setSortDir('desc'); }
        }}
        title={`Sort by ${label}`}
      >
        {label} {arrow && <span className="text-gray-500">{arrow}</span>}
      </th>
    );
  };

  return (
    <div className="overflow-y-auto max-h-96">
      <table className="w-full text-xs text-left">
        <thead className="sticky top-0 bg-gray-800">
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="w-5"></th>
            {header('key', 'Repo / Job')}
            {header('testCount', 'Flaky tests', 'right')}
            {header('totalCount', 'Total occurrences', 'right')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => {
            const isOpen = expanded === g.key;
            return (
              <Fragment key={g.key}>
                <tr
                  className="border-b border-gray-700/40 hover:bg-gray-700/40 cursor-pointer transition-colors"
                  onClick={() => setExpanded(isOpen ? null : g.key)}
                  aria-expanded={isOpen}
                >
                  <td className="py-1 pr-1 text-gray-500 text-center">{isOpen ? '▾' : '▸'}</td>
                  <td className="py-1 pr-3 text-blue-300 font-mono">{g.key}</td>
                  <td className="py-1 pr-3 text-right text-gray-100">{g.tests.length}</td>
                  <td className="py-1 pr-3 text-right font-medium text-rose-300">{g.totalCount}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td></td>
                    <td colSpan={3} className="py-2 pl-1 pr-3">
                      <ul className="list-disc pl-4 text-gray-400 space-y-0.5">
                        {[...g.tests]
                          .sort((a, b) => b.count - a.count)
                          .map((t, i) => (
                            <li key={`${g.key}-${i}`} className="flex justify-between gap-3">
                              <span className="font-mono break-all">
                                {t.name ?? '(unnamed test)'}
                              </span>
                              <span className="text-rose-300 tabular-nums shrink-0">{t.count}</span>
                            </li>
                          ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
