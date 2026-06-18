/**
 * Extraction of inline iOS test recordings (.mov/.mp4) from failed UI-test
 * result-bundle ZIPs. Downloads happen in scripts/fetch-snapshot-data.js; this
 * module owns the streaming extraction and the pure helpers around it, kept
 * here so they can be unit and integration tested in isolation.
 */

import path from 'node:path';
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

export const MEBIBYTE = 1024 * 1024;

// Per-recording size ceiling. The download and per-entry extraction are fully
// streamed (see downloadArtifactToFile / extractVideoFromZipEntry), so memory
// stays bounded regardless of entry size — this cap bounds the size of any
// single recording we persist and publish to the snapshot directory.
export const IOS_VIDEO_MAX_ENTRY_BYTES = 150 * MEBIBYTE;

// Bytes sniffed to classify an entry. An ISO-BMFF/QuickTime `ftyp` box and its
// compatible brands sit within the first 32 bytes.
const VIDEO_HEADER_BYTES = 32;

/**
 * Identify a QuickTime/MP4 recording from its leading bytes. Both formats begin
 * with an `ftyp` box at offset 4; the compatible-brand region (offset 8..32)
 * distinguishes QuickTime (`qt`) from MP4. Returns null when the bytes are not
 * a recognised recording header.
 */
export function videoExtensionFromBytes(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const boxType = bytes.toString('ascii', 4, 8);
  if (boxType !== 'ftyp') return null;
  const brands = bytes.toString('ascii', 8, Math.min(bytes.length, 32));
  return brands.includes('qt') ? '.mov' : '.mp4';
}

export function videoMimeType(extension) {
  if (extension === '.mov') return 'video/quicktime';
  return 'video/mp4';
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size';
  if (bytes >= MEBIBYTE) return `${Math.round(bytes / MEBIBYTE)} MiB`;
  return `${bytes} bytes`;
}

/**
 * Decide whether a ZIP entry is small enough to extract as a recording. Gated
 * on both the compressed and uncompressed sizes from the central directory so a
 * highly-compressible giant entry is rejected before any bytes are streamed.
 */
export function shouldReadZipEntryForVideo(entry) {
  return (
    entry.compressedSize <= IOS_VIDEO_MAX_ENTRY_BYTES
    && entry.uncompressedSize <= IOS_VIDEO_MAX_ENTRY_BYTES
  );
}

export function safeFilename(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'artifact';
}

/**
 * Pull chunks from a stream's async iterator until at least `minBytes` have
 * been read (or the stream ends), returning both the buffered chunks and their
 * concatenated head. Driving the stream through its async iterator (rather than
 * read()/unshift()) works uniformly for stored and deflated ZIP entries; the
 * chunks are kept so the caller can replay them when writing the entry to disk.
 */
async function readEntryHeader(iterator, minBytes) {
  const chunks = [];
  let total = 0;
  while (total < minBytes) {
    const { value, done } = await iterator.next();
    if (done) break;
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    chunks.push(chunk);
    total += chunk.length;
  }
  return { chunks, header: Buffer.concat(chunks, Math.min(total, minBytes)) };
}

async function extractVideoFromZipEntry({
  zipFile,
  entry,
  run,
  family,
  artifact,
  outputDir,
  videoIndex,
}) {
  const entryStream = await zipFile.openReadStreamPromise(entry);
  const iterator = entryStream[Symbol.asyncIterator]();
  const { chunks, header } = await readEntryHeader(iterator, VIDEO_HEADER_BYTES);
  const extension = videoExtensionFromBytes(header);

  if (!extension) {
    // Not a recording — release the stream without reading the rest.
    await iterator.return?.();
    return null;
  }

  const relativePath = path.join(
    'ios-testing-videos',
    family.id,
    String(run.id),
    `${safeFilename(path.basename(entry.fileName)) || 'recording'}-${videoIndex}${extension}`,
  );
  const destination = path.join(outputDir, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });

  // Replay the sniffed chunks, then drain the rest of the entry, streaming it
  // all to disk. pipeline() applies backpressure and turns any read or write
  // error into a rejection rather than an unhandled 'error' event that would
  // crash the process.
  async function* entryBody() {
    yield* chunks;
    while (true) {
      const { value, done } = await iterator.next();
      if (done) break;
      yield value;
    }
  }

  try {
    await pipeline(Readable.from(entryBody()), createWriteStream(destination));
  } catch (err) {
    rmSync(destination, { force: true });
    throw err;
  }

  return {
    id: `${family.id}-${run.id}-${videoIndex}`,
    suite: family.title,
    kind: family.id,
    runId: run.id,
    runUrl: run.html_url,
    runConclusion: run.conclusion ?? '',
    branch: run.head_branch ?? '',
    createdAt: run.created_at,
    artifactName: artifact.name,
    sourceName: entry.fileName,
    path: `data/${relativePath.split(path.sep).join('/')}`,
    bytes: statSync(destination).size,
    mimeType: videoMimeType(extension),
  };
}

/**
 * Extract every inline recording from a result-bundle ZIP on disk into
 * `outputDir`, returning one descriptor per recording. Oversized entries are
 * skipped and an unreadable entry is logged without aborting the rest.
 */
export async function extractVideosFromArtifactZipFile({
  zipPath,
  run,
  family,
  artifact,
  outputDir,
}) {
  const videos = [];
  let skippedEntries = 0;
  const zipFile = await yauzl.openPromise(zipPath, { lazyEntries: true });

  try {
    for await (const entry of zipFile.eachEntry()) {
      if (entry.fileName.endsWith('/')) continue;

      if (!shouldReadZipEntryForVideo(entry)) {
        skippedEntries += 1;
        continue;
      }

      try {
        const video = await extractVideoFromZipEntry({
          zipFile,
          entry,
          run,
          family,
          artifact,
          outputDir,
          videoIndex: videos.length + 1,
        });
        if (video) videos.push(video);
      } catch (err) {
        // One unreadable entry shouldn't sink the other recordings in the
        // bundle; log and move on.
        console.warn(`  ⚠ could not extract ${entry.fileName} from ${artifact.name} (${artifact.id}): ${err.message}`);
      }
    }
  } finally {
    zipFile.close();
  }

  if (skippedEntries > 0) {
    console.warn(`  ⚠ skipped ${skippedEntries} oversized ZIP entr${skippedEntries === 1 ? 'y' : 'ies'} while scanning ${artifact.name} (${artifact.id}); entry cap ${formatBytes(IOS_VIDEO_MAX_ENTRY_BYTES)}`);
  }
  return videos;
}
