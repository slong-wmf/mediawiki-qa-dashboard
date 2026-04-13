import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PassFailPanel from '../../components/PassFailPanel.jsx';
import { makeValidBuild, expectNoCrash } from './helpers.jsx';

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

describe('PassFailPanel – integration contract tests', () => {
  describe('hook initial state', () => {
    it('renders skeleton when loading with empty builds', () => {
      const { container } = render(
        <PassFailPanel builds={[]} error={null} loading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders without crash when loaded with empty builds', () => {
      expectNoCrash(() =>
        render(<PassFailPanel builds={[]} error={null} loading={false} />),
      );
    });
  });

  describe('successful fetch', () => {
    it('renders with valid build data', () => {
      const builds = [
        makeValidBuild({ job: 'quibble-php83', status: 'passed', tests: null }),
        makeValidBuild({ job: 'quibble-php83', status: 'failed', tests: null }),
        makeValidBuild({ job: 'selenium-daily-beta-Echo', status: 'passed' }),
      ];
      render(<PassFailPanel builds={builds} error={null} loading={false} />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  describe('service rejection', () => {
    it('renders error banner when error is set', () => {
      const err = new Error('Jenkins down');
      render(<PassFailPanel builds={[]} error={err} loading={false} />);
      expect(screen.getByText(/Jenkins down/)).toBeInTheDocument();
    });
  });

  describe('malformed data — no crash', () => {
    it('handles null instead of array', () => {
      expectNoCrash(() =>
        render(<PassFailPanel builds={null} error={null} loading={false} />),
      );
    });

    it('handles undefined', () => {
      expectNoCrash(() =>
        render(<PassFailPanel builds={undefined} error={null} loading={false} />),
      );
    });

    it('handles builds with missing fields', () => {
      expectNoCrash(() =>
        render(<PassFailPanel builds={[{ job: 'x' }]} error={null} loading={false} />),
      );
    });

    it('handles builds where tests field is undefined (not null)', () => {
      expectNoCrash(() =>
        render(
          <PassFailPanel
            builds={[makeValidBuild({ tests: undefined })]}
            error={null}
            loading={false}
          />,
        ),
      );
    });
  });
});
