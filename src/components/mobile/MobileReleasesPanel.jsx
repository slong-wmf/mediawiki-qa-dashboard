/**
 * Recent GitHub Releases for one mobile-app repo. Surfaces ship cadence —
 * the mobile equivalent of the MediaWiki "train" — with a coloured pill
 * highlighting how long it has been since the last shipped release.
 *
 * Source-of-truth shape comes from src/services/github/releases.js
 * (`{ releases, lastReleaseAgeDays }`).
 */

import { RelativeTime } from '../shared/RelativeTime.jsx';
import { repoFor } from '../../services/github/repos.js';

/**
 * Map "days since last release" to a Tailwind pill colour.
 * Thresholds chosen to roughly match a 2-week ship cadence as healthy.
 */
function ageBadgeClasses(days) {
  if (days == null) return 'bg-gray-700 text-gray-300';
  if (days <= 14) return 'bg-emerald-700/60 text-emerald-200 border border-emerald-600/60';
  if (days <= 30) return 'bg-amber-700/60 text-amber-200 border border-amber-600/60';
  return 'bg-red-800/60 text-red-200 border border-red-600/60';
}

/**
 * @param {{
 *   data: { releases: Array, lastReleaseAgeDays: number|null, fetchedAt?: string } | null,
 *   error: Error|null,
 *   loading: boolean,
 *   platform: 'ios' | 'android',
 * }} props
 */
export function MobileReleasesPanel({ data, error, loading, platform }) {
  // Skeleton/error states are rendered by the <Panel> wrapper in MobileTab.
  const repo = repoFor(platform);
  const releases = data?.releases ?? [];
  const ageDays = data?.lastReleaseAgeDays ?? null;

  if (loading || error) return null;

  if (releases.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No releases published yet for{' '}
        <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          {repo.fullName}
        </a>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Last-release age pill */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center px-3 py-1 rounded text-sm font-semibold ${ageBadgeClasses(ageDays)}`}>
          {ageDays == null ? 'No published release' : `${ageDays}d since last release`}
        </span>
        <span className="text-xs text-gray-500">
          {ageDays != null && ageDays <= 14 && 'Healthy ship cadence'}
          {ageDays != null && ageDays > 14 && ageDays <= 30 && 'Slowing ship cadence'}
          {ageDays != null && ageDays > 30 && 'Stalled ship cadence'}
        </span>
      </div>

      {/* Recent releases list */}
      <ul className="divide-y divide-gray-800">
        {releases.map((rel) => (
          <li key={rel.id} className="py-2 flex items-baseline justify-between gap-3">
            <div className="min-w-0 flex-1">
              <a
                href={rel.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-gray-100 hover:text-blue-400 hover:underline"
              >
                {rel.name || rel.tag_name}
              </a>
              {rel.tag_name && rel.name !== rel.tag_name && (
                <span className="ml-2 text-xs text-gray-500 font-mono">{rel.tag_name}</span>
              )}
              {rel.prerelease && (
                <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-amber-900/60 text-amber-200 align-middle">
                  pre-release
                </span>
              )}
              {rel.author && (
                <span className="ml-2 text-xs text-gray-500">by {rel.author}</span>
              )}
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              <RelativeTime iso={rel.published_at} />
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-gray-600 text-right">
        <a
          href={`${repo.htmlUrl}/releases`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-400 hover:underline"
        >
          View all releases on GitHub →
        </a>
      </p>
    </div>
  );
}

export default MobileReleasesPanel;
