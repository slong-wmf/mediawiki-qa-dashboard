import { PRIORITY_META } from '../../constants/phabricator.js';

/**
 * Coloured dot + label showing a Phabricator task priority.
 * Falls back to "normal" styling for unknown priority keys.
 */
export function PriorityDot({ priority }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={m.label}>
      <span className={`w-2 h-2 rounded-full inline-block ${m.dot}`} />
      <span className={m.colour}>{m.label}</span>
    </span>
  );
}
