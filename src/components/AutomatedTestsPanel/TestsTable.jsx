import { Fragment, useState } from 'react';

function DailyCell({ jobs }) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return <span className="text-gray-600" title="No daily Jenkins job">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 font-mono">
      {jobs.map((j) => {
        if ((j.total ?? 0) === 0) {
          return (
            <span key={j.name} className="text-gray-500" title={j.name}>
              no runs
            </span>
          );
        }
        const allPass = j.passes === j.total;
        const countColour = allPass ? 'text-emerald-300' : 'text-rose-300';
        const results = Array.isArray(j.results) ? j.results : [];
        return (
          <a
            key={j.name}
            href={j.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            title={j.name}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={countColour}>{j.passes}/{j.total}</span>
            {results.length > 0 && (
              <span className="ml-1.5 tracking-tight">
                {results.map((r, i) => (
                  <span
                    key={i}
                    className={
                      r === 'P'
                        ? 'text-emerald-300'
                        : r === 'U'
                          ? 'text-orange-400'
                          : 'text-rose-300'
                    }
                  >
                    {r}
                  </span>
                ))}
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}

const FRAMEWORK_LABEL = { wdio: 'WDIO', cypress: 'Cypress', other: 'Other' };
const FRAMEWORK_CLASS = {
  wdio: 'text-emerald-300',
  cypress: 'text-indigo-300',
  other: 'text-gray-400',
};

/**
 * Sortable table of repos with an expandable row that reveals the individual
 * test names. Columns: Repo, Framework, Version, MW version, Gated, Tests.
 *
 * Sort is handled locally — click a header to toggle direction.
 */
export function TestsTable({ repos, maxHeightClass = 'max-h-96', forceExpand = false }) {
  const [sortKey, setSortKey] = useState('testCount');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null);

  const sortValue = (repo) => {
    if (sortKey === 'daily') {
      // Sort by pass rate over the repo's daily jobs (7d window).
      const totals = (repo.dailyJobs ?? []).reduce(
        (acc, j) => ({ p: acc.p + (j.passes ?? 0), t: acc.t + (j.total ?? 0) }),
        { p: 0, t: 0 },
      );
      return totals.t === 0 ? -1 : totals.p / totals.t;
    }
    return repo[sortKey];
  };

  const sorted = [...repos].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;

    if (sortKey === 'daily') {
      // Pin repos with daily jobs above repos without, regardless of direction.
      const aHas = Array.isArray(a.dailyJobs) && a.dailyJobs.length > 0;
      const bHas = Array.isArray(b.dailyJobs) && b.dailyJobs.length > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
    }

    const av = sortValue(a);
    const bv = sortValue(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const header = (key, label, align = 'left', info = null) => {
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
        {label}
        {info && (
          <span
            className="ml-1 text-gray-500 cursor-help"
            title={info}
            onClick={(e) => e.stopPropagation()}
          >
            ⓘ
          </span>
        )}
        {arrow && <span className="ml-1 text-gray-500">{arrow}</span>}
      </th>
    );
  };

  return (
    <div className={`overflow-y-auto ${maxHeightClass}`}>
      <table className="w-full text-xs text-left">
        <thead className="sticky top-0 bg-gray-800">
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="w-5"></th>
            {header('name', 'Repo')}
            {header('framework', 'Framework')}
            {header('frameworkVersion', 'Version')}
            {header('mediawikiVersion', 'wdio-mediawiki version')}
            {header('gatedSelenium', 'Gated')}
            {header('daily', 'Daily (7d)', 'left', 'P = passed, U = passed on retry (Jenkins UNSTABLE; counted as a pass), F = failed')}
            {header('testCount', 'Tests', 'right')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((repo) => {
            const rowKey = `${repo.name}::${repo.framework}`;
            const isOpen = forceExpand || expanded === rowKey;
            return (
              <Fragment key={rowKey}>
                <tr
                  className="border-b border-gray-700/40 hover:bg-gray-700/40 cursor-pointer transition-colors"
                  onClick={() => setExpanded(isOpen ? null : rowKey)}
                  aria-expanded={isOpen}
                >
                  <td className="py-1 pr-1 text-gray-500 text-center">{isOpen ? '▾' : '▸'}</td>
                  <td className="py-1 pr-3">
                    {repo.url ? (
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {repo.name}
                      </a>
                    ) : (
                      <span className="text-blue-400">{repo.name}</span>
                    )}
                  </td>
                  <td className={`py-1 pr-3 font-medium ${FRAMEWORK_CLASS[repo.framework] ?? FRAMEWORK_CLASS.other}`}>
                    {FRAMEWORK_LABEL[repo.framework] ?? FRAMEWORK_LABEL.other}
                  </td>
                  <td className="py-1 pr-3 text-gray-300 font-mono">{repo.frameworkVersion ?? '—'}</td>
                  <td className="py-1 pr-3 text-gray-300 font-mono">{repo.mediawikiVersion ?? '—'}</td>
                  <td className="py-1 pr-3">
                    {repo.gatedSelenium ? (
                      <span className="text-amber-300" title="Gated selenium">●</span>
                    ) : (
                      <span className="text-gray-600" title="Not gated">○</span>
                    )}
                  </td>
                  <td className="py-1 pr-3">
                    <DailyCell jobs={repo.dailyJobs} />
                  </td>
                  <td className="py-1 pr-3 font-medium text-right text-gray-100">
                    {repo.testCount}
                  </td>
                </tr>
                {isOpen && (repo.tests?.length ?? 0) > 0 && (
                  <tr>
                    <td></td>
                    <td colSpan={7} className="py-2 pl-1 pr-3">
                      <ul className="list-disc pl-4 text-gray-400 space-y-0.5">
                        {repo.tests.map((t, i) => (
                          <li key={`${rowKey}-${i}`}>
                            {t.daily && (
                              <span className="mr-1.5 rounded bg-blue-900/50 px-1 text-[10px] font-medium uppercase tracking-wide text-blue-300">
                                daily
                              </span>
                            )}
                            {t.name}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
                {isOpen && (repo.tests?.length ?? 0) === 0 && (
                  <tr>
                    <td></td>
                    <td colSpan={7} className="py-1 pl-1 pr-3 text-gray-500 italic">
                      No individual test names recorded for this repo.
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
