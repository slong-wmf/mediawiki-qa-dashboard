/**
 * @file coverage.js
 * Service module for Wikimedia test coverage data.
 *
 * Data source: https://doc.wikimedia.org/cover/ and /cover-extensions/
 * These pages do not send CORS headers, so all requests go through
 * the Vite proxy at /api/coverage → https://doc.wikimedia.org
 *
 * ## Parsing strategy
 * doc.wikimedia.org already generates a well-structured HTML index page for
 * coverage data — complete with <meter> elements, named anchors, and timestamps.
 * Rather than duplicating that aggregation logic or standing up a separate data
 * pipeline, this module deliberately reuses that existing page as its data source.
 * The HTML is parsed client-side and presented as a clean abstraction for the
 * dashboard's reporting panels.
 *
 * The trade-off: if Wikimedia changes the HTML structure of their coverage index
 * pages the parser will silently return empty/incomplete data. See parseRows()
 * for the specific elements and class names this relies on.
 *
 * Coverage percentages are read directly from <meter value="X"> elements
 * in the HTML index pages — no need to fetch individual clover.xml files.
 */

import { USE_STATIC_DATA, fetchStaticJson } from './staticData.js';

const BASE_URL = '/api/coverage';

/** Public base URL for coverage pages — used for clickthrough links. */
const COVERAGE_PUBLIC_URL = 'https://doc.wikimedia.org';

/**
 * Parse coverage rows from an HTML string.
 *
 * This function reads the HTML that doc.wikimedia.org generates for its coverage
 * index pages. We are intentionally reusing their existing page structure rather
 * than building a separate data source — the goal is to surface an abstraction of
 * data that already exists, not to own the underlying aggregation.
 *
 * Expected table structure (as of 2026-04-03 — monitor for upstream changes):
 *   <tr>
 *     <td class="cover-item-meter"><meter value="76">76%</meter></td>
 *     <td class="cover-item-name"><a href="./AbuseFilter/">AbuseFilter</a></td>
 *     <td class="cover-item-mtime">2026-04-03 08:21 GMT</td>
 *     <td class="cover-item-extra">(<a href="./AbuseFilter/clover.xml">clover.xml</a>)</td>
 *   </tr>
 *
 * Key elements we depend on:
 *   - <meter value="N">   — the integer coverage percentage (0–100)
 *   - .cover-item-name a  — the extension/project name and relative href
 *   - .cover-item-mtime   — the last-updated timestamp string
 *
 * Rows that are missing a <meter> or a .cover-item-name anchor are silently
 * skipped (e.g. header rows, summary rows).
 *
 * @param {string} html - Raw HTML string of the coverage index page.
 * @param {string} baseSection - The path segment of the index page (e.g. 'cover-extensions').
 * @returns {Array<{ name: string, coverage_pct: number, last_updated: string, page_url: string, clover_url: string }>}
 */
export function parseRows(html, baseSection) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('tr'))
    .map((row) => {
      const meter = row.querySelector('meter');
      const nameEl = row.querySelector('.cover-item-name a');
      const mtimeEl = row.querySelector('.cover-item-mtime');
      if (!meter || !nameEl) return null;
      const name = nameEl.textContent.trim();
      return {
        name,
        coverage_pct: parseInt(meter.getAttribute('value'), 10),
        last_updated: mtimeEl?.textContent.trim() ?? null,
        page_url: `${COVERAGE_PUBLIC_URL}/${baseSection}/${name}/`,
        clover_url: `${COVERAGE_PUBLIC_URL}/${baseSection}/${name}/clover.xml`,
      };
    })
    .filter(Boolean);
}

/**
 * @typedef {Object} CoverageData
 * @property {{ name: string, coverage_pct: number, last_updated: string }|null} core
 *   Coverage entry for mediawiki-core, or null if not found.
 * @property {Array<{ name: string, coverage_pct: number, last_updated: string }>} extensions
 *   Coverage data for all 200+ MediaWiki extensions.
 */

/**
 * Fetch coverage data for MediaWiki core and all extensions in parallel.
 *
 * Core data comes from https://doc.wikimedia.org/cover/ (the general index),
 * which includes `mediawiki-core` as one of its entries.
 *
 * Extension data comes from https://doc.wikimedia.org/cover-extensions/.
 *
 * @returns {Promise<CoverageData>}
 * @throws {Error} When both fetches fail, or when response HTML cannot be parsed.
 */
export async function fetchCoverageData() {
  if (USE_STATIC_DATA) return fetchStaticJson('coverage.json');
  const [coreRes, extRes] = await Promise.all([
    fetch(`${BASE_URL}/cover/`),
    fetch(`${BASE_URL}/cover-extensions/`),
  ]);

  if (!coreRes.ok) {
    throw new Error(`Coverage (core) fetch failed: ${coreRes.status} ${coreRes.statusText}`);
  }
  if (!extRes.ok) {
    throw new Error(`Coverage (extensions) fetch failed: ${extRes.status} ${extRes.statusText}`);
  }

  const [coreHtml, extHtml] = await Promise.all([coreRes.text(), extRes.text()]);

  const coreRows = parseRows(coreHtml, 'cover');
  const extensions = parseRows(extHtml, 'cover-extensions');

  const core = coreRows.find((r) => r.name === 'mediawiki-core') ?? null;

  if (extensions.length === 0) {
    throw new Error('Coverage index returned no extension data — page structure may have changed');
  }

  return { core, extensions };
}
