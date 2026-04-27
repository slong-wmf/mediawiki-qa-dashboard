import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileReleasesPanel } from '../../components/mobile/MobileReleasesPanel.jsx';

function makeRelease(overrides = {}) {
  return {
    id: Math.random(),
    tag_name: 'v1.0.0',
    name: 'Wikipedia 1.0.0',
    published_at: '2026-04-15T12:00:00Z',
    author: 'releasebot',
    html_url: 'https://github.com/wikimedia/wikipedia-ios/releases/tag/v1.0.0',
    prerelease: false,
    draft: false,
    ...overrides,
  };
}

describe('MobileReleasesPanel', () => {
  it('renders nothing when loading=true (Panel wrapper handles the skeleton)', () => {
    const { container } = render(
      <MobileReleasesPanel data={null} error={null} loading={true} platform="ios" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when error is set (Panel wrapper handles the banner)', () => {
    const { container } = render(
      <MobileReleasesPanel data={null} error={new Error('x')} loading={false} platform="ios" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows an empty-state message including the repo name when there are no releases', () => {
    render(
      <MobileReleasesPanel
        data={{ releases: [], lastReleaseAgeDays: null }}
        error={null}
        loading={false}
        platform="android"
      />,
    );
    expect(screen.getByText(/No releases published yet for/i)).toBeInTheDocument();
    expect(screen.getByText('wikimedia/apps-android-wikipedia')).toBeInTheDocument();
  });

  describe('age pill thresholds', () => {
    it('shows "Healthy" wording at exactly 14 days', () => {
      render(
        <MobileReleasesPanel
          data={{ releases: [makeRelease()], lastReleaseAgeDays: 14 }}
          error={null}
          loading={false}
          platform="ios"
        />,
      );
      expect(screen.getByText(/14d since last release/)).toBeInTheDocument();
      expect(screen.getByText(/Healthy ship cadence/)).toBeInTheDocument();
    });

    it('switches to "Slowing" wording at 15 days', () => {
      render(
        <MobileReleasesPanel
          data={{ releases: [makeRelease()], lastReleaseAgeDays: 15 }}
          error={null}
          loading={false}
          platform="ios"
        />,
      );
      expect(screen.getByText(/Slowing ship cadence/)).toBeInTheDocument();
    });

    it('still shows "Slowing" at exactly 30 days', () => {
      render(
        <MobileReleasesPanel
          data={{ releases: [makeRelease()], lastReleaseAgeDays: 30 }}
          error={null}
          loading={false}
          platform="ios"
        />,
      );
      expect(screen.getByText(/Slowing ship cadence/)).toBeInTheDocument();
    });

    it('switches to "Stalled" wording above 30 days', () => {
      render(
        <MobileReleasesPanel
          data={{ releases: [makeRelease()], lastReleaseAgeDays: 31 }}
          error={null}
          loading={false}
          platform="ios"
        />,
      );
      expect(screen.getByText(/Stalled ship cadence/)).toBeInTheDocument();
    });

    it('shows "No published release" when ageDays is null', () => {
      render(
        <MobileReleasesPanel
          data={{ releases: [makeRelease({ published_at: null, draft: true })], lastReleaseAgeDays: null }}
          error={null}
          loading={false}
          platform="ios"
        />,
      );
      expect(screen.getByText(/No published release/)).toBeInTheDocument();
    });
  });

  it('renders one row per release with a link to the release page', () => {
    const data = {
      releases: [
        makeRelease({ id: 1, name: 'r1', html_url: 'https://x/1' }),
        makeRelease({ id: 2, name: 'r2', html_url: 'https://x/2' }),
      ],
      lastReleaseAgeDays: 5,
    };
    render(<MobileReleasesPanel data={data} error={null} loading={false} platform="ios" />);
    expect(screen.getByRole('link', { name: 'r1' })).toHaveAttribute('href', 'https://x/1');
    expect(screen.getByRole('link', { name: 'r2' })).toHaveAttribute('href', 'https://x/2');
  });

  it('shows a "pre-release" badge for prereleases', () => {
    const data = {
      releases: [makeRelease({ prerelease: true })],
      lastReleaseAgeDays: 1,
    };
    render(<MobileReleasesPanel data={data} error={null} loading={false} platform="ios" />);
    expect(screen.getByText(/pre-release/i)).toBeInTheDocument();
  });

  it('shows the author byline when present', () => {
    const data = {
      releases: [makeRelease({ author: 'alice' })],
      lastReleaseAgeDays: 1,
    };
    render(<MobileReleasesPanel data={data} error={null} loading={false} platform="ios" />);
    expect(screen.getByText(/by alice/)).toBeInTheDocument();
  });

  it('renders a "View all releases on GitHub" link for the platform repo', () => {
    const data = { releases: [makeRelease()], lastReleaseAgeDays: 1 };
    render(<MobileReleasesPanel data={data} error={null} loading={false} platform="android" />);
    const link = screen.getByRole('link', { name: /View all releases on GitHub/i });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/wikimedia/apps-android-wikipedia/releases',
    );
  });
});
