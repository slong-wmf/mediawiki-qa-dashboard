/**
 * Test-file inventory for one mobile-app repo. Surface area, not pass/fail —
 * mirrors AutomatedTestsPanel's role for MediaWiki extensions but for a
 * single repo split into UI vs. unit tests.
 *
 * Source-of-truth shape comes from src/services/github/testInventory.js
 * (`{ totals: { uiTests, unitTests, total }, byDirectory: [{ path, count, kind }] }`).
 */

import { useState } from 'react';
import { repoFor } from '../../services/github/repos.js';

const KIND_PILL = {
  ui:   { label: 'UI',   classes: 'bg-indigo-900/60 text-indigo-200' },
  unit: { label: 'Unit', classes: 'bg-emerald-900/60 text-emerald-200' },
};

/**
 * @param {{
 *   data: { totals: { uiTests, unitTests, total }, byDirectory: Array, repo?: string, generatedAt?: string } | null,
 *   error: Error|null,
 *   loading: boolean,
 *   platform: 'ios' | 'android',
 * }} props
 */
export function MobileTestInventoryPanel({ data, error, loading, platform }) {
  const [expanded, setExpanded] = useState(false);
  const repo = repoFor(platform);

  if (loading || error) return null; // Panel wrapper handles these states.

  const totals = data?.totals ?? { uiTests: 0, unitTests: 0, total: 0 };
  const byDirectory = data?.byDirectory ?? [];

  if (totals.total === 0) {
    return (
      <p className="text-sm text-gray-400">
        No test files matched the inventory rules for{' '}
        <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          {repo.fullName}
        </a>
        .
      </p>
    );
  }

  const cards = [
    { label: 'UI tests',   value: totals.uiTests,   colour: 'text-indigo-300' },
    { label: 'Unit tests', value: totals.unitTests, colour: 'text-emerald-300' },
    { label: 'Total',      value: totals.total,     colour: 'text-blue-300' },
  ];

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {cards.map((c) => (
          <div key={c.label} className="rounded p-2 bg-gray-700/50" title={`${c.label}: ${c.value}`}>
            <div className={`font-bold text-base ${c.colour}`}>{c.value}</div>
            <div className="text-gray-400">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Per-directory breakdown */}
      <details
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
        className="rounded border border-gray-700 bg-gray-700/20"
      >
        <summary className="cursor-pointer select-none px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/40">
          Breakdown by directory ({byDirectory.length})
        </summary>
        <div className="overflow-x-auto px-3 pb-2">
          <table className="w-full text-xs">
            <thead className="text-gray-500 border-b border-gray-700">
              <tr>
                <th className="text-left py-1 pr-2 font-medium">Directory</th>
                <th className="text-left py-1 px-2 font-medium">Kind</th>
                <th className="text-right py-1 pl-2 font-medium">Count</th>
              </tr>
            </thead>
            <tbody className="text-gray-200">
              {byDirectory.map((entry) => (
                <tr key={entry.path} className="border-b border-gray-800 last:border-0 hover:bg-gray-700/30">
                  <td className="py-1 pr-2 font-mono text-[11px]" title={entry.path}>
                    <a
                      href={`${repo.htmlUrl}/tree/HEAD/${entry.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-200 hover:text-blue-400 hover:underline"
                    >
                      {entry.path}
                    </a>
                  </td>
                  <td className="py-1 px-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${KIND_PILL[entry.kind]?.classes ?? 'bg-gray-700 text-gray-300'}`}>
                      {KIND_PILL[entry.kind]?.label ?? entry.kind}
                    </span>
                  </td>
                  <td className="py-1 pl-2 text-right tabular-nums">{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-[10px] text-gray-600 text-right">
        Counts every {platform === 'ios' ? '.swift' : '.kt/.java'} file under the test directories — includes helpers and fixtures.
      </p>
    </div>
  );
}

export default MobileTestInventoryPanel;
