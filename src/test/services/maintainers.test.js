import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseHTML } from 'linkedom';
import {
  MAINTAINERS_API_URL,
  headerLabels,
  parseServiceCatalog,
} from '../../services/maintainersCore.js';
import { fetchMaintainers } from '../../services/maintainers.js';

// A small copy of the Wikimedia Production/Service Catalog layout: two header
// rows, "Owners" spans three columns, and seven cells in each data row.
const CATALOG_HEADER = `
  <tr>
    <th rowspan="2">Service</th><th rowspan="2">Status<sup>[2]</sup></th>
    <th colspan="3">Owners<sup>[2]</sup></th>
    <th rowspan="2">SLO (Status)<sup>[3]</sup></th>
    <th rowspan="2">Volunteer Devs &amp; other useful info</th>
  </tr>
  <tr><th>Development / Maintenance</th><th>Config &amp; Deployment</th><th>Incident First Responder</th></tr>`;

const CATALOG_HTML = `
  <h2>Extensions</h2>
  <table class="wikitable"><tbody>${CATALOG_HEADER}
    <tr>
      <td><a href="/wiki/Special:MyLanguage/Extension:Echo">Echo</a> <a href="/wiki/Extension:Echo"></a></td>
      <td>Maintenance</td><td><a href="/wiki/MediaWiki_Core_Platform_Team">MediaWiki Core Platform</a></td>
      <td>Release Engineering</td><td>SRE Service Ops</td><td></td>
      <td><p><a href="https://phabricator.wikimedia.org/tag/x">Tasks</a></p></td>
    </tr>
    <tr>
      <td><a href="/wiki/Extension:Math"></a><a href="/wiki/Special:MyLanguage/Extension:Math">Math</a></td>
      <td>Maintenance</td><td>Editing</td><td>Release Engineering</td><td>SRE Service Ops</td><td></td>
      <td><p><b>Volunteer Devs</b>: <a href="/wiki/User:Physikerwelt">Physikerwelt</a>,
        <a href="/wiki/User:TheDJ">TheDJ</a><br><br><a href="https://phabricator.wikimedia.org/tag/y">Tasks</a></p></td>
    </tr>
    <tr>
      <td><a href="/wiki/Extension:Gadgets">Gadgets</a></td>
      <td>Unowned</td><td></td><td>Release Engineering</td><td>SRE Service Ops</td><td></td><td></td>
    </tr>
    <tr>
      <td><a href="/wiki/Extension:WikimediaEvents">WikimediaEvents</a></td>
      <td>Active WMF Development</td>
      <td>Multiple teams, see <a href="https://gerrit.wikimedia.org/g/OWNERS.md">OWNERS.md</a>.Framework is owned by
        <a href="/wiki/Experiment_Platform">Experiment Platform</a> .</td>
      <td>Experiment Platform</td><td>SRE Service Ops</td><td></td><td></td>
    </tr>
  </tbody></table>
  <h2>Skins</h2>
  <table class="wikitable"><tbody>${CATALOG_HEADER}
    <tr><td><a href="/wiki/Skin:Vector">Vector</a></td><td>Maintenance</td><td>Reader Experience</td><td></td><td></td><td></td><td></td></tr>
  </tbody></table>
  <table class="wikitable"><tbody>
    <tr><th>Name</th><th>Notes</th></tr>
    <tr><td><a href="/wiki/Extension:Stray">Stray</a></td><td>No owner columns</td></tr>
  </tbody></table>`;

const EXPECTED = new Map([
  ['Echo',            { steward: 'MediaWiki Core Platform', maintainer: '' }],
  ['Math',            { steward: 'Editing',                 maintainer: 'Physikerwelt, TheDJ' }],
  ['Gadgets',         { steward: '',                        maintainer: '' }],
  ['WikimediaEvents', { steward: 'Multiple teams',          maintainer: '' }],
]);

const browserDocument = (html) => new DOMParser().parseFromString(html, 'text/html');

// ── maintainersCore ──────────────────────────────────────────────────────────

describe('headerLabels', () => {
  it('applies rowspan and colspan so each data column gets its lowest label', () => {
    const table = browserDocument(`<table>${CATALOG_HEADER}</table>`).querySelector('table');
    expect(headerLabels(table)).toEqual([
      'service',
      'status',
      'development / maintenance',
      'config & deployment',
      'incident first responder',
      'slo (status)',
      'volunteer devs & other useful info',
    ]);
  });

  it('reads a single header row', () => {
    const table = browserDocument('<table><tr><th>Name</th><th>Notes[1]</th></tr></table>').querySelector('table');
    expect(headerLabels(table)).toEqual(['name', 'notes']);
  });
});

describe('parseServiceCatalog', () => {
  it('maps each extension row to its Development / Maintenance team and volunteers', () => {
    expect(parseServiceCatalog(browserDocument(CATALOG_HTML))).toEqual(EXPECTED);
  });

  it('gives the same result with linkedom, as the snapshot script uses', () => {
    expect(parseServiceCatalog(parseHTML(CATALOG_HTML).document)).toEqual(EXPECTED);
  });

  it('returns an empty Map for a page without catalog tables (e.g. a redirect stub)', () => {
    expect(parseServiceCatalog(browserDocument('<div class="redirectMsg">Redirect to: Service Catalog</div>')).size).toBe(0);
  });
});

// ── fetchMaintainers ─────────────────────────────────────────────────────────

describe('fetchMaintainers', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockPage = (html) => global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ parse: { text: { '*': html } } }),
  });

  it('reads the Service Catalog page and follows redirects', async () => {
    mockPage(CATALOG_HTML);
    const map = await fetchMaintainers();
    expect(global.fetch).toHaveBeenCalledWith(MAINTAINERS_API_URL);
    expect(MAINTAINERS_API_URL).toContain('page=Wikimedia_Production/Service_Catalog');
    expect(MAINTAINERS_API_URL).toContain('redirects=1');
    expect(map).toEqual(EXPECTED);
  });

  it('throws when the page has no extension rows', async () => {
    mockPage('<div class="redirectMsg">Redirect</div>');
    await expect(fetchMaintainers()).rejects.toThrow(/no extension rows/);
  });

  it('throws on an HTTP error', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' });
    await expect(fetchMaintainers()).rejects.toThrow(/HTTP 503/);
  });

  describe('static-data mode', () => {
    afterEach(() => {
      vi.doUnmock('../../services/staticData.js');
      vi.resetModules();
    });

    async function loadWithSnapshot(snapshot) {
      vi.resetModules();
      vi.doMock('../../services/staticData.js', () => ({
        USE_STATIC_DATA: true,
        fetchStaticJson: vi.fn().mockResolvedValue(snapshot),
      }));
      return import('../../services/maintainers.js');
    }

    it('rebuilds the Map from the snapshot object', async () => {
      const mod = await loadWithSnapshot({ Echo: { steward: 'MediaWiki Core Platform', maintainer: '' } });
      const map = await mod.fetchMaintainers();
      expect(map.get('Echo')).toEqual({ steward: 'MediaWiki Core Platform', maintainer: '' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws when the snapshot is empty, so the steward filter shows an error', async () => {
      const mod = await loadWithSnapshot({});
      await expect(mod.fetchMaintainers()).rejects.toThrow(/no extensions/);
    });
  });
});
