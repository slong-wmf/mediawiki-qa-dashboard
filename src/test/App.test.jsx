import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';

// Allow tests to flip USE_STATIC_DATA between cases.
let mockUseStaticData = false;
vi.mock('../services/staticData.js', () => ({
  get USE_STATIC_DATA() { return mockUseStaticData; },
  fetchStaticJson: vi.fn(),
}));

// Provide a minimal stub for the dashboard (Web tab) data hook so App renders
// without real fetches.
vi.mock('../hooks/useDashboardData.js', () => ({
  useDashboardData: () => ({
    builds: [],
    jenkinsFailedJobs: [],
    coverage: null,
    bugs: null,
    trainBlockers: null,
    maintainers: new Map(),
    automatedTests: null,
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

// Stub the mobile data hook so the iOS/Android tabs render their headers and
// panel chrome without actually hitting api.github.com.
vi.mock('../hooks/useMobileData.js', () => ({
  useMobileData: () => ({
    workflows: null,
    releases: null,
    tests: null,
    lastRefreshed: null,
    loading: false,
    initialLoading: false,
    errors: { workflows: null, releases: null, tests: null },
    refresh: vi.fn(),
  }),
}));

function setHash(hash) {
  // jsdom mutates window.location.hash in-place; a Location replacement is not
  // necessary. The "hashchange" event is dispatched manually so the App's
  // listener picks it up.
  window.location.hash = hash;
}

describe('App — Refresh button visibility', () => {
  beforeEach(() => {
    mockUseStaticData = false;
    setHash('');
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

describe('App — Tab bar', () => {
  beforeEach(() => {
    mockUseStaticData = false;
    setHash('');
  });

  afterEach(() => {
    setHash('');
  });

  it('renders the three platform tabs with the expected labels', () => {
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Web' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'iOS' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Android' })).toBeInTheDocument();
  });

  it('marks Web as the active tab when no hash is present', () => {
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Web' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'iOS' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Android' })).toHaveAttribute('aria-selected', 'false');
  });

  it('writes the active tab back into window.location.hash', () => {
    render(<App />);
    // First effect cycle syncs '/web' into the URL.
    expect(window.location.hash).toBe('#/web');
  });
});

describe('App — Hash-driven initial tab', () => {
  beforeEach(() => {
    mockUseStaticData = false;
  });

  afterEach(() => {
    setHash('');
  });

  it('selects iOS when the URL hash is #/ios on initial mount', () => {
    setHash('#/ios');
    render(<App />);
    expect(screen.getByRole('tab', { name: 'iOS' })).toHaveAttribute('aria-selected', 'true');
    // The iOS panel chrome ("iOS — Workflow Health" comes from MobileTab) is
    // a unique-to-iOS marker that we're rendering MobileTab platform="ios".
    expect(screen.getByText(/iOS — Workflow Health/)).toBeInTheDocument();
  });

  it('selects Android when the URL hash is #/android on initial mount', () => {
    setHash('#/android');
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Android' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Android — Workflow Health/)).toBeInTheDocument();
  });

  it('falls back to Web when the URL hash is missing', () => {
    setHash('');
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Web' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to Web when the URL hash names an unknown tab', () => {
    setHash('#/nope');
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Web' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('App — Tab switching', () => {
  beforeEach(() => {
    mockUseStaticData = false;
    setHash('');
  });

  afterEach(() => {
    setHash('');
  });

  it('hides the Web tab content and reveals iOS content when iOS is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Web steward filter heading is a unique marker of the Web tab being visible.
    const stewardFilterHeading = screen.queryByText(/Pass \/ Fail, Coverage & Automated Tests/);
    expect(stewardFilterHeading).not.toBeNull();

    await user.click(screen.getByRole('tab', { name: 'iOS' }));

    // Active tab toggles
    expect(screen.getByRole('tab', { name: 'iOS' })).toHaveAttribute('aria-selected', 'true');
    // iOS panel chrome should now be in the document
    expect(screen.getByText(/iOS — Workflow Health/)).toBeInTheDocument();
    // URL hash updates
    expect(window.location.hash).toBe('#/ios');
  });

  it('responds to hashchange events by switching the active tab', () => {
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Web' })).toHaveAttribute('aria-selected', 'true');

    act(() => {
      setHash('#/android');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByRole('tab', { name: 'Android' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Android — Workflow Health/)).toBeInTheDocument();
  });
});

describe('App — Steward filter scope', () => {
  beforeEach(() => {
    mockUseStaticData = false;
    setHash('');
  });

  afterEach(() => {
    setHash('');
  });

  it('renders the steward filter heading on the Web tab', () => {
    render(<App />);
    expect(screen.getByText(/Pass \/ Fail, Coverage & Automated Tests/)).toBeInTheDocument();
  });

  it('does not render the steward filter heading on the iOS tab', async () => {
    setHash('#/ios');
    render(<App />);
    // The Web steward-filter wrapper section isn't visible — its tab panel is
    // hidden, so its heading should not be reachable via screen queries that
    // honour `hidden`. Use the role-based query which respects aria-hidden.
    expect(
      screen.queryByRole('heading', { name: /Pass \/ Fail, Coverage & Automated Tests/i }),
    ).toBeNull();
  });
});
