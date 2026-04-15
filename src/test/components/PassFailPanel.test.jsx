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
    it('shows a no-test-report message when builds is empty (Test results is default)', () => {
      render(<PassFailPanel builds={[]} loading={false} error={null} />);
      expect(screen.getByText(/No test-report data/i)).toBeInTheDocument();
    });

    it('shows a no-data message after switching to Job results', () => {
      render(<PassFailPanel builds={[]} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Job results'));
      expect(screen.getByText(/No build data available/i)).toBeInTheDocument();
    });
  });

  describe('with data', () => {
    it('defaults to the Test results view', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      // "Test-level results" copy is only shown when the tests view is active.
      expect(screen.getByText(/Test-level results/i)).toBeInTheDocument();
      // Test results toggle should be pressed.
      expect(screen.getByRole('button', { name: 'Test results' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('renders the pie chart', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });

    it('shows the build count after switching to Job results', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Job results'));
      expect(screen.getByText(`${BUILDS.length} builds`)).toBeInTheDocument();
    });

    it('renders build rows in the table after switching to Job results', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Job results'));
      // quibble-php83 appears twice and selenium once — all three are within 10
      expect(screen.getAllByText('quibble-php83').length).toBeGreaterThan(0);
    });

    it('switches back to Job results view', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Job results'));
      expect(screen.getByText(/Job pass\/fail/i)).toBeInTheDocument();
    });

    it('shows "no test-report data" when no builds have test data (default view)', () => {
      const noTestBuilds = BUILDS.map((b) => ({ ...b, tests: null }));
      render(<PassFailPanel builds={noTestBuilds} loading={false} error={null} />);
      expect(screen.getByText(/No test-report data/i)).toBeInTheDocument();
    });

    it('links each Test results row to the specific build\'s test report, not the latest', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      // Default view is already Test results.
      const link = screen.getByRole('link', { name: 'selenium-daily-beta-Echo' });
      expect(link).toHaveAttribute(
        'href',
        'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/1/testReport/',
      );
      expect(link.getAttribute('href')).not.toContain('lastCompletedBuild');
    });
  });

  describe('failed-jobs drill-down (Job results view)', () => {
    it('renders the "Failed builds" toggle button with the past-week failure count', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Job results'));
      // BUILDS contains 1 failed build within the last week.
      const btn = screen.getByRole('button', { name: /Failed builds/ });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('1');
      expect(btn).not.toBeDisabled();
    });

    it('disables the toggle when there are no failed builds in the last week', () => {
      const allPassed = BUILDS.map((b) => ({ ...b, status: 'passed' }));
      render(<PassFailPanel builds={allPassed} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Job results'));
      const btn = screen.getByRole('button', { name: /Failed builds/ });
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent('0');
    });

    it('toggles FailedJobsDetails into and out of the DOM', async () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      fireEvent.click(screen.getByText('Job results'));
      const btn = screen.getByRole('button', { name: /Failed builds/ });
      expect(screen.queryByTestId('failed-jobs-details')).toBeNull();
      fireEvent.click(btn);
      expect(screen.getByTestId('failed-jobs-details')).toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.queryByTestId('failed-jobs-details')).toBeNull();
      // Let any in-flight console-tail fetch settle.
      await waitFor(() => {});
    });

    it('hides the toggle in Test results view (the default)', () => {
      render(<PassFailPanel builds={BUILDS} loading={false} error={null} />);
      expect(screen.queryByRole('button', { name: /Failed builds/ })).toBeNull();
    });
  });

  describe('steward filter', () => {
    const maintainers = new Map([
      ['Echo', { steward: 'Growth', maintainer: 'alice' }],
      ['AdvancedSearch', { steward: 'WMDE', maintainer: 'bob' }],
    ]);
    const FILTER_BUILDS = [
      {
        job: 'quibble-php83',
        job_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/',
        build_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/1/',
        status: 'passed', duration_seconds: 10, timestamp: new Date().toISOString(),
        tests: null,
      },
      {
        job: 'selenium-daily-beta-Echo',
        job_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/',
        build_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/3/',
        status: 'passed', duration_seconds: 10, timestamp: new Date().toISOString(),
        tests: { total: 5, passed: 5, failed: 0, skipped: 0 },
      },
      {
        job: 'selenium-daily-beta-AdvancedSearch',
        job_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-AdvancedSearch/',
        build_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-AdvancedSearch/2/',
        status: 'passed', duration_seconds: 10, timestamp: new Date().toISOString(),
        tests: { total: 3, passed: 3, failed: 0, skipped: 0 },
      },
    ];

    it('narrows Test results to builds whose extension belongs to the selected steward', () => {
      render(
        <PassFailPanel
          builds={FILTER_BUILDS}
          loading={false}
          error={null}
          activeStewards={['Growth']}
          maintainers={maintainers}
        />,
      );
      expect(screen.getByRole('link', { name: 'selenium-daily-beta-Echo' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'selenium-daily-beta-AdvancedSearch' })).toBeNull();
    });

    it('excludes core Quibble jobs when any steward is active', () => {
      render(
        <PassFailPanel
          builds={FILTER_BUILDS}
          loading={false}
          error={null}
          activeStewards={['Growth']}
          maintainers={maintainers}
        />,
      );
      // Switch to Job results — quibble-php83 would normally appear, but the
      // steward filter excludes non-daily jobs.
      fireEvent.click(screen.getByText('Job results'));
      expect(screen.queryAllByText('quibble-php83').length).toBe(0);
    });

    it('passes through all builds when activeStewards is empty', () => {
      render(
        <PassFailPanel
          builds={FILTER_BUILDS}
          loading={false}
          error={null}
          activeStewards={[]}
          maintainers={maintainers}
        />,
      );
      fireEvent.click(screen.getByText('Job results'));
      expect(screen.getByText('3 builds')).toBeInTheDocument();
    });

    it('passes through all builds when maintainers is not a Map', () => {
      render(
        <PassFailPanel
          builds={FILTER_BUILDS}
          loading={false}
          error={null}
          activeStewards={['Growth']}
          maintainers={null}
        />,
      );
      fireEvent.click(screen.getByText('Job results'));
      expect(screen.getByText('3 builds')).toBeInTheDocument();
    });
  });
});

