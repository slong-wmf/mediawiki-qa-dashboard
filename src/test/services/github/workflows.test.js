import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeRun,
  aggregateByWorkflow,
  fetchRecentWorkflowRuns,
} from '../../../services/github/workflows.js';

// ── normalizeRun ──────────────────────────────────────────────────────────────

describe('normalizeRun', () => {
  const RAW_RUN = {
    id: 12345,
    name: 'Build & Test',
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-04-20T10:00:00Z',
    run_started_at: '2026-04-20T10:00:30Z',
    updated_at: '2026-04-20T10:05:30Z',
    html_url: 'https://github.com/wikimedia/wikipedia-ios/actions/runs/12345',
    head_branch: 'main',
    event: 'push',
    run_attempt: 1,
  };

  describe('positive cases', () => {
    it('passes through every stable field unchanged', () => {
      const out = normalizeRun(RAW_RUN);
      expect(out).toMatchObject({
        id: 12345,
        name: 'Build & Test',
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-04-20T10:00:00Z',
        run_started_at: '2026-04-20T10:00:30Z',
        updated_at: '2026-04-20T10:05:30Z',
        html_url: 'https://github.com/wikimedia/wikipedia-ios/actions/runs/12345',
        head_branch: 'main',
        event: 'push',
        run_attempt: 1,
      });
    });

    it('derives duration_ms from run_started_at → updated_at', () => {
      const out = normalizeRun(RAW_RUN);
      // 10:00:30 → 10:05:30 = 5 minutes = 300 000 ms
      expect(out.duration_ms).toBe(300_000);
    });

    it('falls back to created_at when run_started_at is absent', () => {
      const out = normalizeRun({ ...RAW_RUN, run_started_at: null });
      // 10:00:00 → 10:05:30 = 330 000 ms
      expect(out.duration_ms).toBe(330_000);
    });
  });

  describe('negative / edge cases', () => {
    it('returns null duration_ms when updated_at is missing', () => {
      const out = normalizeRun({ ...RAW_RUN, updated_at: null });
      expect(out.duration_ms).toBeNull();
    });

    it('returns null duration_ms when timestamps are unparseable', () => {
      const out = normalizeRun({ ...RAW_RUN, run_started_at: 'garbage', updated_at: 'also garbage', created_at: 'nope' });
      expect(out.duration_ms).toBeNull();
    });

    it('returns null duration_ms when end is before start (clock skew)', () => {
      const out = normalizeRun({
        ...RAW_RUN,
        run_started_at: '2026-04-20T10:05:30Z',
        updated_at: '2026-04-20T10:00:00Z',
      });
      expect(out.duration_ms).toBeNull();
    });

    it('substitutes "(unnamed workflow)" for missing name', () => {
      const out = normalizeRun({ ...RAW_RUN, name: undefined });
      expect(out.name).toBe('(unnamed workflow)');
    });

    it('defaults conclusion to null for in-progress runs', () => {
      const out = normalizeRun({ ...RAW_RUN, conclusion: undefined });
      expect(out.conclusion).toBeNull();
    });

    it('defaults run_attempt to 1 when absent', () => {
      const out = normalizeRun({ ...RAW_RUN, run_attempt: undefined });
      expect(out.run_attempt).toBe(1);
    });
  });
});

// ── aggregateByWorkflow ──────────────────────────────────────────────────────

