/**
 * @file flaky-tests-fetcher.js
 *
 * Pure helpers that turn a Datasette HTTP response from
 * https://releng-data.wmcloud.org/flaky_tests.json into either a parsed array
 * of rows or a precise, actionable error.
 *
 * The endpoint sits behind Anubis bot-protection, which serves an HTML
 * challenge page (HTTP 200, Content-Type: text/html) when it doesn't recognise
 * the caller as a permitted API consumer. Without explicit detection the cron
 * sees a generic "Unexpected token '<' is not valid JSON" error and an empty
 * envelope, which is easy to miss in the logs. The helpers here turn that
 * specific failure into a loud, named error so a regression in the bypass is
 * obvious in the cron output (and the unit test below catches schema drift in
 * the detection logic itself).
 *
 * Kept in scripts/lib/ — and free of side effects — so vitest can import it
 * directly without running the snapshot fetcher's main().
 */

/**
 * Sentinel error type. The snapshot script catches it specifically so the
 * cron output makes it obvious that the bypass needs attention rather than
 * burying the failure in a generic JSON parse error.
 */
export class AnubisChallengeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnubisChallengeError';
  }
}

/**
 * Inspect a Response (and an already-read body string) to decide whether the
 * upstream gave us an Anubis bot-challenge page instead of a JSON payload.
 *
 * Triggers on any of:
 *   - HTTP 403 (nginx blocks non-browser UAs at the edge)
 *   - Content-Type starting with text/html
 *   - body that begins with `<` after trimming whitespace
 *
 * @param {{ status: number, headers: { get: (name: string) => string|null } }} res
 * @param {string} bodyText
 * @returns {boolean}
 */
export function looksLikeAnubisChallenge(res, bodyText) {
  if (res?.status === 403) return true;
  const ct = res?.headers?.get?.('content-type') ?? '';
  if (typeof ct === 'string' && /^text\/html\b/i.test(ct)) return true;
  if (typeof bodyText === 'string' && bodyText.trimStart().startsWith('<')) return true;
  return false;
}

/**
 * Fetch the flaky_tests Datasette endpoint and return the parsed rows.
 * Throws an {@link AnubisChallengeError} when the upstream serves an HTML
 * challenge instead of JSON, throws a regular Error for other HTTP failures,
 * and throws when the parsed body isn't an array.
 *
 * `fetchImpl` is injected so tests can substitute a mock without needing
 * vi.mock on global fetch.
 *
 * @param {string} url
 * @param {{ headers?: Record<string, string>, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Array<object>>}
 */
export async function fetchFlakyTestRows(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(url, { headers: options.headers });
  const body = await res.text();

  if (looksLikeAnubisChallenge(res, body)) {
    throw new AnubisChallengeError(
      `Anubis bot-protection appears to be blocking the snapshot fetcher at `
      + `${url} (HTTP ${res.status}). Verify the script-wide self-identifying `
      + `User-Agent is still recognised as an API consumer; if not, coordinate `
      + `with the releng-data operators to allowlist the Toolforge source IP.`,
    );
  }

  if (!res.ok) {
    throw new Error(`Flaky tests fetch failed: HTTP ${res.status} ${res.statusText}`);
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (err) {
    throw new Error(`Flaky tests response was not valid JSON: ${err.message}`);
  }

  if (!Array.isArray(json)) {
    throw new Error('Flaky tests endpoint returned a non-array response');
  }

  return json;
}
