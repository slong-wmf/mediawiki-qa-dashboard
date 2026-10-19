import { Fragment, useState } from 'react';

/**
 * Aggregate 7-day pass rate across all of a repo's daily jobs.
 * Returns null when the repo has no daily jobs or no runs to divide by, so the
 * cell renderer and sort comparator agree on the "no data" sentinel.
 */
export function aggregatePassRate(repo) {
  const jobs = Array.isArray(repo?.dailyJobs) ? repo.dailyJobs : [];
  let passes = 0;
  let total = 0;
  for (const j of jobs) {
    passes += j.passes ?? 0;
    total += j.total ?? 0;
  }
  return total === 0 ? null : passes / total;
}

function PassRateCell({ rate }) {
  if (rate == null) {
    return <span className="text-gray-600" title="No Catalyst daily job">—</span>;
  }
  const pct = Math.round(rate * 100);
  const colour =
    rate >= 0.95 ? 'text-emerald-300'
    : rate >= 0.85 ? 'text-amber-300'
    : 'text-rose-300';
  return <span className={colour}>{pct}%</span>;
}

function DailyCell({ jobs }) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return <span className="text-gray-600" title="No Catalyst daily job">—</span>;
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
        const flaky = typeof j.flaky === 'number' ? j.flaky : 0;
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
            {flaky > 0 && (
              <span
                className="ml-1.5 text-orange-400"
                title={`${flaky} of ${j.total} runs passed only on retry`}
              >
                {flaky} flaky
              </span>
            )}
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
 *
 * `gatedJob` is the gated selenium job from the scanner. If the scanner sends
 * it, the Gated column links to that job.
 */
export function TestsTable({ repos, maxHeightClass = 'max-h-96', forceExpand = false, gatedJob = null }) {
  const [sortKey, setSortKey] = useState('testCount');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null);

  const sortValue = (repo) => {
    if (sortKey === 'daily' || sortKey === 'passRate') {
      // Sort by aggregate pass rate over the repo's daily jobs (7d window).
      // null (no daily jobs) sinks below any real rate.
      return aggregatePassRate(repo) ?? -1;
    }
    return repo[sortKey];
  };

  const sorted = [...repos].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;

    if (sortKey === 'daily' || sortKey === 'passRate') {
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
            {header('gatedSelenium', 'Gated', 'left', gatedJob ? `Gated selenium: ● when the repo’s selenium tests run in the gated ${gatedJob.name} CI job. The ● links to the job.` : null)}
            {header('passRate', 'Pass Rate', 'right', 'Aggregate pass rate across the repo’s Catalyst daily jobs over their last 7 completed builds. Retries that pass (U) count as passes.')}
            {header('daily', 'Catalyst (7d)', 'left', 'Pass/total over the last 7 completed builds of the repo’s catalyst-daily-* job, which runs its tests daily against a Catalyst environment. P = passed, U = passed on retry (Jenkins UNSTABLE; counted as a pass), F = failed. “N flaky” counts the U runs. The Beta Cluster selenium-daily-beta-* jobs are no longer available.')}
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
                    {repo.gatedSelenium && gatedJob?.url ? (
                      <a
                        href={gatedJob.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-300 hover:text-amber-200"
                        title={`Gated selenium: ${gatedJob.name}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        ●
                      </a>
                    ) : repo.gatedSelenium ? (
                      <span className="text-amber-300" title="Gated selenium">●</span>
                    ) : (
                      <span className="text-gray-600" title="Not gated">○</span>
                    )}
                  </td>
                  <td className="py-1 pr-3 font-mono text-right w-16">
                    <PassRateCell rate={aggregatePassRate(repo)} />
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
                    <td colSpan={8} className="py-2 pl-1 pr-3">
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
                    <td colSpan={8} className="py-1 pl-1 pr-3 text-gray-500 italic">
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
