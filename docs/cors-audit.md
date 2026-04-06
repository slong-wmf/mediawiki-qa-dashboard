# CORS & API Audit

**Date:** 2026-04-03 (updated 2026-04-06)
**Project:** mediawiki-dashboard
**Tested from:** browser at `http://localhost:5173`

---

## Summary

| API | Direct Browser Access | HTTP Status | Auth Required | Workaround |
|-----|----------------------|-------------|---------------|------------|
| Jenkins CI | ❌ Blocked (no CORS) | N/A (blocked) | No | Vite proxy required |
| doc.wikimedia.org coverage | ❌ Blocked (no CORS) | N/A (blocked) | No | Vite proxy required |
| Phabricator Conduit | ❌ Blocked (no CORS) | N/A (blocked) | Optional (token) | Vite proxy required |

All three sources require the Vite dev-server proxy. For production, a server-side
reverse proxy must replace it.

---

## 1. Wikimedia Jenkins CI

**Endpoint:** `GET https://integration.wikimedia.org/ci/job/<slug>/api/json?tree=...`

**Result:** ❌ Blocked by CORS.

Jenkins does not include `Access-Control-Allow-Origin` headers on its API responses.
Any browser `fetch()` to this endpoint will be blocked by the browser's same-origin
policy before a response is received.

- **HTTP status:** N/A — request blocked before response received
- **Authentication required:** No — fully public, read-only endpoint
- **CORS headers present:** No
- **Workaround:** Vite proxy at `/api/jenkins/*` → `https://integration.wikimedia.org/ci`

---

## 2. doc.wikimedia.org Coverage Index

**Endpoints:**
- `GET https://doc.wikimedia.org/cover/`
- `GET https://doc.wikimedia.org/cover-extensions/`

**Result:** ❌ Blocked by CORS.

The coverage index pages are static HTML documents not intended for cross-origin
browser consumption. No CORS headers are present.

- **HTTP status:** N/A — request blocked before response received
- **Authentication required:** No — fully public pages
- **CORS headers present:** No
- **Workaround:** Vite proxy at `/api/coverage/*` → `https://doc.wikimedia.org`

---

## 3. Phabricator Conduit API

**Endpoint:** `POST https://phabricator.wikimedia.org/api/maniphest.search`
**Body:** `__conduit__=1&constraints[modifiedStart]=<epoch>&limit=100`

**Result:** ❌ Blocked by CORS.

Phabricator does not include `Access-Control-Allow-Origin` headers on its Conduit API
responses. Any browser `fetch()` to this endpoint will be blocked by the browser's
same-origin policy.

- **HTTP status:** N/A — request blocked before response received
- **Authentication required:** Optional — token raises rate-limit ceiling but is not
  required for public read access
- **CORS headers present:** No
- **Workaround:** Vite proxy at `/api/phabricator/*` → `https://phabricator.wikimedia.org/api`

---

## Recommendations

1. **Jenkins CI:** Proxy via Vite — browser requests fail without it.
2. **Coverage index:** Proxy via Vite — browser requests fail without it.
3. **Phabricator:** Proxy via Vite — browser requests fail without it.

See `vite.config.js` for the proxy configuration covering all three routes.

---

## Test Files

Manual browser tests are available in `api-tests/`:
- `api-tests/test-zuul.html` — historical; the Zuul service is no longer used
- `api-tests/test-github.html` — historical; the GitHub service is no longer used
- `api-tests/test-phabricator.html` — confirms CORS block behavior for Phabricator
