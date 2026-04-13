import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrainBlockersPanel from '../../components/TrainBlockersPanel.jsx';
import { makeValidTrainBlockers, makeValidBlocker, expectNoCrash } from './helpers.jsx';

describe('TrainBlockersPanel – integration contract tests', () => {
  describe('hook initial state', () => {
    it('renders skeleton when loading with null trainBlockers', () => {
      const { container } = render(
        <TrainBlockersPanel trainBlockers={null} error={null} loading={true} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders fallback message when loaded with null trainBlockers', () => {
      render(<TrainBlockersPanel trainBlockers={null} error={null} loading={false} />);
      expect(screen.getByText(/No train blocker data available/i)).toBeInTheDocument();
    });
  });

  describe('successful fetch', () => {
    it('renders with blockers present', () => {
      const data = makeValidTrainBlockers([
        makeValidBlocker({ id: 1, statusRaw: 'open' }),
        makeValidBlocker({ id: 2, statusRaw: 'resolved' }),
      ]);
      render(<TrainBlockersPanel trainBlockers={data} error={null} loading={false} />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders with no blockers (empty array)', () => {
      const data = makeValidTrainBlockers([]);
      render(<TrainBlockersPanel trainBlockers={data} error={null} loading={false} />);
      // Should render the header — version appears in multiple elements
      expect(screen.getAllByText(/1\.46\.0-wmf\.22/).length).toBeGreaterThan(0);
    });
  });

  describe('service rejection', () => {
    it('renders fallback when error is set and trainBlockers is null', () => {
      const err = new Error('No resolved train tasks found');
      render(<TrainBlockersPanel trainBlockers={null} error={err} loading={false} />);
      expect(screen.getByText(/No train blocker data available/i)).toBeInTheDocument();
    });
  });

  describe('malformed data — no crash', () => {
    it('handles empty array', () => {
      expectNoCrash(() =>
        render(<TrainBlockersPanel trainBlockers={[]} error={null} loading={false} />),
      );
    });

    it('handles empty object (missing blockers field)', () => {
      expectNoCrash(() =>
        render(<TrainBlockersPanel trainBlockers={{}} error={null} loading={false} />),
      );
    });

    it('handles { blockers: null }', () => {
      expectNoCrash(() =>
        render(
          <TrainBlockersPanel
            trainBlockers={{ trainTask: {}, blockers: null, totalBlockers: 0 }}
            error={null}
            loading={false}
          />,
        ),
      );
    });

    it('handles undefined', () => {
      expectNoCrash(() =>
        render(<TrainBlockersPanel trainBlockers={undefined} error={null} loading={false} />),
      );
    });

    it('handles { blockers: "not-an-array" }', () => {
      expectNoCrash(() =>
        render(
          <TrainBlockersPanel
            trainBlockers={{ trainTask: {}, blockers: 'not-an-array', totalBlockers: 0 }}
            error={null}
            loading={false}
          />,
        ),
      );
    });
  });
});
