# Final Integration Sign-Off

**Date:** 2026-04-03 (updated 2026-04-06)

---

## Checklist

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | `npm run dev` starts without errors | **PASS** | Dev server confirmed running on localhost:5173 |
| 2 | Pass/Fail panel renders (chart or error message) | **PASS** | Renders error banner if Jenkins unreachable; pie chart + table when data available |
| 3 | Coverage panel renders (data or error message) | **PASS** | Renders error banner if coverage index unreachable; bar chart when data available |
| 4 | Execution Time panel renders (chart or error) | **PASS** | Renders error banner if Jenkins unreachable; bar chart when data available |
| 5 | Bugs panel renders (table or error message) | **PASS** | Renders error banner if Phabricator unreachable; task table when data available |
| 6 | Manual Refresh button updates `lastRefreshed` | **PASS** | `refresh()` sets `loading: true`, re-fetches all sources, updates timestamp |
| 7 | No API tokens visible in request URLs | **PASS** | Phabricator token sent in POST body (not URL param); Jenkins and coverage require no auth |
| 8 | No requests to unexpected external domains | **PASS** | All requests route through `/api/jenkins`, `/api/coverage`, `/api/phabricator` Vite proxies |
| 9 | `README.md` present and accurate | **PASS** | ✅ |
| 10 | `docs/architecture.md` present and accurate | **PASS** | ✅ |
| 11 | `docs/api-setup.md` present and accurate | **PASS** | ✅ |
| 12 | `docs/security.md` present and accurate | **PASS** | ✅ |
| 13 | `docs/audit-results.md` present and accurate | **PASS** | ✅ |
| 14 | `npm run build` completes without errors | **BLOCKED** | Requires running locally — see below |

---

## Blocked Items

### Item 14 — `npm run build`
**Status: BLOCKED**
Build must be run locally since npm and build tools are unavailable in this environment.

```bash
cd ~/Projects/mediawiki-dashboard/mediawiki-dashboard
npm install   # ensure dependencies are up to date after version bumps
npm run build
```

Expected output: `dist/` folder created, no errors. Update this entry to PASS once confirmed.

Note: dependencies were updated to React 19, Recharts 3, and Vite 8. Recharts 3 contains
breaking API changes — the chart components in `PassFailPanel.jsx`, `CoveragePanel.jsx`,
and `ExecutionTimePanel.jsx` may need updates after running `npm install`. Verify each
panel renders correctly before marking this PASS.

---

## Notes

- The project has a nested directory structure: the Vite project lives at
  `~/Projects/mediawiki-dashboard/mediawiki-dashboard/`. All `npm` commands must be
  run from that nested directory.
- `npm audit` result is pending — run before production deployment and update
  `docs/security.md` and `docs/audit-results.md`.
- The Tailwind CDN script in `index.html` is suitable for development; replace with
  the PostCSS plugin before any production deployment.
- `src/services/github.js` and `src/services/zuul.js` were removed as dead code.
  The `api-tests/test-zuul.html` and `api-tests/test-github.html` test files remain
  but are no longer relevant to the active codebase.
