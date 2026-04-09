import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoveragePanel from '../../components/CoveragePanel.jsx';

// fetchMaintainers is now called automatically on mount; mock it so tests
// don't attempt a real network request.
vi.mock('../../services/maintainers.js', () => ({
  fetchMaintainers: vi.fn(() => Promise.resolve(new Map())),
  uniqueStewards:   vi.fn(() => []),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  Cell: () => null,
}));

// Mock activeExtensions so the Wikipedia-filter test does not depend on the
// live extension list (which changes over time).
vi.mock('../../data/activeExtensions.js', () => ({
  isActiveOnWikipedia: (name) => ['AbuseFilter', 'Echo', 'Cite'].includes(name),
  GENERATED_DATE: '2026-04-03',
}));

const COVERAGE = {
  core: {
    name: 'mediawiki-core',
    coverage_pct: 75,
    last_updated: '2026-04-03 GMT',
    page_url: 'https://doc.wikimedia.org/cover/mediawiki-core/',
    clover_url: 'https://doc.wikimedia.org/cover/mediawiki-core/clover.xml',
  },
  extensions: [
    {
      name: 'AbuseFilter',
      coverage_pct: 90,
      last_updated: '2026-04-01 GMT',
      page_url: 'https://doc.wikimedia.org/cover-extensions/AbuseFilter/',
      clover_url: 'https://doc.wikimedia.org/cover-extensions/AbuseFilter/clover.xml',
    },
    {
      name: 'Echo',
      coverage_pct: 68,
      last_updated: '2026-04-01 GMT',
      page_url: 'https://doc.wikimedia.org/cover-extensions/Echo/',
      clover_url: 'https://doc.wikimedia.org/cover-extensions/Echo/clover.xml',
    },
    {
      name: 'NotOnWikipedia',
      coverage_pct: 45,
      last_updated: '2026-04-01 GMT',
      page_url: 'https://doc.wikimedia.org/cover-extensions/NotOnWikipedia/',
      clover_url: 'https://doc.wikimedia.org/cover-extensions/NotOnWikipedia/clover.xml',
    },
  ],
};

describe('CoveragePanel', () => {
  describe('loading state', () => {
    it('renders the skeleton when loading', () => {
      const { container } = render(
        <CoveragePanel coverage={null} loading={true} error={null} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });
  });

  describe('error state', () => {
    it('renders the error message when error is provided', () => {
      const err = new Error('Coverage index unreachable');
      render(<CoveragePanel coverage={null} loading={false} error={err} />);
      expect(screen.getByText(/Coverage index unreachable/)).toBeInTheDocument();
    });
  });

  describe('null coverage', () => {
    it('shows a not-loaded message when coverage is null', () => {
      render(<CoveragePanel coverage={null} loading={false} error={null} />);
      expect(screen.getByText(/No coverage data loaded yet/i)).toBeInTheDocument();
    });
  });

  describe('with data', () => {
    it('renders the median coverage headline', () => {
      // COVERAGE has AbuseFilter (90%) and Echo (68%), both in WIKIPEDIA_DEPLOYED.
      // Sorted: [68, 90] — even count, so median = round((68 + 90) / 2) = 79.
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      expect(screen.getByText('79%')).toBeInTheDocument();
    });

    it('shows the "Median coverage" label', () => {
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      expect(screen.getByText(/Median coverage/i)).toBeInTheDocument();
    });

    it('renders the bar chart after switching to Top 15 view', () => {
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      // Default view is Table; switch to chart view first.
      fireEvent.click(screen.getByText('Top 15'));
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('shows stat bucket cards', () => {
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      // Bucket labels should be present
      expect(screen.getByText('≥ 80%')).toBeInTheDocument();
      expect(screen.getByText('60–79%')).toBeInTheDocument();
      expect(screen.getByText('< 60%')).toBeInTheDocument();
    });

    it('defaults to Wikipedia-only filter (hides NotOnWikipedia extension)', () => {
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      // "Wikipedia only" button should be active (indigo) — we just check it is present
      expect(screen.getByText('Wikipedia only')).toBeInTheDocument();
    });

    it('switches to All extensions view when button is clicked', () => {
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      fireEvent.click(screen.getByText(`All (${COVERAGE.extensions.length})`));
      // After switching, footer summary shows all 3 extensions (avg across all 3)
      expect(screen.getByText(/3 extensions · avg/i)).toBeInTheDocument();
    });

    it('shows "No coverage data available" when there are no extensions with coverage', () => {
      const noCoverage = {
        core: null,
        extensions: [{ name: 'AbuseFilter', coverage_pct: 0, last_updated: '2026-04-01 GMT', page_url: 'https://doc.wikimedia.org/cover-extensions/AbuseFilter/' }],
      };
      render(<CoveragePanel coverage={noCoverage} loading={false} error={null} />);
      expect(screen.getByText(/No coverage data available/i)).toBeInTheDocument();
    });
  });
});
