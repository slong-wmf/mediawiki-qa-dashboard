import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MATCHERS,
  buildInventory,
  fetchTestInventory,
} from '../../../services/github/testInventory.js';

// ── MATCHERS ─────────────────────────────────────────────────────────────────

describe('MATCHERS', () => {
  it('defines ui + unit rules for ios with the .swift extension', () => {
    expect(MATCHERS.ios).toEqual([
      { kind: 'ui',   prefix: 'WikipediaUITests/',   exts: ['.swift'] },
      { kind: 'unit', prefix: 'WikipediaUnitTests/', exts: ['.swift'] },
    ]);
  });

  it('defines ui + unit rules for android with the .kt and .java extensions', () => {
    expect(MATCHERS.android).toEqual([
      { kind: 'ui',   prefix: 'app/src/androidTest/', exts: ['.kt', '.java'] },
      { kind: 'unit', prefix: 'app/src/test/',        exts: ['.kt', '.java'] },
    ]);
  });
});

// ── buildInventory ──────────────────────────────────────────────────────────

describe('buildInventory (ios)', () => {
  const NOW = new Date('2026-04-24T00:00:00Z');

  function tree(...paths) {
    return { tree: paths.map((path) => ({ path, type: 'blob' })) };
  }

  it('counts UI vs unit tests per matcher', () => {
    const out = buildInventory(
      tree(
        'WikipediaUITests/Foo.swift',
        'WikipediaUITests/Bar.swift',
        'WikipediaUnitTests/Baz.swift',
        'README.md',
      ),
      'ios',
      'wikimedia/wikipedia-ios',
      NOW,
    );
    expect(out.totals).toEqual({ uiTests: 2, unitTests: 1, total: 3 });
  });

  it('groups files by their immediate parent directory', () => {
    const out = buildInventory(
      tree(
        'WikipediaUITests/A/Foo.swift',
        'WikipediaUITests/A/Bar.swift',
        'WikipediaUITests/B/Baz.swift',
      ),
      'ios',
      'wikimedia/wikipedia-ios',
      NOW,
    );
    const dirs = Object.fromEntries(out.byDirectory.map((d) => [d.path, d.count]));
    expect(dirs).toEqual({
      'WikipediaUITests/A': 2,
      'WikipediaUITests/B': 1,
    });
  });

  it('sorts byDirectory by count DESC then path ASC for stable display', () => {
    const out = buildInventory(
      tree(
        'WikipediaUITests/B/A.swift', // dir B → 1
        'WikipediaUITests/A/A.swift', // dir A → 2 (ties broken by path)
        'WikipediaUITests/A/B.swift',
      ),
      'ios',
      'wikimedia/wikipedia-ios',
      NOW,
    );
    expect(out.byDirectory.map((d) => d.path)).toEqual([
      'WikipediaUITests/A',
      'WikipediaUITests/B',
    ]);
  });

  it('skips non-blob entries (commits, trees)', () => {
    const out = buildInventory(
      {
        tree: [
          { path: 'WikipediaUITests/Foo.swift', type: 'blob' },
          { path: 'WikipediaUITests',           type: 'tree' },
          { path: 'WikipediaUITests/sub',       type: 'tree' },
        ],
      },
      'ios',
      'wikimedia/wikipedia-ios',
      NOW,
    );
    expect(out.totals.uiTests).toBe(1);
    expect(out.byDirectory).toHaveLength(1);
  });

  it('skips files outside the matched prefix', () => {
    const out = buildInventory(
      tree(
        'WikipediaUITests/Yes.swift',
        'Wikipedia/SomeView.swift',         // not a test path
        'WikipediaSomethingElse/X.swift',   // similar prefix but not matched
      ),
      'ios',
      'wikimedia/wikipedia-ios',
      NOW,
    );
    expect(out.totals.uiTests).toBe(1);
    expect(out.totals.unitTests).toBe(0);
  });

  it('skips files inside the prefix but with the wrong extension', () => {
    const out = buildInventory(
      tree(
        'WikipediaUITests/README.md',
        'WikipediaUnitTests/snapshot.json',
      ),
      'ios',
      'wikimedia/wikipedia-ios',
      NOW,
    );
    expect(out.totals.total).toBe(0);
  });

  it('records the requested repo full name and timestamp', () => {
    const out = buildInventory(tree(), 'ios', 'wikimedia/wikipedia-ios', NOW);
    expect(out.repo).toBe('wikimedia/wikipedia-ios');
    expect(out.generatedAt).toBe(NOW.toISOString());
  });

  it('handles a missing or empty tree gracefully', () => {
    const out1 = buildInventory({}, 'ios', 'wikimedia/wikipedia-ios', NOW);
    const out2 = buildInventory({ tree: [] }, 'ios', 'wikimedia/wikipedia-ios', NOW);
    for (const out of [out1, out2]) {
      expect(out.totals.total).toBe(0);
      expect(out.byDirectory).toEqual([]);
    }
  });
});

