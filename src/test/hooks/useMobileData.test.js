import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMobileData } from '../../hooks/useMobileData.js';
import { fetchRecentWorkflowRuns } from '../../services/github/workflows.js';
import { fetchRecentReleases } from '../../services/github/releases.js';
import { fetchTestInventory } from '../../services/github/testInventory.js';

vi.mock('../../services/github/workflows.js');
vi.mock('../../services/github/releases.js');
vi.mock('../../services/github/testInventory.js');

const MOCK_WORKFLOWS = { runs: [], byWorkflow: {}, fetchedAt: '2026-04-24T00:00:00Z' };
const MOCK_RELEASES  = { releases: [], lastReleaseAgeDays: 7, fetchedAt: '2026-04-24T00:00:00Z' };
const MOCK_TESTS = {
  repo: 'wikimedia/wikipedia-ios',
  generatedAt: '2026-04-24T00:00:00Z',
  totals: { uiTests: 5, unitTests: 10, total: 15 },
  byDirectory: [],
};

describe('useMobileData', () => {
  beforeEach(() => {
    fetchRecentWorkflowRuns.mockResolvedValue(MOCK_WORKFLOWS);
    fetchRecentReleases.mockResolvedValue(MOCK_RELEASES);
    fetchTestInventory.mockResolvedValue(MOCK_TESTS);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in loading state with no data', () => {
      // Never-resolving promises so the assertion runs while loading is true.
      fetchRecentWorkflowRuns.mockImplementation(() => new Promise(() => {}));
      fetchRecentReleases.mockImplementation(() => new Promise(() => {}));
      fetchTestInventory.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useMobileData('ios'));
      expect(result.current.loading).toBe(true);
      expect(result.current.initialLoading).toBe(true);
      expect(result.current.workflows).toBeNull();
      expect(result.current.releases).toBeNull();
      expect(result.current.tests).toBeNull();
      expect(result.current.lastRefreshed).toBeNull();
    });

    it('exposes a refresh function and per-source errors initialised to nulls', () => {
      fetchRecentWorkflowRuns.mockImplementation(() => new Promise(() => {}));
      fetchRecentReleases.mockImplementation(() => new Promise(() => {}));
      fetchTestInventory.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useMobileData('ios'));
      expect(typeof result.current.refresh).toBe('function');
      expect(result.current.errors).toEqual({
        workflows: null, releases: null, tests: null,
      });
    });
  });

  describe('successful fetch', () => {
    it('populates all three slices once fetches resolve', async () => {
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.workflows).toEqual(MOCK_WORKFLOWS);
      expect(result.current.releases).toEqual(MOCK_RELEASES);
      expect(result.current.tests).toEqual(MOCK_TESTS);
      expect(result.current.errors).toEqual({ workflows: null, releases: null, tests: null });
    });

    it('flips initialLoading to false after the first completed fetch', async () => {
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.initialLoading).toBe(false));
    });

    it('records lastRefreshed as a Date', async () => {
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.lastRefreshed).toBeInstanceOf(Date));
    });

    it('passes the platform argument through to each service', async () => {
      const { result } = renderHook(() => useMobileData('android'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(fetchRecentWorkflowRuns).toHaveBeenCalledWith('android');
      expect(fetchRecentReleases).toHaveBeenCalledWith('android');
      expect(fetchTestInventory).toHaveBeenCalledWith('android');
    });
  });

  describe('per-source error isolation', () => {
    it('records a workflows error but still populates releases + tests', async () => {
      const err = new Error('workflows down');
      fetchRecentWorkflowRuns.mockRejectedValue(err);
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.workflows).toBe(err);
      expect(result.current.errors.releases).toBeNull();
      expect(result.current.errors.tests).toBeNull();
      expect(result.current.workflows).toBeNull();
      expect(result.current.releases).toEqual(MOCK_RELEASES);
      expect(result.current.tests).toEqual(MOCK_TESTS);
    });

    it('records a releases error but still populates workflows + tests', async () => {
      fetchRecentReleases.mockRejectedValue(new Error('releases down'));
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.releases).toBeInstanceOf(Error);
      expect(result.current.workflows).toEqual(MOCK_WORKFLOWS);
      expect(result.current.tests).toEqual(MOCK_TESTS);
    });

    it('records a tests error but still populates workflows + releases', async () => {
      fetchTestInventory.mockRejectedValue(new Error('tree fetch failed'));
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.tests).toBeInstanceOf(Error);
      expect(result.current.workflows).toEqual(MOCK_WORKFLOWS);
      expect(result.current.releases).toEqual(MOCK_RELEASES);
    });

    it('still flips loading off when every source fails', async () => {
      fetchRecentWorkflowRuns.mockRejectedValue(new Error('A'));
      fetchRecentReleases.mockRejectedValue(new Error('B'));
      fetchTestInventory.mockRejectedValue(new Error('C'));
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.errors.workflows).toBeInstanceOf(Error);
      expect(result.current.errors.releases).toBeInstanceOf(Error);
      expect(result.current.errors.tests).toBeInstanceOf(Error);
    });
  });

  describe('refresh', () => {
    it('triggers a fresh round of fetches', async () => {
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const baseCalls = fetchRecentWorkflowRuns.mock.calls.length;
      await act(async () => {
        result.current.refresh();
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(fetchRecentWorkflowRuns.mock.calls.length).toBeGreaterThan(baseCalls);
    });

    it('clears a per-source error when the source recovers on refresh', async () => {
      const err = new Error('flaky');
      fetchRecentReleases.mockRejectedValueOnce(err).mockResolvedValue(MOCK_RELEASES);
      const { result } = renderHook(() => useMobileData('ios'));
      await waitFor(() => expect(result.current.errors.releases).toBe(err));
      await act(async () => {
        result.current.refresh();
      });
      await waitFor(() => expect(result.current.errors.releases).toBeNull());
      expect(result.current.releases).toEqual(MOCK_RELEASES);
    });
  });
});
