import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normaliseStatus,
  extractTestCounts,
  fetchRecentBuilds,
  fetchTrackedJobs,
  fetchBuildConsoleTail,
} from '../../services/jenkins.js';

// ── normaliseStatus ───────────────────────────────────────────────────────────

describe('normaliseStatus', () => {
  describe('positive cases', () => {
    it('maps SUCCESS to passed', () => {
      expect(normaliseStatus('SUCCESS')).toBe('passed');
    });

    it('maps FAILURE to failed', () => {
      expect(normaliseStatus('FAILURE')).toBe('failed');
    });

    it('maps UNSTABLE to failed', () => {
      // Unstable means tests ran but some failed — treated as a failure signal
      expect(normaliseStatus('UNSTABLE')).toBe('failed');
    });
  });

  describe('negative / edge cases', () => {
    it('maps ABORTED to other', () => {
      expect(normaliseStatus('ABORTED')).toBe('other');
    });

    it('maps NOT_BUILT to other', () => {
      expect(normaliseStatus('NOT_BUILT')).toBe('other');
    });

    it('maps null to other (in-progress build)', () => {
      expect(normaliseStatus(null)).toBe('other');
    });

    it('maps undefined to other', () => {
      expect(normaliseStatus(undefined)).toBe('other');
    });

    it('maps empty string to other', () => {
      expect(normaliseStatus('')).toBe('other');
    });

    it('maps an unrecognised string to other', () => {
      expect(normaliseStatus('SOMETHING_NEW')).toBe('other');
    });
  });
});

// ── extractTestCounts ─────────────────────────────────────────────────────────

describe('extractTestCounts', () => {
  describe('positive cases', () => {
    it('extracts all counts from a full TestResultAction', () => {
      const actions = [
        {
          _class: 'hudson.tasks.junit.TestResultAction',
          totalCount: 100,
          failCount: 5,
          skipCount: 2,
        },
      ];
      expect(extractTestCounts(actions)).toEqual({
        total: 100,
        failed: 5,
        skipped: 2,
        passed: 93,
      });
    });

    it('defaults failCount and skipCount to 0 when absent', () => {
      const actions = [
        { _class: 'hudson.tasks.junit.TestResultAction', totalCount: 10 },
      ];
      expect(extractTestCounts(actions)).toEqual({
        total: 10,
        failed: 0,
        skipped: 0,
        passed: 10,
      });
    });

    it('skips non-TestResultAction entries and finds the right one', () => {
      const actions = [
        { _class: 'some.OtherAction', totalCount: 999 },
        {
          _class: 'hudson.tasks.junit.TestResultAction',
          totalCount: 50,
          failCount: 1,
          skipCount: 0,
        },
      ];
      expect(extractTestCounts(actions)).toEqual({
        total: 50,
        failed: 1,
        skipped: 0,
        passed: 49,
      });
    });

    it('clamps passed to 0 when fail+skip exceeds total', () => {
      const actions = [
        {
          _class: 'hudson.tasks.junit.TestResultAction',
          totalCount: 5,
          failCount: 4,
          skipCount: 3,
        },
      ];
      // Math.max(0, 5 - 4 - 3) = Math.max(0, -2) = 0
      expect(extractTestCounts(actions).passed).toBe(0);
    });
  });

  describe('negative / edge cases', () => {
    it('returns null for an empty array', () => {
      expect(extractTestCounts([])).toBeNull();
    });

    it('returns null when no TestResultAction is present', () => {
      expect(extractTestCounts([{ _class: 'some.OtherAction' }])).toBeNull();
    });

    it('returns null when TestResultAction has no totalCount', () => {
      expect(
        extractTestCounts([{ _class: 'hudson.tasks.junit.TestResultAction' }]),
      ).toBeNull();
    });

    it('returns null for null input', () => {
      expect(extractTestCounts(null)).toBeNull();
    });

    it('returns null for a non-array input', () => {
      expect(extractTestCounts('not an array')).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(extractTestCounts(undefined)).toBeNull();
    });
  });
});

// ── fetchRecentBuilds ─────────────────────────────────────────────────────────

const SUCCESSFUL_BUILD = {
  result: 'SUCCESS',
  duration: 120_000,
  timestamp: 1_700_000_000_000,
  url: 'https://integration.wikimedia.org/ci/job/some-job/1/',
  actions: [],
};

const FAILED_BUILD = {
  result: 'FAILURE',
  duration: 60_000,
  timestamp: 1_700_000_001_000,
  url: 'https://integration.wikimedia.org/ci/job/some-job/2/',
  actions: [],
};

const IN_PROGRESS_BUILD = {
  result: null,
  duration: 0,
  timestamp: 1_700_000_002_000,
  url: 'https://integration.wikimedia.org/ci/job/some-job/3/',
  actions: [],
};

