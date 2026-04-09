import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BugsPanel from '../../components/BugsPanel.jsx';

function makeTask(overrides = {}) {
  return {
    id: 12345,
    phid: 'PHID-TASK-abc',
    title: 'Fix login regression',
    statusRaw: 'open',
    statusGroup: 'open',
    statusLabel: 'Open',
    priority: 'normal',
    priorityLabel: 'Normal',
    priorityValue: 50,
    url: 'https://phabricator.wikimedia.org/T12345',
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    modifiedAt: new Date(Date.now() - 3_600_000).toISOString(),
    isNew: false,
    ...overrides,
  };
}

function makeBugs(tasks = [], overrides = {}) {
  return {
    tasks,
    totalFetched: tasks.length,
    hasMore: false,
    cutoffDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    ...overrides,
  };
}

describe('BugsPanel', () => {
  describe('loading state', () => {
    it('renders the skeleton when loading', () => {
      const { container } = render(
        <BugsPanel bugs={null} loading={true} error={null} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });
  });

  describe('error state', () => {
    it('renders the error message when error is provided', () => {
      const err = new Error('Phabricator is unreachable');
      render(<BugsPanel bugs={null} loading={false} error={err} />);
      expect(screen.getByText(/Phabricator is unreachable/)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows a no-tasks message when bugs is null', () => {
      render(<BugsPanel bugs={null} loading={false} error={null} />);
      expect(screen.getByText(/No open tasks modified/i)).toBeInTheDocument();
    });

    it('shows a no-tasks message when tasks array is empty', () => {
      render(<BugsPanel bugs={makeBugs([])} loading={false} error={null} />);
      expect(screen.getByText(/No open tasks modified/i)).toBeInTheDocument();
    });
  });

  describe('with task data', () => {
    const bugs = makeBugs([
      makeTask({ id: 1, title: 'Fix login regression', statusGroup: 'open' }),
      makeTask({ id: 2, title: 'Improve search speed', statusGroup: 'in-progress' }),
      makeTask({ id: 3, title: 'Crash on save', priorityValue: 100, priority: 'unbreak-now' }),
    ]);

    it('renders the total task count headline', () => {
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('renders the task table', () => {
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('shows Unbreak Now! task first (highest priority sort)', () => {
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      const rows = screen.getAllByRole('row');
      // First data row (after header) should be T3 (unbreak-now)
      expect(rows[1]).toHaveTextContent('T3');
    });

    it('renders all tasks in the table', () => {
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      expect(screen.getByText('T1')).toBeInTheDocument();
      expect(screen.getByText('T2')).toBeInTheDocument();
      expect(screen.getByText('T3')).toBeInTheDocument();
    });

    it('shows the criteria note describing subtype-based detection', () => {
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      expect(screen.getByText(/Bug Report/i)).toBeInTheDocument();
    });
  });

  describe('hasMore indicator', () => {
    it('shows the "200+" warning when hasMore is true', () => {
      const bugs = makeBugs([makeTask()], { hasMore: true, totalFetched: 200 });
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      expect(screen.getByText(/200\+/)).toBeInTheDocument();
    });

    it('shows a link to Phabricator Maniphest when hasMore is true', () => {
      const bugs = makeBugs([makeTask()], { hasMore: true, totalFetched: 200 });
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      expect(screen.getByRole('link', { name: /Phabricator Maniphest/i })).toBeInTheDocument();
    });

    it('does not show the overflow warning when hasMore is false', () => {
      const bugs = makeBugs([makeTask()], { hasMore: false });
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      expect(screen.queryByText(/200\+/)).toBeNull();
    });
  });

  describe('status filter cards', () => {
    it('renders a filter card for each status group that has tasks', () => {
      const bugs = makeBugs([
        makeTask({ statusGroup: 'open' }),
        makeTask({ id: 2, statusGroup: 'stalled' }),
      ]);
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      // Target the filter card buttons by their title attribute to avoid
      // ambiguity with identically-labelled status badges in the task table.
      expect(screen.getByTitle('Filter to Open tasks')).toBeInTheDocument();
      expect(screen.getByTitle('Filter to Stalled tasks')).toBeInTheDocument();
    });

    it('filters the table when a status card is clicked', () => {
      const bugs = makeBugs([
        makeTask({ id: 1, title: 'Fix crash', statusGroup: 'open' }),
        makeTask({ id: 2, title: 'Update docs', statusGroup: 'in-progress' }),
      ]);
      render(<BugsPanel bugs={bugs} loading={false} error={null} />);
      // Click the In Progress filter card via its unique title attribute —
      // using getByText('In Progress') would be ambiguous because the status
      // badge in the task row also renders that same text.
      fireEvent.click(screen.getByTitle('Filter to In Progress tasks'));
      // Only T2 should appear; T1 should be hidden
      expect(screen.getByText('T2')).toBeInTheDocument();
      expect(screen.queryByText('T1')).toBeNull();
    });
  });
});
