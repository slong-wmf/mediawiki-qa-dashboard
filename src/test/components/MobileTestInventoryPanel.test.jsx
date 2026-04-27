import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileTestInventoryPanel } from '../../components/mobile/MobileTestInventoryPanel.jsx';

describe('MobileTestInventoryPanel', () => {
  it('renders nothing when loading=true (Panel wrapper handles the skeleton)', () => {
    const { container } = render(
      <MobileTestInventoryPanel data={null} error={null} loading={true} platform="ios" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when error is set (Panel wrapper handles the banner)', () => {
    const { container } = render(
      <MobileTestInventoryPanel data={null} error={new Error('x')} loading={false} platform="ios" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the empty-state message including the repo name when total is 0', () => {
    render(
      <MobileTestInventoryPanel
        data={{ totals: { uiTests: 0, unitTests: 0, total: 0 }, byDirectory: [] }}
        error={null}
        loading={false}
        platform="android"
      />,
    );
    expect(screen.getByText(/No test files matched the inventory rules for/i)).toBeInTheDocument();
    expect(screen.getByText('wikimedia/apps-android-wikipedia')).toBeInTheDocument();
  });

  it('renders three stat cards with the totals', () => {
    render(
      <MobileTestInventoryPanel
        data={{
          totals: { uiTests: 12, unitTests: 34, total: 46 },
          byDirectory: [],
        }}
        error={null}
        loading={false}
        platform="ios"
      />,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('46')).toBeInTheDocument();
    expect(screen.getByText(/UI tests/i)).toBeInTheDocument();
    expect(screen.getByText(/Unit tests/i)).toBeInTheDocument();
    expect(screen.getByText(/Total/i)).toBeInTheDocument();
  });

  it('renders a row per directory in the breakdown table', () => {
    const data = {
      totals: { uiTests: 3, unitTests: 0, total: 3 },
      byDirectory: [
        { path: 'WikipediaUITests/A', count: 2, kind: 'ui' },
        { path: 'WikipediaUITests/B', count: 1, kind: 'ui' },
      ],
    };
    render(<MobileTestInventoryPanel data={data} error={null} loading={false} platform="ios" />);
    // <details> summary contains the count
    expect(screen.getByText(/Breakdown by directory \(2\)/)).toBeInTheDocument();
    // Both directory paths should be present
    expect(screen.getByText('WikipediaUITests/A')).toBeInTheDocument();
    expect(screen.getByText('WikipediaUITests/B')).toBeInTheDocument();
  });

  it('links each directory row to the GitHub tree at HEAD', () => {
    const data = {
      totals: { uiTests: 1, unitTests: 0, total: 1 },
      byDirectory: [{ path: 'WikipediaUITests/A', count: 1, kind: 'ui' }],
    };
    render(<MobileTestInventoryPanel data={data} error={null} loading={false} platform="ios" />);
    const link = screen.getByRole('link', { name: 'WikipediaUITests/A' });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/wikimedia/wikipedia-ios/tree/HEAD/WikipediaUITests/A',
    );
  });

  it('shows the platform-specific extension footnote', () => {
    const data = { totals: { uiTests: 1, unitTests: 0, total: 1 }, byDirectory: [] };

    const { rerender } = render(
      <MobileTestInventoryPanel data={data} error={null} loading={false} platform="ios" />,
    );
    expect(screen.getByText(/\.swift file/)).toBeInTheDocument();

    rerender(
      <MobileTestInventoryPanel data={data} error={null} loading={false} platform="android" />,
    );
    expect(screen.getByText(/\.kt\/\.java file/)).toBeInTheDocument();
  });
});
