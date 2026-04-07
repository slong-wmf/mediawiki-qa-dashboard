/**
 * URL Validation Tests
 *
 * Scans every source file and documentation file in the project, extracts all
 * http/https URLs, and asserts that each one is syntactically valid.
 *
 * Additionally verifies that:
 *  - All API service URLs (the ones actually used for network calls) use HTTPS.
 *  - No placeholder text survives into source-file URLs.
 *  - The three upstream proxy targets declared in vite.config.js are present
 *    and use HTTPS.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/test/ → up two levels → project root (mediawiki-dashboard/)
const ROOT = resolve(__dirname, '../..');

// ── File manifests ────────────────────────────────────────────────────────────

const SOURCE_FILES = [
  'src/services/jenkins.js',
  'src/services/coverage.js',
  'src/services/phabricator.js',
  'src/hooks/useDashboardData.js',
  'src/data/activeExtensions.js',
  'src/App.jsx',
  'src/main.jsx',
  'src/components/PassFailPanel.jsx',
  'src/components/CoveragePanel.jsx',
  'src/components/ExecutionTimePanel.jsx',
  'src/components/BugsPanel.jsx',
  'vite.config.js',
  'index.html',
];

const DOC_FILES = [
  'README.md',
  'docs/api-setup.md',
  'docs/architecture.md',
  'docs/security.md',
  'docs/cors-audit.md',
  'docs/audit-results.md',
  'docs/sign-off.md',
];

// ── URL extraction ────────────────────────────────────────────────────────────

/**
 * Extract all http/https URLs from a string.
 *
 * Skips:
 *  - Template literal expressions (lines containing "${")
 *  - URLs that are clearly fragments (length < 12)
 * Strips trailing punctuation that is not part of the URL (commas, periods,
 * closing parentheses/brackets, backticks, etc.).
 */
function extractUrls(content) {
  const urlRegex = /https?:\/\/[^\s<>"'`\\]+/g;
  return (content.match(urlRegex) ?? [])
    .map((url) => url.replace(/[.,;:)\]`]+$/, ''))
    .filter((url) => !url.includes('${'))   // skip template literals
    .filter((url) => !url.includes('YOUR_')) // skip placeholder strings
    .filter((url) => !url.includes(']('))   // skip markdown link false-matches ([url](url))
    .filter((url) => url.length >= 12);     // must be a plausible URL
}

function readFile(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

// ── Syntactic validity — source files ─────────────────────────────────────────

describe('URL syntax — source files', () => {
  it.each(SOURCE_FILES)('all URLs in %s are syntactically valid', (file) => {
    const urls = extractUrls(readFile(file));
    for (const url of urls) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(`Invalid URL in ${file}: "${url}"`);
      }
      expect(parsed.href).toBeTruthy();
    }
  });
});

// ── Syntactic validity — documentation ───────────────────────────────────────

describe('URL syntax — documentation', () => {
  it.each(DOC_FILES)('all URLs in %s are syntactically valid', (file) => {
    const urls = extractUrls(readFile(file));
    for (const url of urls) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(`Invalid URL in ${file}: "${url}"`);
      }
      expect(parsed.href).toBeTruthy();
    }
  });
});

// ── HTTPS enforcement — service layer ─────────────────────────────────────────

describe('HTTPS enforcement', () => {
  const SERVICE_FILES = [
    'src/services/jenkins.js',
    'src/services/coverage.js',
    'src/services/phabricator.js',
  ];

  it.each(SERVICE_FILES)('all URLs in %s use HTTPS (not plain HTTP)', (file) => {
    const content = readFile(file);
    const httpUrls = (content.match(/http:\/\/[^\s<>"'`\\]+/g) ?? [])
      .filter((url) => !url.includes('${'));

    expect(
      httpUrls,
      `Found http:// URLs in ${file}: ${httpUrls.join(', ')}`,
    ).toHaveLength(0);
  });
});

// ── Vite proxy targets ────────────────────────────────────────────────────────

describe('Vite proxy configuration', () => {
  const config = readFile('vite.config.js');

  it('proxies Jenkins through https://integration.wikimedia.org/ci', () => {
    expect(config).toContain('https://integration.wikimedia.org/ci');
  });

  it('proxies coverage index through https://doc.wikimedia.org', () => {
    expect(config).toContain('https://doc.wikimedia.org');
  });

  it('proxies Phabricator through https://phabricator.wikimedia.org/api', () => {
    expect(config).toContain('https://phabricator.wikimedia.org/api');
  });

  it('all proxy targets use HTTPS', () => {
    const targets = config.match(/target:\s*['"]https?:\/\/[^'"]+['"]/g) ?? [];
    for (const target of targets) {
      expect(target, `proxy target should use https: ${target}`).toContain('https://');
    }
  });
});

// ── Known hardcoded public URLs ───────────────────────────────────────────────

describe('Known hardcoded public URLs', () => {
  it('JENKINS_PUBLIC_URL in jenkins.js is a valid HTTPS URL', () => {
    const content = readFile('src/services/jenkins.js');
    expect(content).toContain('https://integration.wikimedia.org/ci');
    expect(() => new URL('https://integration.wikimedia.org/ci')).not.toThrow();
  });

  it('COVERAGE_PUBLIC_URL in coverage.js is a valid HTTPS URL', () => {
    const content = readFile('src/services/coverage.js');
    expect(content).toContain('https://doc.wikimedia.org');
    expect(() => new URL('https://doc.wikimedia.org')).not.toThrow();
  });

  it('Phabricator task URL base in phabricator.js is valid HTTPS', () => {
    const content = readFile('src/services/phabricator.js');
    expect(content).toContain('https://phabricator.wikimedia.org/T');
    expect(() => new URL('https://phabricator.wikimedia.org/T12345')).not.toThrow();
  });

  it('Phabricator Maniphest link in BugsPanel.jsx is a valid HTTPS URL', () => {
    const content = readFile('src/components/BugsPanel.jsx');
    expect(content).toContain('https://phabricator.wikimedia.org/maniphest/');
    expect(() => new URL('https://phabricator.wikimedia.org/maniphest/')).not.toThrow();
  });
});

// ── No placeholder URLs in source ────────────────────────────────────────────

describe('No placeholder text in source URLs', () => {
  it('no source file contains YOUR_TOKEN_HERE in a URL context', () => {
    for (const file of SOURCE_FILES) {
      const content = readFile(file);
      expect(
        content,
        `${file} contains a placeholder token`,
      ).not.toMatch(/https?:\/\/[^\s]*YOUR_TOKEN/i);
    }
  });

  it('no source file contains example.com', () => {
    for (const file of SOURCE_FILES) {
      const content = readFile(file);
      expect(content, `${file} contains example.com`).not.toContain('example.com');
    }
  });
});
