const MAX_VISIBLE_TAGS = 3;

/**
 * Renders up to MAX_VISIBLE_TAGS project tag names as small grey badges.
 * Overflow is summarised as "+N" with a tooltip listing the remaining names.
 * When name resolution failed but a raw count is available, falls back to
 * showing "N tags" so the column is never misleadingly blank.
 */
export function TagList({ names, count = 0 }) {
  if (!names.length) {
    if (count > 0) {
      return <span className="text-gray-500 italic">{count} tag{count !== 1 ? 's' : ''}</span>;
    }
    return <span className="text-gray-600">—</span>;
  }
  const visible  = names.slice(0, MAX_VISIBLE_TAGS);
  const overflow = names.length - MAX_VISIBLE_TAGS;
  return (
    <span className="flex flex-wrap gap-0.5">
      {visible.map((name) => (
        <span
          key={name}
          title={name}
          className="inline-block max-w-[80px] truncate rounded bg-gray-700 px-1 py-0.5 text-gray-300"
        >
          {name}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="rounded bg-gray-700 px-1 py-0.5 text-gray-500"
          title={names.slice(MAX_VISIBLE_TAGS).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
