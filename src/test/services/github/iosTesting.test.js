import { describe, it, expect, vi, afterEach } from 'vitest';

describe('fetchIosTestingDashboard (live mode)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('fetches PR runs, main runs, and artifact metadata without Authorization', async () => {
    vi.resetModules();
    vi.doMock('../../../services/staticData.js', () => ({
      USE_STATIC_DATA: false,
      fetchStaticJson: vi.fn(),
    }));
    const mod = await import('../../../services/github/iosTesting.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workflow_runs: [], artifacts: [] }),
    });

    const out = await mod.fetchIosTestingDashboard();

    expect(out.repo).toBe('wikimedia/wikipedia-ios');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[0][0]).toContain('event=pull_request');
    expect(global.fetch.mock.calls[1][0]).toContain('branch=main');
    expect(global.fetch.mock.calls[2][0]).toContain('/actions/artifacts?per_page=100');
    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers.Authorization).toBeUndefined();
    }
  });

  it('throws with status details when GitHub returns non-OK', async () => {
    vi.resetModules();
    vi.doMock('../../../services/staticData.js', () => ({
      USE_STATIC_DATA: false,
      fetchStaticJson: vi.fn(),
    }));
    const mod = await import('../../../services/github/iosTesting.js');
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

    await expect(mod.fetchIosTestingDashboard()).rejects.toThrow(/403 Forbidden/);
  });
});

describe('fetchIosTestingDashboard (static mode)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../services/staticData.js');
  });

  it('reads ios-testing.json without calling GitHub', async () => {
    vi.resetModules();
    const fetchStaticJson = vi.fn().mockResolvedValue({ repo: 'wikimedia/wikipedia-ios' });
    vi.doMock('../../../services/staticData.js', () => ({
      USE_STATIC_DATA: true,
      fetchStaticJson,
    }));
    const mod = await import('../../../services/github/iosTesting.js');
    global.fetch = vi.fn();

    const out = await mod.fetchIosTestingDashboard();

    expect(fetchStaticJson).toHaveBeenCalledWith('ios-testing.json');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(out.repo).toBe('wikimedia/wikipedia-ios');
  });
});
