import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlakyTestsPanel from '../../components/FlakyTestsPanel.jsx';

function makeRow(overrides = {}) {
  return {
    name: 'should not flake',
    repo: 'AbuseFilter',
    job: null,
    count: 5,
    raw: {},
    ...overrides,
  };
}

describe('FlakyTestsPanel', () => {
  describe('loading + error', () => {
    it('renders skeleton when loading', () => {
      const { container } = render(
        <FlakyTestsPanel data={null} loading={true} error={null} />,
      );
      expect(container.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders error banner when error is set', () => {
      render(
        <FlakyTestsPanel data={null} loading={false} error={new Error('boom')} />,
      );
      expect(screen.getByText(/boom/)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows the empty message when data is null', () => {
      render(<FlakyTestsPanel data={null} loading={false} error={null} />);
      expect(screen.getByText(/No flaky tests recorded yet/i)).toBeInTheDocument();
    });

    it('shows the empty message when rows is an empty array', () => {
      render(<FlakyTestsPanel data={{ generatedAt: null, rows: [] }} loading={false} error={null} />);
      expect(screen.getByText(/No flaky tests recorded yet/i)).toBeInTheDocument();
    });
  });

  describe('populated', () => {
    const data = {
      generatedAt: '2026-05-01T10:00:00.000Z',
      rows: [
        makeRow({ name: 'a', repo: 'AbuseFilter', count: 5 }),
        makeRow({ name: 'b', repo: 'AbuseFilter', count: 3 }),
        makeRow({ name: 'c', repo: 'Cite',         count: 4 }),
      ],
    };

    it('renders the stat strip with totals', () => {
      const { container } = render(<FlakyTestsPanel data={data} loading={false} error={null} />);
      // Stat strip is the first 3-column grid in the panel.
      const strip = container.querySelector('.grid.grid-cols-3');
      expect(strip).not.toBeNull();
      const cards = strip.querySelectorAll('div.rounded.bg-gray-700\\/50');
      const values = [...cards].map((c) => c.querySelector('.font-bold').textContent);
      // 3 flaky tests, 12 total occurrences, 2 repos
      expect(values).toEqual(['3', '12', '2']);
    });

    it('groups rows by repo and shows totalCount per group', () => {
      render(<FlakyTestsPanel data={data} loading={false} error={null} />);
      expect(screen.getByText('AbuseFilter')).toBeInTheDocument();
      expect(screen.getByText('Cite')).toBeInTheDocument();
      // AbuseFilter total = 5+3 = 8 (rendered as the totalCount cell)
      expect(screen.getByText('8')).toBeInTheDocument();
    });

    it('expands a repo row to reveal individual test names on click', () => {
      render(<FlakyTestsPanel data={data} loading={false} error={null} />);
      // Names are not visible until expanded
      expect(screen.queryByText('a')).toBeNull();
      fireEvent.click(screen.getByText('AbuseFilter'));
      expect(screen.getByText('a')).toBeInTheDocument();
      expect(screen.getByText('b')).toBeInTheDocument();
    });

    it('falls back to job name when repo is missing', () => {
      const dataNoRepo = {
        generatedAt: null,
        rows: [makeRow({ repo: null, job: 'selenium-daily-beta-Echo', count: 2 })],
      };
      render(<FlakyTestsPanel data={dataNoRepo} loading={false} error={null} />);
      expect(screen.getByText('selenium-daily-beta-Echo')).toBeInTheDocument();
    });

    it('falls back to "(unknown)" when both repo and job are missing', () => {
      const dataUnknown = {
        generatedAt: null,
        rows: [makeRow({ repo: null, job: null, count: 1 })],
      };
      render(<FlakyTestsPanel data={dataUnknown} loading={false} error={null} />);
      expect(screen.getByText('(unknown)')).toBeInTheDocument();
    });
  });
});
