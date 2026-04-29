import { describe, it, expect } from 'vitest';
import {
  aggregateDailyTestStats,
  aggregateE2ETestCount,
  aggregateDailyTestRunCount,
  aggregateCoverage,
  buildTodayEntry,
  upsertHistoryEntry,
  backfillFromDailyJobs,
  todayUtcDate,
} from '../metrics-aggregator.js';

const FIXED_NOW = new Date('2026-04-29T12:00:00.000Z');

function makeAutomatedTests(repos) {
  return { generatedAt: FIXED_NOW.toISOString(), repoCount: repos.length, testCount: repos.reduce((n, r) => n + (r.testCount ?? 0), 0), repos };
}

function makeRepo(overrides = {}) {
  return {
    name: 'AdvancedSearch',
    framework: 'wdio',
    testCount: 10,
    dailyJobs: [],
    ...overrides,
  };
}

describe('aggregateDailyTestStats', () => {
  it('returns null for missing data', () => {
    expect(aggregateDailyTestStats(null)).toBeNull();
    expect(aggregateDailyTestStats({})).toBeNull();
    expect(aggregateDailyTestStats({ repos: [] })).toBeNull();
  });

  it('returns null when no repo has any dailyJobs', () => {
    const data = makeAutomatedTests([makeRepo({ dailyJobs: [] }), makeRepo({ name: 'Echo', dailyJobs: [] })]);
    expect(aggregateDailyTestStats(data)).toBeNull();
  });

  it('sums passes/fails/total across all daily jobs', () => {
    const data = makeAutomatedTests([
      makeRepo({ dailyJobs: [{ name: 'a', passes: 4, fails: 3, total: 7, results: ['P','F','F','P','P','P','F'] }] }),
      makeRepo({ name: 'Echo', dailyJobs: [{ name: 'b', passes: 6, fails: 1, total: 7, results: ['P','P','P','P','P','P','F'] }] }),
    ]);
    const stats = aggregateDailyTestStats(data);
    expect(stats).toEqual({ pct: 71.4, passes: 10, fails: 4, total: 14 });
  });

  it('handles 0 total without dividing by zero', () => {
    const data = makeAutomatedTests([
      makeRepo({ dailyJobs: [{ name: 'a', passes: 0, fails: 0, total: 0, results: [] }] }),
    ]);
    expect(aggregateDailyTestStats(data)).toEqual({ pct: 0, passes: 0, fails: 0, total: 0 });
  });
});

describe('aggregateE2ETestCount', () => {
  it('partitions by framework', () => {
    const data = makeAutomatedTests([
      makeRepo({ framework: 'wdio', testCount: 5 }),
      makeRepo({ name: 'Cite', framework: 'cypress', testCount: 3 }),
      makeRepo({ name: 'Math', framework: 'wdio', testCount: 2 }),
      makeRepo({ name: 'Other', framework: 'other', testCount: 100 }),
    ]);
    expect(aggregateE2ETestCount(data)).toEqual({ wdio: 7, cypress: 3, total: 10 });
  });

  it('returns null for missing input', () => {
    expect(aggregateE2ETestCount(null)).toBeNull();
    expect(aggregateE2ETestCount({})).toBeNull();
  });
});

describe('aggregateDailyTestRunCount', () => {
  it('returns the total run count', () => {
    const data = makeAutomatedTests([
      makeRepo({ dailyJobs: [{ name: 'a', passes: 4, fails: 3, total: 7, results: [] }] }),
      makeRepo({ name: 'Echo', dailyJobs: [{ name: 'b', passes: 6, fails: 1, total: 7, results: [] }] }),
    ]);
    expect(aggregateDailyTestRunCount(data)).toBe(14);
  });

  it('returns null when no daily jobs', () => {
    expect(aggregateDailyTestRunCount({ repos: [makeRepo({ dailyJobs: [] })] })).toBeNull();
  });
});

