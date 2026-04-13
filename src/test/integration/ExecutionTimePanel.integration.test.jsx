import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExecutionTimePanel from '../../components/ExecutionTimePanel.jsx';
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

describe('ExecutionTimePanel – integration contract tests', () => {
  describe('hook initial state', () => {
    it('renders skeleton when loading with empty builds', () => {
      const { container } = render(
        <ExecutionTimePanel builds={[]} error={null} loading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders empty message when loaded with empty builds', () => {
      render(<ExecutionTimePanel builds={[]} error={null} loading={false} />);
      expect(screen.getByText(/No build data available/i)).toBeInTheDocument();
    });
  });

  describe('successful fetch', () => {
    it('renders bar chart with valid build data', () => {
      const builds = [
        makeValidBuild({ job: 'quibble-php83', duration_seconds: 400 }),
        makeValidBuild({ job: 'quibble-php83', duration_seconds: 350 }),
        makeValidBuild({ job: 'selenium-daily-beta-Echo', duration_seconds: 200 }),
      ];
      render(<ExecutionTimePanel builds={builds} error={null} loading={false} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  describe('service rejection', () => {
    it('renders error banner when error is set', () => {
      const err = new Error('Jenkins unreachable');
      render(<ExecutionTimePanel builds={[]} error={err} loading={false} />);
      expect(screen.getByText(/Jenkins unreachable/)).toBeInTheDocument();
    });
  });

  describe('malformed data — no crash', () => {
    it('handles null instead of array', () => {
      expectNoCrash(() =>
        render(<ExecutionTimePanel builds={null} error={null} loading={false} />),
      );
    });

    it('handles undefined', () => {
      expectNoCrash(() =>
        render(<ExecutionTimePanel builds={undefined} error={null} loading={false} />),
      );
    });

    it('handles builds with duration_seconds: undefined', () => {
      expectNoCrash(() =>
        render(
          <ExecutionTimePanel
            builds={[{ job: 'x', duration_seconds: undefined }]}
            error={null}
            loading={false}
          />,
        ),
      );
    });

    it('handles builds with missing job field', () => {
      expectNoCrash(() =>
        render(
          <ExecutionTimePanel
            builds={[{ duration_seconds: 100 }]}
            error={null}
            loading={false}
          />,
        ),
      );
    });
  });
});