describe('buildInventory (android)', () => {
  const NOW = new Date('2026-04-24T00:00:00Z');

  function tree(...paths) {
    return { tree: paths.map((path) => ({ path, type: 'blob' })) };
  }

  it('matches both .kt and .java extensions', () => {
    const out = buildInventory(
      tree(
        'app/src/androidTest/com/foo/A.kt',
        'app/src/androidTest/com/foo/B.java',
        'app/src/test/com/foo/C.kt',
      ),
      'android',
      'wikimedia/apps-android-wikipedia',
      NOW,
    );
    expect(out.totals).toEqual({ uiTests: 2, unitTests: 1, total: 3 });
  });

  it('does not double-count if a path could match both rules (first wins)', () => {
    // Defensive — neither matcher's prefix is a subset of the other today,
    // but the "first matching rule wins" rule is the contract, so pin it.
    const out = buildInventory(
      tree('app/src/androidTest/X.kt'),
      'android',
      'wikimedia/apps-android-wikipedia',
      NOW,
    );
    expect(out.totals.uiTests).toBe(1);
    expect(out.totals.unitTests).toBe(0);
  });
});

describe('buildInventory (errors)', () => {
  it('throws for an unknown platform', () => {
    expect(() => buildInventory({ tree: [] }, 'webos', 'x/y'))
      .toThrow(/No test matchers defined for platform: webos/);
  });
});

// ── fetchTestInventory ──────────────────────────────────────────────────────

describe('fetchTestInventory (live mode)', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('hits git/trees/HEAD?recursive=1 for the repo', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ tree: [] }) });
    await fetchTestInventory('ios');
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/wikimedia/wikipedia-ios/git/trees/HEAD?recursive=1',
    );
  });

  it('passes through to buildInventory and returns the inventory shape', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tree: [{ path: 'WikipediaUITests/Foo.swift', type: 'blob' }],
      }),
    });
    const out = await fetchTestInventory('ios');
    expect(out.totals.uiTests).toBe(1);
    expect(out.repo).toBe('wikimedia/wikipedia-ios');
    expect(typeof out.generatedAt).toBe('string');
  });

  it('throws on non-OK with status info', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
    await expect(fetchTestInventory('android')).rejects.toThrow(/500 Server Error/);
  });
});

describe('fetchTestInventory (static mode)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../services/staticData.js');
  });

  it('reads ${platform}-test-inventory.json without hitting the live API', async () => {
    vi.resetModules();
    const fetchStaticJson = vi.fn().mockResolvedValue({
      repo: 'wikimedia/wikipedia-ios',
      generatedAt: 'snapshot',
      totals: { uiTests: 0, unitTests: 0, total: 0 },
      byDirectory: [],
    });
    vi.doMock('../../../services/staticData.js', () => ({
      USE_STATIC_DATA: true,
      fetchStaticJson,
    }));
    const mod = await import('../../../services/github/testInventory.js');
    global.fetch = vi.fn();
    await mod.fetchTestInventory('ios');
    expect(fetchStaticJson).toHaveBeenCalledWith('ios-test-inventory.json');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
