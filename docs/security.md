# Security

## Security Checklist

- [x] `.env` is listed in `.gitignore`
- [x] No tokens in any source file — credentials read from `import.meta.env` only
- [x] All API data rendered via React JSX — no `dangerouslySetInnerHTML` used anywhere
- [x] Vite dev server bound to `localhost` only — no `host: '0.0.0.0'` in `vite.config.js`
- [x] Phabricator token is a standard Conduit read token (see docs/api-setup.md)
- [x] API responses validated for expected shape before use — each service module
      throws on unexpected response structure
- [ ] `npm audit`: zero high/critical findings — run `npm audit` to verify before deploying

---

## Rate Limiting Notes

### Wikimedia Jenkins CI
- **Limit:** No documented rate limit. The instance is public and read-only.
- **Recommendation:** The dashboard fetches 20 builds across 17 jobs per refresh cycle
  (17 parallel requests). At the default 1-hour interval this is negligible. Avoid
  polling more frequently than every 5 minutes.

### doc.wikimedia.org Coverage Index
- **Limit:** No documented rate limit. These are static HTML pages served by a CDN.
- **Recommendation:** Two requests per refresh cycle (one for core, one for extensions).
  The default 1-hour interval is more than sufficient.

### Phabricator Conduit API
- **Limit:** Not publicly documented; Wikimedia Phabricator enforces server-side
  throttling at the application layer.
- **Unauthenticated:** Lower limit; suitable for infrequent manual refreshes.
- **Authenticated (token):** Higher limit; recommended for regular polling.
- **Recommendation:** Keep polling at ≥ 15-minute intervals. The dashboard fetches
  up to 2 pages of 100 tasks each (200 tasks max) per refresh cycle.

---

## Production Deployment Considerations

1. **Phabricator token:** If `VITE_PHABRICATOR_TOKEN` is set, it is embedded in the
   JavaScript bundle at build time (all `VITE_*` variables are inlined by Vite). For
   production, move the Phabricator API call to a server-side proxy that reads the
   token from a server-side environment variable and never exposes it to the client.
   Jenkins and coverage fetches require no secrets and can remain client-side.

2. **Content Security Policy (CSP):** Add a CSP header restricting `connect-src` to
   only the three upstream domains once deployed behind a server.

3. **Tailwind CDN:** The `cdn.tailwindcss.com` script in `index.html` has no
   Subresource Integrity (SRI) hash. Replace it with the PostCSS Tailwind plugin for
   production to eliminate this supply-chain dependency.

4. **Dependency auditing:** Run `npm audit` before each deployment and address any
   high or critical findings.

---

## npm Audit Result

*(Run `npm audit` and paste the output here before shipping to production.)*

```
Pending — run: npm audit
```
