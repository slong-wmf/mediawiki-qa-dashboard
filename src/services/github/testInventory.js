/**
 * @file testInventory.js
 *
 * Counts of test files discovered in a mobile-app repo, parsed from the
 * default-branch source tree. Mirrors AutomatedTestsPanel's role for
 * MediaWiki extensions: gives a quick sense of test surface area without
 * needing the test results themselves.
 *
 * Strategy: GET /repos/{owner}/{name}/git/trees/HEAD?recursive=1 — one API
 * call returns every path in the repo. We filter by per-platform path
 * prefix + extension to identify test files, then group by directory.
 *
 * For wikipedia-ios:
 *   - WikipediaUITests/**.swift   → UI tests (XCUITest)
 *   - WikipediaUnitTests/**.swift → unit tests (XCTest)
 *
 * For apps-android-wikipedia:
 *   - app/src/androidTest/**.{kt,java} → instrumented / UI tests (Espresso)
 *   - app/src/test/**.{kt,java}        → JVM unit tests
 */

import { USE_STATIC_DATA, fetchStaticJson } from '../staticData.js';
import { repoFor, GITHUB_API_BASE } from './repos.js';

/**
 * Per-platform matcher table. Each entry classifies repo paths into a `kind`
 * (`'ui'` or `'unit'`) when both prefix and extension match. The first
 * matching rule wins per file.
 *
 * NOTE: also duplicated in scripts/fetch-snapshot-data.js so the snapshot
 * script can run without importing from src/. Keep these in sync if either
 * mobile app reorganises its test directory layout.
 */
export const MATCHERS = {
  ios: [
    { kind: 'ui',   prefix: 'WikipediaUITests/',   exts: ['.swift'] },
    { kind: 'unit', prefix: 'WikipediaUnitTests/', exts: ['.swift'] },
  ],
  android: [
    { kind: 'ui',   prefix: 'app/src/androidTest/', exts: ['.kt', '.java'] },
    { kind: 'unit', prefix: 'app/src/test/',        exts: ['.kt', '.java'] },
  ],
};

/**
 * @typedef {Object} TestInventory
 * @property {string} repo                    Full repo name (owner/name).
 * @property {string} generatedAt             ISO timestamp when this inventory was built.
 * @property {{ uiTests: number, unitTests: number, total: number }} totals
 * @property {Array<{ path: string, count: number, kind: 'ui' | 'unit' }>} byDirectory  Grouped by immediate parent directory of each test file, sorted by count DESC.
 */

/**
 * Reduce a raw `git/trees` response into the inventory shape.
 *
 * @param {{ tree?: Array<{ path: string, type: string }> }} treeResponse
 * @param {'ios' | 'android'} platform
 * @param {string} repoFullName
 * @param {Date}   [now=new Date()]   Injectable for deterministic tests.
 * @returns {TestInventory}
 */
export function buildInventory(treeResponse, platform, repoFullName, now = new Date()) {
  const matchers = MATCHERS[platform];
  if (!matchers) {
    throw new Error(`No test matchers defined for platform: ${platform}`);
  }
  const tree = Array.isArray(treeResponse?.tree) ? treeResponse.tree : [];

  let uiTests = 0;
  let unitTests = 0;
  /** @type {Map<string, { count: number, kind: 'ui' | 'unit' }>} */
  const byDir = new Map();

  for (const entry of tree) {
    if (entry.type !== 'blob') continue;
    const path = entry.path;
    if (typeof path !== 'string') continue;

    for (const rule of matchers) {
      if (!path.startsWith(rule.prefix)) continue;
      if (!rule.exts.some((ext) => path.endsWith(ext))) continue;

      if (rule.kind === 'ui') uiTests += 1;
      else if (rule.kind === 'unit') unitTests += 1;

      const lastSlash = path.lastIndexOf('/');
      const dir = lastSlash > 0 ? path.slice(0, lastSlash) : path;
      const existing = byDir.get(dir);
      if (existing) {
        existing.count += 1;
      } else {
        byDir.set(dir, { count: 1, kind: rule.kind });
      }
      break; // first matching rule wins
    }
  }

  const byDirectory = [...byDir.entries()]
    .map(([path, { count, kind }]) => ({ path, count, kind }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  return {
    repo: repoFullName,
    generatedAt: now.toISOString(),
    totals: { uiTests, unitTests, total: uiTests + unitTests },
    byDirectory,
  };
}

/**
 * Fetch and build a test-file inventory for a mobile-app repo.
 *
 * @param {'ios' | 'android'} platform
 * @returns {Promise<TestInventory>}
 */
export async function fetchTestInventory(platform) {
  if (USE_STATIC_DATA) return fetchStaticJson(`${platform}-test-inventory.json`);

  const repo = repoFor(platform);
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/git/trees/HEAD?recursive=1`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub repo tree (${repo.fullName}): ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return buildInventory(json, platform, repo.fullName);
}
