import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutomatedTestsPanel from '../../components/AutomatedTestsPanel.jsx';
import { makeValidAutomatedTests, expectNoCrash } from './helpers.jsx';

describe('AutomatedTestsPanel – integration contract tests', () => {
  describe('hook initial state', () => {
    it('renders skeleton when loading with null data', () => {
      const { container } = render(
        <AutomatedTestsPanel data={null} error={null} loading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders empty message when loaded with null data', () => {
      render(<AutomatedTestsPanel data={null} error={null} loading={false} />);
      expect(screen.getByText(/No automated-tests data loaded yet/i)).toBeInTheDocument();
    });
  });

  describe('successful fetch', () => {
    it('renders with valid fixture data', () => {
      render(
        <AutomatedTestsPanel data={makeValidAutomatedTests()} error={null} loading={false} />,
      );
      expect(screen.getByText('AbuseFilter')).toBeInTheDocument();
      expect(screen.getByText('Cite')).toBeInTheDocument();
      expect(screen.getByText('Echo')).toBeInTheDocument();
    });

    it('integrates with steward filter and maintainers Map', () => {
      const maintainers = new Map([
        ['AbuseFilter', { steward: 'Performance', maintainer: 'alice' }],
        ['Cite',        { steward: 'Editing',     maintainer: 'bob' }],
        ['Echo',        { steward: 'Growth',      maintainer: 'carol' }],
      ]);
      render(
        <AutomatedTestsPanel
          data={makeValidAutomatedTests()}
          error={null}
          loading={false}
          maintainers={maintainers}
          activeStewards={['Performance']}
        />,
      );
      expect(screen.getByText('AbuseFilter')).toBeInTheDocument();
      expect(screen.queryByText('Cite')).not.toBeInTheDocument();
      expect(screen.queryByText('Echo')).not.toBeInTheDocument();
    });

    it('framework toggle is still honoured when a steward filter is active', () => {
      const maintainers = new Map([
        ['AbuseFilter', { steward: 'Performance', maintainer: 'alice' }],
        ['Cite',        { steward: 'Performance', maintainer: 'bob' }],
      ]);
      render(
        <AutomatedTestsPanel
          data={makeValidAutomatedTests()}
          error={null}
          loading={false}
          maintainers={maintainers}
          activeStewards={['Performance']}
        />,
      );
      // Both AbuseFilter (wdio) and Cite (cypress) belong to Performance.
      fireEvent.click(screen.getByRole('button', { name: /Cypress/ }));
      expect(screen.getByText('Cite')).toBeInTheDocument();
      expect(screen.queryByText('AbuseFilter')).not.toBeInTheDocument();
    });
  });

  describe('service rejection', () => {
    it('renders error banner when the service error is set', () => {
      const err = new Error('Scanner endpoint 503');
      render(<AutomatedTestsPanel data={null} error={err} loading={false} />);
      expect(screen.getByText(/Scanner endpoint 503/)).toBeInTheDocument();
    });
  });

  describe('pass-rate column', () => {
    it('renders an aggregated 7-day pass rate per repo', () => {
      const data = {
        generatedAt: null,
        repoCount: 1,
        testCount: 1,
        repos: [
          {
            name: 'Mostly',
            framework: 'wdio',
            mediawikiVersion: null,
            frameworkVersion: null,
            gatedSelenium: false,
            testCount: 1,
            tests: [{ name: 't1' }],
            dailyJobs: [
              { name: 'job-a', url: 'http://x', passes: 9, fails: 1, total: 10, results: [] },
            ],
          },
          {
            name: 'NoDaily',
            framework: 'wdio',
            mediawikiVersion: null,
            frameworkVersion: null,
            gatedSelenium: false,
            testCount: 1,
            tests: [{ name: 't1' }],
            dailyJobs: [],
          },
        ],
      };
      render(<AutomatedTestsPanel data={data} error={null} loading={false} />);
      // 9/10 = 90%
      expect(screen.getByText('90%')).toBeInTheDocument();
      // The new column header is present
      expect(screen.getByText('Pass Rate')).toBeInTheDocument();
    });
  });

  describe('malformed data — no crash', () => {
    it('handles empty array instead of envelope', () => {
      expectNoCrash(() =>
        render(<AutomatedTestsPanel data={[]} error={null} loading={false} />),
      );
    });

    it('handles envelope with non-array repos', () => {
      expectNoCrash(() =>
        render(<AutomatedTestsPanel data={{ repos: null }} error={null} loading={false} />),
      );
    });

    it('handles undefined data', () => {
      expectNoCrash(() =>
        render(<AutomatedTestsPanel data={undefined} error={null} loading={false} />),
      );
    });

    it('handles a repo without tests array', () => {
      expectNoCrash(() =>
        render(
          <AutomatedTestsPanel
            data={{ repos: [{ name: 'Broken' }] }}
            error={null}
            loading={false}
          />,
        ),
      );
    });

    it('handles maintainers as plain object instead of Map', () => {
      expectNoCrash(() =>
        render(
          <AutomatedTestsPanel
            data={makeValidAutomatedTests()}
            error={null}
            loading={false}
            maintainers={{}}
            activeStewards={['Growth']}
          />,
        ),
      );
    });
  });
});
