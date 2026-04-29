import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendsPanel from '../../components/TrendsPanel.jsx';
import {
  makeValidMetricsHistory,
  makeValidMetricsHistoryEntry,
  expectNoCrash,
} from './helpers.jsx';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceLine: () => <div data-testid="reference-line" />,
}));

describe('TrendsPanel — integration contract tests', () => {
  describe('hook initial state', () => {
    it('renders skeleton during initial load', () => {
      const { container } = render(<TrendsPanel data={null} error={null} loading={true} />);
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders empty state when the hook returned null (cron has not run)', () => {
      render(<TrendsPanel data={null} error={null} loading={false} />);
      expect(screen.getByText(/No history yet/i)).toBeInTheDocument();
    });
  });

  describe('successful fetch', () => {
    it('renders four charts with valid history data', () => {
      const history = makeValidMetricsHistory([
        makeValidMetricsHistoryEntry({ date: '2026-04-23' }),
        makeValidMetricsHistoryEntry({ date: '2026-04-29' }),
      ]);
      render(<TrendsPanel data={history} error={null} loading={false} />);
      expect(screen.getAllByTestId('line-chart')).toHaveLength(4);
    });

    it('honours backfilled entries with null coverage / e2e fields', () => {
      const history = makeValidMetricsHistory([
        makeValidMetricsHistoryEntry({
          date: '2026-04-23',
          coverage: null,
          e2eTestCount: null,
        }),
        makeValidMetricsHistoryEntry({ date: '2026-04-29' }),
      ]);
      expectNoCrash(() => render(<TrendsPanel data={history} error={null} loading={false} />));
    });
  });

  describe('service rejection', () => {
    it('renders error banner when the metrics-history fetch failed', () => {
      const err = new Error('Snapshot 503');
      render(<TrendsPanel data={null} error={err} loading={false} />);
      expect(screen.getByText(/Snapshot 503/)).toBeInTheDocument();
    });
  });

  describe('malformed data — no crash', () => {
    it('handles entries: null', () => {
      expectNoCrash(() =>
        render(<TrendsPanel data={{ entries: null }} error={null} loading={false} />),
      );
    });

    it('handles undefined data', () => {
      expectNoCrash(() => render(<TrendsPanel data={undefined} error={null} loading={false} />));
    });

    it('handles an entry with all-null metric fields', () => {
      const history = makeValidMetricsHistory([
        {
          date: '2026-04-29',
          dailyPassRate: null,
          coverage: null,
          e2eTestCount: null,
          dailyTestRunCount: null,
        },
      ]);
      expectNoCrash(() => render(<TrendsPanel data={history} error={null} loading={false} />));
    });
  });
});
