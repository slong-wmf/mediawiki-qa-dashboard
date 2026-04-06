# Security & Code Audit Results

**Date:** 2026-04-03 (updated 2026-04-06)

---

## npm Audit

Run the following in the project root before each production deploy:

```bash
npm audit
npm audit fix   # apply safe fixes automatically
```

*(Result to be filled in after running locally — requires network access to npm registry.)*

---

## Source Code Scan

### 1. `dangerouslySetInnerHTML`
**Result: ✅ CLEAN**
No occurrences found in `src/`.

### 2. Hardcoded tokens / keys
**Result: ✅ CLEAN**
No strings matching `ghp_`, `api-<token>`, or equivalent credential patterns found in
`src/`. The only credential (`VITE_PHABRICATOR_TOKEN`) is read exclusively from
`import.meta.env`.

### 3. `console.log` statements
**Result: ✅ CLEAN**
No `console.log` calls found in `src/`. `jenkins.js` uses `console.warn` for partial
fetch failures — this is intentional to surface per-job errors without breaking the UI.

### 4. Hardcoded URLs
**Result: ✅ INTENTIONAL — documented below**

Two public-facing base URLs are hardcoded directly in service modules as constants:

- `JENKINS_PUBLIC_URL = 'https://integration.wikimedia.org/ci'` in `jenkins.js`
- `COVERAGE_PUBLIC_URL = 'https://doc.wikimedia.org'` in `coverage.js`

These are used exclusively for generating **clickthrough links** in the UI (e.g. opening
a build or coverage page in a new tab) — not for API calls. API calls go through the
`/api/*` proxy paths, which are also hardcoded constants in each service module.
This is an intentional design choice: the upstream hosts are fixed Wikimedia
infrastructure, and treating them as env vars would add configuration overhead with
no security benefit.

### 5. `.env` in `.gitignore`
**Result: ✅ CONFIRMED**
`.env`, `.env.local`, and `.env.*.local` are all listed in `.gitignore`.

### 6. Vite dev server binding
**Result: ✅ CLEAN**
`vite.config.js` does not contain `host: '0.0.0.0'`.
Dev server binds to `localhost` only (Vite default).

---

## Items Confirmed Clean

- No `dangerouslySetInnerHTML` usage — all data rendered via React JSX
- No tokens or credentials in source files
- No debug `console.log` left in production code paths
- Hardcoded URLs are clickthrough links only, not API credentials — intentional
- `.env` protected from accidental commit
- Dev server not exposed to external network interfaces

---

## Pending

- [ ] Run `npm audit` locally and paste result into `docs/security.md` under
  "npm Audit Result" before first production deployment
