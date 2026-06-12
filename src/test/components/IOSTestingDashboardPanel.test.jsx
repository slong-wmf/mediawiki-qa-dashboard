import { describe, it, expect, vi } from 'vitest';
import { cloneElement } from 'react';
import { render, screen } from '@testing-library/react';
import { IOSTestingDashboardPanel } from '../../components/mobile/IOSTestingDashboardPanel.jsx';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive">{children}</div>,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: ({ dataKey, name }) => <div data-testid="line" data-key={dataKey} data-name={name} />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: ({ content }) => cloneElement(content, {
    active: true,
    label: 'Jun 2',
    payload: [
      { dataKey: 'wikipediaApp', name: 'Wikipedia.app', value: 16, color: '#60a5fa' },
      { dataKey: 'wmfData', name: 'WMFData', value: 38, color: '#f472b6' },
      { dataKey: 'wmfFramework', name: 'WMF.framework', value: 25, color: '#f59e0b' },
    ],
  }),
}));

const DATA = {
  windowDays: 7,
  resultBundleWindowDays: 7,
  coverage: [
    {
      id: 'unit-wikipedia',
      title: 'Wikipedia Unit',
      points: [
        {
          day: '2026-05-28',
          date: '2026-05-28T10:00:00Z',
          value: 10,
          targets: {
            CocoaLumberjackSwift: 99,
            'Wikipedia.app': 10,
            'WMF.framework': 20,
          },
        },
        {
          day: '2026-06-02',
          date: '2026-06-02T10:00:00Z',
          value: 12.5,
          targets: {
            CocoaLumberjackSwift: 99,
            'Wikipedia.app': 12,
            'WMF.framework': 21,
          },
        },
      ],
      summary: { latestValue: 12.5, delta: 2.5 },
    },
    {
      id: 'unit-components',
      title: 'WMFComponents Unit',
      points: [
        {
          day: '2026-05-28',
          date: '2026-05-28T10:00:00Z',
          value: 30,
          targets: { WMFComponents: 30 },
        },
        {
          day: '2026-06-02',
          date: '2026-06-02T10:00:00Z',
          value: 34,
          targets: { WMFComponents: 34 },
        },
      ],
      summary: { latestValue: 34, delta: 4 },
    },
    {
      id: 'unit-data',
      title: 'WMFData Unit',
      points: [
        {
          day: '2026-05-28',
          date: '2026-05-28T10:00:00Z',
          value: 40,
          targets: { WMFData: 40 },
        },
        {
          day: '2026-06-02',
          date: '2026-06-02T10:00:00Z',
          value: 38,
          targets: { WMFData: 38 },
        },
      ],
      summary: { latestValue: 38, delta: -2 },
    },
    {
      id: 'ui',
      title: 'UI Tests',
      points: [
        {
          day: '2026-05-28',
          date: '2026-05-28T10:00:00Z',
          value: 15,
          targets: {
            CocoaLumberjackSwift: 98,
            'Wikipedia.app': 15,
            'WMF.framework': 22,
          },
        },
        {
          day: '2026-06-02',
          date: '2026-06-02T10:00:00Z',
          value: 16,
          targets: {
            CocoaLumberjackSwift: 98,
            'Wikipedia.app': 16,
            'WMF.framework': 25,
          },
        },
      ],
      summary: { latestValue: 16, delta: 1 },
    },
  ],
  stability: [
    { id: 'unit', title: 'Unit Tests', stabilityLabel: 'PR stability', rate: 95, successes: 19, failures: 1, ignoredRuns: 0 },
    { id: 'ui', title: 'UI Tests', stabilityLabel: 'Nightly stability', rate: 80, successes: 8, failures: 2, ignoredRuns: 1 },
    { id: 'e2e', title: 'E2E UI Tests', stabilityLabel: 'PR stability', rate: 70, successes: 7, failures: 3, ignoredRuns: 0 },
  ],
  resultBundles: [
    {
      suite: 'UI Tests',
      kind: 'ui',
      runId: 123,
      runUrl: 'https://github.com/wikimedia/wikipedia-ios/actions/runs/123',
      runConclusion: 'failure',
      branch: 'feature',
      createdAt: '2026-06-02T10:00:00Z',
      artifactName: 'WikipediaUITests-TestResults',
      artifactSizeBytes: 120_000_000,
      note: '2 retained screen recordings',
    },
    {
      suite: 'E2E UI Tests',
      kind: 'e2e',
      runId: 124,
      runUrl: 'https://github.com/wikimedia/wikipedia-ios/actions/runs/124',
      runConclusion: 'success',
      branch: 'feature',
      createdAt: '2026-06-02T11:00:00Z',
      artifactName: 'WikipediaUITests-E2E-TestResults',
      artifactSizeBytes: 80_000_000,
      note: '0 retained recordings; successful XCTest attachments are commonly delete-on-success',
    },
  ],
  videos: [
    {
      id: 'ui-123-1',
      suite: 'UI Tests',
      runId: 123,
      runUrl: 'https://github.com/wikimedia/wikipedia-ios/actions/runs/123',
      runConclusion: 'failure',
      createdAt: '2026-06-02T10:00:00Z',
      sourceName: 'Data/data.0~recording',
      path: 'data/ios-testing-videos/ui/123/recording-1.mov',
      bytes: 4_000_000,
    },
  ],
};

