import { describe, it, expect } from 'vitest';
import {
  buildCoverageSuites,
  buildIosTestingDashboard,
  buildResultBundleSummaries,
  buildStabilitySummaries,
  coverageDelta,
  coverageTargetsFromPayload,
  coverageValue,
  IOS_TESTING_WINDOW_DAYS,
  isCoverageRunForSuite,
  summarizeStability,
} from '../../../services/github/iosTestingCore.js';

const NOW = new Date('2026-06-04T18:00:00Z');

function makeRun(overrides = {}) {
  return {
    id: 1,
    name: 'Run Unit Tests',
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-06-01T10:00:00Z',
    run_started_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:05:00Z',
    html_url: 'https://github.com/wikimedia/wikipedia-ios/actions/runs/1',
    head_branch: 'main',
    event: 'push',
    duration_ms: 300_000,
    ...overrides,
  };
}

function makeArtifact(overrides = {}) {
  return {
    id: 100,
    name: 'Wikipedia-coverage',
    size_in_bytes: 300,
    expired: false,
    created_at: '2026-06-01T10:10:00Z',
    archive_download_url: 'https://api.github.com/artifact.zip',
    workflow_run: { id: 1 },
    ...overrides,
  };
}

describe('coverage helpers', () => {
  it('extracts numeric targets for the requested coverage scheme', () => {
    const payload = {
      Wikipedia: {
        'Wikipedia.app': 2.184,
        'WMF.framework': '15.091',
        ignored: 'nope',
      },
    };

    expect(coverageTargetsFromPayload(payload, 'Wikipedia')).toEqual({
      'Wikipedia.app': 2.18,
      'WMF.framework': 15.09,
    });
  });

  it('averages target values to match the stashed dashboard summary', () => {
    expect(coverageValue({ A: 10, B: 20, C: 30 })).toBe(20);
  });

  it('compares first and latest coverage points including target deltas', () => {
    const summary = coverageDelta([
      { date: '2026-05-01T00:00:00Z', value: 50, targets: { A: 40, B: 60 } },
      { date: '2026-06-01T00:00:00Z', value: 52.5, targets: { A: 45, B: 60 } },
    ]);

    expect(summary.delta).toBe(2.5);
    expect(summary.targets).toEqual([
      { target: 'A', current: 45, previous: 40, delta: 5 },
      { target: 'B', current: 60, previous: 60, delta: 0 },
    ]);
  });

  it('builds coverage suites from successful main push artifacts for unit targets', () => {
    const runs = [
      makeRun({ id: 1, created_at: '2026-05-30T10:00:00Z' }),
      makeRun({ id: 2, created_at: '2026-06-02T10:00:00Z' }),
      makeRun({ id: 3, event: 'pull_request', head_branch: 'feature' }),
      makeRun({ id: 4, conclusion: 'failure' }),
    ];
    const artifacts = [
      makeArtifact({ id: 101, workflow_run: { id: 1 } }),
      makeArtifact({ id: 102, workflow_run: { id: 2 } }),
      makeArtifact({ id: 103, workflow_run: { id: 3 } }),
      makeArtifact({ id: 104, workflow_run: { id: 4 } }),
    ];
    const coveragePayloadsByArtifactId = {
      101: { Wikipedia: { A: 10, B: 20 } },
      102: { Wikipedia: { A: 20, B: 30 } },
      103: { Wikipedia: { A: 100 } },
      104: { Wikipedia: { A: 100 } },
    };

    const [suite] = buildCoverageSuites({
      runs,
      artifacts,
      coveragePayloadsByArtifactId,
      now: NOW,
    });

    expect(suite.points).toHaveLength(2);
    expect(suite.summary.delta).toBe(10);
  });

  it('builds UI coverage points from repository-dispatched nightly artifacts when present', () => {
    const runs = [
      makeRun({
        id: 10,
        name: 'Run UI Tests',
        event: 'repository_dispatch',
        head_branch: 'main',
        created_at: '2026-06-01T10:00:00Z',
      }),
      makeRun({
        id: 11,
        name: 'Run UI Tests',
        event: 'pull_request',
        head_branch: 'feature',
        created_at: '2026-06-02T10:00:00Z',
      }),
      makeRun({
        id: 12,
        name: 'Run UI Tests',
        event: 'repository_dispatch',
        head_branch: 'main',
        conclusion: 'failure',
        created_at: '2026-06-03T10:00:00Z',
      }),
    ];
    const artifacts = [
      makeArtifact({ id: 201, name: 'WikipediaUITests-coverage', workflow_run: { id: 10 } }),
      makeArtifact({ id: 202, name: 'WikipediaUITests-coverage', workflow_run: { id: 11 } }),
      makeArtifact({ id: 203, name: 'WikipediaUITests-coverage', workflow_run: { id: 12 } }),
    ];
    const coveragePayloadsByArtifactId = {
      201: { WikipediaUITests: { 'Wikipedia.app': 16, 'WMF.framework': 25 } },
      202: { WikipediaUITests: { 'Wikipedia.app': 100 } },
      203: { WikipediaUITests: { 'Wikipedia.app': 100 } },
    };

    const suite = buildCoverageSuites({
      runs,
      artifacts,
      coveragePayloadsByArtifactId,
      now: NOW,
    }).find((item) => item.id === 'ui');

    expect(suite.points).toHaveLength(1);
    expect(suite.points[0].runId).toBe(10);
    expect(suite.points[0].targets).toEqual({
      'Wikipedia.app': 16,
      'WMF.framework': 25,
    });
    expect(isCoverageRunForSuite(runs[0], { kind: 'ui' })).toBe(true);
  });
});

