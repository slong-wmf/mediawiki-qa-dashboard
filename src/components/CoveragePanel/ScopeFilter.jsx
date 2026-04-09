import { GENERATED_DATE } from '../../data/activeExtensions.js';
import { InfoTooltip } from './InfoTooltip.jsx';

/**
 * Segmented "Wikipedia only / All" scope toggle plus the deployed-count info
 * tooltip that appears beside it when the Wikipedia-only filter is active.
 */
export function ScopeFilter({
  wikiOnly,
  onChange,
  allCount,
  wikipediaCount,
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex rounded overflow-hidden border border-gray-600 text-xs" role="group" aria-label="Extension scope">
        <button
          onClick={() => onChange(true)}
          aria-pressed={wikiOnly}
          className={`px-2 py-0.5 transition-colors ${
            wikiOnly ? 'bg-indigo-700 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
          }`}
          title="Show only extensions deployed on en.wikipedia.org"
        >
          Wikipedia only
        </button>
        <button
          onClick={() => onChange(false)}
          aria-pressed={!wikiOnly}
          className={`px-2 py-0.5 transition-colors ${
            !wikiOnly ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-400 hover:text-gray-200'
          }`}
          title="Show all extensions tracked on doc.wikimedia.org"
        >
          All ({allCount})
        </button>
      </div>
      {wikiOnly && (
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <InfoTooltip label={`${wikipediaCount} deployed`}>
            <strong className="block text-white mb-1">What does &quot;deployed&quot; mean?</strong>
            These extensions are currently installed on{' '}
            <strong className="text-indigo-300">en.wikipedia.org</strong> per its live
            MediaWiki siteinfo API. All have a verified Gerrit commit within the last
            6 months, confirming active maintenance.
            <br /><br />
            Extensions tracked on doc.wikimedia.org but <em>not</em> in this list are
            deployed on other Wikimedia wikis only, still in development, or legacy.
            Switch to <strong className="text-gray-300">All</strong> to see them.
            <span className="block mt-2 text-gray-400 border-t border-gray-700 pt-1">
              Source: en.wikipedia.org siteinfo API · {GENERATED_DATE}
            </span>
          </InfoTooltip>
          {' '}· as of {GENERATED_DATE}
        </span>
      )}
    </div>
  );
}
