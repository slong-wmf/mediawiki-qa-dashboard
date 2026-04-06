import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  statusGroup,
  mapPriority,
  isSuspectedBug,
  shapeTask,
  fetchRecentBugs,
} from '../../services/phabricator.js';

// ── statusGroup ───────────────────────────────────────────────────────────────

describe('statusGroup', () => {
  describe('positive cases — known statuses', () => {
    it('maps "open" to open', () => expect(statusGroup('open')).toBe('open'));
    it('maps "in-progress" to in-progress', () => expect(statusGroup('in-progress')).toBe('in-progress'));
    it('maps "stalled" to stalled', () => expect(statusGroup('stalled')).toBe('stalled'));
    it('maps "needs-triage" to needs-triage', () => expect(statusGroup('needs-triage')).toBe('needs-triage'));
  });

  describe('negative cases — unknown / closed statuses map to other', () => {
    it('maps "resolved" to other', () => expect(statusGroup('resolved')).toBe('other'));
    it('maps "declined" to other', () => expect(statusGroup('declined')).toBe('other'));
    it('maps "wontfix" to other', () => expect(statusGroup('wontfix')).toBe('other'));
    it('maps "" to other', () => expect(statusGroup('')).toBe('other'));
    it('maps an unrecognised string to other', () => expect(statusGroup('custom-status')).toBe('other'));
  });
});

// ── mapPriority ───────────────────────────────────────────────────────────────

describe('mapPriority', () => {
  describe('positive cases — all standard Phabricator priority values', () => {
    it('maps 100 to unbreak-now', () => {
      expect(mapPriority(100)).toEqual({ label: 'Unbreak Now!', key: 'unbreak-now' });
    });
    it('maps 90 to needs-triage', () => {
      expect(mapPriority(90)).toEqual({ label: 'Needs Triage', key: 'needs-triage' });
    });
    it('maps 80 to high', () => {
      expect(mapPriority(80)).toEqual({ label: 'High', key: 'high' });
    });
    it('maps 50 to normal', () => {
      expect(mapPriority(50)).toEqual({ label: 'Normal', key: 'normal' });
    });
    it('maps 25 to low', () => {
      expect(mapPriority(25)).toEqual({ label: 'Low', key: 'low' });
    });
    it('maps 0 to wishlist', () => {
      expect(mapPriority(0)).toEqual({ label: 'Wishlist', key: 'wishlist' });
    });
  });

  describe('negative cases — unknown values get a generated label', () => {
    it('returns a generated label for an unknown priority value', () => {
      expect(mapPriority(999)).toEqual({ label: 'P999', key: 'p999' });
    });
    it('returns a generated label for a negative priority', () => {
      expect(mapPriority(-1)).toEqual({ label: 'P-1', key: 'p-1' });
    });
  });
});

// ── isSuspectedBug ────────────────────────────────────────────────────────────

describe('isSuspectedBug', () => {
  describe('positive cases — titles containing bug-signal keywords', () => {
    it('matches "bug"', () => expect(isSuspectedBug('Login bug in VisualEditor')).toBe(true));
    it('matches "regression"', () => expect(isSuspectedBug('Regression in search')).toBe(true));
    it('matches "broken"', () => expect(isSuspectedBug('Upload is broken')).toBe(true));
    it('matches "fail"', () => expect(isSuspectedBug('CI fail on PHP 8.3')).toBe(true));
    it('matches "failing"', () => expect(isSuspectedBug('Tests failing in beta')).toBe(true));
    it('matches "failure"', () => expect(isSuspectedBug('Failure to load extension')).toBe(true));
    it('matches "crash"', () => expect(isSuspectedBug('Parser crash on large wikitext')).toBe(true));
    it('matches "error"', () => expect(isSuspectedBug('500 error on save')).toBe(true));
    it('matches "exception"', () => expect(isSuspectedBug('Uncaught exception in Hook')).toBe(true));
    it('matches "not working"', () => expect(isSuspectedBug('Upload not working')).toBe(true));
    it('matches "fix " (with trailing space)', () => expect(isSuspectedBug('fix API endpoint')).toBe(true));
    it('matches " fix:" (with leading space)', () => expect(isSuspectedBug('Login fix: revert bad commit')).toBe(true));
    it('is case-insensitive', () => expect(isSuspectedBug('BUG: incorrect redirect')).toBe(true));
    it('matches "hotfix"', () => expect(isSuspectedBug('Deploy hotfix for outage')).toBe(true));
    it('matches "incorrect"', () => expect(isSuspectedBug('Incorrect diff display')).toBe(true));
    it('matches "wrong"', () => expect(isSuspectedBug('Wrong user shown in history')).toBe(true));
  });

  describe('negative cases — titles without bug-signal keywords', () => {
    it('does not match a generic task title', () => {
      expect(isSuspectedBug('Add dark mode to preferences')).toBe(false);
    });
    it('does not match a feature request title', () => {
      expect(isSuspectedBug('Improve search ranking for categories')).toBe(false);
    });
    it('does not match an empty string', () => {
      expect(isSuspectedBug('')).toBe(false);
    });
  });

  describe('edge cases — partial-word avoidance', () => {
    // "fix " has a trailing space to avoid matching "prefix", "suffix", etc.
    it('does not match "prefix"', () => {
      expect(isSuspectedBug('Update url prefix setting')).toBe(false);
    });
    it('does not match "suffix"', () => {
      expect(isSuspectedBug('Add language suffix support')).toBe(false);
    });
  });
});

