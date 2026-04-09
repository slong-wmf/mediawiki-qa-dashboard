/**
 * Red error banner rendered above any panel whose data source has failed.
 * Extracted from App.jsx so individual panels can also render it inline
 * (e.g. when showing a recoverable sub-section error while the rest of
 * the panel still has data to display).
 */
export function ErrorBanner({ source, error }) {
  if (!error) return null;
  return (
    <div className="bg-red-900 border border-red-600 text-red-200 rounded p-3 text-sm mb-4">
      <span className="font-semibold">{source} unavailable:</span>{' '}
      {error.message ?? 'Unknown error'}
    </div>
  );
}
