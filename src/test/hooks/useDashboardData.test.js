import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDashboardData } from '../../hooks/useDashboardData.js';
import { fetchRecentBuilds, fetchTrackedJobs } from '../../services/jenkins.js';
import { fetchCoverageData } from '../../services/coverage.js';
import { fetchRecentBugs, fetchTrainBlockers } from '../../services/phabricator.js';
import { fetchMaintainers } from '../../services/maintainers.js';

vi.mock('../../services/jenkins.js');
vi.mock('../../services/coverage.js');
vi.mock('../../services/phabricator.js');
vi.mock('../../services/maintainers.js');

const MOCK_BUILDS = [
  { job: 'TestJob', status: 'passed', duration_seconds: 60, timestamp: new Date().toISOString() },
];
const MOCK_JENKINS_RESULT = { builds: MOCK_BUILDS, failedJobs: [] };
const MOCK_COVERAGE = {
  core: { name: 'mediawiki-core', coverage_pct: 75, last_updated: '2026-04-03' },
  extensions: [],
};
const MOCK_BUGS = {
  tasks: [],
  totalFetched: 0,
  hasMore: false,
  cutoffDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
};
const MOCK_TRAIN_BLOCKERS = {
  trainTask: { id: 420481, title: '1.46.0-wmf.22 deployment blockers', url: 'https://phabricator.wikimedia.org/T420481', version: '1.46.0-wmf.22', closedAt: new Date().toISOString(), closerUsername: 'testuser' },
  blockers: [],
  totalBlockers: 0,
};

