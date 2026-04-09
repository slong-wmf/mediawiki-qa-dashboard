import { COVERAGE_BUCKETS } from '../../constants/coverage.js';

/**
 * Four-up grid of stat cards summarising how many extensions fall into each
 * coverage bucket (≥ 80%, 60–79%, < 60%, 0%). Clicking a card toggles the
 * bucket-detail drill-in managed by the parent panel.
 */
export function BucketCards({ extensions, activeBucket, onSelect }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center text-xs">
      {COVERAGE_BUCKETS.map((bucket, i) => {
        const count = extensions.filter(bucket.filter).length;
        const isActive = activeBucket === i;
        return (
          <button
            key={bucket.label}
            onClick={() => onSelect(isActive ? null : i)}
            aria-pressed={isActive}
            title={`Show extensions with ${bucket.label} coverage`}
            className={`rounded p-2 transition-colors ${
              isActive
                ? 'bg-gray-600 ring-1 ring-gray-400'
                : 'bg-gray-700/50 hover:bg-gray-700'
            }`}
          >
            <div className={`font-bold text-base ${bucket.colour}`}>{count}</div>
            <div className="text-gray-400">{bucket.label}</div>
          </button>
        );
      })}
    </div>
  );
}
