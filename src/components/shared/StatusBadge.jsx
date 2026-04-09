import { STATUS_META, SUBTYPE_META } from '../../constants/phabricator.js';

/**
 * Small coloured pill showing a Phabricator status.
 * Accepts either a broad status group ('open', 'in-progress', …) or a raw
 * status value ('resolved', 'declined', …) — both resolve via STATUS_META.
 */
export function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? { label: status, text: 'text-gray-300', border: 'border-gray-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border bg-transparent ${m.text} ${m.border}`}>
      {m.label}
    </span>
  );
}

/**
 * Small coloured pill showing a Phabricator task subtype
 * (Bug Report / Production Error / Security / Task).
 */
export function SubtypeBadge({ subtype }) {
  const m = SUBTYPE_META[subtype] ?? SUBTYPE_META.default;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border bg-transparent ${m.text} ${m.border}`}>
      {m.label}
    </span>
  );
}
