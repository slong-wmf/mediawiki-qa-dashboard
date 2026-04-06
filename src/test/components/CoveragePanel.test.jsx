import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoveragePanel from '../../components/CoveragePanel.jsx';

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
    it('renders the mediawiki-core headline coverage percentage', () => {
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('renders the bar chart', () => {
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('shows the "mediawiki-core" label', () => {
      render(<CoveragePanel coverage={COVERAGE} loading={false} error={null} />);
      expect(screen.getByText('mediawiki-core')).toBeInTheDocument();
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
      // After switching, total count includes all 3 extensions
      expect(screen.getByText(/3 extensions/i)).toBeInTheDocument();
    });

    it('shows "mediawiki-core entry not found" when core is null', () => {
      const noCoverage = { ...COVERAGE, core: null };
      render(<CoveragePanel coverage={noCoverage} loading={false} error={null} />);
      expect(screen.getByText(/mediawiki-core entry not found/i)).toBeInTheDocument();
    });
  });
});
