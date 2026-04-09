import { relativeTimeLabel } from '../../utils/format.js';

/**
 * Shows a human-readable relative time (e.g. "3d ago") with the full local
 * date/time as a tooltip. Returns an em-dash when the timestamp is missing
 * so table columns never render with a gap.
 */
export function RelativeTime({ iso }) {
  if (!iso) return <span className="text-gray-600">—</span>;
  return (
    <span className="text-gray-400" title={new Date(iso).toLocaleString()}>
      {relativeTimeLabel(iso)}
    </span>
  );
}
