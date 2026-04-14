import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App.jsx';

// Allow tests to flip USE_STATIC_DATA between cases.
let mockUseStaticData = false;
vi.mock('../services/staticData.js', () => ({
  get USE_STATIC_DATA() { return mockUseStaticData; },
  fetchStaticJson: vi.fn(),
}));

// Provide a minimal stub for the data hook so App renders without real fetches.
vi.mock('../hooks/useDashboardData.js', () => ({
  useDashboardData: () => ({
    builds: [],
    jenkinsFailedJobs: [],
    coverage: null,
    bugs: null,
    trainBlockers: null,
    maintainers: new Map(),
    lastRefreshed: null,
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

describe('App — Refresh button visibility', () => {
  beforeEach(() => {
    mockUseStaticData = false;
  });

  it('shows the Refresh button in live-data mode (USE_STATIC_DATA = false)', () => {
    mockUseStaticData = false;
    render(<App />);
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('hides the Refresh button in static/hosted mode (USE_STATIC_DATA = true)', () => {
    mockUseStaticData = true;
    render(<App />);
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
  });
});
