/**
 * @file maintainers.js
 * Fetches the Wikimedia Production/Service Catalog wiki page and parses its
 * extension rows into a lookup of extension name → steward/maintainer.
 *
 * The MediaWiki Action API supports CORS with origin=*, so no Vite proxy is
 * needed — the request goes directly from the browser.
 *
 * Source page: https://www.mediawiki.org/wiki/Wikimedia_Production/Service_Catalog
 * (Developers/Maintainers is now a redirect to it.)
 */

import { USE_STATIC_DATA, fetchStaticJson } from './staticData.js';
import { MAINTAINERS_API_URL, parseServiceCatalog } from './maintainersCore.js';

/**
 * @typedef {Object} MaintainerEntry
 * @property {string} steward            - Development / Maintenance team in the Service Catalog (may be empty)
 * @property {string} maintainer         - Volunteer developer name(s) (may be empty)
 */

/**
 * Fetch the Service Catalog page and return a map from extension name to its
 * steward and maintainer.
 *
 * An empty result is an error. It shows that the page or its table layout
 * changed, and the steward filter then shows "Steward info unavailable".
 *
 * @returns {Promise<Map<string, MaintainerEntry>>}
 */
export async function fetchMaintainers() {
  if (USE_STATIC_DATA) {
    // Snapshot is stored as a plain object (JSON can't represent Maps).
    // Reconstruct as Map<extName, { steward, maintainer }>.
    const json = await fetchStaticJson('maintainers.json');
    const map = new Map(Object.entries(json ?? {}));
    if (map.size === 0) throw new Error('Maintainers snapshot has no extensions');
    return map;
  }
  const res = await fetch(MAINTAINERS_API_URL);
  if (!res.ok) {
    throw new Error(`Maintainers fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const html = json?.parse?.text?.['*'];
  if (!html) throw new Error('Maintainers page returned no HTML content');
  const map = parseServiceCatalog(new DOMParser().parseFromString(html, 'text/html'));
  if (map.size === 0) throw new Error('Service Catalog page has no extension rows');
  return map;
}

/**
 * Derive a sorted, de-duplicated list of unique steward names from a maintainers map.
 * Empty or whitespace-only steward values are omitted.
 *
 * @param {Map<string, MaintainerEntry>} maintainersMap
 * @returns {string[]}
 */
export function uniqueStewards(maintainersMap) {
  const set = new Set();
  for (const { steward } of maintainersMap.values()) {
    const s = steward.trim();
    if (s) set.add(s);
  }
  return [...set].sort();
}
