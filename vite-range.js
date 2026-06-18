/**
 * HTTP Range (RFC 7233) resolution for the dev `/data` middleware and any other
 * static file serving. Pure so it can be unit tested without a server.
 *
 * Returns one of:
 *   { type: 'full' }                     — no/unsupported Range header; serve 200
 *   { type: 'range', start, end }        — satisfiable single range; serve 206
 *   { type: 'unsatisfiable' }            — parseable but out of bounds; serve 416
 *
 * `start`/`end` are inclusive byte offsets, matching `fs.createReadStream`.
 */
export function resolveByteRange(rangeHeader, fileSize) {
  if (!rangeHeader) return { type: 'full' };

  // Only a single `bytes=a-b` range is supported. Anything else (multi-range,
  // other units, malformed) falls back to serving the whole file, which is what
  // the production express.static path does and is always RFC-compliant.
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return { type: 'full' };

  let start;
  let end;
  if (match[1] === '') {
    // Suffix range: the final N bytes. A zero/absent suffix length is invalid.
    const suffixLength = Number(match[2]);
    if (!suffixLength) return { type: 'unsatisfiable' };
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    // A last-byte-pos at or past the end is clamped to the final byte rather
    // than rejected (RFC 7233 §2.1), matching express.static / send.
    end = match[2] === '' ? fileSize - 1 : Math.min(Number(match[2]), fileSize - 1);
  }

  if (start >= fileSize || start > end) return { type: 'unsatisfiable' };
  return { type: 'range', start, end };
}
