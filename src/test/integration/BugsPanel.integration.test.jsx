import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BugsPanel from '../../components/BugsPanel.jsx';
import { makeValidBugs, makeValidTask, expectNoCrash } from './helpers.jsx';

describe('BugsPanel – integration contract tests', () => {
  describe('hook initial state', () => {
    it('renders skeleton when loading with null bugs', () => {
      const { container } = render(
        <BugsPanel bugs={null} error={null} loading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders empty message when loaded with null bugs', () => {
      render(<BugsPanel bugs={null} error={null} loading={false} />);
      expect(screen.getByText(/No open tasks modified/i)).toBeInTheDocument();
    });
  });

  describe('successful fetch', () => {
    it('renders empty message when tasks array is empty', () => {
      render(<BugsPanel bugs={makeValidBugs([])} error={null} loading={false} />);
      expect(screen.getByText(/No open tasks modified/i)).toBeInTheDocument();
    });

    it('renders the task table when tasks are present', () => {
      const bugs = makeValidBugs([
        makeValidTask({ id: 1, statusGroup: 'open' }),
        makeValidTask({ id: 2, statusGroup: 'in-progress' }),
      ]);
      render(<BugsPanel bugs={bugs} error={null} loading={false} />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  describe('service rejection', () => {
    it('renders error banner when error is set and bugs is null', () => {
      const err = new Error('Conduit timeout');
      render(<BugsPanel bugs={null} error={err} loading={false} />);
      expect(screen.getByText(/Conduit timeout/)).toBeInTheDocument();
    });
  });

  describe('malformed data — no crash', () => {
    it('handles empty array (old initial state bug)', () => {
      expectNoCrash(() =>
        render(<BugsPanel bugs={[]} error={null} loading={false} />),
      );
    });

    it('handles empty object (missing tasks field)', () => {
      expectNoCrash(() =>
        render(<BugsPanel bugs={{}} error={null} loading={false} />),
      );
    });

    it('handles { tasks: null }', () => {
      expectNoCrash(() =>
        render(<BugsPanel bugs={{ tasks: null }} error={null} loading={false} />),
      );
    });

    it('handles undefined', () => {
      expectNoCrash(() =>
        render(<BugsPanel bugs={undefined} error={null} loading={false} />),
      );
    });

    it('handles { tasks: "not-an-array" }', () => {
      expectNoCrash(() =>
        render(<BugsPanel bugs={{ tasks: 'not-an-array' }} error={null} loading={false} />),
      );
    });
  });
});
