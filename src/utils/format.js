/**
 * @file format.js
 * Display formatters shared by multiple panels.
 * Pure functions only — no React, no side effects.
 */

/**
 * Format seconds into "Xm Ys", "Xs", or "0s".
 * @param {number} s  Number of seconds
 * @returns {string}
 */
export function formatDuration(s) {
  if (!s) return '0s';
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${s}s`;
}

/**
 * Truncate a string to at most `max` characters, appending a single-character
 * ellipsis when truncated. Used for chart axis labels.
 * @param {string} name
 * @param {number} [max=20]
 * @returns {string}
 */
export function truncate(name, max = 20) {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

/**
 * Relative-time label (e.g. "3d ago") for an ISO timestamp. Returns an em-dash
 * when the input is falsy so callers do not need a separate null-check branch.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function relativeTimeLabel(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d    = Math.floor(diff / 86_400_000);
  const h    = Math.floor(diff / 3_600_000);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  return 'just now';
}
