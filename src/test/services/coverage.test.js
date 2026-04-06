import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseRows, fetchCoverageData } from '../../services/coverage.js';

// ── parseRows ─────────────────────────────────────────────────────────────────

/**
 * Minimal HTML that matches the structure expected by parseRows.
 * See coverage.js for the full expected structure.
 */
function makeHtml(rows) {
  const rowHtml = rows
    .map(
      ({ name, value, mtime, skipMeter, skipName }) => `
    <tr>
      ${skipMeter ? '' : `<td class="cover-item-meter"><meter value="${value}">${value}%</meter></td>`}
      ${skipName ? '' : `<td class="cover-item-name"><a href="./${name}/">${name}</a></td>`}
      ${mtime ? `<td class="cover-item-mtime">${mtime}</td>` : ''}
    </tr>`,
    )
    .join('\n');
  return `<html><body><table>${rowHtml}</table></body></html>`;
}

describe('parseRows', () => {
  describe('positive cases', () => {
    it('parses a single valid row', () => {
      const html = makeHtml([
        { name: 'AbuseFilter', value: 76, mtime: '2026-04-03 08:21 GMT' },
      ]);
      const rows = parseRows(html, 'cover-extensions');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        name: 'AbuseFilter',
        coverage_pct: 76,
        last_updated: '2026-04-03 08:21 GMT',
        page_url: 'https://doc.wikimedia.org/cover-extensions/AbuseFilter/',
        clover_url: 'https://doc.wikimedia.org/cover-extensions/AbuseFilter/clover.xml',
      });
    });

    it('parses multiple rows', () => {
      const html = makeHtml([
        { name: 'Echo', value: 85, mtime: '2026-04-01 GMT' },
        { name: 'Cite', value: 62, mtime: '2026-04-02 GMT' },
      ]);
      const rows = parseRows(html, 'cover-extensions');
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Echo');
      expect(rows[1].name).toBe('Cite');
    });

    it('uses the correct baseSection in generated URLs', () => {
      const html = makeHtml([{ name: 'mediawiki-core', value: 75, mtime: '' }]);
      const rows = parseRows(html, 'cover');
      expect(rows[0].page_url).toBe('https://doc.wikimedia.org/cover/mediawiki-core/');
      expect(rows[0].clover_url).toBe('https://doc.wikimedia.org/cover/mediawiki-core/clover.xml');
    });

    it('returns null for last_updated when mtime cell is absent', () => {
      const html = makeHtml([{ name: 'Foo', value: 50 }]);
      const rows = parseRows(html, 'cover-extensions');
      expect(rows[0].last_updated).toBeNull();
    });

    it('parses a 0% coverage entry', () => {
      const html = makeHtml([{ name: 'Bar', value: 0, mtime: '2026-04-01 GMT' }]);
      const rows = parseRows(html, 'cover-extensions');
      expect(rows[0].coverage_pct).toBe(0);
    });

    it('parses a 100% coverage entry', () => {
      const html = makeHtml([{ name: 'Baz', value: 100, mtime: '2026-04-01 GMT' }]);
      const rows = parseRows(html, 'cover-extensions');
      expect(rows[0].coverage_pct).toBe(100);
    });
  });

  describe('negative / edge cases', () => {
    it('returns an empty array for empty HTML', () => {
      expect(parseRows('<html></html>', 'cover-extensions')).toEqual([]);
    });

    it('returns an empty array for empty string', () => {
      expect(parseRows('', 'cover-extensions')).toEqual([]);
    });

    it('skips rows that are missing a <meter> element', () => {
      const html = makeHtml([
        { name: 'NoMeter', value: 70, mtime: '', skipMeter: true },
        { name: 'WithMeter', value: 70, mtime: '' },
      ]);
      const rows = parseRows(html, 'cover-extensions');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('WithMeter');
    });

    it('skips rows that are missing the .cover-item-name anchor', () => {
      const html = makeHtml([
        { name: 'NoName', value: 70, mtime: '', skipName: true },
        { name: 'WithName', value: 55, mtime: '' },
      ]);
      const rows = parseRows(html, 'cover-extensions');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('WithName');
    });

    it('skips rows that are missing both meter and name', () => {
      const html = makeHtml([
        { name: 'None', value: 70, mtime: '', skipMeter: true, skipName: true },
      ]);
      expect(parseRows(html, 'cover-extensions')).toHaveLength(0);
    });
  });
});

// ── fetchCoverageData ─────────────────────────────────────────────────────────

const CORE_HTML = makeHtml([
  { name: 'mediawiki-core', value: 75, mtime: '2026-04-03 GMT' },
  { name: 'SomeOtherProject', value: 80, mtime: '2026-04-02 GMT' },
]);

const EXT_HTML = makeHtml([
  { name: 'AbuseFilter', value: 90, mtime: '2026-04-01 GMT' },
  { name: 'Echo', value: 68, mtime: '2026-04-01 GMT' },
]);

describe('fetchCoverageData', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('positive cases', () => {
    it('returns core and extensions on success', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, text: async () => CORE_HTML })
        .mockResolvedValueOnce({ ok: true, text: async () => EXT_HTML });

      const result = await fetchCoverageData();
      expect(result.core).not.toBeNull();
      expect(result.core.name).toBe('mediawiki-core');
      expect(result.core.coverage_pct).toBe(75);
      expect(result.extensions).toHaveLength(2);
    });

    it('sets core to null when mediawiki-core entry is not in the core page', async () => {
      const noCoreHtml = makeHtml([
        { name: 'SomeOtherProject', value: 80, mtime: '' },
      ]);
      global.fetch
        .mockResolvedValueOnce({ ok: true, text: async () => noCoreHtml })
        .mockResolvedValueOnce({ ok: true, text: async () => EXT_HTML });

      const result = await fetchCoverageData();
      expect(result.core).toBeNull();
      expect(result.extensions).toHaveLength(2);
    });

    it('fetches core and extensions in parallel (two fetch calls)', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, text: async () => CORE_HTML })
        .mockResolvedValueOnce({ ok: true, text: async () => EXT_HTML });

      await fetchCoverageData();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('negative cases', () => {
    it('throws when the core fetch returns a non-OK status', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: 'Bad Gateway' })
        .mockResolvedValueOnce({ ok: true, text: async () => EXT_HTML });

      await expect(fetchCoverageData()).rejects.toThrow('502');
    });

    it('throws when the extensions fetch returns a non-OK status', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, text: async () => CORE_HTML })
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' });

      await expect(fetchCoverageData()).rejects.toThrow('503');
    });

    it('throws when the extensions page returns no rows', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, text: async () => CORE_HTML })
        .mockResolvedValueOnce({ ok: true, text: async () => '<html></html>' });

      await expect(fetchCoverageData()).rejects.toThrow(/no extension data/i);
    });

    it('throws when fetch itself rejects (network error)', async () => {
      global.fetch.mockRejectedValue(new Error('network failure'));
      await expect(fetchCoverageData()).rejects.toThrow('network failure');
    });
  });
});
