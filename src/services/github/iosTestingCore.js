/**
 * Pure aggregation helpers for the wikipedia-ios testing dashboard.
 *
 * These helpers intentionally avoid fetch/import.meta/browser APIs so they can
 * be used by both the React service and the snapshot script.
 */

export const IOS_TESTING_WINDOW_DAYS = 7;
export const FAILED_RESULT_BUNDLE_WINDOW_DAYS = 7;

export const COVERAGE_SUITES = [
  {
    id: 'unit-wikipedia',
    title: 'Wikipedia Unit',
    kind: 'unit',
    workflowName: 'Run Unit Tests',
    artifactName: 'Wikipedia-coverage',
    scheme: 'Wikipedia',
  },
  {
    id: 'unit-components',
    title: 'WMFComponents Unit',
    kind: 'unit',
    workflowName: 'Run Unit Tests',
    artifactName: 'WMFComponents-coverage',
    scheme: 'WMFComponents',
  },
  {
    id: 'unit-data',
    title: 'WMFData Unit',
    kind: 'unit',
    workflowName: 'Run Unit Tests',
    artifactName: 'WMFData-coverage',
    scheme: 'WMFData',
  },
  {
    id: 'ui',
    title: 'UI Tests',
    kind: 'ui',
    workflowName: 'Run UI Tests',
    artifactName: 'WikipediaUITests-coverage',
    scheme: 'WikipediaUITests',
  },
  {
    id: 'e2e',
    title: 'E2E UI Tests',
    kind: 'e2e',
    workflowName: 'Run E2E Tests',
    artifactName: 'WikipediaUITests-E2E-coverage',
    scheme: 'WikipediaUITests',
  },
];

export const WORKFLOW_FAMILIES = [
  {
    id: 'unit',
    title: 'Unit Tests',
    workflowName: 'Run Unit Tests',
    resultArtifactName: null,
    stabilityEvents: ['pull_request'],
    stabilityLabel: 'PR stability',
  },
  {
    id: 'ui',
    title: 'UI Tests',
    workflowName: 'Run UI Tests',
    resultArtifactName: 'WikipediaUITests-TestResults',
    stabilityEvents: ['repository_dispatch'],
    stabilityLabel: 'Nightly stability',
  },
  {
    id: 'e2e',
    title: 'E2E UI Tests',
    workflowName: 'Run E2E Tests',
    resultArtifactName: 'WikipediaUITests-E2E-TestResults',
    stabilityEvents: ['pull_request'],
    stabilityLabel: 'PR stability',
  },
];

export const STABILITY_CONCLUSIONS = new Set([
  'success',
  'failure',
  'timed_out',
  'startup_failure',
  'action_required',
]);