describe('aggregateByWorkflow', () => {
  it('groups runs by workflow name with passed/failed counts', () => {
    const runs = [
      { name: 'CI', conclusion: 'success', duration_ms: 60_000 },
      { name: 'CI', conclusion: 'failure', duration_ms: 30_000 },
      { name: 'CI', conclusion: 'success', duration_ms: 90_000 },
      { name: 'Lint', conclusion: 'success', duration_ms: 10_000 },
    ];
    const out = aggregateByWorkflow(runs);
    expect(out).toEqual({
      CI:   { n: 3, passed: 2, failed: 1, avgDurationMs: 60_000 },
      Lint: { n: 1, passed: 1, failed: 0, avgDurationMs: 10_000 },
    });
  });

  it('counts timed_out as failed (matches GitHub UI semantics)', () => {
    const runs = [
      { name: 'CI', conclusion: 'timed_out', duration_ms: 100 },
      { name: 'CI', conclusion: 'failure',   duration_ms: 200 },
    ];
    expect(aggregateByWorkflow(runs).CI.failed).toBe(2);
  });

  it('does not count cancelled or skipped runs as either passed or failed', () => {
    const runs = [
      { name: 'CI', conclusion: 'cancelled', duration_ms: 100 },
      { name: 'CI', conclusion: 'skipped',   duration_ms: 100 },
    ];
    const ci = aggregateByWorkflow(runs).CI;
    expect(ci.n).toBe(2);
    expect(ci.passed).toBe(0);
    expect(ci.failed).toBe(0);
  });

  it('returns null avgDurationMs when no run has a numeric duration', () => {
    const runs = [{ name: 'CI', conclusion: 'success', duration_ms: null }];
    expect(aggregateByWorkflow(runs).CI.avgDurationMs).toBeNull();
  });

  it('rounds avgDurationMs to an integer', () => {
    const runs = [
      { name: 'CI', conclusion: 'success', duration_ms: 100 },
      { name: 'CI', conclusion: 'success', duration_ms: 101 },
      { name: 'CI', conclusion: 'success', duration_ms: 100 },
    ];
    // mean = 100.333… → 100
    expect(aggregateByWorkflow(runs).CI.avgDurationMs).toBe(100);
  });

  it('returns an empty object for an empty input array', () => {
    expect(aggregateByWorkflow([])).toEqual({});
  });
});

// ── fetchRecentWorkflowRuns ──────────────────────────────────────────────────

describe('fetchRecentWorkflowRuns (live mode)', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('hits the per_page=30 actions/runs URL for the given platform by default', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ workflow_runs: [] }),
    });
    await fetchRecentWorkflowRuns('ios');
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/wikimedia/wikipedia-ios/actions/runs?per_page=30',
    );
  });

  it('uses the android repo when platform="android"', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ workflow_runs: [] }),
    });
    await fetchRecentWorkflowRuns('android');
    expect(global.fetch.mock.calls[0][0]).toContain('apps-android-wikipedia');
  });

  it('honours the limit option', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ workflow_runs: [] }),
    });
    await fetchRecentWorkflowRuns('ios', { limit: 5 });
    expect(global.fetch.mock.calls[0][0]).toContain('per_page=5');
  });

  it('sends the GitHub Accept and API version headers (no auth in browser)', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ workflow_runs: [] }),
    });
    await fetchRecentWorkflowRuns('ios');
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    // PATs must not ship in client JS — confirm we never set Authorization here.
    expect(headers.Authorization).toBeUndefined();
  });

  it('returns runs + byWorkflow + fetchedAt', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        workflow_runs: [
          {
            id: 1, name: 'CI', status: 'completed', conclusion: 'success',
            created_at: '2026-04-20T10:00:00Z',
            run_started_at: '2026-04-20T10:00:00Z',
            updated_at: '2026-04-20T10:01:00Z',
            html_url: 'x', head_branch: 'main', event: 'push', run_attempt: 1,
          },
        ],
      }),
    });
    const out = await fetchRecentWorkflowRuns('ios');
    expect(out.runs).toHaveLength(1);
    expect(out.byWorkflow).toEqual({ CI: { n: 1, passed: 1, failed: 0, avgDurationMs: 60_000 } });
    expect(typeof out.fetchedAt).toBe('string');
  });

  it('throws with status info when GitHub returns non-OK', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
    await expect(fetchRecentWorkflowRuns('ios')).rejects.toThrow(/403 Forbidden/);
  });

  it('returns empty runs when workflow_runs is missing or non-array', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ workflow_runs: null }),
    });
    const out = await fetchRecentWorkflowRuns('ios');
    expect(out.runs).toEqual([]);
    expect(out.byWorkflow).toEqual({});
  });
});

describe('fetchRecentWorkflowRuns (static mode)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../services/staticData.js');
  });

  it('reads ${platform}-workflows.json without calling the live API', async () => {
    vi.resetModules();
    const fetchStaticJson = vi.fn().mockResolvedValue({ runs: [], byWorkflow: {}, fetchedAt: 'snapshot' });
    vi.doMock('../../../services/staticData.js', () => ({
      USE_STATIC_DATA: true,
      fetchStaticJson,
    }));
    const mod = await import('../../../services/github/workflows.js');
    global.fetch = vi.fn();
    const out = await mod.fetchRecentWorkflowRuns('android');
    expect(fetchStaticJson).toHaveBeenCalledWith('android-workflows.json');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(out.fetchedAt).toBe('snapshot');
  });
});