describe('aggregateCoverage', () => {
  it('returns simple averages', () => {
    const data = {
      core: { coverage_pct: 50, last_updated: '2026-04-29 08:00 GMT' },
      extensions: [
        { name: 'A', coverage_pct: 60, last_updated: '2026-04-29 08:00 GMT' },
        { name: 'B', coverage_pct: 80, last_updated: '2026-04-29 08:00 GMT' },
        { name: 'C', coverage_pct: 100, last_updated: '2026-04-29 08:00 GMT' },
      ],
    };
    const result = aggregateCoverage(data);
    expect(result.coreAvg).toBe(50);
    expect(result.extensionsAvg).toBe(80);
    expect(result.extensionsCount).toBe(3);
  });

  it('skips never-built zero entries (no last_updated)', () => {
    const data = {
      core: null,
      extensions: [
        { name: 'A', coverage_pct: 80, last_updated: '2026-04-29 08:00 GMT' },
        { name: 'B', coverage_pct: 0 }, // no last_updated → skip
        { name: 'C', coverage_pct: 0, last_updated: '2025-01-01 00:00 GMT' }, // legitimate zero → include
      ],
    };
    const result = aggregateCoverage(data);
    expect(result.coreAvg).toBeNull();
    expect(result.extensionsAvg).toBe(40); // (80 + 0) / 2
    expect(result.extensionsCount).toBe(2);
  });

  it('returns null for missing input', () => {
    expect(aggregateCoverage(null)).toBeNull();
  });
});

