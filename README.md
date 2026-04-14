# MediaWiki QA Dashboard

A static single-page React dashboard that aggregates MediaWiki project quality metrics
from three sources — [Wikimedia Jenkins CI](https://integration.wikimedia.org/ci), the
[doc.wikimedia.org coverage index](https://doc.wikimedia.org/cover-extensions/), and
[Phabricator Maniphest](https://phabricator.wikimedia.org/maniphest/) — and displays
them in real-time panels with automatic polling and manual refresh.

---

- Authored via Claude Code with prompting.

Designed to be run locally via `npm run dev`.

## Prerequisites

- **Node.js 20.19+ or 22.12+** and **npm** (required by Vite 8)
- A Phabricator Conduit API token (optional but recommended — raises the rate-limit ceiling)
- Network access to [`integration.wikimedia.org`](https://integration.wikimedia.org/ci), [`doc.wikimedia.org`](https://doc.wikimedia.org/cover-extensions/), and [`phabricator.wikimedia.org`](https://phabricator.wikimedia.org)

---

## Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd mediawiki-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Copy the example and fill in your token:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` — see the table below for each variable.

4. **Run the unit tests**
   ```bash
   npm run test:run
   ```
   All tests must pass before working on the app. See [Unit Tests](#unit-tests) below
   for the full test reference.

5. **Start the development server**
   ```bash
   npm run dev
   ```
   The app will be available at [http://localhost:5173](http://localhost:5173).
   To run tests automatically before the server starts, use `npm run dev:safe` instead.

6. **Build for production**
   ```bash
   npm run build
   ```
   Output is written to `dist/`. Serve with any static host.

---

## Docker

You can also run the dashboard using Docker.

After cloning the project, just run `docker compose up`.

You can also provide a Phabricator API token either by editing the `.env` file, or by providing it via the CLI:

```bash
VITE_PHABRICATOR_TOKEN=api-xxxxx docker compose up
```

To rebuild the image after dependency changes (e.g. after `git pull` updates
`package-lock.json` or changing the `.env` file):

```bash
docker compose up --build
```

> Please note that local edits trigger hot-reload automatically.

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `VITE_PHABRICATOR_TOKEN` | Phabricator Conduit API token (read-only) | No — but raises rate-limit ceiling |
| `VITE_REFRESH_INTERVAL_MS` | Auto-refresh interval in milliseconds (default: `3600000` = 1 hour) | No |

---

## Unit Tests

Tests are written with [Vitest](https://vitest.dev) and
[@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/).
All test files live under `src/test/`.

### Commands

| Command | What it does |
|---|---|
| `npm run test` | Start Vitest in watch mode — re-runs affected tests on every file save |
| `npm run test:run` | Run the full suite once and exit — use this in CI or before committing |
| `npm run dev:safe` | Run the full suite, then start the dev server only if all tests pass |

### Test coverage

| Area | File | What is tested |
|---|---|---|
| Jenkins service | `src/test/services/jenkins.test.js` | `normaliseStatus`, `extractTestCounts`, `fetchRecentBuilds`, `fetchTrackedJobs` — including partial failure, in-progress build filtering, result sorting, view deduplication, and per-view failure isolation |
| Coverage service | `src/test/services/coverage.test.js` | `parseRows` (valid HTML, missing elements, edge cases), `fetchCoverageData` (success, HTTP errors, empty page) |
| Phabricator service | `src/test/services/phabricator.test.js` | `statusGroup`, `mapPriority`, `isSuspectedBug` (all keywords + partial-word avoidance), `shapeTask`, `fetchRecentBugs` (pagination, MAX_PAGES cap, Conduit error codes) |
| Data hook | `src/test/hooks/useDashboardData.test.js` | Initial state, per-source error isolation, error recovery on refresh, manual refresh, auto-refresh interval |
| PassFailPanel | `src/test/components/PassFailPanel.test.jsx` | Loading, error, empty, and data states; Job/Test view toggle |
| CoveragePanel | `src/test/components/CoveragePanel.test.jsx` | Loading, error, null, and data states; Wikipedia filter toggle; null core |
| ExecutionTimePanel | `src/test/components/ExecutionTimePanel.test.jsx` | Loading, error, empty, and data states; slow-job colour legend |
| BugsPanel | `src/test/components/BugsPanel.test.jsx` | Loading, error, empty, and data states; priority sort; suspected-bug filter; status card filter; hasMore indicator |
| Extension data | `src/test/data/activeExtensions.test.js` | Set size, known extensions, alias resolution, case-sensitivity, date format |
| URL validation | `src/test/urls.test.js` | Every URL in every source and documentation file is syntactically valid; service files use HTTPS only; Vite proxy targets are present and correct; no placeholder text in source URLs |

### How the URL validation test works

`src/test/urls.test.js` reads each source and documentation file from disk,
extracts all `http://` and `https://` URLs using a regex, and calls `new URL()`
on each one — which throws if the URL is malformed. Template-literal expressions
(`${...}`) are skipped automatically. The test runs one `it.each` assertion per
file so a failure tells you exactly which file and URL is broken.

---

## Known Limitations

- **Coverage parsing** reads HTML directly from the [doc.wikimedia.org coverage index](https://doc.wikimedia.org/cover-extensions/)
  rather than a dedicated API. If Wikimedia changes the structure of those pages the
  Coverage panel will silently return empty or incomplete data.
- **Phabricator bug detection** scans task *titles only* for bug-signal keywords. Tasks
  where the bug is described in a comment but not the title will not be flagged.
- The Tailwind CSS CDN script ([cdn.tailwindcss.com](https://cdn.tailwindcss.com)) is used for development
  convenience. For production, replace it with the PostCSS plugin and a proper build step.
- The Vite proxy (`vite.config.js`) handles CORS for [Phabricator](https://phabricator.wikimedia.org), [Jenkins](https://integration.wikimedia.org/ci), and the
  coverage index during development. A production deployment needs a real server-side
  reverse proxy in its place.

---

## Further Reading

- [About](docs/about.md) — dependencies, frameworks, coding methodologies, and testing strategy
- [API Setup Guide](docs/api-setup.md) — how to create tokens for each service
- [Architecture](docs/architecture.md) — data flow diagram and component tree
- [Security](docs/security.md) — security checklist and rate-limiting notes
