/**
 * Shared factories and utilities for integration tests.
 *
 * These factories produce canonical "valid" data shapes that match the
 * contracts between useDashboardData and each panel component. Using a
 * single source of truth for mock data prevents the hook-vs-component
 * contract mismatches that caused the original BugsPanel blank-screen bug.
 */

// NOTE: Recharts vi.mock() factories must be inlined in each test file
// because vi.mock() is hoisted above imports and cannot reference external
// variables. See each *.integration.test.jsx for the inline mock.

// ---------------------------------------------------------------------------
// Jenkins builds
// ---------------------------------------------------------------------------

/** A single valid build record as produced by fetchRecentBuilds(). */
export function makeValidBuild(overrides = {}) {
  return {
    job: 'selenium-daily-beta-Echo',
    job_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/',
    build_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/42/',
    status: 'passed',
    duration_seconds: 180,
    timestamp: new Date().toISOString(),
    tests: { total: 10, failed: 0, skipped: 1, passed: 9 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phabricator bugs
// ---------------------------------------------------------------------------

/** A single valid task as produced by fetchRecentBugs() → shapeTask(). */
export function makeValidTask(overrides = {}) {
  return {
    id: 12345,
    phid: 'PHID-TASK-abc',
    title: 'Fix login regression',
    statusRaw: 'open',
    statusGroup: 'open',
    statusLabel: 'Open',
    priority: 'normal',
    priorityLabel: 'Normal',
    priorityValue: 50,
    url: 'https://phabricator.wikimedia.org/T12345',
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    modifiedAt: new Date(Date.now() - 3_600_000).toISOString(),
    isNew: false,
    projectNames: ['MediaWiki-core'],
    projectCount: 1,
    ...overrides,
  };
}

/** A valid bugs envelope as returned by fetchRecentBugs(). */
export function makeValidBugs(tasks = [makeValidTask()], overrides = {}) {
  return {
    tasks,
    totalFetched: tasks.length,
    hasMore: false,
    cutoffDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Code coverage
// ---------------------------------------------------------------------------

/** A valid coverage object as returned by fetchCoverageData(). */
export function makeValidCoverage(overrides = {}) {
  return {
    core: {
      name: 'mediawiki-core',
      coverage_pct: 75,
      last_updated: '2026-04-03 08:21 GMT',
      page_url: 'https://doc.wikimedia.org/cover/',
      clover_url: 'https://doc.wikimedia.org/cover/mediawiki-core/clover.xml',
    },
    extensions: [
      {
        name: 'AbuseFilter',
        coverage_pct: 62,
        last_updated: '2026-04-03 08:21 GMT',
        page_url: 'https://doc.wikimedia.org/cover-extensions/AbuseFilter/',
        clover_url: 'https://doc.wikimedia.org/cover-extensions/AbuseFilter/clover.xml',
      },
      {
        name: 'Echo',
        coverage_pct: 45,
        last_updated: '2026-04-03 08:21 GMT',
        page_url: 'https://doc.wikimedia.org/cover-extensions/Echo/',
        clover_url: 'https://doc.wikimedia.org/cover-extensions/Echo/clover.xml',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Train blockers
// ---------------------------------------------------------------------------

/** A single valid blocker task as produced by fetchTrainBlockers(). */
export function makeValidBlocker(overrides = {}) {
  return {
    id: 99001,
    phid: 'PHID-TASK-blocker1',
    title: 'VisualEditor breaks on save',
    url: 'https://phabricator.wikimedia.org/T99001',
    statusRaw: 'open',
    statusLabel: 'Open',
    priority: 'high',
    priorityLabel: 'High',
    priorityValue: 80,
    subtype: 'bug',
    authorUsername: 'alice',
    closerUsername: null,
    ownerUsername: 'bob',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    closedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Automated tests inventory (browser-test-scanner)
// ---------------------------------------------------------------------------

/** A single valid repo entry as produced by fetchAutomatedTests(). */
export function makeValidTestRepo(overrides = {}) {
  return {
    name: 'AbuseFilter',
    repoPath: 'mediawiki/extensions/AbuseFilter',
    framework: 'wdio',
    mediawikiVersion: '9.27.0',
    frameworkVersion: '6.5.0',
    gatedSelenium: true,
    testCount: 3,
    tests: [
      { name: 'page should exist' },
      { name: 'allows saving an edit' },
      { name: 'surfaces filter matches' },
    ],
    ...overrides,
  };
}

/** A valid automatedTests envelope as returned by fetchAutomatedTests(). */
export function makeValidAutomatedTests(overrides = {}) {
  const repos = [
    makeValidTestRepo(),
    makeValidTestRepo({
      name: 'Cite',
      repoPath: 'mediawiki/extensions/Cite',
      framework: 'cypress',
      frameworkVersion: '15.11.0',
      gatedSelenium: true,
      testCount: 2,
      tests: [
        { name: 'renders references' },
        { name: 'handles citation syntax' },
      ],
    }),
    makeValidTestRepo({
      name: 'Echo',
      repoPath: 'mediawiki/extensions/Echo',
      framework: 'wdio',
      gatedSelenium: false,
      testCount: 1,
      tests: [{ name: 'notifications flyout opens' }],
    }),
  ];
  return {
    generatedAt: '2026-04-17T18:55:37Z',
    repoCount: repos.length,
    testCount: repos.reduce((n, r) => n + r.testCount, 0),
    repos,
    ...overrides,
  };
}

/** A valid trainBlockers envelope as returned by fetchTrainBlockers(). */
export function makeValidTrainBlockers(blockers = [makeValidBlocker()], overrides = {}) {
  return {
    trainTask: {
      id: 420481,
      title: '1.46.0-wmf.22 deployment blockers',
      url: 'https://phabricator.wikimedia.org/T420481',
      version: '1.46.0-wmf.22',
      closedAt: new Date().toISOString(),
      closerUsername: 'trainrunner',
    },
    blockers,
    totalBlockers: blockers.length,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Metrics history (rolling-history file)
// ---------------------------------------------------------------------------

/** A single valid history entry as written by scripts/fetch-snapshot-data.js. */
export function makeValidMetricsHistoryEntry(overrides = {}) {
  return {
    date: '2026-04-29',
    dailyPassRate: { pct: 80, passes: 8, fails: 2, total: 10 },
    coverage: { coreAvg: 50, extensionsAvg: 65, extensionsCount: 3 },
    e2eTestCount: { wdio: 5, cypress: 2, total: 7 },
    dailyTestRunCount: 10,
    ...overrides,
  };
}

/** A valid metrics-history envelope. */
export function makeValidMetricsHistory(entries = [makeValidMetricsHistoryEntry()], overrides = {}) {
  return {
    generatedAt: '2026-04-29T13:00:00.000Z',
    windowDays: 90,
    entries,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render-safety assertion
// ---------------------------------------------------------------------------

/**
 * Assert that a React element renders without throwing.
 *
 * Wraps render() and catches the error so the test can assert on the failure
 * rather than having the test runner report an unhandled exception.
 *
 * @param {Function} renderFn - callback that calls render()
 */
export function expectNoCrash(renderFn) {
  let error = null;
  try {
    renderFn();
  } catch (e) {
    error = e;
  }
  expect(error).toBeNull();
}
