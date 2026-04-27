import { describe, it, expect } from 'vitest';
import { REPOS, repoFor, GITHUB_API_BASE } from '../../../services/github/repos.js';

// repos.js is small but it's the single source of truth that wires every
// platform tab to its GitHub data — a misshape (e.g. a typo in fullName)
// would silently break either the live URL or the snapshot file lookup, so
// it's worth pinning the contract.

describe('REPOS map', () => {
  it('contains exactly ios and android entries', () => {
    expect(Object.keys(REPOS).sort()).toEqual(['android', 'ios']);
  });

  it('points iOS at wikimedia/wikipedia-ios', () => {
    expect(REPOS.ios).toMatchObject({
      owner: 'wikimedia',
      name: 'wikipedia-ios',
      fullName: 'wikimedia/wikipedia-ios',
      htmlUrl: 'https://github.com/wikimedia/wikipedia-ios',
      label: 'iOS',
    });
  });

  it('points Android at wikimedia/apps-android-wikipedia', () => {
    expect(REPOS.android).toMatchObject({
      owner: 'wikimedia',
      name: 'apps-android-wikipedia',
      fullName: 'wikimedia/apps-android-wikipedia',
      htmlUrl: 'https://github.com/wikimedia/apps-android-wikipedia',
      label: 'Android',
    });
  });

  it('keeps fullName consistent with `${owner}/${name}` for every repo', () => {
    for (const repo of Object.values(REPOS)) {
      expect(repo.fullName).toBe(`${repo.owner}/${repo.name}`);
    }
  });

  it('is frozen so panels cannot mutate the shared descriptors', () => {
    expect(Object.isFrozen(REPOS)).toBe(true);
  });
});

describe('repoFor', () => {
  it('returns the iOS descriptor for "ios"', () => {
    expect(repoFor('ios')).toBe(REPOS.ios);
  });

  it('returns the Android descriptor for "android"', () => {
    expect(repoFor('android')).toBe(REPOS.android);
  });

  it('throws a descriptive error for unknown platforms', () => {
    expect(() => repoFor('windows-phone')).toThrow(/Unknown platform: windows-phone/);
  });

  it('error message lists the valid platforms so callers can self-correct', () => {
    expect(() => repoFor('xxx')).toThrow(/ios.*android|android.*ios/);
  });
});

describe('GITHUB_API_BASE', () => {
  it('is the canonical api.github.com URL with no trailing slash', () => {
    // Trailing slashes lead to `//repos/...` paths that some clients reject;
    // the convention everywhere is no trailing slash.
    expect(GITHUB_API_BASE).toBe('https://api.github.com');
  });
});
