/**
 * @file useMobileData.js
 *
 * Custom React hook that fetches and manages data for one mobile-app
 * platform (iOS or Android) from GitHub. Mirrors the patterns of
 * useDashboardData (mountedRef guard, Promise.allSettled, per-source
 * error isolation) so the two coexist cleanly inside the same App.
 *
 * Each tab in the dashboard owns its own instance of this hook so the
 * three platforms (Web / iOS / Android) fetch independently and a failure
 * from one does not impact the others.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchRecentWorkflowRuns } from '../services/github/workflows.js';
import { fetchRecentReleases } from '../services/github/releases.js';
import { fetchTestInventory } from '../services/github/testInventory.js';
import { USE_STATIC_DATA } from '../services/staticData.js';

const REFRESH_INTERVAL_MS = Number(import.meta.env.VITE_REFRESH_INTERVAL_MS) || 3_600_000;

/**
 * @typedef {Object} MobileErrors
 * @property {Error|null} workflows
 * @property {Error|null} releases
 * @property {Error|null} tests
 */

/**
 * @typedef {Object} MobileData
 * @property {object|null}      workflows       From fetchRecentWorkflowRuns()
 * @property {object|null}      releases        From fetchRecentReleases()
 * @property {object|null}      tests           From fetchTestInventory()
 * @property {Date|null}        lastRefreshed   Timestamp of last completed fetch.
 * @property {boolean}          loading         True during any active refetch.
 * @property {boolean}          initialLoading  True only until the first fetch completes.
 * @property {MobileErrors}     errors          Per-source error state.
 * @property {() => void}       refresh         Trigger an immediate re-fetch.
 */

/**
 * Fetch the three GitHub-backed data sources for one mobile-app platform.
 * In static mode (production), each call reads a pre-generated JSON file;
 * in live mode (local dev), each call hits api.github.com directly.
 *
 * @param {'ios' | 'android'} platform
 * @returns {MobileData}
 */
export function useMobileData(platform) {
  const [workflows, setWorkflows] = useState(null);
  const [releases, setReleases] = useState(null);
  const [tests, setTests] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errors, setErrors] = useState({
    workflows: null,
    releases: null,
    tests: null,
  });

  // Tracks whether the component is still mounted — guards all state setters
  // in async paths so unmount cannot cause "update on unmounted" warnings or
  // memory leaks from late-arriving fetch results.
  const mountedRef = useRef(true);

  // Use a ref so the interval callback always has access to the latest fetchAll.
  const fetchAllRef = useRef(null);

  const fetchAll = useCallback(async () => {
    const [workflowsResult, releasesResult, testsResult] = await Promise.allSettled([
      fetchRecentWorkflowRuns(platform),
      fetchRecentReleases(platform),
      fetchTestInventory(platform),
    ]);

    if (!mountedRef.current) return;

    if (workflowsResult.status === 'fulfilled') {
      setWorkflows(workflowsResult.value);
      setErrors((prev) => ({ ...prev, workflows: null }));
    } else {
      setErrors((prev) => ({ ...prev, workflows: workflowsResult.reason }));
    }

    if (releasesResult.status === 'fulfilled') {
      setReleases(releasesResult.value);
      setErrors((prev) => ({ ...prev, releases: null }));
    } else {
      setErrors((prev) => ({ ...prev, releases: releasesResult.reason }));
    }

    if (testsResult.status === 'fulfilled') {
      setTests(testsResult.value);
      setErrors((prev) => ({ ...prev, tests: null }));
    } else {
      setErrors((prev) => ({ ...prev, tests: testsResult.reason }));
    }

    setLastRefreshed(new Date());
    setLoading(false);
    setInitialLoading(false);
  }, [platform]);

  // Keep ref in sync with latest fetchAll (re-created when platform changes).
  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  // Initial fetch + polling interval. Re-runs when platform changes, which
  // happens at most once in practice (the hook is called per-tab with a fixed
  // platform string), but keeping it correct avoids stale-closure bugs.
  useEffect(() => {
    mountedRef.current = true;
    fetchAllRef.current();

    let intervalId;
    if (!USE_STATIC_DATA) {
      const tick = () => {
        if (document.visibilityState === 'visible') {
          fetchAllRef.current();
        }
      };
      intervalId = setInterval(tick, REFRESH_INTERVAL_MS);
    }

    return () => {
      mountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [platform]);

  /**
   * Manually trigger an immediate re-fetch of all three sources.
   */
  const refresh = useCallback(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  return {
    workflows,
    releases,
    tests,
    lastRefreshed,
    loading,
    initialLoading,
    errors,
    refresh,
  };
}
