import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FailedJobsDetails, {
  buildWeeklyHourlyBreakdown,
  __resetConsoleTailCache,
} from '../../components/PassFailPanel/FailedJobsDetails.jsx';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../services/jenkins.js', () => ({
  fetchBuildConsoleTail: vi.fn(),
}));

vi.mock('../../services/staticData.js', () => ({
  USE_STATIC_DATA: false,
}));

import { fetchBuildConsoleTail } from '../../services/jenkins.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Use a local-time anchor so day/hour bucketing is deterministic regardless
// of the runner timezone.
const NOW = new Date(2026, 3, 14, 12, 30, 0).getTime();

/**
 * Build a fixture at a specific calendar offset from NOW.
 * `daysAgo` is whole local-calendar days back (0 = today); `hour` is local
 * hour-of-day (0..23). Defaults land 1h ago, same calendar day.
 */
function makeBuild({
  job = 'quibble-php83',
  status = 'failed',
  daysAgo = 0,
  hour = 11,
  minute = 0,
  buildNumber = 1,
} = {}) {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return {
    job,
    job_url: `https://integration.wikimedia.org/ci/job/${job}/`,
    build_url: `https://integration.wikimedia.org/ci/job/${job}/${buildNumber}/`,
    status,
    duration_seconds: 60,
    timestamp: d.toISOString(),
    tests: null,
  };
}

beforeEach(() => {
  vi.setSystemTime(new Date(NOW));
  fetchBuildConsoleTail.mockReset();
  fetchBuildConsoleTail.mockResolvedValue('tail of console log\nfinal error line');
  __resetConsoleTailCache();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── buildWeeklyHourlyBreakdown (unit) ─────────────────────────────────────────

describe('buildWeeklyHourlyBreakdown', () => {
  it('returns a 7×24 grid', () => {
    const grid = buildWeeklyHourlyBreakdown([], NOW);
    expect(grid).toHaveLength(7);
    grid.forEach((row) => expect(row).toHaveLength(24));
  });

  it('places a build from today in row 6 at the build hour', () => {
    const grid = buildWeeklyHourlyBreakdown(
      [makeBuild({ daysAgo: 0, hour: 9 })],
      NOW,
    );
    expect(grid[6][9]).toBe(1);
    // everything else is 0
    const total = grid.flat().reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });

  it('places a build from 6 days ago in row 0', () => {
    const grid = buildWeeklyHourlyBreakdown(
      [makeBuild({ daysAgo: 6, hour: 14 })],
      NOW,
    );
    expect(grid[0][14]).toBe(1);
  });

  it('ignores failures older than 7 days', () => {
    const grid = buildWeeklyHourlyBreakdown(
      [makeBuild({ daysAgo: 7, hour: 14 })],
      NOW,
    );
    expect(grid.flat().every((c) => c === 0)).toBe(true);
  });

  it('sums multiple failures in the same (day, hour) slot', () => {
    const grid = buildWeeklyHourlyBreakdown(
      [
        makeBuild({ daysAgo: 2, hour: 10 }),
        makeBuild({ daysAgo: 2, hour: 10 }),
      ],
      NOW,
    );
    expect(grid[4][10]).toBe(2);
  });
});

// ── Component ─────────────────────────────────────────────────────────────────

describe('FailedJobsDetails', () => {
  it('renders the no-failures message when there are no failed builds', () => {
    render(<FailedJobsDetails builds={[makeBuild({ status: 'passed' })]} />);
    expect(screen.getByTestId('no-failures')).toBeInTheDocument();
  });

  it('excludes passed/other builds from the group', () => {
    render(
      <FailedJobsDetails
        builds={[
          makeBuild({ job: 'a', status: 'passed' }),
          makeBuild({ job: 'b', status: 'other' }),
        ]}
      />,
    );
    expect(screen.getByTestId('no-failures')).toBeInTheDocument();
  });

  it('excludes failed builds older than 7 days', () => {
    render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'old-job', daysAgo: 8 })]}
      />,
    );
    expect(screen.getByTestId('no-failures')).toBeInTheDocument();
  });

  it('groups failed builds by job and shows the count per job', async () => {
    render(
      <FailedJobsDetails
        builds={[
          makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, buildNumber: 1 }),
          makeBuild({ job: 'job-a', daysAgo: 0, hour: 10, buildNumber: 2 }),
          makeBuild({ job: 'job-b', daysAgo: 0, hour: 9,  buildNumber: 10 }),
        ]}
      />,
    );
    expect(screen.getByText('job-a')).toBeInTheDocument();
    expect(screen.getByText('job-b')).toBeInTheDocument();
    expect(screen.getByText('2 failures / past week')).toBeInTheDocument();
    expect(screen.getByText('1 failure / past week')).toBeInTheDocument();
    // Let the lazy effect settle so the test cleans up without act() warnings.
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });

  it('renders 168 hour-slot cells per job card (7×24)', async () => {
    render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'job-a', daysAgo: 0, hour: 11 })]}
      />,
    );
    const breakdown = screen.getByTestId('hourly-breakdown');
    // 7 rows, each with 24 buttons
    expect(breakdown.children).toHaveLength(7);
    expect(breakdown.querySelectorAll('button')).toHaveLength(168);
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });

  it('links "most recent failure" to the newest failed build_url', async () => {
    render(
      <FailedJobsDetails
        builds={[
          makeBuild({ job: 'job-a', daysAgo: 0, hour: 7,  buildNumber: 11 }),
          makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, buildNumber: 22 }),
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: /build 22/ });
    expect(link).toHaveAttribute(
      'href',
      'https://integration.wikimedia.org/ci/job/job-a/22/',
    );
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });

  it('renders the console tail once fetchBuildConsoleTail resolves', async () => {
    fetchBuildConsoleTail.mockResolvedValueOnce('ERROR: boom\nstack trace');
    render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, buildNumber: 7 })]}
      />,
    );
    expect(await screen.findByText(/ERROR: boom/)).toBeInTheDocument();
  });

  it('renders the error state when fetchBuildConsoleTail rejects', async () => {
    fetchBuildConsoleTail.mockRejectedValueOnce(new Error('403 Forbidden'));
    render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, buildNumber: 7 })]}
      />,
    );
    expect(
      await screen.findByText(/Could not load console log: 403 Forbidden/),
    ).toBeInTheDocument();
  });

  it('renders the static-mode fallback when fetchBuildConsoleTail returns null', async () => {
    fetchBuildConsoleTail.mockResolvedValueOnce(null);
    render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, buildNumber: 7 })]}
      />,
    );
    expect(
      await screen.findByText(/Error log not available in snapshot mode/),
    ).toBeInTheDocument();
  });
});

