/**
 * @file coverage.js
 * Shared thresholds and bucket definitions for the Code Coverage panel.
 */

/** Coverage percentage thresholds that drive red / amber / green colouring. */
export const COVERAGE_THRESHOLDS = { target: 80, warning: 60 };

/**
 * Bucket labels and filter predicates for the coverage stat cards. Kept here
 * so the bucket boundaries can be tweaked in one place if the thresholds change.
 */
export const COVERAGE_BUCKETS = [
  { label: '≥ 80%',  colour: 'text-green-400', filter: (e) => e.coverage_pct >= 80 },
  { label: '60–79%', colour: 'text-amber-400', filter: (e) => e.coverage_pct >= 60 && e.coverage_pct < 80 },
  { label: '< 60%',  colour: 'text-red-400',   filter: (e) => e.coverage_pct > 0 && e.coverage_pct < 60 },
  { label: '0%',     colour: 'text-gray-400',  filter: (e) => e.coverage_pct === 0 },
];

/**
 * Map a coverage percent to a Tailwind text colour class.
 * Used by the coverage table and median headline.
 */
export function coverageColour(pct) {
  if (pct >= COVERAGE_THRESHOLDS.target)  return 'text-green-400';
  if (pct >= COVERAGE_THRESHOLDS.warning) return 'text-amber-400';
  return 'text-red-400';
}

/**
 * Map a coverage percent to a Recharts bar fill hex.
 * Mirrors coverageColour() but returns raw hex values because Recharts
 * cannot parse Tailwind class names.
 */
export function coverageBarHex(pct) {
  if (pct >= COVERAGE_THRESHOLDS.target)  return '#22c55e';
  if (pct >= COVERAGE_THRESHOLDS.warning) return '#f59e0b';
  return '#ef4444';
}
