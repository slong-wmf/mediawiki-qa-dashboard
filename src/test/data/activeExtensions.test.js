import { describe, it, expect } from 'vitest';
import {
  WIKIPEDIA_DEPLOYED,
  COVERAGE_NAME_ALIASES,
  GENERATED_DATE,
  isActiveOnWikipedia,
} from '../../data/activeExtensions.js';

// ── WIKIPEDIA_DEPLOYED Set ────────────────────────────────────────────────────

describe('WIKIPEDIA_DEPLOYED', () => {
  it('is a Set', () => {
    expect(WIKIPEDIA_DEPLOYED).toBeInstanceOf(Set);
  });

  it('contains at least 100 entries (sanity check against accidental truncation)', () => {
    expect(WIKIPEDIA_DEPLOYED.size).toBeGreaterThanOrEqual(100);
  });

  it('contains well-known Wikipedia extensions', () => {
    const wellKnown = [
      'CirrusSearch',
      'AbuseFilter',
      'Echo',
      'VisualEditor',
      'DiscussionTools',
      'CheckUser',
      'CentralAuth',
    ];
    for (const name of wellKnown) {
      expect(WIKIPEDIA_DEPLOYED.has(name), `expected Set to contain "${name}"`).toBe(true);
    }
  });

  it('does not contain empty string', () => {
    expect(WIKIPEDIA_DEPLOYED.has('')).toBe(false);
  });

  it('does not contain a made-up extension name', () => {
    expect(WIKIPEDIA_DEPLOYED.has('NotARealExtension_XYZ')).toBe(false);
  });
});

// ── COVERAGE_NAME_ALIASES ─────────────────────────────────────────────────────

describe('COVERAGE_NAME_ALIASES', () => {
  it('is an object', () => {
    expect(typeof COVERAGE_NAME_ALIASES).toBe('object');
    expect(COVERAGE_NAME_ALIASES).not.toBeNull();
  });

  it('each alias value exists in WIKIPEDIA_DEPLOYED', () => {
    for (const [alias, canonical] of Object.entries(COVERAGE_NAME_ALIASES)) {
      expect(
        WIKIPEDIA_DEPLOYED.has(canonical),
        `alias "${alias}" points to "${canonical}" which is not in WIKIPEDIA_DEPLOYED`,
      ).toBe(true);
    }
  });
});

// ── GENERATED_DATE ────────────────────────────────────────────────────────────

describe('GENERATED_DATE', () => {
  it('is a non-empty string', () => {
    expect(typeof GENERATED_DATE).toBe('string');
    expect(GENERATED_DATE.length).toBeGreaterThan(0);
  });

  it('looks like an ISO date (YYYY-MM-DD)', () => {
    expect(GENERATED_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── isActiveOnWikipedia ───────────────────────────────────────────────────────

describe('isActiveOnWikipedia', () => {
  describe('positive cases', () => {
    it('returns true for a known deployed extension', () => {
      expect(isActiveOnWikipedia('AbuseFilter')).toBe(true);
    });

    it('returns true for another known extension', () => {
      expect(isActiveOnWikipedia('Echo')).toBe(true);
    });

    it('returns true for a name that resolves via COVERAGE_NAME_ALIASES', () => {
      // COVERAGE_NAME_ALIASES maps SyntaxHighlight → SyntaxHighlight_GeSHi
      expect(isActiveOnWikipedia('SyntaxHighlight')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('returns false for a made-up extension name', () => {
      expect(isActiveOnWikipedia('NonExistentExtension_XYZ')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isActiveOnWikipedia('')).toBe(false);
    });

    it('is case-sensitive (wrong case → false)', () => {
      // Extensions use PascalCase; lower-case versions should not match
      expect(isActiveOnWikipedia('abusefilter')).toBe(false);
      expect(isActiveOnWikipedia('ABUSEFILTER')).toBe(false);
    });
  });
});
