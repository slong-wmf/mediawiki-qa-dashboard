import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchFlakyTests,
  normaliseRow,
  parseJobFromExample,
} from '../../services/flakyTests.js';

beforeEach(() => {
  global.fetch = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOk(json) {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(json),
  });
}

function mockFetchStatus(status, statusText = '') {
  global.fetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve({}),
  });
}

describe('normaliseRow', () => {
  it('returns null for non-object input', () => {
    expect(normaliseRow(null)).toBeNull();
    expect(normaliseRow(undefined)).toBeNull();
    expect(normaliseRow('string')).toBeNull();
    expect(normaliseRow(42)).toBeNull();
  });

  it('returns null when count is not numeric', () => {
    expect(normaliseRow({ name: 'foo' })).toBeNull();
    expect(normaliseRow({ name: 'foo', count: 'lots' })).toBeNull();
  });

  it('coerces string-typed count when finite', () => {
    const r = normaliseRow({ name: 'foo', count: '7' });
    expect(r?.count).toBe(7);
  });

  it('picks well-known field aliases for name/repo/job', () => {
    const r = normaliseRow({ test_name: 'foo', project: 'X', build_name: 'job-1', count: 3 });
    expect(r).toMatchObject({ name: 'foo', repo: 'X', job: 'job-1', count: 3 });
  });

  it('preserves the raw row for forward compatibility', () => {
    const raw = { name: 'foo', count: 3, weird_field: 'yes' };
    const r = normaliseRow(raw);
    expect(r?.raw).toEqual(raw);
  });

  it('handles the live capitalised Datasette schema (Count, Test Name, Example)', () => {
    const raw = {
      'Count': 47,
      'Test Name': 'Page ->should be restorable',
      'Example': '<a href=https://integration.wikimedia.org/ci/job/quibble-composer-mysql-php81-selenium/1326/>https://integration.wikimedia.org/ci/job/quibble-composer-mysql-php81-selenium/1326/</a>',
      'Most recent flake': '2026-05-01 09:00:18',
    };
    const r = normaliseRow(raw);
    expect(r).toMatchObject({
      name: 'Page ->should be restorable',
      job: 'quibble-composer-mysql-php81-selenium',
      count: 47,
    });
    expect(r?.repo).toBeNull();
  });
});

describe('parseJobFromExample', () => {
  it('extracts the job name from a Jenkins href', () => {
    const html = '<a href=https://integration.wikimedia.org/ci/job/quibble-composer-mysql-php81-selenium/1326/>1326</a>';
    expect(parseJobFromExample(html)).toBe('quibble-composer-mysql-php81-selenium');
  });

  it('returns null for non-string input', () => {
    expect(parseJobFromExample(null)).toBeNull();
    expect(parseJobFromExample(undefined)).toBeNull();
    expect(parseJobFromExample(42)).toBeNull();
  });

  it('returns null when the href does not match the /ci/job/ pattern', () => {
    expect(parseJobFromExample('https://example.com/foo')).toBeNull();
    expect(parseJobFromExample('plain text')).toBeNull();
  });
});

describe('fetchFlakyTests', () => {
  it('returns the parsed envelope on success', async () => {
    mockFetchOk({
      generatedAt: '2026-05-01T10:00:00.000Z',
      rows: [{ name: 'a', count: 5 }, { name: 'b', count: 3 }],
    });
    const result = await fetchFlakyTests();
    expect(global.fetch).toHaveBeenCalledWith('/data/flaky-tests.json');
    expect(result.generatedAt).toBe('2026-05-01T10:00:00.000Z');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].count).toBe(5);
  });

  it('accepts a bare array response (no envelope)', async () => {
    mockFetchOk([{ name: 'a', count: 5 }]);
    const result = await fetchFlakyTests();
    expect(result.generatedAt).toBeNull();
    expect(result.rows).toHaveLength(1);
  });

  it('returns an empty envelope on 404', async () => {
    mockFetchStatus(404, 'Not Found');
    const result = await fetchFlakyTests();
    expect(result).toEqual({ generatedAt: null, rows: [] });
  });

  it('throws on non-404 errors', async () => {
    mockFetchStatus(500, 'Internal Server Error');
    await expect(fetchFlakyTests()).rejects.toThrow(/500/);
  });

  it('drops rows that fail normalisation', async () => {
    mockFetchOk({ rows: [{ name: 'good', count: 1 }, { name: 'bad' }, null] });
    const result = await fetchFlakyTests();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('good');
  });
});
