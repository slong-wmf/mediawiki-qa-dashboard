/**
 * @file releases.js
 *
 * Recent GitHub Releases for one of the mobile-app repos. Used by
 * MobileReleasesPanel to surface ship cadence (the mobile equivalent of
 * the MediaWiki "train").
 *
 * Live mode hits api.github.com directly (CORS-enabled, anonymous quota
 * applies). Static mode reads `${platform}-releases.json` written by the
 * Toolforge snapshot job.
 */

import { USE_STATIC_DATA, fetchStaticJson } from '../staticData.js';
import { repoFor, GITHUB_API_BASE } from './repos.js';

/**
 * @typedef {Object} NormalizedRelease
 * @property {number}      id
 * @property {string}      tag_name
 * @property {string}      name           Release title (often equal to tag_name).
 * @property {string|null} published_at   ISO; null for unpublished/draft entries.
 * @property {string|null} author         GitHub login of the publisher.
 * @property {string}      html_url       Link to the release page.
 * @property {boolean}     prerelease
 * @property {boolean}     draft
 */

/**
 * Normalise one release object to the stable shape consumed by the panel.
 *
 * @param {object} raw
 * @returns {NormalizedRelease}
 */
export function normalizeRelease(raw) {
  return {
    id: raw.id,
    tag_name: raw.tag_name ?? '',
    name: raw.name ?? raw.tag_name ?? '(untitled)',
    published_at: raw.published_at ?? null,
    author: raw.author?.login ?? null,
    html_url: raw.html_url ?? '',
    prerelease: Boolean(raw.prerelease),
    draft: Boolean(raw.draft),
  };
}

/**
 * Compute days since the most recently published release.
 * Drafts and unpublished entries are skipped. Returns null when no release
 * has a `published_at` timestamp.
 *
 * @param {NormalizedRelease[]} releases
 * @param {Date}                [now=new Date()]   Injectable for tests.
 * @returns {number|null}
 */
export function lastReleaseAgeDays(releases, now = new Date()) {
  const published = releases
    .filter((r) => !r.draft && r.published_at)
    .map((r) => Date.parse(r.published_at))
    .filter((t) => Number.isFinite(t));
  if (published.length === 0) return null;
  const newest = Math.max(...published);
  const diffMs = now.getTime() - newest;
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

/**
 * Fetch recent GitHub Releases for a mobile-app repo.
 *
 * @param {'ios' | 'android'} platform
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ releases: NormalizedRelease[], lastReleaseAgeDays: number|null, fetchedAt: string }>}
 */
export async function fetchRecentReleases(platform, opts = {}) {
  if (USE_STATIC_DATA) return fetchStaticJson(`${platform}-releases.json`);

  const { limit = 10 } = opts;
  const repo = repoFor(platform);
  const url = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/releases?per_page=${limit}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub Releases (${repo.fullName}): ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const releases = Array.isArray(json) ? json.map(normalizeRelease) : [];
  return {
    releases,
    lastReleaseAgeDays: lastReleaseAgeDays(releases),
    fetchedAt: new Date().toISOString(),
  };
}
