import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeRelease,
  lastReleaseAgeDays,
  fetchRecentReleases,
} from '../../../services/github/releases.js';

// ── normalizeRelease ─────────────────────────────────────────────────────────

describe('normalizeRelease', () => {
  const RAW = {
    id: 999,
    tag_name: 'v7.6.1',
    name: 'Wikipedia 7.6.1',
    published_at: '2026-04-15T12:00:00Z',
    author: { login: 'releasebot' },
    html_url: 'https://github.com/wikimedia/wikipedia-ios/releases/tag/v7.6.1',
    prerelease: false,
    draft: false,
    body: 'Long markdown changelog…',  // Should be stripped from output.
  };

  it('extracts the publisher login from the nested author object', () => {
    expect(normalizeRelease(RAW).author).toBe('releasebot');
  });

  it('returns the canonical NormalizedRelease shape', () => {
    expect(normalizeRelease(RAW)).toEqual({
      id: 999,
      tag_name: 'v7.6.1',
      name: 'Wikipedia 7.6.1',
      published_at: '2026-04-15T12:00:00Z',
      author: 'releasebot',
      html_url: 'https://github.com/wikimedia/wikipedia-ios/releases/tag/v7.6.1',
      prerelease: false,
      draft: false,
    });
  });

  it('falls back to tag_name when name is missing', () => {
    expect(normalizeRelease({ ...RAW, name: undefined }).name).toBe('v7.6.1');
  });

  it('falls back to "(untitled)" when both name and tag_name are missing', () => {
    expect(normalizeRelease({ id: 1 }).name).toBe('(untitled)');
  });

  it('returns null author when the nested author object is missing', () => {
    expect(normalizeRelease({ ...RAW, author: null }).author).toBeNull();
  });

  it('coerces prerelease/draft to booleans', () => {
    expect(normalizeRelease({ ...RAW, prerelease: 1, draft: 0 }))
      .toMatchObject({ prerelease: true, draft: false });
  });
});

// ── lastReleaseAgeDays ──────────────────────────────────────────────────────

describe('lastReleaseAgeDays', () => {
  const NOW = new Date('2026-04-24T12:00:00Z');

  it('returns 0 for a release published right now', () => {
    expect(lastReleaseAgeDays([{ published_at: NOW.toISOString(), draft: false }], NOW)).toBe(0);
  });

  it('counts whole-day differences (not rounded)', () => {
    const releases = [{ published_at: '2026-04-21T12:00:00Z', draft: false }];
    // Exactly 3 days ago at the same time of day → 3
    expect(lastReleaseAgeDays(releases, NOW)).toBe(3);
  });

  it('hits the 14-day green/amber boundary cleanly', () => {
    const releases = [{ published_at: '2026-04-10T12:00:00Z', draft: false }];
    expect(lastReleaseAgeDays(releases, NOW)).toBe(14);
  });

  it('hits the 30-day amber/red boundary cleanly', () => {
    const releases = [{ published_at: '2026-03-25T12:00:00Z', draft: false }];
    expect(lastReleaseAgeDays(releases, NOW)).toBe(30);
  });

  it('picks the newest published release when multiple are present', () => {
    const releases = [
      { published_at: '2026-01-01T00:00:00Z', draft: false },
      { published_at: '2026-04-23T12:00:00Z', draft: false }, // newest, ~1d old
      { published_at: '2025-06-15T00:00:00Z', draft: false },
    ];
    expect(lastReleaseAgeDays(releases, NOW)).toBe(1);
  });

  it('skips drafts even if their published_at is recent', () => {
    const releases = [
      { published_at: '2026-04-23T12:00:00Z', draft: true },  // ignored
      { published_at: '2026-04-10T12:00:00Z', draft: false },
    ];
    expect(lastReleaseAgeDays(releases, NOW)).toBe(14);
  });

  it('returns null when no release has a published_at', () => {
    const releases = [
      { published_at: null, draft: false },
      { published_at: null, draft: true },
    ];
    expect(lastReleaseAgeDays(releases, NOW)).toBeNull();
  });

  it('returns null for an empty release list', () => {
    expect(lastReleaseAgeDays([], NOW)).toBeNull();
  });

  it('clamps negative values to 0 (release dated in the future)', () => {
    const releases = [{ published_at: '2026-04-25T00:00:00Z', draft: false }];
    expect(lastReleaseAgeDays(releases, NOW)).toBe(0);
  });
});

// ── fetchRecentReleases ─────────────────────────────────────────────────────

describe('fetchRecentReleases (live mode)', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('hits the per_page=10 releases URL by default', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => [] });
    await fetchRecentReleases('ios');
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/wikimedia/wikipedia-ios/releases?per_page=10',
    );
  });

  it('honours the limit option', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => [] });
    await fetchRecentReleases('android', { limit: 3 });
    expect(global.fetch.mock.calls[0][0]).toContain('per_page=3');
    expect(global.fetch.mock.calls[0][0]).toContain('apps-android-wikipedia');
  });

  it('returns releases + lastReleaseAgeDays + fetchedAt', async () => {
    const futureFreshIso = new Date(Date.now() - 86_400_000).toISOString(); // ~1 day ago
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1, tag_name: 'v1', name: 'r1',
          published_at: futureFreshIso,
          author: { login: 'rel' }, html_url: 'x', prerelease: false, draft: false,
        },
      ],
    });
    const out = await fetchRecentReleases('ios');
    expect(out.releases).toHaveLength(1);
    expect(out.lastReleaseAgeDays).toBeGreaterThanOrEqual(0);
    expect(out.lastReleaseAgeDays).toBeLessThanOrEqual(1);
    expect(typeof out.fetchedAt).toBe('string');
  });

  it('throws on non-OK with status info', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    await expect(fetchRecentReleases('ios')).rejects.toThrow(/404 Not Found/);
  });

  it('returns an empty list when GitHub returns non-array body', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: 'oops' }) });
    const out = await fetchRecentReleases('ios');
    expect(out.releases).toEqual([]);
    expect(out.lastReleaseAgeDays).toBeNull();
  });
});

describe('fetchRecentReleases (static mode)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../services/staticData.js');
  });

  it('reads ${platform}-releases.json without hitting the live API', async () => {
    vi.resetModules();
    const fetchStaticJson = vi.fn().mockResolvedValue({
      releases: [], lastReleaseAgeDays: null, fetchedAt: 'snapshot',
    });
    vi.doMock('../../../services/staticData.js', () => ({
      USE_STATIC_DATA: true,
      fetchStaticJson,
    }));
    const mod = await import('../../../services/github/releases.js');
    global.fetch = vi.fn();
    await mod.fetchRecentReleases('ios');
    expect(fetchStaticJson).toHaveBeenCalledWith('ios-releases.json');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
