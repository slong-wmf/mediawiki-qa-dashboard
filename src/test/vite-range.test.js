import { describe, it, expect } from 'vitest';
import { resolveByteRange } from '../../vite-range.js';

const SIZE = 1000;

describe('resolveByteRange', () => {
  it('serves the full file when there is no Range header', () => {
    expect(resolveByteRange(undefined, SIZE)).toEqual({ type: 'full' });
    expect(resolveByteRange('', SIZE)).toEqual({ type: 'full' });
  });

  it('resolves an explicit start-end range', () => {
    expect(resolveByteRange('bytes=0-99', SIZE)).toEqual({ type: 'range', start: 0, end: 99 });
    expect(resolveByteRange('bytes=200-299', SIZE)).toEqual({ type: 'range', start: 200, end: 299 });
  });

  it('treats an absent end as "to the last byte"', () => {
    expect(resolveByteRange('bytes=0-', SIZE)).toEqual({ type: 'range', start: 0, end: 999 });
    expect(resolveByteRange('bytes=500-', SIZE)).toEqual({ type: 'range', start: 500, end: 999 });
  });

  it('clamps an over-large end to the final byte instead of rejecting (RFC 7233)', () => {
    // Regression guard: a media client requesting a fixed window past EOF must
    // get 206 with a clamped range, matching production express.static.
    expect(resolveByteRange('bytes=0-999999', SIZE)).toEqual({ type: 'range', start: 0, end: 999 });
    expect(resolveByteRange('bytes=900-5000', SIZE)).toEqual({ type: 'range', start: 900, end: 999 });
  });

  it('resolves suffix ranges (last N bytes)', () => {
    expect(resolveByteRange('bytes=-500', SIZE)).toEqual({ type: 'range', start: 500, end: 999 });
  });

  it('clamps a suffix length larger than the file to the whole file', () => {
    expect(resolveByteRange('bytes=-5000', SIZE)).toEqual({ type: 'range', start: 0, end: 999 });
  });

  it('rejects a range that starts at or past the end', () => {
    expect(resolveByteRange('bytes=1000-', SIZE)).toEqual({ type: 'unsatisfiable' });
    expect(resolveByteRange('bytes=2000-3000', SIZE)).toEqual({ type: 'unsatisfiable' });
  });

  it('rejects an inverted range', () => {
    expect(resolveByteRange('bytes=100-50', SIZE)).toEqual({ type: 'unsatisfiable' });
  });

  it('rejects a zero/empty suffix length', () => {
    expect(resolveByteRange('bytes=-', SIZE)).toEqual({ type: 'unsatisfiable' });
    expect(resolveByteRange('bytes=-0', SIZE)).toEqual({ type: 'unsatisfiable' });
  });

  it('falls back to the full file for multi-range and malformed headers', () => {
    // Single-range only; anything else serves 200 (always RFC-compliant) rather
    // than 416, matching the production static server.
    expect(resolveByteRange('bytes=0-99,200-299', SIZE)).toEqual({ type: 'full' });
    expect(resolveByteRange('bytes=abc', SIZE)).toEqual({ type: 'full' });
    expect(resolveByteRange('items=0-99', SIZE)).toEqual({ type: 'full' });
  });

  it('rejects any range against a zero-length file', () => {
    expect(resolveByteRange('bytes=0-', 0)).toEqual({ type: 'unsatisfiable' });
  });
});
