import { coverageColour } from '../../constants/coverage.js';

/**
 * Sortable extension coverage table used in both the main "Table" chart view
 * and the bucket-detail drill-in. Rows are keyboard-accessible and open the
 * extension's doc.wikimedia.org coverage page in a new tab.
 */
export function CoverageTable({ extensions, maxHeightClass = 'max-h-56' }) {
  const openExtension = (url) => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <div className={`overflow-y-auto ${maxHeightClass}`}>
      <table className="w-full text-xs text-left">
        <thead className="sticky top-0 bg-gray-800">
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="pb-1 pr-3 font-medium">Extension</th>
            <th className="pb-1 pr-3 font-medium">Coverage</th>
            <th className="pb-1 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {extensions.map((ext) => (
            <tr
              key={ext.name}
              onClick={() => openExtension(ext.page_url)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openExtension(ext.page_url);
                }
              }}
              tabIndex={0}
              aria-label={`Open ${ext.name} coverage page`}
              className="border-b border-gray-700/40 hover:bg-gray-700/40 cursor-pointer transition-colors focus:outline-none focus:bg-gray-700/40"
              title={`Open ${ext.name} coverage page`}
            >
              <td className="py-1 pr-3 text-blue-400 hover:underline">{ext.name}</td>
              <td className={`py-1 pr-3 font-medium ${coverageColour(ext.coverage_pct)}`}>
                {ext.coverage_pct}%
              </td>
              <td className="py-1 text-gray-500">{ext.last_updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