describe('filterBuildsBySteward', () => {
  const maintainers = new Map([
    ['Echo',           { steward: 'Growth', maintainer: '' }],
    ['AdvancedSearch', { steward: 'WMDE',   maintainer: '' }],
  ]);
  const builds = [
    { job: 'quibble-php83', build_url: 'https://example/job/quibble-php83/1/' },
    { job: 'selenium-daily-beta-Echo', build_url: 'https://example/job/selenium-daily-beta-Echo/1/' },
    { job: 'selenium-daily-beta-AdvancedSearch', build_url: 'https://example/job/selenium-daily-beta-AdvancedSearch/1/' },
    { job: 'selenium-daily-beta-Unknown', build_url: 'https://example/job/selenium-daily-beta-Unknown/1/' },
  ];

  it('returns input unchanged when no stewards selected', async () => {
    const { filterBuildsBySteward } = await import('../../components/PassFailPanel.jsx');
    expect(filterBuildsBySteward(builds, [], maintainers)).toBe(builds);
  });

  it('returns input unchanged when maintainers is not a Map', async () => {
    const { filterBuildsBySteward } = await import('../../components/PassFailPanel.jsx');
    expect(filterBuildsBySteward(builds, ['Growth'], null)).toBe(builds);
    expect(filterBuildsBySteward(builds, ['Growth'], {})).toBe(builds);
  });

  it('keeps only daily-beta builds whose extension maps to a selected steward', async () => {
    const { filterBuildsBySteward } = await import('../../components/PassFailPanel.jsx');
    const out = filterBuildsBySteward(builds, ['Growth'], maintainers);
    expect(out.map((b) => b.job)).toEqual(['selenium-daily-beta-Echo']);
  });

  it('supports multiple selected stewards (union)', async () => {
    const { filterBuildsBySteward } = await import('../../components/PassFailPanel.jsx');
    const out = filterBuildsBySteward(builds, ['Growth', 'WMDE'], maintainers);
    expect(out.map((b) => b.job)).toEqual([
      'selenium-daily-beta-Echo',
      'selenium-daily-beta-AdvancedSearch',
    ]);
  });

  it('returns an empty list when the selected steward owns no known extensions', async () => {
    const { filterBuildsBySteward } = await import('../../components/PassFailPanel.jsx');
    expect(filterBuildsBySteward(builds, ['NoSuchSteward'], maintainers)).toEqual([]);
  });

  it('falls back to the `job` field when build_url is missing', async () => {
    const { filterBuildsBySteward } = await import('../../components/PassFailPanel.jsx');
    const out = filterBuildsBySteward(
      [{ job: 'selenium-daily-beta-Echo' }],
      ['Growth'],
      maintainers,
    );
    expect(out).toHaveLength(1);
  });
});
