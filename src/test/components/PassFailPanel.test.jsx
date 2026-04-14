import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PassFailPanel from '../../components/PassFailPanel.jsx';

vi.mock('../../services/jenkins.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    fetchBuildConsoleTail: vi.fn().mockResolvedValue('mock console tail'),
  };
});

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }) => <g>{children}</g>,
  Cell: () => null,
  Tooltip: () => null,
  Legend: ({ formatter }) => (
    <div data-testid="legend">
      {['Passed', 'Failed'].map((v) => (
        <span key={v}>{formatter(v)}</span>
      ))}
    </div>
  ),
}));

const BUILDS = [
  {
    job: 'quibble-php83',
    job_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/',
    build_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/1/',
    status: 'passed',
    duration_seconds: 120,
    timestamp: new Date().toISOString(),
    tests: null,
  },
  {
    job: 'quibble-php83',
    job_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/',
    build_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/2/',
    status: 'failed',
    duration_seconds: 90,
    timestamp: new Date(Date.now() - 3600_000).toISOString(),
    tests: null,
  },
  {
    job: 'selenium-daily-beta-Echo',
    job_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/',
    build_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/1/',
    status: 'passed',
    duration_seconds: 60,
    timestamp: new Date().toISOString(),
    tests: { total: 50, passed: 48, failed: 1, skipped: 1 },
  },
];

describe('PassFailPanel', () => {
  describe('loading state', () => {
    it('renders the skeleton placeholder when loading', () => {
      const { container } = render(<PassFailPanel builds={[]} loading={true} error={null} />);
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('does not render the chart when loading', () => {
      render(<PassFailPanel builds={[]} loading={true} error={null} />);
      expect(screen.queryByTestId('pie-chart')).toBeNull();
    });
  });

  describe('error state', () => {
    it('renders the error message when an error is provided', () => {
      const err = new Error('Jenkins is down');
      render(<PassFailPanel builds={[]} loading={false} error={err} />);
      expect(screen.getByText(/Jenkins is down/)).toBeInTheDocument();
    });
  });

  describe('empty data', () => {
    it('shows a no-data message when builds is empty', () => {
      render(<PassFailPanel builds={[]} loading={false} error={null} />);
      expect(screen.getByText(/No build data available/i)).toBeInTheDocument();
    });
  });

  describe('with data', () => {
    it('renders the pie chart', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });

    it('shows the build count', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      expect(screen.getByText(`${BUILDS.length} builds`)).toBeInTheDocument();
    });

    it('renders build rows in the table', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      // quibble-php83 appears twice and selenium once — all three are within 10
      expect(screen.getAllByText('quibble-php83').length).toBeGreaterThan(0);
    });

    it('switches to Test results view', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Test results'));
      expect(screen.getByText(/Test-level results/i)).toBeInTheDocument();
    });

    it('shows "no test-report data" when in test view but no builds have test data', () => {
      const noTestBuilds = BUILDS.map((b) => ({ ...b, tests: null }));
      render(<PassFailPanel builds={noTestBuilds} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Test results'));
      expect(screen.getByText(/No test-report data/i)).toBeInTheDocument();
    });
  });

  describe('failed-jobs drill-down', () => {
    it('renders the "Failed builds" toggle button with the past-week failure count', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      // BUILDS contains 1 failed build within the last week.
      const btn = screen.getByRole('button', { name: /Failed builds/ });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('1');
      expect(btn).not.toBeDisabled();
    });

    it('disables the toggle when there are no failed builds in the last week', () => {
      const allPassed = BUILDS.map((b) => ({ ...b, status: 'passed' }));
      render(<PassFailPanel builds={allPassed} loading={false} error={null} />);
      const btn = screen.getByRole('button', { name: /Failed builds/ });
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent('0');
    });

    it('toggles FailedJobsDetails into and out of the DOM', async () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      const btn = screen.getByRole('button', { name: /Failed builds/ });
      expect(screen.queryByTestId('failed-jobs-details')).toBeNull();
      fireEvent.click(btn);
      expect(screen.getByTestId('failed-jobs-details')).toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.queryByTestId('failed-jobs-details')).toBeNull();
      // Let any in-flight console-tail fetch settle.
      await waitFor(() => {});
    });

    it('hides the toggle in Test results view', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Test results'));
      expect(screen.queryByRole('button', { name: /Failed builds/ })).toBeNull();
    });
  });
});
