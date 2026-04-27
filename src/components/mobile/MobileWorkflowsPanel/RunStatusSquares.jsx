/**
 * Compact "last N runs" status strip — one coloured square per run, in
 * chronological order with the most recent on the right. Mirrors the at-a-glance
 * health visualisation common in CI dashboards.
 *
 * Colour mapping:
 *   - green:  conclusion === 'success'
 *   - red:    conclusion === 'failure' | 'timed_out'
 *   - amber:  conclusion === 'cancelled' | 'action_required' | 'startup_failure'
 *   - grey:   anything else (in-progress, skipped, neutral, null)
 */

const SQUARE_BG = {
  passed:  'bg-emerald-500',
  failed:  'bg-red-500',
  warned:  'bg-amber-500',
  neutral: 'bg-gray-600',
};

function classifyConclusion(conclusion) {
  if (conclusion === 'success') return 'passed';
  if (conclusion === 'failure' || conclusion === 'timed_out') return 'failed';
  if (conclusion === 'cancelled' || conclusion === 'action_required' || conclusion === 'startup_failure') return 'warned';
  return 'neutral';
}

/**
 * @param {{ runs: Array<{ id: number, name: string, conclusion: string|null, html_url: string, created_at: string }> }} props
 */
export function RunStatusSquares({ runs }) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return <p className="text-xs text-gray-500">No runs available.</p>;
  }
  // Sort oldest → newest so the most recent appears on the right (rightmost = newest).
  const ordered = [...runs].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return (
    <div className="flex gap-1 flex-wrap">
      {ordered.map((run) => {
        const cls = classifyConclusion(run.conclusion);
        const tooltip = `${run.name} — ${run.conclusion ?? run.status ?? 'unknown'}\n${new Date(run.created_at).toLocaleString()}`;
        return (
          <a
            key={run.id}
            href={run.html_url}
            target="_blank"
            rel="noopener noreferrer"
            title={tooltip}
            className={`block w-3 h-3 rounded-sm ${SQUARE_BG[cls]} hover:ring-2 hover:ring-blue-400 transition-all`}
            aria-label={`Run ${run.id}: ${run.conclusion ?? 'unknown'}`}
          />
        );
      })}
    </div>
  );
}