describe('stability helpers', () => {
  it('excludes cancelled and non-PR runs from stability rate', () => {
    const summary = summarizeStability([
      makeRun({ event: 'pull_request', conclusion: 'success' }),
      makeRun({ event: 'pull_request', conclusion: 'failure' }),
      makeRun({ event: 'pull_request', conclusion: 'cancelled' }),
      makeRun({ event: 'push', conclusion: 'failure' }),
    ]);

    expect(summary.rate).toBe(50);
    expect(summary.consideredRuns).toBe(2);
    expect(summary.ignoredRuns).toBe(1);
    expect(summary.daily).toEqual([
      { date: '2026-06-01', total: 2, success: 1, failure: 1, rate: 50 },
    ]);
  });

  it('can summarize repository-dispatched nightly stability', () => {
    const summary = summarizeStability([
      makeRun({ event: 'repository_dispatch', conclusion: 'success' }),
      makeRun({ event: 'repository_dispatch', conclusion: 'failure' }),
      makeRun({ event: 'pull_request', conclusion: 'failure' }),
    ], { events: ['repository_dispatch'] });

    expect(summary.rate).toBe(50);
    expect(summary.consideredRuns).toBe(2);
    expect(summary.failures).toBe(1);
  });

  it('returns one stability summary per workflow family', () => {
    const summaries = buildStabilitySummaries({
      runs: [
        makeRun({ name: 'Run Unit Tests', event: 'pull_request' }),
        makeRun({ name: 'Run UI Tests', event: 'pull_request', conclusion: 'failure' }),
        makeRun({ name: 'Run UI Tests', event: 'repository_dispatch', conclusion: 'success' }),
        makeRun({ name: 'Run E2E Tests', event: 'pull_request', conclusion: 'success' }),
      ],
      now: NOW,
    });

    expect(summaries.map((summary) => summary.id)).toEqual(['unit', 'ui', 'e2e']);
    expect(summaries.find((summary) => summary.id === 'ui').rate).toBe(100);
    expect(summaries.find((summary) => summary.id === 'ui').stabilityLabel).toBe('Nightly stability');
  });
});

