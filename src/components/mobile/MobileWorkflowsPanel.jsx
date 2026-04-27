/**
 * GitHub Actions workflow-run health for one mobile-app repo.
 *
 * Layout:
 *   1. Headline pass-rate over the visible runs (large number)
 *   2. "Last N runs" coloured-square strip (chronological, newest right)
 *   3. Per-workflow breakdown table — workflow | runs | pass% | avg duration
 *
 * Source-of-truth shape comes from src/services/github/workflows.js. The hook
 * already aggregates `byWorkflow`, so this component is purely presentational.
 */

import { useMemo } from 'react';
import { RunStatusSquares } from './MobileWorkflowsPanel/RunStatusSquares.jsx';
import { formatDuration } from '../../utils/format.js';
import { repoFor } from '../../services/github/repos.js';

function formatPct(numerator, denominator) {
  if (!denominator) return '—';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/**
 * @param {{
 *   data: { runs: Array, byWorkflow: Record<string, { n, passed, failed, avgDurationMs }>, fetchedAt?: string } | null,
 *   error: Error|null,
 *   loading: boolean,
 *   platform: 'ios' | 'android',
 * }} props
 */
export function MobileWorkflowsPanel({ data, error, loading, platform }) {
  // Skeleton/error states are rendered by the <Panel> wrapper in MobileTab —
  // when this child renders, we have data (or an empty fallback after fetch).
  const repo = repoFor(platform);
  const runs = data?.runs ?? [];

  const summary = useMemo(() => {
    const passed = runs.filter((r) => r.conclusion === 'success').length;
    const failed = runs.filter((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out').length;
    const completed = passed + failed;
    return { passed, failed, completed, total: runs.length };
  }, [runs]);

  const sortedWorkflows = useMemo(() => {
    const entries = Object.entries(data?.byWorkflow ?? {});
    return entries.sort((a, b) => b[1].n - a[1].n);
  }, [data?.byWorkflow]);

  if (loading || error) return null; // Panel wrapper handles these states.

  if (runs.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No recent workflow runs found for{' '}
        <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          {repo.fullName}
        </a>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline pass rate */}
      <div className="flex items-baseline gap-3">
        <p className="text-3xl font-bold text-emerald-300">
          {formatPct(summary.passed, summary.completed)}
        </p>
        <p className="text-xs text-gray-400">
          pass rate · {summary.passed} passed / {summary.failed} failed
          {summary.total !== summary.completed && (
            <> · {summary.total - summary.completed} other</>
          )}{' '}
          across last {summary.total} runs
        </p>
      </div>

      {/* Last-N runs strip */}
      <div>
        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Recent runs (oldest → newest)</p>
        <RunStatusSquares runs={runs} />
      </div>

      {/* Per-workflow table */}
      <div>
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">By workflow</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-400 border-b border-gray-700">
              <tr>
                <th className="text-left py-1 pr-2 font-medium">Workflow</th>
                <th className="text-right py-1 px-2 font-medium">Runs</th>
                <th className="text-right py-1 px-2 font-medium">Pass</th>
                <th className="text-right py-1 pl-2 font-medium">Avg duration</th>
              </tr>
            </thead>
            <tbody className="text-gray-200">
              {sortedWorkflows.map(([name, stats]) => {
                const completed = stats.passed + stats.failed;
                return (
                  <tr key={name} className="border-b border-gray-800 last:border-0 hover:bg-gray-700/30">
                    <td className="py-1.5 pr-2 truncate max-w-[18rem]" title={name}>{name}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{stats.n}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {formatPct(stats.passed, completed)}
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums text-gray-400">
                      {stats.avgDurationMs != null ? formatDuration(Math.round(stats.avgDurationMs / 1000)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-gray-600 text-right">
        <a
          href={`${repo.htmlUrl}/actions`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-400 hover:underline"
        >
          View all workflows on GitHub →
        </a>
      </p>
    </div>
  );
}

export default MobileWorkflowsPanel;
