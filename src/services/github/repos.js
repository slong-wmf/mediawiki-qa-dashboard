/**
 * @file repos.js
 *
 * Single source of truth for the platform → GitHub repo mapping used by every
 * GitHub-backed service and panel. Keep additions to this file: each new
 * platform automatically wires through the parametrised services and the
 * MobileTab component without further changes.
 */

/**
 * @typedef {'ios' | 'android'} Platform
 */

/**
 * @typedef {Object} RepoDescriptor
 * @property {string} owner       GitHub org/user — currently always "wikimedia".
 * @property {string} name        Repository name on GitHub.
 * @property {string} label       Display label used in panel headers (e.g. "iOS").
 * @property {string} fullName    Convenience accessor — `${owner}/${name}`.
 * @property {string} htmlUrl     Public GitHub URL for the repo.
 */

/**
 * Platform → repo descriptor map. The keys (`ios`, `android`) double as the
 * URL hash slugs used by the tab router and the file-name prefixes used by
 * the snapshot script (`ios-workflows.json`, `android-releases.json`, etc.).
 */
export const REPOS = Object.freeze({
  ios: {
    owner: 'wikimedia',
    name: 'wikipedia-ios',
    label: 'iOS',
    fullName: 'wikimedia/wikipedia-ios',
    htmlUrl: 'https://github.com/wikimedia/wikipedia-ios',
  },
  android: {
    owner: 'wikimedia',
    name: 'apps-android-wikipedia',
    label: 'Android',
    fullName: 'wikimedia/apps-android-wikipedia',
    htmlUrl: 'https://github.com/wikimedia/apps-android-wikipedia',
  },
});

/**
 * Lookup helper that throws on unknown platforms — preferred over `REPOS[p]`
 * because callers get a meaningful error message instead of silently
 * receiving `undefined` and crashing later.
 *
 * @param {Platform} platform
 * @returns {RepoDescriptor}
 */
export function repoFor(platform) {
  const repo = REPOS[platform];
  if (!repo) {
    throw new Error(`Unknown platform: ${platform}. Expected one of: ${Object.keys(REPOS).join(', ')}`);
  }
  return repo;
}

/**
 * GitHub REST API base URL. CORS-enabled for public repositories so the
 * browser can fetch directly without a Vite proxy.
 */
export const GITHUB_API_BASE = 'https://api.github.com';