describe('result bundle helpers', () => {
  it('summarizes failed UI and E2E result bundle artifacts from the last 7 days', () => {
    const runs = [
      makeRun({
        id: 10,
        name: 'Run UI Tests',
        event: 'pull_request',
        head_branch: 'feature',
        conclusion: 'failure',
        created_at: '2026-06-01T10:00:00Z',
      }),
      makeRun({
        id: 11,
        name: 'Run E2E Tests',
        event: 'pull_request',
        head_branch: 'feature',
        conclusion: 'success',
        created_at: '2026-06-01T11:00:00Z',
      }),
      makeRun({
        id: 12,
        name: 'Run UI Tests',
        event: 'pull_request',
        head_branch: 'old-feature',
        conclusion: 'failure',
        created_at: '2026-05-20T10:00:00Z',
      }),
      makeRun({
        id: 13,
        name: 'Run E2E Tests',
        event: 'pull_request',
        head_branch: 'feature-2',
        conclusion: 'timed_out',
        created_at: '2026-06-02T10:00:00Z',
      }),
    ];
    const artifacts = [
      makeArtifact({
        id: 201,
        name: 'WikipediaUITests-TestResults',
        size_in_bytes: 120_000_000,
        workflow_run: { id: 10 },
      }),
      makeArtifact({
        id: 202,
        name: 'WikipediaUITests-E2E-TestResults',
        size_in_bytes: 90_000_000,
        workflow_run: { id: 11 },
      }),
      makeArtifact({
        id: 203,
        name: 'WikipediaUITests-TestResults',
        size_in_bytes: 110_000_000,
        workflow_run: { id: 12 },
      }),
      makeArtifact({
        id: 204,
        name: 'WikipediaUITests-E2E-TestResults',
        size_in_bytes: 80_000_000,
        workflow_run: { id: 13 },
      }),
    ];

    const summaries = buildResultBundleSummaries({
      runs,
      artifacts,
      videoCountsByRunId: { 10: 2 },
      videosByRunId: {
        10: [{ id: 'ui-10-1', runId: 10 }],
      },
      now: NOW,
    });

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.runId)).toEqual([13, 10]);
    expect(summaries.find((summary) => summary.runId === 10).videoCount).toBe(1);
    expect(summaries.find((summary) => summary.runId === 10).videos).toHaveLength(1);
    expect(summaries.find((summary) => summary.runId === 10).note).toContain('1 retained screen recording');
    expect(summaries.find((summary) => summary.runId === 13).note).toContain('Retained .xcresult bundle');
  });

  it('does not cap failed result bundles per family inside the 7-day window', () => {
    const createdDates = [
      '2026-05-29T10:00:00Z',
      '2026-05-30T10:00:00Z',
      '2026-05-31T10:00:00Z',
      '2026-06-01T10:00:00Z',
      '2026-06-02T10:00:00Z',
      '2026-06-03T10:00:00Z',
    ];
    const runs = Array.from({ length: 6 }, (_, index) => makeRun({
      id: 20 + index,
      name: 'Run UI Tests',
      event: 'pull_request',
      head_branch: `feature-${index}`,
      conclusion: 'failure',
      created_at: createdDates[index],
    }));
    const artifacts = runs.map((run) => makeArtifact({
      id: 300 + run.id,
      name: 'WikipediaUITests-TestResults',
      workflow_run: { id: run.id },
    }));

    const summaries = buildResultBundleSummaries({ runs, artifacts, now: NOW });

    expect(summaries).toHaveLength(6);
    expect(summaries.map((summary) => summary.runId)).toEqual([25, 24, 23, 22, 21, 20]);
  });
});

describe('buildIosTestingDashboard', () => {
  it('packages coverage, stability, result bundles, and recent runs', () => {
    const dashboard = buildIosTestingDashboard({
      runs: [
        makeRun({ id: 1 }),
        makeRun({ id: 2, name: 'Run UI Tests', event: 'pull_request', head_branch: 'feature', conclusion: 'failure' }),
      ],
      artifacts: [
        makeArtifact({ id: 101, workflow_run: { id: 1 } }),
        makeArtifact({ id: 102, name: 'WikipediaUITests-TestResults', workflow_run: { id: 2 } }),
      ],
      coveragePayloadsByArtifactId: {
        101: { Wikipedia: { A: 10, B: 20 } },
      },
      videos: [{ id: 'ui-2-1', runId: 2 }],
      generatedAt: NOW.toISOString(),
    });

    expect(dashboard.repo).toBe('wikimedia/wikipedia-ios');
    expect(dashboard.coverage[0].points).toHaveLength(1);
    expect(dashboard.stability).toHaveLength(3);
    expect(dashboard.resultBundles).toHaveLength(1);
    expect(dashboard.resultBundles[0].videoCount).toBe(1);
    expect(dashboard.videos).toHaveLength(1);
    expect(dashboard.recentRuns).toHaveLength(2);
    expect(dashboard.windowDays).toBe(7);
    expect(IOS_TESTING_WINDOW_DAYS).toBe(7);
  });
});
