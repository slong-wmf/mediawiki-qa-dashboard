/**
 * Static data mode detection and JSON fetch helper.
 *
 * When VITE_STATIC_DATA=true is set at build time (e.g. for GitHub Pages),
 * each service module reads from pre-generated snapshot JSON files under
 * /data/ instead of calling live APIs. This avoids CORS issues on static
 * hosts while keeping dev mode and Vercel proxy deployments unchanged.
 *
 * Upgrade path to live data (Vercel):
 *   Simply deploy without VITE_STATIC_DATA set. The existing /api/* proxy
 *   routes in vite.config.js work in dev; Vercel serverless functions
 *   (/api/jenkins.js, /api/coverage.js, /api/phabricator.js) replace them
 *   in production — no frontend changes needed.
 */

export const USE_STATIC_DATA = import.meta.env.VITE_STATIC_DATA === 'true';

/**
 * Fetch a pre-generated snapshot JSON file from the /data/ directory.
 * Uses import.meta.env.BASE_URL so the path resolves correctly regardless
 * of whether the site is hosted at / or /mediawiki-qa-dashboard/.
 *
 * @param {string} filename  e.g. 'jenkins-builds.json'
 * @returns {Promise<any>}
 */
export async function fetchStaticJson(filename) {
  const url = `${import.meta.env.BASE_URL}data/${filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Static data fetch failed for ${filename}: ${res.status} ${res.statusText}`);
  return res.json();
}
