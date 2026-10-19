import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAutomatedTests,
  normaliseEnvelope,
  normaliseFramework,
  normaliseGatedJob,
  shortRepoName,
} from '../../services/automatedTests.js';

// ── normaliseFramework ───────────────────────────────────────────────────────

describe('normaliseFramework', () => {
  it.each([
    ['wdio', 'wdio'],
    ['WebdriverIO', 'wdio'],
    ['webdriver', 'wdio'],
    ['Cypress', 'cypress'],
    ['playwright', 'other'],
    ['', 'other'],
    [null, 'other'],
    [undefined, 'other'],
    [42, 'other'],
  ])('maps %p to %p', (input, expected) => {
    expect(normaliseFramework(input)).toBe(expected);
  });
});

// ── shortRepoName ────────────────────────────────────────────────────────────

describe('shortRepoName', () => {
  it('extracts the last path segment', () => {
    expect(shortRepoName('mediawiki/extensions/AbuseFilter')).toBe('AbuseFilter');
  });
  it('returns the input when no slash is present', () => {
    expect(shortRepoName('Echo')).toBe('Echo');
  });
  it('returns empty string for blank input', () => {
    expect(shortRepoName('')).toBe('');
    expect(shortRepoName('   ')).toBe('');
    expect(shortRepoName(null)).toBe('');
  });
});

// ── normaliseEnvelope ────────────────────────────────────────────────────────

describe('normaliseEnvelope', () => {
  it('normalises an array-of-repos envelope', () => {
    const result = normaliseEnvelope({
      generatedAt: '2026-04-17T00:00:00Z',
      repos: [
        { repo: 'mediawiki/extensions/AbuseFilter',
          url: 'https://gerrit.wikimedia.org/g/mediawiki/extensions/AbuseFilter',
          framework: 'wdio', wdioVersion: '6.5.0',
          mediawikiVersion: '9.27.0', gatedSelenium: true, tests: ['test a', 'test b'] },
      ],
    });
    expect(result.generatedAt).toBe('2026-04-17T00:00:00Z');
    expect(result.repoCount).toBe(1);
    expect(result.testCount).toBe(2);
    expect(result.repos[0]).toMatchObject({
      name: 'AbuseFilter',
      repoPath: 'mediawiki/extensions/AbuseFilter',
      url: 'https://gerrit.wikimedia.org/g/mediawiki/extensions/AbuseFilter',
      framework: 'wdio',
      frameworkVersion: '6.5.0',
      mediawikiVersion: '9.27.0',
      gatedSelenium: true,
      testCount: 2,
    });
    expect(result.repos[0].tests).toEqual([
      { name: 'test a', daily: false },
      { name: 'test b', daily: false },
    ]);
  });

  it('normalises an object-of-repos envelope (keyed by name)', () => {
    const result = normaliseEnvelope({
      repos: {
        Echo: { framework: 'cypress', cypressVersion: '15.11.0', tests: [{ name: 't1' }] },
      },
    });
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].name).toBe('Echo');
    expect(result.repos[0].framework).toBe('cypress');
    expect(result.repos[0].frameworkVersion).toBe('15.11.0');
  });

  it('preserves explicit top-level counts when provided', () => {
    const result = normaliseEnvelope({
      repoCount: 45,
      testCount: 383,
      repos: [{ repo: 'AbuseFilter', tests: [{ name: 't' }] }],
    });
    expect(result.repoCount).toBe(45);
    expect(result.testCount).toBe(383);
  });

  it('falls back to [] for a malformed input', () => {
    expect(normaliseEnvelope(null).repos).toEqual([]);
    expect(normaliseEnvelope(undefined).repos).toEqual([]);
    expect(normaliseEnvelope('string').repos).toEqual([]);
    expect(normaliseEnvelope({ repos: 'nope' }).repos).toEqual([]);
  });

  it('drops repos without a usable name', () => {
    const result = normaliseEnvelope({ repos: [{}, { repo: '' }, { repo: 'Echo' }] });
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].name).toBe('Echo');
  });

  it('defaults missing fields to null / false / []', () => {
    const result = normaliseEnvelope({ repos: [{ repo: 'Echo' }] });
    expect(result.repos[0]).toMatchObject({
      framework: 'other',
      mediawikiVersion: null,
      frameworkVersion: null,
      url: null,
      gatedSelenium: false,
      testCount: 0,
      tests: [],
    });
  });

  it('keeps the schema v2 gatedJob and per-job flaky count', () => {
    const result = normaliseEnvelope({
      schemaVersion: 2,
      gatedJob: {
        name: 'quibble-with-gated-extensions-selenium-php83',
        url: 'https://integration.wikimedia.org/ci/job/quibble-with-gated-extensions-selenium-php83/',
      },
      repos: [{
        repo: 'mediawiki/extensions/AdvancedSearch',
        dailyJobs: [{
          name: 'catalyst-daily-AdvancedSearch',
          url: 'https://integration.wikimedia.org/ci/job/catalyst-daily-AdvancedSearch/',
          passes: 5, flaky: 3, fails: 2, total: 7,
          results: ['U', 'F', 'U', 'F', 'P', 'U', 'P'],
        }],
      }],
    });
    expect(result.gatedJob).toEqual({
      name: 'quibble-with-gated-extensions-selenium-php83',
      url: 'https://integration.wikimedia.org/ci/job/quibble-with-gated-extensions-selenium-php83/',
    });
    expect(result.repos[0].daily).toBe(true);
    expect(result.repos[0].dailyJobs[0]).toMatchObject({ name: 'catalyst-daily-AdvancedSearch', flaky: 3 });
  });

  it('sets gatedJob to null when the scanner does not emit it', () => {
    expect(normaliseEnvelope({ repos: [] }).gatedJob).toBeNull();
  });
});

// ── normaliseGatedJob ────────────────────────────────────────────────────────

describe('normaliseGatedJob', () => {
  it('returns name and url', () => {
    expect(normaliseGatedJob({ name: 'gated', url: 'https://example/job/gated/' }))
      .toEqual({ name: 'gated', url: 'https://example/job/gated/' });
  });

  it('sets url to null when it is missing or blank', () => {
    expect(normaliseGatedJob({ name: 'gated' })).toEqual({ name: 'gated', url: null });
    expect(normaliseGatedJob({ name: 'gated', url: '  ' })).toEqual({ name: 'gated', url: null });
  });

  it('returns null for malformed input', () => {
    expect(normaliseGatedJob(null)).toBeNull();
    expect(normaliseGatedJob('gated')).toBeNull();
    expect(normaliseGatedJob({})).toBeNull();
    expect(normaliseGatedJob({ name: '' })).toBeNull();
    expect(normaliseGatedJob({ name: 42 })).toBeNull();
  });
});

// ── fetchAutomatedTests ──────────────────────────────────────────────────────

describe('fetchAutomatedTests', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns normalised data on success', async () => {
    const body = {
      generatedAt: '2026-04-17T00:00:00Z',
      repos: [{ repo: 'Echo', framework: 'wdio', tests: [{ name: 't' }] }],
    };
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
    const result = await fetchAutomatedTests();
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0].name).toBe('Echo');
  });

  it('throws a helpful error when the endpoint returns 404', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    });
    await expect(fetchAutomatedTests()).rejects.toThrow(/not yet published/i);
  });

  it('throws a plain HTTP error for other non-OK responses', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });
    await expect(fetchAutomatedTests()).rejects.toThrow(/503/);
  });

  it('propagates network errors', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));
    await expect(fetchAutomatedTests()).rejects.toThrow('network down');
  });
});