// ── Hour-cell click-through ───────────────────────────────────────────────────

describe('FailedJobsDetails — hour cell click-through', () => {
  function cellSelector(day, hour) {
    return `[data-testid="hourly-breakdown"] button[data-day="${day}"][data-hour="${hour}"]`;
  }

  it('shows failed build details when a failing cell is clicked', async () => {
    const { container } = render(
      <FailedJobsDetails
        builds={[
          makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, minute: 15, buildNumber: 42 }),
        ]}
      />,
    );
    // No detail initially
    expect(screen.queryByTestId('hour-detail')).not.toBeInTheDocument();
    // Click the failing cell (today, hour 11)
    fireEvent.click(container.querySelector(cellSelector(6, 11)));
    const detail = screen.getByTestId('hour-detail');
    expect(detail).toBeInTheDocument();
    const rows = detail.querySelectorAll('[data-testid="hour-detail-build"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-status')).toBe('failed');
    expect(detail.querySelector('a[href*="/42/"]')).toBeTruthy();
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });

  it('shows a passed build when a cell with a pass (but no fail) is clicked', async () => {
    const { container } = render(
      <FailedJobsDetails
        builds={[
          // Must have a failure somewhere so the job card renders at all.
          makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, buildNumber: 1 }),
          // A passing build at a different hour.
          makeBuild({ job: 'job-a', daysAgo: 0, hour: 8, status: 'passed', buildNumber: 2 }),
        ]}
      />,
    );
    fireEvent.click(container.querySelector(cellSelector(6, 8)));
    const detail = screen.getByTestId('hour-detail');
    const rows = detail.querySelectorAll('[data-testid="hour-detail-build"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-status')).toBe('passed');
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });

  it('collapses the detail block when the same cell is clicked twice', async () => {
    const { container } = render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, buildNumber: 1 })]}
      />,
    );
    const cell = container.querySelector(cellSelector(6, 11));
    fireEvent.click(cell);
    expect(screen.getByTestId('hour-detail')).toBeInTheDocument();
    fireEvent.click(cell);
    expect(screen.queryByTestId('hour-detail')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });

  it('shows "No builds in this hour" when an empty cell is clicked', async () => {
    const { container } = render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'job-a', daysAgo: 0, hour: 11, buildNumber: 1 })]}
      />,
    );
    // Click an hour where nothing ran.
    fireEvent.click(container.querySelector(cellSelector(2, 3)));
    const detail = screen.getByTestId('hour-detail');
    expect(detail).toHaveTextContent('No builds in this hour');
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });
});
