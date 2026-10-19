import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutomatedTestsPanel, { filterReposBySteward } from '../../components/AutomatedTestsPanel.jsx';

function makeRepo(overrides = {}) {
  return {
    name: 'AbuseFilter',
    repoPath: 'mediawiki/extensions/AbuseFilter',
    framework: 'wdio',
    mediawikiVersion: '9.27.0',
    frameworkVersion: '6.5.0',
    gatedSelenium: true,
    testCount: 2,
    tests: [{ name: 'page should exist' }, { name: 'allows saving an edit' }],
    ...overrides,
  };
}

const DATA = {
  generatedAt: '2026-04-17T00:00:00Z',
  repoCount: 3,
  testCount: 5,
  repos: [
    makeRepo(),
    makeRepo({ name: 'Cite', framework: 'cypress', frameworkVersion: '15.11.0', testCount: 2, tests: [{ name: 'r1' }, { name: 'r2' }], gatedSelenium: false }),
    makeRepo({ name: 'Echo', framework: 'wdio', testCount: 1, tests: [{ name: 'notif' }], gatedSelenium: false }),
  ],
};

describe('AutomatedTestsPanel', () => {
  describe('loading/error/empty states', () => {
    it('renders a skeleton when loading', () => {
      const { container } = render(<AutomatedTestsPanel data={null} error={null} loading={true} />);
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders an ErrorBanner when error is set', () => {
      const err = new Error('Scanner JSON page not found');
      render(<AutomatedTestsPanel data={null} error={err} loading={false} />);
      expect(screen.getByText(/Scanner JSON page not found/)).toBeInTheDocument();
    });

    it('renders a not-loaded message when data is null and no error', () => {
      render(<AutomatedTestsPanel data={null} error={null} loading={false} />);
      expect(screen.getByText(/No automated-tests data loaded yet/i)).toBeInTheDocument();
    });

    it('renders a no-repos message when the envelope has an empty repos list', () => {
      render(<AutomatedTestsPanel data={{ repos: [], repoCount: 0, testCount: 0 }} error={null} loading={false} />);
      expect(screen.getByText(/No repos reported by the scanner/i)).toBeInTheDocument();
    });
  });

  describe('rendered data', () => {
    it('shows headline counts', () => {
      render(<AutomatedTestsPanel data={DATA} error={null} loading={false} />);
      // "Tests", "WDIO" and "Cypress" also appear in the table (column header
      // / framework cells), so allow multiple matches for those labels.
      expect(screen.getByText(/^Repos$/)).toBeInTheDocument();
      expect(screen.getAllByText(/^Tests$/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^WDIO$/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^Cypress$/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^Gated$/).length).toBeGreaterThan(0);
    });

    it('renders one row per repo in the default view', () => {
      render(<AutomatedTestsPanel data={DATA} error={null} loading={false} />);
      expect(screen.getByText('AbuseFilter')).toBeInTheDocument();
      expect(screen.getByText('Cite')).toBeInTheDocument();
      expect(screen.getByText('Echo')).toBeInTheDocument();
    });

    it('filters to WDIO when the framework toggle is clicked', () => {
      render(<AutomatedTestsPanel data={DATA} error={null} loading={false} />);
      fireEvent.click(screen.getByRole('button', { name: /WDIO/ }));
      expect(screen.getByText('AbuseFilter')).toBeInTheDocument();
      expect(screen.getByText('Echo')).toBeInTheDocument();
      expect(screen.queryByText('Cite')).not.toBeInTheDocument();
    });

    it('filters to Cypress when the framework toggle is clicked', () => {
      render(<AutomatedTestsPanel data={DATA} error={null} loading={false} />);
      fireEvent.click(screen.getByRole('button', { name: /Cypress/ }));
      expect(screen.getByText('Cite')).toBeInTheDocument();
      expect(screen.queryByText('AbuseFilter')).not.toBeInTheDocument();
    });

    it('expands a row to show its test names when clicked', () => {
      render(<AutomatedTestsPanel data={DATA} error={null} loading={false} />);
      fireEvent.click(screen.getByText('AbuseFilter'));
      expect(screen.getByText('page should exist')).toBeInTheDocument();
      expect(screen.getByText('allows saving an edit')).toBeInTheDocument();
    });
  });

  describe('steward filter integration', () => {
    const maintainers = new Map([
      ['AbuseFilter', { steward: 'Performance', maintainer: 'alice' }],
      ['Cite',        { steward: 'Editing',     maintainer: 'bob' }],
      ['Echo',        { steward: 'Growth',      maintainer: 'carol' }],
    ]);

    it('shows all repos when no stewards are selected', () => {
      render(
        <AutomatedTestsPanel
          data={DATA} error={null} loading={false}
          maintainers={maintainers} activeStewards={[]}
        />,
      );
      expect(screen.getByText('AbuseFilter')).toBeInTheDocument();
      expect(screen.getByText('Cite')).toBeInTheDocument();
      expect(screen.getByText('Echo')).toBeInTheDocument();
    });

    it('narrows to a single steward', () => {
      render(
        <AutomatedTestsPanel
          data={DATA} error={null} loading={false}
          maintainers={maintainers} activeStewards={['Growth']}
        />,
      );
      expect(screen.queryByText('AbuseFilter')).not.toBeInTheDocument();
      expect(screen.queryByText('Cite')).not.toBeInTheDocument();
      expect(screen.getByText('Echo')).toBeInTheDocument();
    });
  });

  describe('Catalyst daily jobs, gated job and skins', () => {
    const GATED_JOB = {
      name: 'quibble-with-gated-extensions-selenium-php83',
      url: 'https://integration.wikimedia.org/ci/job/quibble-with-gated-extensions-selenium-php83/',
    };

    it('notes that daily jobs run on Catalyst and that the scanner lists no skins', () => {
      render(<AutomatedTestsPanel data={DATA} error={null} loading={false} />);
      expect(screen.getByText(/Daily jobs run on Catalyst/)).toBeInTheDocument();
      expect(screen.getByText('selenium-daily-beta-*')).toBeInTheDocument();
      expect(screen.getByText(/lists no skins with browser tests/)).toBeInTheDocument();
    });

    it('omits the skins sentence when the scanner reports a skin repo', () => {
      const data = {
        ...DATA,
        repos: [...DATA.repos, makeRepo({ name: 'MinervaNeue', repoPath: 'mediawiki/skins/MinervaNeue' })],
      };
      render(<AutomatedTestsPanel data={data} error={null} loading={false} />);
      expect(screen.getByText(/Daily jobs run on Catalyst/)).toBeInTheDocument();
      expect(screen.queryByText(/lists no skins with browser tests/)).not.toBeInTheDocument();
    });

    it('links the gated marker to the gated selenium job', () => {
      render(<AutomatedTestsPanel data={{ ...DATA, gatedJob: GATED_JOB }} error={null} loading={false} />);
      // Only AbuseFilter is gated in DATA.
      const links = screen.getAllByTitle(`Gated selenium: ${GATED_JOB.name}`);
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', GATED_JOB.url);
    });

    it('keeps the gated marker as plain text when the scanner sends no gatedJob', () => {
      render(<AutomatedTestsPanel data={DATA} error={null} loading={false} />);
      expect(screen.getByTitle('Gated selenium').tagName).toBe('SPAN');
    });

    it('labels the daily column Catalyst and shows the flaky count', () => {
      const data = {
        ...DATA,
        repos: [
          makeRepo({
            name: 'AdvancedSearch',
            dailyJobs: [{
              name: 'catalyst-daily-AdvancedSearch',
              url: 'https://integration.wikimedia.org/ci/job/catalyst-daily-AdvancedSearch/',
              passes: 5, flaky: 3, fails: 2, total: 7,
              results: ['U', 'F', 'U', 'F', 'P', 'U', 'P'],
            }],
          }),
        ],
      };
      render(<AutomatedTestsPanel data={data} error={null} loading={false} />);
      expect(screen.getByText('Catalyst (7d)')).toBeInTheDocument();
      expect(screen.getByText('5/7')).toBeInTheDocument();
      expect(screen.getByText('3 flaky')).toHaveAttribute('title', '3 of 7 runs passed only on retry');
    });

    it('hides the flaky count when no run needed a retry', () => {
      const data = {
        ...DATA,
        repos: [
          makeRepo({
            dailyJobs: [{
              name: 'catalyst-daily-AbuseFilter', url: 'https://example/', passes: 7, flaky: 0, fails: 0, total: 7,
              results: ['P', 'P', 'P', 'P', 'P', 'P', 'P'],
            }],
          }),
        ],
      };
      render(<AutomatedTestsPanel data={data} error={null} loading={false} />);
      expect(screen.getByText('7/7')).toBeInTheDocument();
      expect(screen.queryByText(/flaky/)).not.toBeInTheDocument();
    });
  });
});

// ── filterReposBySteward unit tests ──────────────────────────────────────────

describe('filterReposBySteward', () => {
  const maintainers = new Map([
    ['AbuseFilter', { steward: 'Performance' }],
    ['Echo',        { steward: 'Growth' }],
  ]);
  const repos = [
    { name: 'AbuseFilter' }, { name: 'Echo' }, { name: 'OtherExt' },
  ];

  it('returns the list unchanged when activeStewards is empty', () => {
    expect(filterReposBySteward(repos, [], maintainers)).toEqual(repos);
  });

  it('returns the list unchanged when maintainers is not a Map', () => {
    expect(filterReposBySteward(repos, ['Growth'], null)).toEqual(repos);
    expect(filterReposBySteward(repos, ['Growth'], {})).toEqual(repos);
  });

  it('keeps only repos owned by one of the selected stewards', () => {
    const result = filterReposBySteward(repos, ['Growth'], maintainers);
    expect(result).toEqual([{ name: 'Echo' }]);
  });

  it('excludes repos whose extension is not in the maintainers map', () => {
    const result = filterReposBySteward(repos, ['Performance', 'Growth'], maintainers);
    expect(result.map((r) => r.name)).toEqual(['AbuseFilter', 'Echo']);
  });
});
