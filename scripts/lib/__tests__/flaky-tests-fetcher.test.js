import { describe, it, expect } from 'vitest';
import {
  AnubisChallengeError,
  looksLikeAnubisChallenge,
  fetchFlakyTestRows,
} from '../flaky-tests-fetcher.js';

/**
 * Build a minimal Response-like object the helpers will accept. Exists so
 * each test can assemble exactly the (status, content-type, body) tuple it
 * cares about without dragging in the whole Response constructor.
 */
function makeResponse({ status = 200, contentType = 'application/json', body = '[]' } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 403 ? 'Forbidden' : 'OK',
    headers: {
      get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null),
    },
    text: () => Promise.resolve(body),
  };
}

describe('looksLikeAnubisChallenge', () => {
  it('returns true on HTTP 403', () => {
    expect(looksLikeAnubisChallenge(makeResponse({ status: 403 }), '')).toBe(true);
  });

  it('returns true when the Content-Type is text/html', () => {
    expect(
      looksLikeAnubisChallenge(makeResponse({ contentType: 'text/html; charset=utf-8' }), 'whatever'),
    ).toBe(true);
  });

  it('returns true when the body starts with `<` (HTML challenge served as 200)', () => {
    expect(
      looksLikeAnubisChallenge(makeResponse({ contentType: 'application/json' }), '<!doctype html><html>…'),
    ).toBe(true);
  });

  it('ignores leading whitespace before the `<`', () => {
    expect(
      looksLikeAnubisChallenge(makeResponse({}), '   \n<html><body>challenge</body></html>'),
    ).toBe(true);
  });

  it('returns false for a normal JSON response', () => {
    expect(
      looksLikeAnubisChallenge(makeResponse({ contentType: 'application/json' }), '[{"Count":1}]'),
    ).toBe(false);
  });
});

describe('fetchFlakyTestRows', () => {
  function fakeFetch(response) {
    return () => Promise.resolve(response);
  }

  it('returns the parsed array on a healthy JSON response', async () => {
    const rows = await fetchFlakyTestRows('https://example/flaky.json', {
      fetchImpl: fakeFetch(makeResponse({ body: '[{"Count":3,"Test Name":"foo"}]' })),
    });
    expect(rows).toEqual([{ Count: 3, 'Test Name': 'foo' }]);
  });

  it('throws AnubisChallengeError when the body is an HTML challenge page', async () => {
    const fetcher = fetchFlakyTestRows('https://example/flaky.json', {
      fetchImpl: fakeFetch(makeResponse({
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><head><title>Anubis</title></head>…',
      })),
    });
    await expect(fetcher).rejects.toBeInstanceOf(AnubisChallengeError);
    await expect(fetcher).rejects.toThrow(/Anubis bot-protection/);
  });

  it('throws AnubisChallengeError on HTTP 403 even with a JSON-shaped body', async () => {
    const fetcher = fetchFlakyTestRows('https://example/flaky.json', {
      fetchImpl: fakeFetch(makeResponse({ status: 403, body: '[]' })),
    });
    await expect(fetcher).rejects.toBeInstanceOf(AnubisChallengeError);
  });

  it('throws a regular Error (not AnubisChallengeError) on a generic 5xx', async () => {
    const fetcher = fetchFlakyTestRows('https://example/flaky.json', {
      fetchImpl: fakeFetch(makeResponse({ status: 500, body: '{}' })),
    });
    await expect(fetcher).rejects.toThrow(/HTTP 500/);
    await expect(fetcher).rejects.not.toBeInstanceOf(AnubisChallengeError);
  });

  it('throws when the response body is not valid JSON', async () => {
    const fetcher = fetchFlakyTestRows('https://example/flaky.json', {
      fetchImpl: fakeFetch(makeResponse({ body: 'not-json-at-all' })),
    });
    await expect(fetcher).rejects.toThrow(/not valid JSON/);
  });

  it('throws when the response is JSON but not an array', async () => {
    const fetcher = fetchFlakyTestRows('https://example/flaky.json', {
      fetchImpl: fakeFetch(makeResponse({ body: '{"oops":true}' })),
    });
    await expect(fetcher).rejects.toThrow(/non-array response/);
  });

  it('passes the configured Accept header through to fetch', async () => {
    let captured = null;
    const fetchImpl = (url, opts) => {
      captured = { url, opts };
      return Promise.resolve(makeResponse({ body: '[]' }));
    };
    await fetchFlakyTestRows('https://example/flaky.json', {
      headers: { Accept: 'application/json', 'X-Trace': 'on' },
      fetchImpl,
    });
    expect(captured.url).toBe('https://example/flaky.json');
    expect(captured.opts.headers).toEqual({ Accept: 'application/json', 'X-Trace': 'on' });
  });
});
