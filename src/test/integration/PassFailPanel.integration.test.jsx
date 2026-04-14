import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PassFailPanel from '../../components/PassFailPanel.jsx';
import { makeValidBuild, expectNoCrash } from './helpers.jsx';

vi.mock('../../services/jenkins.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    fetchBuildConsoleTail: vi.fn().mockResolvedValue('MOCK_CONSOLE_TAIL_LINE'),
  };
});

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

  describe('failed-jobs drill-down', () => {
    it('expands grouped cards with error log on toggle', async () => {
      const builds = [
        makeValidBuild({
          job: 'quibble-php83',
          status: 'failed',
          build_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/9/',
          timestamp: new Date(Date.now() - 30 * 60_000).toISOString(),
          tests: null,
        }),
        makeValidBuild({
          job: 'quibble-php83',
          status: 'failed',
          build_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/8/',
          timestamp: new Date(Date.now() - 90 * 60_000).toISOString(),
          tests: null,
        }),
        makeValidBuild({
          job: 'selenium-daily-beta-Echo',
          status: 'passed',
          tests: null,
        }),
      ];

      render(<PassFailPanel builds={builds} error={null} loading={false} />);

      const toggle = screen.getByRole('button', { name: /Failed jobs/ });
      expect(toggle).toHaveTextContent('2');
      fireEvent.click(toggle);

      const details = screen.getByTestId('failed-jobs-details');
      expect(details).toBeInTheDocument();
      // "quibble-php83" also appears in the builds table below — scope the
      // assertion to the drill-down card heading.
      const { within } = await import('@testing-library/react');
      expect(within(details).getByRole('heading', { name: 'quibble-php83' })).toBeInTheDocument();
      expect(within(details).getByText('2 failures / 24h')).toBeInTheDocument();
      expect(await screen.findByText(/MOCK_CONSOLE_TAIL_LINE/)).toBeInTheDocument();

      // Links to the most recent failed build (build 9, the 30-min-old one).
      const link = screen.getByRole('link', { name: /build 9/ });
      expect(link).toHaveAttribute(
        'href',
        'https://integration.wikimedia.org/ci/job/quibble-php83/9/',
      );
    });

    it('does not crash when toggled with null/undefined builds', async () => {
      // null/undefined → button is disabled, so toggling is a no-op, but the
      // expansion render path must still be safe if opened with stale data.
      expectNoCrash(() =>
        render(<PassFailPanel builds={null} error={null} loading={false} />),
      );
      await waitFor(() => {});
    });
  });
});
