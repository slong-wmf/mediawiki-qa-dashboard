import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchMetricsHistory } from '../../services/metricsHistory.js';

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

describe('fetchMetricsHistory', () => {
  it('returns the parsed envelope on success', async () => {
    const sample = {
      generatedAt: '2026-04-29T13:00:00.000Z',
      windowDays: 90,
      entries: [
        {
          date: '2026-04-29',
          dailyPassRate: { pct: 80, passes: 8, fails: 2, total: 10 },
          coverage: { coreAvg: 50, extensionsAvg: 65, extensionsCount: 3 },
          e2eTestCount: { wdio: 5, cypress: 2, total: 7 },
          dailyTestRunCount: 10,
        },
      ],
    };
    mockFetchOk(sample);
    const result = await fetchMetricsHistory();
    expect(global.fetch).toHaveBeenCalledWith('/data/metrics-history.json');
    expect(result).toEqual(sample);
  });

  it('returns an empty envelope on 404', async () => {
    mockFetchStatus(404, 'Not Found');
    const result = await fetchMetricsHistory();
    expect(result.entries).toEqual([]);
    expect(result.generatedAt).toBeNull();
    expect(result.windowDays).toBe(90);
  });

  it('throws on non-404 errors', async () => {
    mockFetchStatus(500, 'Internal Server Error');
    await expect(fetchMetricsHistory()).rejects.toThrow(/500/);
  });

  it('coerces malformed responses to safe defaults', async () => {
    mockFetchOk({ entries: 'not-an-array' });
    const result = await fetchMetricsHistory();
    expect(result.entries).toEqual([]);
    expect(result.windowDays).toBe(90);
  });
});