function parseDateMs(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function dateOnly(iso) {
  const ms = parseDateMs(iso);
  if (ms == null) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function roundPct(value) {
  return Math.round(value * 10) / 10;
}

function roundCoverage(value) {
  return Math.round(value * 100) / 100;
}

function isWithinWindow(iso, now, windowDays) {
  const ms = parseDateMs(iso);
  if (ms == null) return false;
  const cutoff = now.getTime() - windowDays * 86_400_000;
  return ms >= cutoff && ms <= now.getTime() + 86_400_000;
}

function compareCreatedAtAsc(a, b) {
  return (parseDateMs(a.created_at ?? a.createdAt) ?? 0) - (parseDateMs(b.created_at ?? b.createdAt) ?? 0);
}

function compareCreatedAtDesc(a, b) {
  return (parseDateMs(b.created_at ?? b.createdAt) ?? 0) - (parseDateMs(a.created_at ?? a.createdAt) ?? 0);
}

function isSuccessfulCompletedRun(run) {
  return (
    run.status === 'completed'
    && run.conclusion === 'success'
  );
}

function isMainPush(run) {
  return run.event === 'push' && run.head_branch === 'main';
}

function isNightlyDispatch(run) {
  return run.event === 'repository_dispatch' && run.head_branch === 'main';
}

export function isCoverageRunForSuite(run, suite) {
  if (!isSuccessfulCompletedRun(run)) return false;

  if (suite.kind === 'ui') {
    return isMainPush(run) || isNightlyDispatch(run);
  }

  return isMainPush(run);
}

export function normalizeArtifact(raw) {
  return {
    id: raw.id,
    name: raw.name ?? '',
    size_in_bytes: raw.size_in_bytes ?? 0,
    expired: Boolean(raw.expired),
    created_at: raw.created_at ?? null,
    archive_download_url: raw.archive_download_url ?? null,
    workflow_run: {
      id: raw.workflow_run?.id ?? null,
    },
  };
}

export function coverageValue(targets) {
  const values = Object.values(targets)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return roundCoverage(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function coverageTargetsFromPayload(payload, scheme) {
  const rawTargets = payload?.[scheme];
  if (!rawTargets || typeof rawTargets !== 'object' || Array.isArray(rawTargets)) {
    return null;
  }

  const targets = {};
  for (const [target, value] of Object.entries(rawTargets)) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      targets[target] = roundCoverage(numberValue);
    }
  }
  return Object.keys(targets).length > 0 ? targets : null;
}

export function coverageDelta(points) {
  if (!points.length) return null;

  const first = points[0];
  const latest = points[points.length - 1];
  const firstValue = first.value;
  const latestValue = latest.value;
  const delta = firstValue == null || latestValue == null
    ? null
    : roundCoverage(latestValue - firstValue);

  const targets = [];
  const firstTargets = first.targets ?? {};
  const latestTargets = latest.targets ?? {};
  for (const target of Object.keys(latestTargets).sort()) {
    const current = latestTargets[target];
    const previous = firstTargets[target];
    targets.push({
      target,
      current,
      previous: previous ?? null,
      delta: previous == null ? null : roundCoverage(current - previous),
    });
  }

  return {
    firstDate: first.date,
    latestDate: latest.date,
    firstValue,
    latestValue,
    delta,
    targets,
  };
}

export function buildCoverageSuites({
  runs,
  artifacts,
  coveragePayloadsByArtifactId = {},
  now = new Date(),
  windowDays = IOS_TESTING_WINDOW_DAYS,
  maxRunsPerSuite = 120,
} = {}) {
  const artifactsByRun = new Map();
  for (const artifact of artifacts ?? []) {
    if (artifact.expired) continue;
    const runId = artifact.workflow_run?.id;
    if (runId == null) continue;
    if (!artifactsByRun.has(runId)) artifactsByRun.set(runId, new Map());
    artifactsByRun.get(runId).set(artifact.name, artifact);
  }

  const allRuns = Array.isArray(runs) ? runs : [];
  return COVERAGE_SUITES.map((suite) => {
    const candidateRuns = allRuns
      .filter((run) => (
        run.name === suite.workflowName
        && isCoverageRunForSuite(run, suite)
        && isWithinWindow(run.created_at, now, windowDays)
      ))
      .sort(compareCreatedAtAsc)
      .slice(-maxRunsPerSuite);

    const points = [];
    for (const run of candidateRuns) {
      const artifact = artifactsByRun.get(run.id)?.get(suite.artifactName);
      if (!artifact) continue;

      const payload = coveragePayloadsByArtifactId[String(artifact.id)];
      const targets = coverageTargetsFromPayload(payload, suite.scheme);
      if (!targets) continue;

      points.push({
        date: run.created_at,
        day: dateOnly(run.created_at),
        runId: run.id,
        runUrl: run.html_url,
        value: coverageValue(targets),
        targets,
      });
    }

    return {
      id: suite.id,
      title: suite.title,
      kind: suite.kind,
      workflowName: suite.workflowName,
      artifactName: suite.artifactName,
      scheme: suite.scheme,
      points,
      summary: coverageDelta(points),
    };
  });
}

export function summarizeStability(runs, { events = ['pull_request'] } = {}) {
  const allowedEvents = new Set(events);
  const sourceRuns = (runs ?? []).filter((run) => (
    allowedEvents.has(run.event) && run.status === 'completed'
  ));
  const considered = sourceRuns.filter((run) => STABILITY_CONCLUSIONS.has(run.conclusion));
  const successes = considered.filter((run) => run.conclusion === 'success');
  const failures = considered.filter((run) => run.conclusion !== 'success');
  const ignored = sourceRuns.filter((run) => !STABILITY_CONCLUSIONS.has(run.conclusion));
  const rate = considered.length ? roundPct((successes.length / considered.length) * 100) : null;

  const daily = new Map();
  for (const run of considered) {
    const day = dateOnly(run.created_at);
    if (!day) continue;
    if (!daily.has(day)) daily.set(day, { date: day, total: 0, success: 0, failure: 0 });
    const bucket = daily.get(day);
    bucket.total += 1;
    if (run.conclusion === 'success') bucket.success += 1;
    else bucket.failure += 1;
  }

  const dailyPoints = [...daily.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bucket) => ({
      ...bucket,
      rate: bucket.total ? roundPct((bucket.success / bucket.total) * 100) : null,
    }));

  return {
    rate,
    consideredRuns: considered.length,
    successes: successes.length,
    failures: failures.length,
    ignoredRuns: ignored.length,
    daily: dailyPoints,
  };
}

export function buildStabilitySummaries({
  runs,
  now = new Date(),
  windowDays = IOS_TESTING_WINDOW_DAYS,
} = {}) {
  const filteredRuns = (runs ?? []).filter((run) => isWithinWindow(run.created_at, now, windowDays));
  return WORKFLOW_FAMILIES.map((family) => ({
    id: family.id,
    title: family.title,
    workflowName: family.workflowName,
    stabilityEvents: family.stabilityEvents,
    stabilityLabel: family.stabilityLabel,
    ...summarizeStability(
      filteredRuns.filter((run) => run.name === family.workflowName),
      { events: family.stabilityEvents },
    ),
  }));
}

export function buildResultBundleSummaries({
  runs,
  artifacts,
  videoCountsByRunId = {},
  videosByRunId = {},
  now = new Date(),
  windowDays = FAILED_RESULT_BUNDLE_WINDOW_DAYS,
} = {}) {
  const artifactsByRun = new Map();
  for (const artifact of artifacts ?? []) {
    if (artifact.expired) continue;
    const runId = artifact.workflow_run?.id;
    if (runId == null) continue;
    if (!artifactsByRun.has(runId)) artifactsByRun.set(runId, new Map());
    artifactsByRun.get(runId).set(artifact.name, artifact);
  }

  const summaries = [];
  for (const family of WORKFLOW_FAMILIES) {
    if (!family.resultArtifactName) continue;

    const candidates = (runs ?? [])
      .filter((run) => (
        run.name === family.workflowName
        && run.status === 'completed'
        && run.conclusion
        && run.conclusion !== 'success'
        && run.conclusion !== 'cancelled'
        && isWithinWindow(run.created_at, now, windowDays)
      ))
      .sort(compareCreatedAtDesc);

    for (const run of candidates) {
      const artifact = artifactsByRun.get(run.id)?.get(family.resultArtifactName);
      if (!artifact) continue;

      const videos = videosByRunId[String(run.id)] ?? [];
      const videoCount = videos.length || videoCountsByRunId[String(run.id)] || 0;
      let note;
      if (videoCount > 0) {
        note = `${videoCount} retained screen recording${videoCount === 1 ? '' : 's'}`;
      } else {
        note = 'Retained .xcresult bundle; recordings are inside the artifact when XCTest keeps them';
      }

      summaries.push({
        suite: family.title,
        kind: family.id,
        workflowName: family.workflowName,
        runId: run.id,
        runUrl: run.html_url,
        runConclusion: run.conclusion ?? '',
        branch: run.head_branch ?? '',
        event: run.event ?? '',
        createdAt: run.created_at,
        day: dateOnly(run.created_at),
        artifactName: artifact.name,
        artifactSizeBytes: artifact.size_in_bytes ?? 0,
        artifactUrl: artifact.archive_download_url ?? null,
        videoCount,
        videos,
        note,
      });
    }
  }

  return summaries.sort(compareCreatedAtDesc);
}

export function buildIosTestingDashboard({
  runs = [],
  artifacts = [],
  coveragePayloadsByArtifactId = {},
  coverageStatus = null,
  videoCountsByRunId = {},
  videos = [],
  generatedAt = new Date().toISOString(),
  now = new Date(generatedAt),
  windowDays = IOS_TESTING_WINDOW_DAYS,
  resultBundleWindowDays = FAILED_RESULT_BUNDLE_WINDOW_DAYS,
  maxCoverageRunsPerSuite = 120,
} = {}) {
  const normalizedArtifacts = artifacts.map(normalizeArtifact);
  const allRuns = Array.isArray(runs) ? runs : [];
  const videoCounts = { ...videoCountsByRunId };
  const videosByRun = {};
  for (const video of videos) {
    const key = String(video.runId);
    videoCounts[key] = (videoCounts[key] ?? 0) + 1;
    if (!videosByRun[key]) videosByRun[key] = [];
    videosByRun[key].push(video);
  }

  return {
    repo: 'wikimedia/wikipedia-ios',
    generatedAt,
    windowDays,
    resultBundleWindowDays,
    coverageStatus,
    coverage: buildCoverageSuites({
      runs: allRuns,
      artifacts: normalizedArtifacts,
      coveragePayloadsByArtifactId,
      now,
      windowDays,
      maxRunsPerSuite: maxCoverageRunsPerSuite,
    }),
    stability: buildStabilitySummaries({ runs: allRuns, now, windowDays }),
    resultBundles: buildResultBundleSummaries({
      runs: allRuns,
      artifacts: normalizedArtifacts,
      videoCountsByRunId: videoCounts,
      videosByRunId: videosByRun,
      now,
      windowDays: resultBundleWindowDays,
    }),
    videos,
    recentRuns: allRuns
      .filter((run) => WORKFLOW_FAMILIES.some((family) => family.workflowName === run.name))
      .filter((run) => isWithinWindow(run.created_at, now, windowDays))
      .sort(compareCreatedAtDesc)
      .slice(0, 20),
  };
}
