import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendsPanel from '../../components/TrendsPanel.jsx';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive">{children}</div>,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceLine: () => <div data-testid="reference-line" />,
}));

function makeEntry(overrides = {}) {
  return {
    date: '2026-04-29',
    dailyPassRate: { pct: 80, passes: 8, fails: 2, total: 10 },
    coverage: { coreAvg: 50, extensionsAvg: 65, extensionsCount: 3 },
    e2eTestCount: { wdio: 5, cypress: 2, total: 7 },
    dailyTestRunCount: 10,
    ...overrides,
  };
}

describe('TrendsPanel', () => {
  describe('loading + error', () => {
    it('renders skeleton when loading', () => {
      const { container } = render(<TrendsPanel data={null} loading={true} error={null} />);
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders error banner when error is set', () => {
      const err = new Error('fetch failed');
      render(<TrendsPanel data={null} loading={false} error={err} />);
      expect(screen.getByText(/fetch failed/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows the "no history yet" message when entries is empty', () => {
      render(<TrendsPanel data={{ entries: [], windowDays: 90 }} loading={false} error={null} />);
      expect(screen.getByText(/No history yet/i)).toBeInTheDocument();
      expect(screen.queryByTestId('line-chart')).toBeNull();
    });

    it('shows the empty state when data is null', () => {
      render(<TrendsPanel data={null} loading={false} error={null} />);
      expect(screen.getByText(/No history yet/i)).toBeInTheDocument();
    });
  });

  describe('populated', () => {
    it('renders one chart per metric', () => {
      const data = {
        windowDays: 90,
        entries: [makeEntry({ date: '2026-04-28' }), makeEntry({ date: '2026-04-29' })],
      };
      render(<TrendsPanel data={data} loading={false} error={null} />);
      const charts = screen.getAllByTestId('line-chart');
      expect(charts).toHaveLength(4);
    });

    it('renders reference lines on the percent charts', () => {
      const data = { windowDays: 90, entries: [makeEntry()] };
      render(<TrendsPanel data={data} loading={false} error={null} />);
      // pass-rate + coverage have thresholds → 2 reference lines
      expect(screen.getAllByTestId('reference-line')).toHaveLength(2);
    });

    it('shows chart titles', () => {
      const data = { windowDays: 90, entries: [makeEntry()] };
      render(<TrendsPanel data={data} loading={false} error={null} />);
      expect(screen.getByText('% Daily Tests Passing')).toBeInTheDocument();
      expect(screen.getByText('Code Coverage (Extensions Avg)')).toBeInTheDocument();
      expect(screen.getByText('E2E Tests Available')).toBeInTheDocument();
      expect(screen.getByText('Tests Running Daily')).toBeInTheDocument();
    });

    it('reports the window length in the helper copy', () => {
      const data = { windowDays: 30, entries: [makeEntry()] };
      render(<TrendsPanel data={data} loading={false} error={null} />);
      expect(screen.getByText(/Rolling 30-day history/i)).toBeInTheDocument();
    });
  });

  describe('sparse entries', () => {
    it('handles entries where coverage and e2eTestCount are null (backfilled)', () => {
      const data = {
        windowDays: 90,
        entries: [
          makeEntry({ date: '2026-04-23', coverage: null, e2eTestCount: null }),
          makeEntry({ date: '2026-04-29' }),
        ],
      };
      render(<TrendsPanel data={data} loading={false} error={null} />);
      // Charts still render; the gap is a recharts concern, mocked here.
      expect(screen.getAllByTestId('line-chart')).toHaveLength(4);
    });
  });
});
