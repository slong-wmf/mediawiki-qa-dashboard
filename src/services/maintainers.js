/**
 * @file maintainers.js
 * Fetches the Wikimedia Developers/Maintainers wiki page and parses the
 * HTML extension table into a lookup of extension name → steward/maintainer.
 *
 * The MediaWiki Action API supports CORS with origin=*, so no Vite proxy is
 * needed — the request goes directly from the browser.
 *
 * Source page: https://www.mediawiki.org/wiki/Developers/Maintainers
 */

import { USE_STATIC_DATA, fetchStaticJson } from './staticData.js';

const MAINTAINERS_API_URL =
  'https://www.mediawiki.org/w/api.php' +
  '?action=parse&page=Developers/Maintainers&prop=text&format=json&origin=*';

/**
 * @typedef {Object} MaintainerEntry
 * @property {string} steward            - Team or org with professional responsibility (may be empty)
 * @property {string} maintainer         - Individual maintainer name(s) (may be empty)
 */

/**
 * Fetch the Developers/Maintainers page and return a map from extension name
 * to its steward and individual maintainer.
 *
 * @returns {Promise<Map<string, MaintainerEntry>>}
 */
export async function fetchMaintainers() {
  if (USE_STATIC_DATA) {
    // Snapshot is stored as a plain object (JSON can't represent Maps).
    // Reconstruct as Map<extName, { steward, maintainer }>.
    const json = await fetchStaticJson('maintainers.json');
    return new Map(Object.entries(json));
  }
  const res = await fetch(MAINTAINERS_API_URL);
  if (!res.ok) {
    throw new Error(`Maintainers fetch failed: HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const html = json?.parse?.text?.['*'];
  if (!html) throw new Error('Maintainers page returned no HTML content');
  return parseMaintainersHTML(html);
}

/**
 * Parse the rendered HTML of the Developers/Maintainers page into a Map.
 *
 * The page contains a wikitable with columns:
 *   Extension | Description | Steward | Individual maintainer | Consultants
 *
 * Extension name cells contain an anchor whose href includes "Extension:" —
 * this is the reliable signal that a row represents an extension (not a core
 * component or skin).
 *
 * @param {string} html  Raw HTML string from the MediaWiki parse API
 * @returns {Map<string, MaintainerEntry>}
 */
function parseMaintainersHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const result = new Map();

  for (const table of doc.querySelectorAll('table.wikitable')) {
    // Locate column indices from the header row
    const headerRow = table.querySelector('tr');
    if (!headerRow) continue;

    const headers = [...headerRow.querySelectorAll('th')].map(
      (th) => th.textContent.trim().toLowerCase(),
    );

    const idxSteward    = headers.findIndex((h) => h.includes('steward'));
    const idxMaintainer = headers.findIndex((h) => h.includes('individual'));

    if (idxSteward < 0) continue; // not the extensions table

    for (const row of table.querySelectorAll('tr')) {
      const cells = [...row.querySelectorAll('td')];
      if (!cells.length) continue;

      // Only extension rows have a link whose href contains "Extension:"
      const extLink = cells[0]?.querySelector('a[href*="Extension:"]');
      if (!extLink) continue;

      const extName   = extLink.textContent.trim();
      const steward   = cells[idxSteward]?.textContent?.trim()   ?? '';
      const maintainer = idxMaintainer >= 0
        ? cells[idxMaintainer]?.textContent?.trim() ?? ''
        : '';

      result.set(extName, { steward, maintainer });
    }
  }

  return result;
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
