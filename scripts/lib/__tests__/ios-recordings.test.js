import { describe, it, expect } from 'vitest';
import {
  MEBIBYTE,
  IOS_VIDEO_MAX_ENTRY_BYTES,
  videoExtensionFromBytes,
  videoMimeType,
  formatBytes,
  shouldReadZipEntryForVideo,
} from '../ios-recordings.js';

/**
 * Build a minimal ISO-BMFF / QuickTime `ftyp` box: a 4-byte size, the literal
 * 'ftyp', then a major brand and optional compatible brands. The detector only
 * inspects offsets 4-32, so the size field value is irrelevant.
 */
function ftypHeader(majorBrand, compatibleBrands = '') {
  const body = `ftyp${majorBrand}${compatibleBrands}`;
  const buf = Buffer.alloc(4 + body.length);
  buf.writeUInt32BE(buf.length, 0);
  buf.write(body, 4, 'ascii');
  return buf;
}

describe('videoExtensionFromBytes', () => {
  it('detects an MP4 ftyp header', () => {
    expect(videoExtensionFromBytes(ftypHeader('isom', 'iso2avc1mp41'))).toBe('.mp4');
  });

  it('detects a QuickTime header via the "qt" brand', () => {
    expect(videoExtensionFromBytes(ftypHeader('qt  '))).toBe('.mov');
  });

  it('detects QuickTime when "qt" is a compatible brand beyond the major brand', () => {
    expect(videoExtensionFromBytes(ftypHeader('isom', 'qt  '))).toBe('.mov');
  });

  it('returns null when the box type is not ftyp', () => {
    expect(videoExtensionFromBytes(Buffer.alloc(32))).toBeNull();
  });

  it('returns null for fewer than 12 bytes', () => {
    expect(videoExtensionFromBytes(ftypHeader('qt  ').subarray(0, 8))).toBeNull();
  });

  it('returns null for empty/absent input', () => {
    expect(videoExtensionFromBytes(null)).toBeNull();
    expect(videoExtensionFromBytes(Buffer.alloc(0))).toBeNull();
  });
});

describe('videoMimeType', () => {
  it('maps .mov to video/quicktime', () => {
    expect(videoMimeType('.mov')).toBe('video/quicktime');
  });

  it('maps .mp4 (and anything else) to video/mp4', () => {
    expect(videoMimeType('.mp4')).toBe('video/mp4');
    expect(videoMimeType('.webm')).toBe('video/mp4');
  });
});

describe('formatBytes', () => {
  it('renders sub-MiB sizes in bytes', () => {
    expect(formatBytes(500)).toBe('500 bytes');
    expect(formatBytes(0)).toBe('0 bytes');
  });

  it('renders >= 1 MiB sizes rounded to MiB', () => {
    expect(formatBytes(MEBIBYTE)).toBe('1 MiB');
    expect(formatBytes(IOS_VIDEO_MAX_ENTRY_BYTES)).toBe('150 MiB');
  });

  it('handles non-finite input', () => {
    expect(formatBytes(Infinity)).toBe('unknown size');
    expect(formatBytes(NaN)).toBe('unknown size');
  });
});

describe('shouldReadZipEntryForVideo', () => {
  it('accepts entries within the cap on both sizes', () => {
    expect(shouldReadZipEntryForVideo({ compressedSize: 1000, uncompressedSize: 2000 })).toBe(true);
  });

  it('accepts an entry exactly at the cap', () => {
    expect(shouldReadZipEntryForVideo({
      compressedSize: IOS_VIDEO_MAX_ENTRY_BYTES,
      uncompressedSize: IOS_VIDEO_MAX_ENTRY_BYTES,
    })).toBe(true);
  });

  it('rejects when the compressed size exceeds the cap', () => {
    expect(shouldReadZipEntryForVideo({
      compressedSize: IOS_VIDEO_MAX_ENTRY_BYTES + 1,
      uncompressedSize: 1,
    })).toBe(false);
  });

  it('rejects when the uncompressed size exceeds the cap (highly-compressible giant)', () => {
    expect(shouldReadZipEntryForVideo({
      compressedSize: 1,
      uncompressedSize: IOS_VIDEO_MAX_ENTRY_BYTES + 1,
    })).toBe(false);
  });
});