function mockJobResponse(builds) {
  return {
    ok: true,
    json: async () => ({ builds }),
  };
}

describe('fetchRecentBuilds', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(mockJobResponse([SUCCESSFUL_BUILD]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('positive cases', () => {
    it('returns a { builds, failedJobs } object', async () => {
      const result = await fetchRecentBuilds();
      expect(Array.isArray(result.builds)).toBe(true);
      expect(Array.isArray(result.failedJobs)).toBe(true);
      expect(result.builds.length).toBeGreaterThan(0);
    });

    it('each build has the expected shape', async () => {
      const { builds } = await fetchRecentBuilds();
      const build = builds[0];
      expect(build).toMatchObject({
        job: expect.any(String),
        job_url: expect.any(String),
        build_url: expect.any(String),
        status: expect.stringMatching(/^(passed|failed|other)$/),
        duration_seconds: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    it('normalises SUCCESS result to passed', async () => {
      const { builds } = await fetchRecentBuilds();
      expect(builds.every((b) => b.status === 'passed')).toBe(true);
    });

    it('normalises FAILURE result to failed', async () => {
      global.fetch.mockResolvedValue(mockJobResponse([FAILED_BUILD]));
      const { builds } = await fetchRecentBuilds();
      expect(builds.every((b) => b.status === 'failed')).toBe(true);
    });

    it('converts duration from milliseconds to seconds', async () => {
      const { builds } = await fetchRecentBuilds();
      // 120_000 ms → 120 s
      expect(builds[0].duration_seconds).toBe(120);
    });

    it('sorts builds by timestamp descending (most recent first)', async () => {
      global.fetch.mockResolvedValue(
        mockJobResponse([SUCCESSFUL_BUILD, FAILED_BUILD]),
      );
      const { builds } = await fetchRecentBuilds();
      for (let i = 1; i < builds.length; i++) {
        expect(new Date(builds[i - 1].timestamp) >= new Date(builds[i].timestamp)).toBe(true);
      }
    });

    it('returns partial results when some jobs fail', async () => {
      let callCount = 0;
      global.fetch.mockImplementation(() => {
        callCount++;
        // Fail every third request
        if (callCount % 3 === 0) return Promise.reject(new Error('flaky'));
        return Promise.resolve(mockJobResponse([SUCCESSFUL_BUILD]));
      });
      const { builds, failedJobs } = await fetchRecentBuilds();
      expect(builds.length).toBeGreaterThan(0);
      // At least one job failed — metadata should surface that for the banner
      expect(failedJobs.length).toBeGreaterThan(0);
    });

    it('populates failedJobs entries with { label, error }', async () => {
      // First call fails with the exact message fetchJobBuilds would throw;
      // all subsequent calls succeed so we still get a partial result.
      let callCount = 0;
      global.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
          });
        }
        return Promise.resolve(mockJobResponse([SUCCESSFUL_BUILD]));
      });
      const { failedJobs } = await fetchRecentBuilds();
      expect(failedJobs.length).toBe(1);
      expect(failedJobs[0]).toMatchObject({
        label: expect.any(String),
        error: expect.stringContaining('503'),
      });
    });

    it('returns an empty failedJobs array when all jobs succeed', async () => {
      const { failedJobs } = await fetchRecentBuilds();
      expect(failedJobs).toEqual([]);
    });

    it('filters out in-progress builds (result === null)', async () => {
      global.fetch.mockResolvedValue(
        mockJobResponse([IN_PROGRESS_BUILD, SUCCESSFUL_BUILD]),
      );
      const { builds } = await fetchRecentBuilds();
      // In-progress builds have result null and are filtered before mapping,
      // so none should survive into the output
      expect(builds.every((b) => b.status !== undefined)).toBe(true);
      expect(builds.every((b) => b.status === 'passed')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('throws when every job fails (total outage)', async () => {
      global.fetch.mockRejectedValue(new Error('network error'));
      await expect(fetchRecentBuilds()).rejects.toThrow();
    });

    it('throws when a job returns a non-OK HTTP status', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
      await expect(fetchRecentBuilds()).rejects.toThrow();
    });

    it('throws when the response is missing the builds array', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ notBuilds: [] }),
      });
      await expect(fetchRecentBuilds()).rejects.toThrow();
    });
  });
});

// ── fetchTrackedJobs ──────────────────────────────────────────────────────────

/**
 * Build a mock view API response containing the given job names.
 */
function mockViewResponse(jobNames) {
  return {
    ok: true,
    json: async () => ({ jobs: jobNames.map((name) => ({ name, url: `https://integration.wikimedia.org/ci/job/${name}/` })) }),
  };
}