describe('useDashboardData', () => {
  const MOCK_JOBS = [
    { label: 'Job A', slug: 'job-a', hasTestReport: false },
    { label: 'selenium-daily-beta-Echo', slug: 'selenium-daily-beta-Echo', hasTestReport: true },
  ];

  beforeEach(() => {
    fetchRecentBuilds.mockResolvedValue(MOCK_JENKINS_RESULT);
    fetchCoverageData.mockResolvedValue(MOCK_COVERAGE);
    fetchRecentBugs.mockResolvedValue(MOCK_BUGS);
    fetchTrainBlockers.mockResolvedValue(MOCK_TRAIN_BLOCKERS);
    fetchTrackedJobs.mockResolvedValue(MOCK_JOBS);
    fetchMaintainers.mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers(); // prevent fake timers leaking between tests
  });

  describe('initial state', () => {
    it('starts in loading state with empty data', () => {
      // Use never-resolving promises so loading stays true for the assertion
      fetchRecentBuilds.mockImplementation(() => new Promise(() => {}));
      fetchCoverageData.mockImplementation(() => new Promise(() => {}));
      fetchRecentBugs.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useDashboardData());
      expect(result.current.loading).toBe(true);
      expect(result.current.builds).toEqual([]);
      expect(result.current.coverage).toBeNull();
      expect(result.current.bugs).toEqual([]);
      expect(result.current.lastRefreshed).toBeNull();
    });

    it('exposes a refresh function', () => {
      const { result } = renderHook(() => useDashboardData());
      expect(typeof result.current.refresh).toBe('function');
    });

    it('exposes a per-source errors object initialised to nulls', () => {
      fetchRecentBuilds.mockImplementation(() => new Promise(() => {}));
      fetchCoverageData.mockImplementation(() => new Promise(() => {}));
      fetchRecentBugs.mockImplementation(() => new Promise(() => {}));
      fetchTrainBlockers.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useDashboardData());
      expect(result.current.errors).toEqual({
        jenkins: null,
        coverage: null,
        phabricator: null,
        trainBlockers: null,
        maintainers: null,
      });
    });
  });

  describe('successful fetch', () => {
    it('sets loading to false after fetch completes', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('populates builds from jenkins service', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.builds).toEqual(MOCK_BUILDS);
    });

    it('populates coverage from coverage service', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.coverage).toEqual(MOCK_COVERAGE);
    });

    it('populates bugs from phabricator service', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.bugs).toEqual(MOCK_BUGS);
    });

    it('sets lastRefreshed to a Date after fetch', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.lastRefreshed).toBeInstanceOf(Date);
    });

    it('clears all errors on a clean fetch', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors).toEqual({
        jenkins: null,
        coverage: null,
        phabricator: null,
        trainBlockers: null,
        maintainers: null,
      });
    });
  });

  describe('per-source error isolation', () => {
    it('sets errors.jenkins when jenkins fails, leaves other data intact', async () => {
      const err = new Error('Jenkins down');
      fetchRecentBuilds.mockRejectedValue(err);
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.jenkins).toBe(err);
      expect(result.current.builds).toEqual([]);        // unchanged (empty)
      expect(result.current.coverage).toEqual(MOCK_COVERAGE); // unaffected
      expect(result.current.bugs).toEqual(MOCK_BUGS);         // unaffected
    });

    it('sets errors.coverage when coverage fails, leaves other data intact', async () => {
      const err = new Error('Coverage index down');
      fetchCoverageData.mockRejectedValue(err);
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.coverage).toBe(err);
      expect(result.current.coverage).toBeNull();
      expect(result.current.builds).toEqual(MOCK_BUILDS);
    });

    it('sets errors.phabricator when phabricator fails, leaves other data intact', async () => {
      const err = new Error('Conduit timeout');
      fetchRecentBugs.mockRejectedValue(err);
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.phabricator).toBe(err);
      expect(result.current.bugs).toEqual([]);
      expect(result.current.builds).toEqual(MOCK_BUILDS);
    });

    it('still sets loading to false even when all three sources fail', async () => {
      fetchRecentBuilds.mockRejectedValue(new Error('A'));
      fetchCoverageData.mockRejectedValue(new Error('B'));
      fetchRecentBugs.mockRejectedValue(new Error('C'));
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('clears a previous error when the source recovers on refresh', async () => {
      const err = new Error('transient');
      fetchRecentBuilds.mockRejectedValueOnce(err).mockResolvedValue(MOCK_JENKINS_RESULT);

      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.jenkins).toBe(err);

      // Wrap in act() so React flushes setLoading(true) and the subsequent
      // async fetchAll() state updates atomically, avoiding a race condition.
      act(() => { result.current.refresh(); });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.jenkins).toBeNull();
      expect(result.current.builds).toEqual(MOCK_BUILDS);
    });
  });

  describe('manual refresh', () => {
    it('sets loading to true immediately when refresh is called', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Wrap in act() so React flushes the synchronous setLoading(true) state
      // update before the assertion runs.
      act(() => { result.current.refresh(); });
      expect(result.current.loading).toBe(true);
    });

    it('re-fetches all sources on refresh', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      result.current.refresh();
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Each service should have been called twice: initial + refresh
      expect(fetchRecentBuilds).toHaveBeenCalledTimes(2);
      expect(fetchCoverageData).toHaveBeenCalledTimes(2);
      expect(fetchRecentBugs).toHaveBeenCalledTimes(2);
    });

    it('updates lastRefreshed after refresh', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));
      const firstRefresh = result.current.lastRefreshed;

      result.current.refresh();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.lastRefreshed.getTime()).toBeGreaterThanOrEqual(firstRefresh.getTime());
    });
  });

  describe('auto-refresh interval', () => {
    it('calls fetch services again after the interval elapses', async () => {
      // Fake timers MUST be installed before renderHook so that the setInterval
      // created inside the hook's useEffect is tracked by the fake clock.
      // Installing them after the hook mounts means the interval uses real timers
      // and vi.advanceTimersByTime() would never fire it.
      vi.useFakeTimers();
      const { result } = renderHook(() => useDashboardData());

      // The mocks resolve immediately (Promise.resolve), so the entire initial
      // fetch chain completes as microtasks — no macrotimers needed.
      // await act(async () => {}) flushes all pending microtasks and React work.
      await act(async () => {});

      expect(result.current.loading).toBe(false);
      const callsBefore = fetchRecentBuilds.mock.calls.length;

      // Fire the setInterval callback and flush resulting async state updates.
      await act(async () => {
        vi.advanceTimersByTime(3_600_000); // advance by 1 hour (default interval)
      });

      expect(fetchRecentBuilds.mock.calls.length).toBeGreaterThan(callsBefore);
      vi.useRealTimers();
    });
  });

  describe('refreshJobList (Jenkins-only refresh)', () => {
    it('does not set global loading — only jenkinsLoading — during a job-list refresh', async () => {
      // Let the initial fetch complete so we have a clean baseline.
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Hold fetchRecentBuilds open so we can inspect intermediate state.
      let resolveBuilds;
      fetchRecentBuilds.mockReturnValueOnce(
        new Promise((res) => { resolveBuilds = res; }),
      );

      act(() => { result.current.refreshJobList(); });

      // jobListLoading should be true while the view API call is in-flight.
      // Global loading must stay false — other panels must not be disturbed.
      await waitFor(() => expect(result.current.jobListLoading).toBe(true));
      expect(result.current.loading).toBe(false);

      // Let the build fetch complete.
      resolveBuilds(MOCK_JENKINS_RESULT);
      await waitFor(() => expect(result.current.jenkinsLoading).toBe(false));
    });

    it('does not call fetchCoverageData or fetchRecentBugs', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const coverageCalls = fetchCoverageData.mock.calls.length;
      const bugsCalls = fetchRecentBugs.mock.calls.length;

      await act(async () => { await result.current.refreshJobList(); });

      // Neither coverage nor bugs should have been re-fetched.
      expect(fetchCoverageData.mock.calls.length).toBe(coverageCalls);
      expect(fetchRecentBugs.mock.calls.length).toBe(bugsCalls);
    });

    it('calls fetchRecentBuilds again after refreshJobList', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const buildCallsBefore = fetchRecentBuilds.mock.calls.length;

      await act(async () => { await result.current.refreshJobList(); });

      expect(fetchRecentBuilds.mock.calls.length).toBeGreaterThan(buildCallsBefore);
    });

    it('updates builds with the result of the fresh fetch', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const freshBuilds = [
        { job: 'Job A', status: 'failed', duration_seconds: 30, timestamp: new Date().toISOString() },
      ];
      fetchRecentBuilds.mockResolvedValueOnce({ builds: freshBuilds, failedJobs: [] });

      await act(async () => { await result.current.refreshJobList(); });

      expect(result.current.builds).toEqual(freshBuilds);
    });

    it('sets jobListError and leaves builds unchanged when fetchTrackedJobs fails', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const originalBuilds = result.current.builds;
      const err = new Error('View API down');
      fetchTrackedJobs.mockRejectedValueOnce(err);

      await act(async () => { await result.current.refreshJobList(); });

      expect(result.current.jobListError).toBe(err);
      expect(result.current.builds).toEqual(originalBuilds);
    });

    it('sets errors.jenkins and leaves coverage/bugs unchanged when the Jenkins re-fetch fails', async () => {
      const { result } = renderHook(() => useDashboardData());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const err = new Error('Jenkins builds down');
      fetchRecentBuilds.mockRejectedValueOnce(err);

      await act(async () => { await result.current.refreshJobList(); });

      expect(result.current.errors.jenkins).toBe(err);
      // Coverage and bugs are untouched.
      expect(result.current.errors.coverage).toBeNull();
      expect(result.current.errors.phabricator).toBeNull();
    });
  });
});
