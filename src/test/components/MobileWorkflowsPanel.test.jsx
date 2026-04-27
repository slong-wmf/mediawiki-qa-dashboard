import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileWorkflowsPanel } from '../../components/mobile/MobileWorkflowsPanel.jsx';

function makeRun(overrides = {}) {
  return {
    id: Math.random(),
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-04-20T10:00:00Z',
    run_started_at: '2026-04-20T10:00:00Z',
    updated_at: '2026-04-20T10:01:00Z',
    html_url: 'https://github.com/wikimedia/wikipedia-ios/actions/runs/1',
    head_branch: 'main',
    event: 'push',
    run_attempt: 1,
    duration_ms: 60_000,
    ...overrides,
  };
}

describe('MobileWorkflowsPanel', () => {
  it('renders nothing when loading=true (Panel wrapper handles the skeleton)', () => {
    const { container } = render(
      <MobileWorkflowsPanel data={null} error={null} loading={true} platform="ios" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when error is set (Panel wrapper handles the banner)', () => {
    const { container } = render(
      <MobileWorkflowsPanel data={null} error={new Error('boom')} loading={false} platform="ios" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows an empty-state message including the repo name when there are no runs', () => {
    render(
      <MobileWorkflowsPanel
        data={{ runs: [], byWorkflow: {} }}
        error={null}
        loading={false}
        platform="ios"
      />,
    );
    expect(screen.getByText(/No recent workflow runs found for/i)).toBeInTheDocument();
    expect(screen.getByText('wikimedia/wikipedia-ios')).toBeInTheDocument();
  });

  it('displays the headline pass rate as a percentage', () => {
    const data = {
      runs: [
        makeRun({ conclusion: 'success' }),
        makeRun({ conclusion: 'success' }),
        makeRun({ conclusion: 'success' }),
        makeRun({ conclusion: 'failure' }),
      ],
      byWorkflow: { CI: { n: 4, passed: 3, failed: 1, avgDurationMs: 60_000 } },
    };
    render(<MobileWorkflowsPanel data={data} error={null} loading={false} platform="ios" />);
    // 3/4 = 75 %. The percentage appears both in the headline (<p>) and the
    // per-workflow table (<td>); scope to the headline element so the
    // assertion is unambiguous.
    expect(screen.getByText('75%', { selector: 'p' })).toBeInTheDocument();
  });

  it('handles 100% pass with no failures', () => {
    const data = {
      runs: [makeRun({ conclusion: 'success' })],
      byWorkflow: { CI: { n: 1, passed: 1, failed: 0, avgDurationMs: 60_000 } },
    };
    render(<MobileWorkflowsPanel data={data} error={null} loading={false} platform="ios" />);
    expect(screen.getByText('100%', { selector: 'p' })).toBeInTheDocument();
  });

  it('renders one row per workflow in the breakdown table, sorted by run count DESC', () => {
    const data = {
      runs: [makeRun({ name: 'CI' })],
      byWorkflow: {
        CI:    { n: 10, passed: 8, failed: 2, avgDurationMs: 60_000 },
        Lint:  { n: 3,  passed: 3, failed: 0, avgDurationMs: 5_000  },
      },
    };
    render(<MobileWorkflowsPanel data={data} error={null} loading={false} platform="ios" />);
    const rows = screen.getAllByRole('row');
    // Header + 2 workflows
    expect(rows).toHaveLength(3);
    // CI must come before Lint because n=10 > n=3
    const bodyText = rows.slice(1).map((r) => r.textContent).join(' ');
    expect(bodyText.indexOf('CI')).toBeLessThan(bodyText.indexOf('Lint'));
  });

  it('renders a "View all workflows on GitHub" link for the platform repo', () => {
    const data = { runs: [makeRun()], byWorkflow: { CI: { n: 1, passed: 1, failed: 0, avgDurationMs: 60_000 } } };
    render(<MobileWorkflowsPanel data={data} error={null} loading={false} platform="android" />);
    const link = screen.getByRole('link', { name: /View all workflows on GitHub/i });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/wikimedia/apps-android-wikipedia/actions',
    );
  });
});