describe('fetchTrackedJobs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('positive cases', () => {
    it('returns an array of job descriptors from both views', async () => {
      global.fetch = vi.fn()
        // Selenium view
        .mockResolvedValueOnce(mockViewResponse(['quibble-composer-mysql-php81-selenium']))
        // selenium-daily view
        .mockResolvedValueOnce(mockViewResponse(['selenium-daily-beta-Echo']));

      const jobs = await fetchTrackedJobs();
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBe(2);
    });

    it('each descriptor has label, slug, and hasTestReport', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce(mockViewResponse(['quibble-composer-mysql-php81-selenium']))
        .mockResolvedValueOnce(mockViewResponse([]));

      const jobs = await fetchTrackedJobs();
      expect(jobs[0]).toMatchObject({
        label: expect.any(String),
        slug: expect.any(String),
        hasTestReport: expect.any(Boolean),
      });
    });

    it('sets hasTestReport=true for selenium-daily-beta-* jobs', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce(mockViewResponse([]))
        .mockResolvedValueOnce(mockViewResponse(['selenium-daily-beta-Echo', 'selenium-daily-beta-Popups']));

      const jobs = await fetchTrackedJobs();
      expect(jobs.every((j) => j.hasTestReport === true)).toBe(true);
    });

    it('sets hasTestReport=false for non-daily jobs', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce(mockViewResponse(['quibble-composer-mysql-php81-selenium', 'wikibase-selenium']))
        .mockResolvedValueOnce(mockViewResponse([]));

      const jobs = await fetchTrackedJobs();
      expect(jobs.every((j) => j.hasTestReport === false)).toBe(true);
    });

    it('deduplicates jobs that appear in both views', async () => {
      const sharedJob = 'quibble-composer-mysql-php81-selenium';
      global.fetch = vi.fn()
        .mockResolvedValueOnce(mockViewResponse([sharedJob]))
        .mockResolvedValueOnce(mockViewResponse([sharedJob]));

      const jobs = await fetchTrackedJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].slug).toBe(sharedJob);
    });

    it('succeeds with jobs from only one view when the other fails', async () => {
      global.fetch = vi.fn()
        // Selenium view succeeds
        .mockResolvedValueOnce(mockViewResponse(['quibble-composer-mysql-php81-selenium']))
        // selenium-daily view fails
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' });

      const jobs = await fetchTrackedJobs();
      expect(jobs.length).toBe(1);
    });
  });

  describe('negative cases', () => {
    it('throws when both views return no jobs', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce(mockViewResponse([]))
        .mockResolvedValueOnce(mockViewResponse([]));

      await expect(fetchTrackedJobs()).rejects.toThrow();
    });

    it('throws when both view requests fail', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
      await expect(fetchTrackedJobs()).rejects.toThrow();
    });

    it('throws when both views return non-OK HTTP status', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
      await expect(fetchTrackedJobs()).rejects.toThrow();
    });

    it('error message includes upstream reason when both views fail', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' });

      await expect(fetchTrackedJobs()).rejects.toThrow(/No jobs found/);
    });
  });
});

// ── fetchBuildConsoleTail ────────────────────────────────────────────────────

describe('fetchBuildConsoleTail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rewrites an absolute Jenkins build URL onto the /api/jenkins proxy path', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'line 1\nline 2',
    });
    await fetchBuildConsoleTail(
      'https://integration.wikimedia.org/ci/job/some-job/5/',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/jenkins/job/some-job/5/consoleText');
  });

  it('returns the last N non-empty lines joined by newlines', async () => {
    const text = ['a', '', 'b', 'c', '', 'd'].join('\n');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => text,
    });
    const tail = await fetchBuildConsoleTail(
      'https://integration.wikimedia.org/ci/job/j/1/',
      { lines: 2 },
    );
    expect(tail).toBe('c\nd');
  });

  it('throws on a non-OK HTTP status with a descriptive message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    await expect(
      fetchBuildConsoleTail('https://integration.wikimedia.org/ci/job/j/1/'),
    ).rejects.toThrow(/404 Not Found/);
  });

  it('throws when buildUrl is missing', async () => {
    await expect(fetchBuildConsoleTail('')).rejects.toThrow(/buildUrl is required/);
  });

  it('returns null in static-data mode without calling fetch', async () => {
    vi.resetModules();
    vi.doMock('../../services/staticData.js', () => ({
      USE_STATIC_DATA: true,
      fetchStaticJson: vi.fn(),
    }));
    const mod = await import('../../services/jenkins.js');
    global.fetch = vi.fn();
    const out = await mod.fetchBuildConsoleTail(
      'https://integration.wikimedia.org/ci/job/j/1/',
    );
    expect(out).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    vi.doUnmock('../../services/staticData.js');
  });
});
