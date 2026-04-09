/**
 * @file useDashboardData.js
 * Custom React hook that fetches and manages data from all three dashboard
 * data sources: Wikimedia Jenkins CI, Wikimedia coverage index, and Phabricator Maniphest.
 *
 * All three sources are fetched in parallel via Promise.allSettled so a
 * failure from one does not prevent the others from rendering.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchRecentBuilds, fetchTrackedJobs } from '../services/jenkins.js';
import { fetchCoverageData } from '../services/coverage.js';
import { fetchRecentBugs, fetchTrainBlockers } from '../services/phabricator.js';

const REFRESH_INTERVAL_MS = Number(import.meta.env.VITE_REFRESH_INTERVAL_MS) || 3_600_000;

/**
 * @typedef {Object} DashboardErrors
 * @property {Error|null} jenkins
 * @property {Error|null} coverage
 * @property {Error|null} phabricator
 * @property {Error|null} trainBlockers
 */

/**
 * @typedef {Object} DashboardData
 * @property {Array}           builds           - Jenkins CI build records
 * @property {object|null}     coverage         - { core, extensions } from doc.wikimedia.org
 * @property {Array}           bugs             - Phabricator open task records
 * @property {object|null}     trainBlockers    - { trainTask, blockers, totalBlockers } for the previous train
 * @property {Date|null}       lastRefreshed    - Timestamp of the last completed fetch cycle
 * @property {boolean}         loading          - True until the first full fetch completes
 * @property {boolean}         jenkinsLoading   - True only while a Jenkins-only re-fetch is running
 *                                                (triggered by refreshJobList; does not affect other panels)
 * @property {DashboardErrors} errors           - Per-source error state
 * @property {Function}        refresh          - Trigger an immediate re-fetch of all data
 * @property {Function}        refreshJobList   - Fetch the current job list from Jenkins views
 *                                                and re-fetch only the Jenkins builds panel
 * @property {boolean}         jobListLoading   - True while the job list fetch is in progress
 * @property {Error|null}      jobListError     - Set when fetchTrackedJobs() fails
 */

/**
 * Fetches data from Jenkins, the Wikimedia coverage index, and Phabricator in parallel.
 * Returns state and manual refresh functions.
 *
 * @returns {DashboardData}
 */
export function useDashboardData() {
  const [builds, setBuilds] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [bugs, setBugs] = useState([]);
  const [trainBlockers, setTrainBlockers] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [loading, setLoading] = useState(true);
  // Separate from `loading` so clicking "Fetch Job Information" only shows a
  // skeleton on the Jenkins panels, leaving coverage and bugs panels untouched.
  const [jenkinsLoading, setJenkinsLoading] = useState(false);
  const [errors, setErrors] = useState({ jenkins: null, coverage: null, phabricator: null, trainBlockers: null });
  const [jobListLoading, setJobListLoading] = useState(false);
  const [jobListError, setJobListError] = useState(null);

  // Holds the dynamically fetched job list, or null to use the static default.
  // A ref is used (rather than state) so fetchAll always reads the latest value
  // without needing to be recreated via useCallback deps.
  const trackedJobsRef = useRef(null);

  // Use a ref so the interval callback always has access to the latest fetchAll
  const fetchAllRef = useRef(null);

  const fetchAll = useCallback(async () => {
    // Pass the dynamic job list if one has been fetched; otherwise jenkins.js
    // will fall back to DEFAULT_TRACKED_JOBS.
    const jobList = trackedJobsRef.current ?? undefined;

    const [jenkinsResult, coverageResult, phabResult, trainBlockersResult] = await Promise.allSettled([
      fetchRecentBuilds(jobList),
      fetchCoverageData(),
      fetchRecentBugs(),
      fetchTrainBlockers(),
    ]);

    // Update each source independently so a single failure doesn't wipe the rest
    if (jenkinsResult.status === 'fulfilled') {
      setBuilds(jenkinsResult.value);
      setErrors((prev) => ({ ...prev, jenkins: null }));
    } else {
      setErrors((prev) => ({ ...prev, jenkins: jenkinsResult.reason }));
    }

    if (coverageResult.status === 'fulfilled') {
      setCoverage(coverageResult.value);
      setErrors((prev) => ({ ...prev, coverage: null }));
    } else {
      setErrors((prev) => ({ ...prev, coverage: coverageResult.reason }));
    }

    if (phabResult.status === 'fulfilled') {
      setBugs(phabResult.value);
      setErrors((prev) => ({ ...prev, phabricator: null }));
    } else {
      setErrors((prev) => ({ ...prev, phabricator: phabResult.reason }));
    }

    if (trainBlockersResult.status === 'fulfilled') {
      setTrainBlockers(trainBlockersResult.value);
      setErrors((prev) => ({ ...prev, trainBlockers: null }));
    } else {
      setErrors((prev) => ({ ...prev, trainBlockers: trainBlockersResult.reason }));
    }

    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  // Keep ref in sync with latest fetchAll
  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  // Initial fetch + polling interval
  useEffect(() => {
    fetchAllRef.current();

    const intervalId = setInterval(() => {
      fetchAllRef.current();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []); // empty deps — runs once on mount, cleared on unmount

  /**
   * Re-fetch only Jenkins builds using the current tracked job list.
   * Sets jenkinsLoading (not the global loading flag) so only the Jenkins
   * panels show a skeleton — coverage and bugs panels are left untouched.
   */
  const fetchJenkins = useCallback(async () => {
    const jobList = trackedJobsRef.current ?? undefined;
    setJenkinsLoading(true);
    try {
      const builds = await fetchRecentBuilds(jobList);
      setBuilds(builds);
      setErrors((prev) => ({ ...prev, jenkins: null }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, jenkins: err }));
    } finally {
      setJenkinsLoading(false);
    }
  }, []);

  /**
   * Manually trigger an immediate re-fetch of all data sources.
   */
  const refresh = useCallback(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  /**
   * Fetch the current job list from the Jenkins view APIs and immediately
   * re-fetch only the Jenkins builds panel using the updated list.
   *
   * On success the dynamic list is stored in trackedJobsRef and used for all
   * subsequent fetches (including auto-refresh) until the page is reloaded.
   * On failure jobListError is set; the existing job list and build data are
   * left unchanged.
   *
   * Coverage and Phabricator panels are not affected by this action.
   */
  const refreshJobList = useCallback(async () => {
    setJobListLoading(true);
    setJobListError(null);
    try {
      const jobs = await fetchTrackedJobs();
      // Update the ref synchronously so the immediately following fetchJenkins
      // call reads the new list rather than the previous one.
      trackedJobsRef.current = jobs;
      // Re-fetch only Jenkins builds — other panels are untouched.
      await fetchJenkins();
    } catch (err) {
      setJobListError(err);
    } finally {
      setJobListLoading(false);
    }
  }, [fetchJenkins]);

  return {
    builds,
    coverage,
    bugs,
    trainBlockers,
    lastRefreshed,
    loading,
    jenkinsLoading,
    errors,
    refresh,
    refreshJobList,
    jobListLoading,
    jobListError,
  };
}