// ── shapeTask ─────────────────────────────────────────────────────────────────

const BASE_RAW_TASK = {
  id: 12345,
  phid: 'PHID-TASK-abc123',
  fields: {
    name: 'Fix login regression',
    status: { value: 'open', name: 'Open' },
    priority: { value: 80 },
    dateCreated: 1_743_000_000,   // in the past
    dateModified: 1_743_100_000,
  },
};

const CUT_OFF_EPOCH = 1_700_000_000; // older than both dates → nothing is "new"

describe('shapeTask', () => {
  describe('positive cases', () => {
    it('returns the correct id and phid', () => {
      const task = shapeTask(BASE_RAW_TASK, CUT_OFF_EPOCH);
      expect(task.id).toBe(12345);
      expect(task.phid).toBe('PHID-TASK-abc123');
    });

    it('builds the correct Phabricator URL', () => {
      const task = shapeTask(BASE_RAW_TASK, CUT_OFF_EPOCH);
      expect(task.url).toBe('https://phabricator.wikimedia.org/T12345');
    });

    it('maps status to the correct group and label', () => {
      const task = shapeTask(BASE_RAW_TASK, CUT_OFF_EPOCH);
      expect(task.statusGroup).toBe('open');
      expect(task.statusLabel).toBe('Open');
    });

    it('maps priority value 80 to high', () => {
      const task = shapeTask(BASE_RAW_TASK, CUT_OFF_EPOCH);
      expect(task.priority).toBe('high');
      expect(task.priorityLabel).toBe('High');
      expect(task.priorityValue).toBe(80);
    });

    it('sets isSuspectedBug to true for a bug-signal title', () => {
      const task = shapeTask(BASE_RAW_TASK, CUT_OFF_EPOCH);
      expect(task.isSuspectedBug).toBe(true); // title contains "regression"
    });

    it('sets isNew to true when createdAt is after the cutoff', () => {
      // cutoff is in the future relative to dateCreated
      const futureCutoff = BASE_RAW_TASK.fields.dateCreated - 1;
      const task = shapeTask(BASE_RAW_TASK, futureCutoff);
      expect(task.isNew).toBe(true);
    });

    it('sets isNew to false when createdAt is before the cutoff', () => {
      const task = shapeTask(BASE_RAW_TASK, CUT_OFF_EPOCH);
      expect(task.isNew).toBe(false);
    });

    it('converts epoch timestamps to ISO strings', () => {
      const task = shapeTask(BASE_RAW_TASK, CUT_OFF_EPOCH);
      expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(task.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('negative / edge cases', () => {
    it('falls back to "(no title)" when name is absent', () => {
      const raw = { ...BASE_RAW_TASK, fields: { ...BASE_RAW_TASK.fields, name: undefined } };
      expect(shapeTask(raw, CUT_OFF_EPOCH).title).toBe('(no title)');
    });

    it('falls back to priority Normal (50) when priority is absent', () => {
      const raw = { ...BASE_RAW_TASK, fields: { ...BASE_RAW_TASK.fields, priority: undefined } };
      const task = shapeTask(raw, CUT_OFF_EPOCH);
      expect(task.priorityValue).toBe(50);
      expect(task.priority).toBe('normal');
    });

    it('falls back to status "open" when status is absent', () => {
      const raw = { ...BASE_RAW_TASK, fields: { ...BASE_RAW_TASK.fields, status: undefined } };
      const task = shapeTask(raw, CUT_OFF_EPOCH);
      expect(task.statusGroup).toBe('open');
    });

    it('handles absent fields object gracefully', () => {
      const raw = { id: 1, phid: 'PHID-TASK-x' };
      const task = shapeTask(raw, CUT_OFF_EPOCH);
      expect(task.title).toBe('(no title)');
      expect(task.priorityValue).toBe(50);
    });
  });
});

// ── fetchRecentBugs ───────────────────────────────────────────────────────────

function conduitResponse(data, cursorAfter = null) {
  return {
    ok: true,
    json: async () => ({
      error_code: null,
      error_info: null,
      result: {
        data,
        cursor: { after: cursorAfter },
      },
    }),
  };
}

const OPEN_TASK = {
  id: 1,
  phid: 'PHID-TASK-1',
  fields: {
    name: 'Some open task',
    status: { value: 'open', name: 'Open' },
    priority: { value: 50 },
    dateCreated: 1_000_000,
    dateModified: 1_000_001,
  },
};

const CLOSED_TASK = {
  id: 2,
  phid: 'PHID-TASK-2',
  fields: {
    name: 'Resolved task',
    status: { value: 'resolved', name: 'Resolved' },
    priority: { value: 50 },
    dateCreated: 1_000_000,
    dateModified: 1_000_001,
  },
};

describe('fetchRecentBugs', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('positive cases', () => {
    it('returns shaped task objects', async () => {
      global.fetch.mockResolvedValue(conduitResponse([OPEN_TASK]));
      const result = await fetchRecentBugs();
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toMatchObject({
        id: 1,
        statusGroup: 'open',
        url: 'https://phabricator.wikimedia.org/T1',
      });
    });

    it('returns metadata fields alongside tasks', async () => {
      global.fetch.mockResolvedValue(conduitResponse([OPEN_TASK]));
      const result = await fetchRecentBugs();
      expect(typeof result.totalFetched).toBe('number');
      expect(typeof result.hasMore).toBe('boolean');
      expect(typeof result.cutoffDate).toBe('string');
    });

    it('filters out closed tasks (resolved, declined, etc.)', async () => {
      global.fetch.mockResolvedValue(conduitResponse([OPEN_TASK, CLOSED_TASK]));
      const result = await fetchRecentBugs();
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe(1);
    });

    it('fetches a second page when cursor.after is present', async () => {
      const PAGE_2_TASK = {
        id: 3,
        phid: 'PHID-TASK-3',
        fields: {
          name: 'Page 2 task',
          status: { value: 'open', name: 'Open' },
          priority: { value: 50 },
          dateCreated: 1_000_000,
          dateModified: 1_000_001,
        },
      };
      global.fetch
        .mockResolvedValueOnce(conduitResponse(Array(100).fill(OPEN_TASK), 'cursor-token'))
        .mockResolvedValueOnce(conduitResponse([PAGE_2_TASK]));

      const result = await fetchRecentBugs();
      expect(global.fetch).toHaveBeenCalledTimes(2);
      // 100 from page 1 + 1 from page 2 = 101 tasks
      expect(result.tasks.length).toBe(101);
    });

    it('stops at MAX_PAGES (2) even when more pages exist', async () => {
      // Both pages return 100 items with a cursor — but we should stop at 2
      global.fetch.mockResolvedValue(
        conduitResponse(Array(100).fill(OPEN_TASK), 'always-more'),
      );
      const result = await fetchRecentBugs();
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.hasMore).toBe(true);
    });

    it('returns hasMore: false when last page is partial', async () => {
      // Fewer than 100 items means no more pages
      global.fetch.mockResolvedValue(conduitResponse([OPEN_TASK]));
      const result = await fetchRecentBugs();
      expect(result.hasMore).toBe(false);
    });
  });

  describe('negative cases', () => {
    it('throws when the API returns a non-OK HTTP status', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
      await expect(fetchRecentBugs()).rejects.toThrow('HTTP 500');
    });

    it('throws when the Conduit response has an error_code', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          error_code: 'ERR-CONDUIT-CORE',
          error_info: 'Invalid token',
          result: null,
        }),
      });
      await expect(fetchRecentBugs()).rejects.toThrow(/ERR-CONDUIT-CORE/);
    });

    it('throws when the Conduit response has no result field', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ error_code: null, result: null }),
      });
      await expect(fetchRecentBugs()).rejects.toThrow(/no result/i);
    });

    it('throws when fetch itself rejects', async () => {
      global.fetch.mockRejectedValue(new Error('DNS failure'));
      await expect(fetchRecentBugs()).rejects.toThrow('DNS failure');
    });
  });
});
