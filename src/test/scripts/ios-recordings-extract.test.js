/**
 * Integration tests for extractVideosFromArtifactZipFile — the streaming
 * extraction of inline recordings from a result-bundle ZIP on disk.
 *
 * Builds real ZIP fixtures in-process (both STORED and DEFLATED entries, since
 * GitHub artifact ZIPs use both for already-compressed media) and asserts each
 * recording is written byte-for-byte, non-recordings are ignored, and oversized
 * entries are skipped. The stored-vs-deflated cases guard against a regression
 * where stored entries were silently written as 0 bytes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  extractVideosFromArtifactZipFile,
  IOS_VIDEO_MAX_ENTRY_BYTES,
} from '../../../scripts/lib/ios-recordings.js';

/** Build a minimal ISO-BMFF / QuickTime `ftyp` box plus a payload. */
function recording(majorBrand, payloadSize) {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 0x14]),
    Buffer.from(`ftyp${majorBrand}`, 'ascii'),
    Buffer.alloc(payloadSize, 0x5a),
  ]);
}

/**
 * Encode a ZIP from `[{ name, data, store, centralSizes }]`. `store` writes the
 * entry uncompressed (method 0); otherwise it is DEFLATE-compressed (method 8).
 * `centralSizes` overrides the sizes recorded in the central directory (used to
 * fake an oversized entry without allocating one). yauzl does not validate
 * CRC-32, so it is left zero.
 */
function buildZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.store ? 0 : 8;
    const compressed = entry.store ? entry.data : deflateRawSync(entry.data);
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compSize = entry.centralSizes?.compressed ?? compressed.length;
    const uncompSize = entry.centralSizes?.uncompressed ?? entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localHeaderOffset = offset;
    const localRecord = Buffer.concat([local, nameBuf, compressed]);
    localRecords.push(localRecord);
    offset += localRecord.length;

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compSize, 20);
    central.writeUInt32LE(uncompSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(localHeaderOffset, 42);
    centralRecords.push(Buffer.concat([central, nameBuf]));
  }

  const localSection = Buffer.concat(localRecords);
  const centralSection = Buffer.concat(centralRecords);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16);
  return Buffer.concat([localSection, centralSection, eocd]);
}

const RUN = { id: 4242, html_url: 'https://example/run/4242', conclusion: 'failure', head_branch: 'main', created_at: '2026-06-18T00:00:00Z' };
const FAMILY = { id: 'ui', title: 'UI Tests' };
const ARTIFACT = { name: 'WikipediaUITests-result-bundle', id: 99 };

let tmpDir;
let zipPath;
let outputDir;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ios-rec-test-'));
  zipPath = path.join(tmpDir, 'bundle.zip');
  outputDir = path.join(tmpDir, 'out');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function run(entries) {
  writeFileSync(zipPath, buildZip(entries));
  return extractVideosFromArtifactZipFile({
    zipPath, run: RUN, family: FAMILY, artifact: ARTIFACT, outputDir,
  });
}

describe('extractVideosFromArtifactZipFile', () => {
  it('extracts a DEFLATE-compressed recording byte-for-byte', async () => {
    const data = recording('isom', 500);
    const videos = await run([{ name: 'recording.mp4', data, store: false }]);

    expect(videos).toHaveLength(1);
    expect(videos[0].mimeType).toBe('video/mp4');
    expect(videos[0].bytes).toBe(data.length);
    expect(readFileSync(path.join(outputDir, videos[0].path.replace(/^data\//, '')))).toEqual(data);
  });

  it('extracts a STORED (uncompressed) recording byte-for-byte (regression guard)', async () => {
    // A stored .mov is exactly the case that previously produced a 0-byte file.
    const data = recording('qt  ', 800);
    const videos = await run([{ name: 'screen.mov', data, store: true }]);

    expect(videos).toHaveLength(1);
    expect(videos[0].mimeType).toBe('video/quicktime');
    expect(videos[0].bytes).toBe(data.length);
    expect(readFileSync(path.join(outputDir, videos[0].path.replace(/^data\//, '')))).toEqual(data);
  });

  it('extracts a recording smaller than the sniff window', async () => {
    const data = recording('isom', 4); // 20 bytes total, < 32-byte header window
    const videos = await run([{ name: 'tiny.mp4', data, store: true }]);

    expect(videos).toHaveLength(1);
    expect(videos[0].bytes).toBe(data.length);
    expect(readFileSync(path.join(outputDir, videos[0].path.replace(/^data\//, '')))).toEqual(data);
  });

  it('ignores non-recording entries and directory entries', async () => {
    const videos = await run([
      { name: 'logs/', data: Buffer.alloc(0), store: true },
      { name: 'notes.txt', data: Buffer.from('not a video, just text padding bytes here'), store: false },
    ]);
    expect(videos).toEqual([]);
  });

  it('skips entries whose central-directory size exceeds the cap', async () => {
    const data = recording('isom', 500);
    const videos = await run([{
      name: 'huge.mp4',
      data,
      store: false,
      centralSizes: { compressed: 10, uncompressed: IOS_VIDEO_MAX_ENTRY_BYTES + 1 },
    }]);
    expect(videos).toEqual([]);
  });

  it('numbers multiple recordings sequentially and reports their paths', async () => {
    const videos = await run([
      { name: 'a.mp4', data: recording('isom', 100), store: false },
      { name: 'plain.log', data: Buffer.from('logs go here, padded out so it is over 32 bytes long.'), store: false },
      { name: 'b.mov', data: recording('qt  ', 120), store: true },
    ]);

    expect(videos).toHaveLength(2);
    expect(videos.map((v) => v.id)).toEqual(['ui-4242-1', 'ui-4242-2']);
    expect(videos[0].path).toBe('data/ios-testing-videos/ui/4242/a-mp4-1.mp4');
    expect(videos[1].path).toBe('data/ios-testing-videos/ui/4242/b-mov-2.mov');
  });
});
