import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import FailedJobsDetails, {
  buildHourlyBreakdown,
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

const NOW = new Date('2026-04-14T12:00:00Z').getTime();

function makeBuild({
  job = 'quibble-php83',
  status = 'failed',
  hoursAgo = 1,
  buildNumber = 1,
} = {}) {
  return {
    job,
    job_url: `https://integration.wikimedia.org/ci/job/${job}/`,
    build_url: `https://integration.wikimedia.org/ci/job/${job}/${buildNumber}/`,
    status,
    duration_seconds: 60,
    timestamp: new Date(NOW - hoursAgo * 3600_000).toISOString(),
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

// ── buildHourlyBreakdown (unit) ───────────────────────────────────────────────

describe('buildHourlyBreakdown', () => {
  it('returns a length-24 array', () => {
    expect(buildHourlyBreakdown([], NOW)).toHaveLength(24);
  });

  it('places the most recent failure in the last slot', () => {
    const bucket = buildHourlyBreakdown(
      [makeBuild({ hoursAgo: 0 })],
      NOW,
    );
    expect(bucket[23]).toBe(1);
    expect(bucket.slice(0, 23).every((c) => c === 0)).toBe(true);
  });

  it('places a 23h-old failure in the first slot', () => {
    const bucket = buildHourlyBreakdown(
      [makeBuild({ hoursAgo: 23 })],
      NOW,
    );
    expect(bucket[0]).toBe(1);
  });

  it('ignores failures older than 24h', () => {
    const bucket = buildHourlyBreakdown(
      [makeBuild({ hoursAgo: 25 })],
      NOW,
    );
    expect(bucket.every((c) => c === 0)).toBe(true);
  });

  it('sums multiple failures in the same slot', () => {
    const bucket = buildHourlyBreakdown(
      [makeBuild({ hoursAgo: 2 }), makeBuild({ hoursAgo: 2 })],
      NOW,
    );
    expect(bucket[21]).toBe(2);
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

  it('excludes failed builds older than 24 hours', () => {
    render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'old-job', hoursAgo: 30 })]}
      />,
    );
    expect(screen.getByTestId('no-failures')).toBeInTheDocument();
  });

  it('groups failed builds by job and shows the count per job', async () => {
    render(
      <FailedJobsDetails
        builds={[
          makeBuild({ job: 'job-a', hoursAgo: 1, buildNumber: 1 }),
          makeBuild({ job: 'job-a', hoursAgo: 2, buildNumber: 2 }),
          makeBuild({ job: 'job-b', hoursAgo: 3, buildNumber: 10 }),
        ]}
      />,
    );
    expect(screen.getByText('job-a')).toBeInTheDocument();
    expect(screen.getByText('job-b')).toBeInTheDocument();
    expect(screen.getByText('2 failures / 24h')).toBeInTheDocument();
    expect(screen.getByText('1 failure / 24h')).toBeInTheDocument();
    // Let the lazy effect settle so the test cleans up without act() warnings.
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });

  it('renders 24 hour-slot cells per job card', async () => {
    render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'job-a', hoursAgo: 1 })]}
      />,
    );
    const breakdown = screen.getByTestId('hourly-breakdown');
    expect(breakdown.children).toHaveLength(24);
    await waitFor(() => expect(fetchBuildConsoleTail).toHaveBeenCalled());
  });

  it('links "most recent failure" to the newest failed build_url', async () => {
    render(
      <FailedJobsDetails
        builds={[
          makeBuild({ job: 'job-a', hoursAgo: 5, buildNumber: 11 }),
          makeBuild({ job: 'job-a', hoursAgo: 1, buildNumber: 22 }),
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
        builds={[makeBuild({ job: 'job-a', hoursAgo: 1, buildNumber: 7 })]}
      />,
    );
    expect(await screen.findByText(/ERROR: boom/)).toBeInTheDocument();
  });

  it('renders the error state when fetchBuildConsoleTail rejects', async () => {
    fetchBuildConsoleTail.mockRejectedValueOnce(new Error('403 Forbidden'));
    render(
      <FailedJobsDetails
        builds={[makeBuild({ job: 'job-a', hoursAgo: 1, buildNumber: 7 })]}
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
        builds={[makeBuild({ job: 'job-a', hoursAgo: 1, buildNumber: 7 })]}
      />,
    );
    expect(
      await screen.findByText(/Error log not available in snapshot mode/),
    ).toBeInTheDocument();
  });
});