describe('todayUtcDate', () => {
  it('returns YYYY-MM-DD in UTC', () => {
    expect(todayUtcDate(new Date('2026-04-29T23:30:00.000Z'))).toBe('2026-04-29');
    expect(todayUtcDate(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
  });
});

describe('buildTodayEntry', () => {
  it('packages all four metrics and uses the supplied date', () => {
    const automatedTests = makeAutomatedTests([
      makeRepo({ framework: 'wdio', testCount: 5, dailyJobs: [{ passes: 4, fails: 1, total: 5, results: ['P','P','P','P','F'] }] }),
    ]);
    const coverage = { core: { coverage_pct: 50 }, extensions: [{ coverage_pct: 80, last_updated: 'x' }] };
    const entry = buildTodayEntry({ automatedTests, coverage, date: '2026-04-29' });
    expect(entry.date).toBe('2026-04-29');
    expect(entry.dailyPassRate).toEqual({ pct: 80, passes: 4, fails: 1, total: 5 });
    expect(entry.coverage).toEqual({ coreAvg: 50, extensionsAvg: 80, extensionsCount: 1 });
    expect(entry.e2eTestCount).toEqual({ wdio: 5, cypress: 0, total: 5 });
    expect(entry.dailyTestRunCount).toBe(5);
  });

  it('passes through nulls when sources are missing', () => {
    const entry = buildTodayEntry({ automatedTests: null, coverage: null, date: '2026-04-29' });
    expect(entry).toEqual({
      date: '2026-04-29',
      dailyPassRate: null,
      coverage: null,
      e2eTestCount: null,
      dailyTestRunCount: null,
    });
  });
});

describe('upsertHistoryEntry', () => {
  it('appends a new date', () => {
    const entries = [{ date: '2026-04-27' }, { date: '2026-04-28' }];
    const out = upsertHistoryEntry(entries, { date: '2026-04-29' }, { now: FIXED_NOW });
    expect(out.map((e) => e.date)).toEqual(['2026-04-27', '2026-04-28', '2026-04-29']);
  });

  it('overwrites an existing date', () => {
    const entries = [{ date: '2026-04-29', marker: 'old' }];
    const out = upsertHistoryEntry(entries, { date: '2026-04-29', marker: 'new' }, { now: FIXED_NOW });
    expect(out).toHaveLength(1);
    expect(out[0].marker).toBe('new');
  });

  it('drops entries older than the rolling window', () => {
    const entries = [
      { date: '2025-01-01' }, // way outside
      { date: '2026-01-29' }, // exactly 90 days before — kept
      { date: '2026-01-28' }, // 91 days — dropped
      { date: '2026-04-28' },
    ];
    const out = upsertHistoryEntry(entries, { date: '2026-04-29' }, { now: FIXED_NOW, windowDays: 90 });
    expect(out.map((e) => e.date)).toEqual(['2026-01-29', '2026-04-28', '2026-04-29']);
  });

  it('sorts entries chronologically', () => {
    const entries = [{ date: '2026-04-29' }, { date: '2026-04-27' }, { date: '2026-04-28' }];
    const out = upsertHistoryEntry(entries, { date: '2026-04-30' }, { now: new Date('2026-04-30T12:00:00Z') });
    expect(out.map((e) => e.date)).toEqual(['2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30']);
  });
});

describe('backfillFromDailyJobs', () => {
  it('returns 6 entries for fully-populated 7-day results, skipping today', () => {
    const data = makeAutomatedTests([
      makeRepo({ dailyJobs: [{ name: 'a', passes: 7, fails: 0, total: 7, results: ['P','P','P','P','P','P','P'] }] }),
    ]);
    const entries = backfillFromDailyJobs(data, { now: FIXED_NOW });
    expect(entries).toHaveLength(6);
    // All historical entries should be 100% pass
    for (const e of entries) {
      expect(e.dailyPassRate.pct).toBe(100);
      expect(e.dailyPassRate.total).toBe(1);
      expect(e.coverage).toBeNull();
      expect(e.e2eTestCount).toBeNull();
    }
    // Dates should be 2026-04-23 through 2026-04-28 (6 days before 04-29)
    expect(entries.map((e) => e.date)).toEqual([
      '2026-04-23','2026-04-24','2026-04-25','2026-04-26','2026-04-27','2026-04-28',
    ]);
  });

  it('handles mixed P/F flags', () => {
    const data = makeAutomatedTests([
      makeRepo({ dailyJobs: [{ name: 'a', passes: 4, fails: 3, total: 7, results: ['P','F','F','P','P','P','F'] }] }),
    ]);
    const entries = backfillFromDailyJobs(data, { now: FIXED_NOW });
    expect(entries).toHaveLength(6);
    // i=0 'P' → dayOffset 6 (oldest) → date 04-23
    // i=5 'P' → dayOffset 1 (yesterday) → date 04-28
    // dayOffset 0 (today, 'F') is skipped
    const yesterday = entries.find((e) => e.date === '2026-04-28');
    expect(yesterday.dailyPassRate.pct).toBe(100);
    const oldest = entries.find((e) => e.date === '2026-04-23');
    expect(oldest.dailyPassRate.pct).toBe(100);
  });

  it('returns empty array when no daily jobs', () => {
    expect(backfillFromDailyJobs(null)).toEqual([]);
    expect(backfillFromDailyJobs({ repos: [] })).toEqual([]);
    expect(backfillFromDailyJobs({ repos: [makeRepo({ dailyJobs: [] })] })).toEqual([]);
  });

  it('aggregates across multiple jobs on the same day', () => {
    const data = makeAutomatedTests([
      makeRepo({ dailyJobs: [{ name: 'a', passes: 7, fails: 0, total: 7, results: ['P','P','P','P','P','P','P'] }] }),
      makeRepo({ name: 'Echo', dailyJobs: [{ name: 'b', passes: 0, fails: 7, total: 7, results: ['F','F','F','F','F','F','F'] }] }),
    ]);
    const entries = backfillFromDailyJobs(data, { now: FIXED_NOW });
    // Each historical day should have 1 P (from job a) + 1 F (from job b) = 50%
    for (const e of entries) {
      expect(e.dailyPassRate.pct).toBe(50);
      expect(e.dailyPassRate.total).toBe(2);
    }
  });
});
