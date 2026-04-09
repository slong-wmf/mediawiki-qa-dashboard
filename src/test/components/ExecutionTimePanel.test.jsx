import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExecutionTimePanel from '../../components/ExecutionTimePanel.jsx';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Cell: () => null,
}));

const BUILDS = [
  {
    job: 'quibble-php83',
    job_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/',
    build_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/1/',
    status: 'passed',
    duration_seconds: 400, // slow — amber/red
    timestamp: new Date().toISOString(),
    tests: null,
  },
  {
    job: 'quibble-php83',
    job_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/',
    build_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/2/',
    status: 'passed',
    duration_seconds: 200,
    timestamp: new Date(Date.now() - 3_600_000).toISOString(),
    tests: null,
  },
  {
    job: 'selenium-daily-beta-Echo',
    job_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/',
    build_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/1/',
    status: 'passed',
    duration_seconds: 60, // fast — green
    timestamp: new Date().toISOString(),
    tests: null,
  },
];

describe('ExecutionTimePanel', () => {
  describe('loading state', () => {
    it('renders the skeleton when loading', () => {
      const { container } = render(
        <ExecutionTimePanel builds={[]} loading={true} error={null} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('does not render the bar chart when loading', () => {
      render(<ExecutionTimePanel builds={[]} loading={true} error={null} />);
      expect(screen.queryByTestId('bar-chart')).toBeNull();
    });
  });

  describe('error state', () => {
    it('renders the error message', () => {
      const err = new Error('Jenkins is down');
      render(<ExecutionTimePanel builds={[]} loading={false} error={err} />);
      expect(screen.getByText(/Jenkins is down/)).toBeInTheDocument();
    });
  });

  describe('empty data', () => {
    it('shows a no-data message when builds is empty', () => {
      render(<ExecutionTimePanel builds={[]} loading={false} error={null} />);
      expect(screen.getByText(/No build data available/i)).toBeInTheDocument();
    });
  });

  describe('with data', () => {
    it('renders the bar chart', () => {
      render(<ExecutionTimePanel builds={BUILDS} loading={false} error={null} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    it('renders the introductory label', () => {
      render(<ExecutionTimePanel builds={BUILDS} loading={false} error={null} />);
      expect(screen.getByText(/Avg total job runtime/i)).toBeInTheDocument();
    });

    it('shows the slow-job colour legend when any avg duration ≥ 300s', () => {
      // quibble-php83 has avg (400+200)/2 = 300s → triggers red note
      render(<ExecutionTimePanel builds={BUILDS} loading={false} error={null} />);
      expect(screen.getByText(/Red/i)).toBeInTheDocument();
    });

    it('does not show the colour legend when all jobs are fast', () => {
      const fastBuilds = BUILDS.map((b) => ({ ...b, duration_seconds: 60 }));
      render(<ExecutionTimePanel builds={fastBuilds} loading={false} error={null} />);
      expect(screen.queryByText(/Red bars exceed/i)).toBeNull();
    });

    it('renders the Quibble per-phase timing disclaimer', () => {
      render(<ExecutionTimePanel builds={BUILDS} loading={false} error={null} />);
      expect(screen.getByText(/Quibble does not publish per-phase/i)).toBeInTheDocument();
    });
  });
});
