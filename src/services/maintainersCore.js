/**
 * Pure parse helpers for the Wikimedia Production/Service Catalog page, which
 * gives the owner team (steward) of each MediaWiki extension.
 *
 * These helpers do not use fetch, import.meta or browser globals, so the React
 * service (maintainers.js) and the snapshot script can both use them.
 *
 * Source page: https://www.mediawiki.org/wiki/Wikimedia_Production/Service_Catalog
 * The old page, Developers/Maintainers, is now a redirect to it.
 */

export const SERVICE_CATALOG_PAGE = 'Wikimedia_Production/Service_Catalog';

/**
 * Action API URL that returns the rendered page HTML. `redirects=1` makes the
 * API follow a page move. Without it, the API parses only the redirect page.
 * `origin=*` lets the browser call the API (CORS).
 */
export const MAINTAINERS_API_URL =
  'https://www.mediawiki.org/w/api.php' +
  `?action=parse&page=${SERVICE_CATALOG_PAGE}&redirects=1&prop=text&format=json&origin=*`;

/**
 * Give the header label of each column of a table. The function reads all the
 * header rows and applies rowspan and colspan. A label in a lower header row
 * replaces the label above it. Labels are lower case, without footnote marks
 * such as "[2]".
 *
 * @param {Element} table
 * @returns {string[]}
 */
export function headerLabels(table) {
  const grid = [];
  const headerRows = [...table.querySelectorAll('tr')].filter(
    (tr) => tr.querySelector('th') && !tr.querySelector('td'),
  );
  headerRows.forEach((tr, r) => {
    grid[r] = grid[r] ?? [];
    let col = 0;
    for (const th of tr.querySelectorAll('th')) {
      while (grid[r][col] !== undefined) col++;
      const colspan = Number(th.getAttribute('colspan')) || 1;
      const rowspan = Number(th.getAttribute('rowspan')) || 1;
      const label = th.textContent.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      for (let dr = 0; dr < rowspan; dr++) {
        grid[r + dr] = grid[r + dr] ?? [];
        for (let dc = 0; dc < colspan; dc++) grid[r + dr][col + dc] = label;
      }
      col += colspan;
    }
  });
  return grid.length ? grid[grid.length - 1] : [];
}

/**
 * Give the extension name in a Service cell, or null. The cell links to the
 * Extension: page. Some of these links have no text, so the function uses the
 * first link that has text.
 *
 * @param {Element|undefined} cell
 * @returns {string|null}
 */
function extensionName(cell) {
  for (const a of cell?.querySelectorAll('a[href*="Extension:"]') ?? []) {
    const text = a.textContent.trim();
    if (text) return text;
  }
  return null;
}

/**
 * Give the team in a Development / Maintenance cell. When some teams own an
 * extension together, the cell starts with "Multiple teams, see OWNERS.md".
 * For these cells, the function gives "Multiple teams".
 *
 * @param {Element|undefined} cell
 * @returns {string}
 */
function stewardName(cell) {
  const text = (cell?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return /^multiple teams\b/i.test(text) ? 'Multiple teams' : text;
}

/**
 * Give the volunteer developers in a "Volunteer Devs & other useful info"
 * cell. The cell links to the user page of each volunteer.
 *
 * @param {Element|undefined} cell
 * @returns {string}
 */
function volunteerNames(cell) {
  return [...(cell?.querySelectorAll('a[href*="/wiki/User:"]') ?? [])]
    .map((a) => a.textContent.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Parse the rendered Service Catalog page into a Map from extension name to
 * steward and maintainer.
 *
 * Each section of the page has a wikitable with two header rows. "Owners"
 * spans three columns: "Development / Maintenance", "Config & Deployment" and
 * "Incident First Responder". The steward is the Development / Maintenance
 * team. The maintainer is the list of volunteer developers.
 *
 * Only rows whose first cell links to an Extension: page are extensions. The
 * rows for core, skins, libraries and services do not have this link.
 *
 * @param {Document} document  Parsed page (DOMParser in the browser, linkedom in Node)
 * @returns {Map<string, { steward: string, maintainer: string }>}
 */
export function parseServiceCatalog(document) {
  const result = new Map();
  for (const table of document.querySelectorAll('table.wikitable')) {
    const labels = headerLabels(table);
    const idxSteward = labels.findIndex((h) => h.includes('development'));
    const idxVolunteers = labels.findIndex((h) => h.includes('volunteer'));
    if (idxSteward < 0) continue;

    for (const row of table.querySelectorAll('tr')) {
      const cells = [...row.querySelectorAll('td')];
      const name = extensionName(cells[0]);
      if (!name) continue;
      result.set(name, {
        steward: stewardName(cells[idxSteward]),
        maintainer: idxVolunteers >= 0 ? volunteerNames(cells[idxVolunteers]) : '',
      });
    }
  }
  return result;
}
