import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CoveragePanel from '../../components/CoveragePanel.jsx';
import { makeValidCoverage, expectNoCrash } from './helpers.jsx';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }) => <g>{children}</g>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Cell: () => null,
  ReferenceLine: () => null,
}));

// Mock activeExtensions so the Wikipedia-filter does not depend on the live
// extension list (which changes over time).
vi.mock('../../data/activeExtensions.js', () => ({
  isActiveOnWikipedia: (name) => ['AbuseFilter', 'Echo', 'Cite'].includes(name),
  GENERATED_DATE: '2026-04-03',
}));

describe('CoveragePanel – integration contract tests', () => {
  describe('hook initial state', () => {
    it('renders skeleton when loading with null coverage', () => {
      const { container } = render(
        <CoveragePanel coverage={null} error={null} loading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders empty message when loaded with null coverage', () => {
      render(
        <CoveragePanel coverage={null} error={null} loading={false} />,
      );
      expect(screen.getByText(/No coverage data loaded yet/i)).toBeInTheDocument();
    });
  });

  describe('successful fetch', () => {
    it('renders with valid coverage and maintainers', () => {
      const maintainers = new Map([
        ['AbuseFilter', { steward: 'Performance', maintainer: 'alice' }],
        ['Echo', { steward: 'Growth', maintainer: 'bob' }],
      ]);
      render(
        <CoveragePanel
          coverage={makeValidCoverage()}
          error={null}
          loading={false}
          maintainers={maintainers}
          maintainersError={null}
        />,
      );
      // Should render the coverage table
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders with coverage but null maintainers (maintainers failed)', () => {
      render(
        <CoveragePanel
          coverage={makeValidCoverage()}
          error={null}
          loading={false}
          maintainers={null}
          maintainersError={new Error('Maintainers fetch failed')}
        />,
      );
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  describe('service rejection', () => {
    it('renders error banner when coverage error is set', () => {
      const err = new Error('Coverage index down');
      render(
        <CoveragePanel coverage={null} error={err} loading={false} />,
      );
      expect(screen.getByText(/Coverage index down/)).toBeInTheDocument();
    });
  });

  describe('malformed data — no crash', () => {
    it('handles empty array instead of object', () => {
      expectNoCrash(() =>
        render(<CoveragePanel coverage={[]} error={null} loading={false} />),
      );
    });

    it('handles empty object (missing extensions field)', () => {
      expectNoCrash(() =>
        render(<CoveragePanel coverage={{}} error={null} loading={false} />),
      );
    });

    it('handles { core: null, extensions: null }', () => {
      expectNoCrash(() =>
        render(
          <CoveragePanel
            coverage={{ core: null, extensions: null }}
            error={null}
            loading={false}
          />,
        ),
      );
    });

    it('handles undefined coverage', () => {
      expectNoCrash(() =>
        render(<CoveragePanel coverage={undefined} error={null} loading={false} />),
      );
    });

    it('handles maintainers as empty array instead of Map', () => {
      expectNoCrash(() =>
        render(
          <CoveragePanel
            coverage={makeValidCoverage()}
            error={null}
            loading={false}
            maintainers={[]}
            maintainersError={null}
          />,
        ),
      );
    });

    it('handles maintainers as plain object instead of Map', () => {
      expectNoCrash(() =>
        render(
          <CoveragePanel
            coverage={makeValidCoverage()}
            error={null}
            loading={false}
            maintainers={{}}
            maintainersError={null}
          />,
        ),
      );
    });
  });
});