describe('IOSTestingDashboardPanel', () => {
  it('renders nothing while loading', () => {
    const { container } = render(<IOSTestingDashboardPanel data={null} error={null} loading={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the Panel wrapper owns an error', () => {
    const { container } = render(<IOSTestingDashboardPanel data={null} error={new Error('x')} loading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders selected target coverage cards, stability cards, and the chart', () => {
    const { container } = render(<IOSTestingDashboardPanel data={DATA} error={null} loading={false} />);

    expect(screen.getByText('coverage targets')).toBeInTheDocument();
    expect(screen.getByText('unit PR stability')).toBeInTheDocument();
    expect(screen.getByText('UI nightly stability')).toBeInTheDocument();
    expect(screen.getByText('Test stability by workflow')).toBeInTheDocument();
    expect(screen.getByText('Nightly stability')).toBeInTheDocument();
    expect(screen.getByText('7-day coverage deltas')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('line').map((line) => line.getAttribute('data-name'))).toEqual([
      'Wikipedia.app',
      'WMF.framework',
      'WMFComponents',
      'WMFData',
    ]);
    expect(screen.queryByText('CocoaLumberjackSwift')).not.toBeInTheDocument();
    expect(screen.getByText('+4.00%')).toBeInTheDocument();
    expect(screen.getByText('-2.00%')).toBeInTheDocument();

    const tooltipText = container.textContent;
    expect(tooltipText.indexOf('WMFData: 38.0%')).toBeLessThan(tooltipText.indexOf('WMF.framework: 25.0%'));
    expect(tooltipText.indexOf('WMF.framework: 25.0%')).toBeLessThan(tooltipText.indexOf('Wikipedia.app: 16.0%'));
  });

  it('shows failed result bundles with inline recordings and hides successful bundles', () => {
    render(<IOSTestingDashboardPanel data={DATA} error={null} loading={false} />);

    expect(screen.getByText('Failed UI result bundles - last 7 days')).toBeInTheDocument();
    expect(screen.queryByText('Retained UI recordings')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '123' })).toHaveAttribute(
      'href',
      'https://github.com/wikimedia/wikipedia-ios/actions/runs/123',
    );
    expect(screen.getAllByText('failure')).toHaveLength(1);
    expect(screen.getByText(/2 retained screen recordings/)).toBeInTheDocument();
    const video = document.querySelector('video');
    expect(video).toHaveAttribute('src', 'data/ios-testing-videos/ui/123/recording-1.mov');
    expect(screen.getByText('Data/data.0~recording')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '124' })).not.toBeInTheDocument();
  });

  it('shows an empty coverage state when no artifact points are present', () => {
    render(
      <IOSTestingDashboardPanel
        data={{ ...DATA, coverage: DATA.coverage.map((suite) => ({ ...suite, points: [], summary: null })) }}
        error={null}
        loading={false}
      />,
    );

    expect(screen.getByText(/No coverage artifact points are available/i)).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });
});
