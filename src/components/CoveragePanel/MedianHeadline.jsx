import { coverageColour } from '../../constants/coverage.js';

/**
 * Large median-coverage headline shown at the top of the panel. Falls back
 * to an italic "No coverage data available" line when the median cannot be
 * computed (e.g. steward filter with no coverage data).
 */
export function MedianHeadline({ median, coveredCount, wikiOnly, activeSteward }) {
  if (median === null) {
    return <p className="text-gray-500 text-sm italic text-center">No coverage data available</p>;
  }

  return (
    <div className="text-center">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
        Median coverage
        {wikiOnly ? ' · Wikipedia extensions' : ' · all extensions'}
        {activeSteward ? ` · ${activeSteward}` : ''}
      </p>
      <p className={`text-5xl font-bold ${coverageColour(median)}`}>
        {median}%
      </p>
      <p className="text-xs text-gray-500 mt-1">
        across {coveredCount} extension{coveredCount !== 1 ? 's' : ''} with coverage data
      </p>
    </div>
  );
}
