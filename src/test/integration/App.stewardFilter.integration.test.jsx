import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../../App.jsx';

// --- Module mocks (hoisted) -----------------------------------------------

vi.mock('../../services/staticData.js', () => ({
  USE_STATIC_DATA: false,
  fetchStaticJson: vi.fn(),
}));

// Stub recharts so chart components render without layout calculations.
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

vi.mock('../../services/jenkins.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    fetchBuildConsoleTail: vi.fn().mockResolvedValue(''),
  };
});

vi.mock('../../data/activeExtensions.js', () => ({
  isActiveOnWikipedia: () => true,
  GENERATED_DATE: '2026-04-03',
}));

const MAINTAINERS = new Map([
  ['Echo',           { steward: 'Growth',   maintainer: '' }],
  ['AdvancedSearch', { steward: 'WMDE',     maintainer: '' }],
  ['VisualEditor',   { steward: 'Editing',  maintainer: '' }],
]);

const BUILDS = [
  {
    job: 'quibble-php83',
    job_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/',
    build_url: 'https://integration.wikimedia.org/ci/job/quibble-php83/1/',
    status: 'passed', duration_seconds: 600, timestamp: new Date().toISOString(),
    tests: null,
  },
  {
    job: 'selenium-daily-beta-Echo',
    job_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/',
    build_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-Echo/1/',
    status: 'passed', duration_seconds: 120, timestamp: new Date().toISOString(),
    tests: { total: 5, passed: 5, failed: 0, skipped: 0 },
  },
  {
    job: 'selenium-daily-beta-AdvancedSearch',
    job_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-AdvancedSearch/',
    build_url: 'https://integration.wikimedia.org/ci/job/selenium-daily-beta-AdvancedSearch/1/',
    status: 'passed', duration_seconds: 120, timestamp: new Date().toISOString(),
    tests: { total: 3, passed: 3, failed: 0, skipped: 0 },
  },
];

const COVERAGE = {
  core: null,
  extensions: [
    { name: 'Echo',           coverage_pct: 80, last_updated: '2026-04-03', page_url: 'https://doc.wikimedia.org/cover-extensions/Echo/' },
    { name: 'AdvancedSearch', coverage_pct: 60, last_updated: '2026-04-03', page_url: 'https://doc.wikimedia.org/cover-extensions/AdvancedSearch/' },
    { name: 'VisualEditor',   coverage_pct: 40, last_updated: '2026-04-03', page_url: 'https://doc.wikimedia.org/cover-extensions/VisualEditor/' },
  ],
};

vi.mock('../../hooks/useDashboardData.js', () => ({
  useDashboardData: () => ({
    builds: BUILDS,
    jenkinsFailedJobs: [],
    coverage: COVERAGE,
    bugs: null,
    trainBlockers: null,
    maintainers: MAINTAINERS,
    lastRefreshed: new Date(),
    loading: false,
    initialLoading: false,
    jenkinsLoading: false,
    errors: {},
    refresh: vi.fn(),
    refreshJobList: vi.fn(),
    jobListLoading: false,
    jobListError: null,
  }),
}));

describe('App – shared steward filter', () => {
  it('renders the Steward dropdown in the Pass/Fail & Coverage wrapper', () => {
    render(<App />);
    // Wrapper header is labelled; dropdown button starts as "All stewards".
    const wrapper = screen.getByLabelText('Pass/Fail, Code Coverage, and Automated Tests');
    expect(within(wrapper).getByRole('button', { name: /All stewards/ })).toBeInTheDocument();
  });

  it('narrows Pass/Fail Rates and Code Coverage to the selected steward', () => {
    render(<App />);
    const wrapper = screen.getByLabelText('Pass/Fail, Code Coverage, and Automated Tests');

    // Open the dropdown and select Growth (owns Echo).
    fireEvent.click(within(wrapper).getByRole('button', { name: /All stewards/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Growth' }));

    // Pass/Fail table now only lists the Echo daily-beta build.
    expect(screen.getByRole('link', { name: 'selenium-daily-beta-Echo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'selenium-daily-beta-AdvancedSearch' })).toBeNull();

    // Coverage table narrows to Echo as well (AdvancedSearch/VisualEditor gone).
    const coverageLinks = screen.getAllByRole('link', { name: /Echo/ });
    expect(coverageLinks.length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'VisualEditor' })).toBeNull();
  });

  it('leaves the Job Total Time panel outside the wrapper', () => {
    render(<App />);
    const wrapper = screen.getByLabelText('Pass/Fail, Code Coverage, and Automated Tests');
    // "Job Total Time" heading should NOT be inside the wrapper section.
    expect(within(wrapper).queryByText('Job Total Time')).toBeNull();
    // But it should exist somewhere on the page.
    expect(screen.getByText('Job Total Time')).toBeInTheDocument();
  });
});
