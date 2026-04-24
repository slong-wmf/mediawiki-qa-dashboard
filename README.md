# MediaWiki QA Dashboard

A static single-page React dashboard that aggregates MediaWiki project quality metrics
from four sources — [Wikimedia Jenkins CI](https://integration.wikimedia.org/ci), the
[doc.wikimedia.org coverage index](https://doc.wikimedia.org/cover-extensions/),
[Phabricator Maniphest](https://phabricator.wikimedia.org/maniphest/), and the
[browser-test-scanner inventory](https://www.mediawiki.org/wiki/Wikimedia_Quality_Services/Automated_tests_available)
published on mediawiki.org — and displays them in real-time panels with automatic
polling and manual refresh.

The **Pass / Fail Rates** panel includes a *Failed jobs* drill-down: click the button
below the pie chart to expand a per-job breakdown of failures in the past 24 hours —
failure count, hour-by-hour distribution, a direct link to the most recent failed
build, and a tail of that build's Jenkins console log. The console tail is lazy-fetched
from Jenkins on expand and is not available in the static (snapshot) build.

The **Automated Tests Inventory** panel lists every MediaWiki extension repo that
publishes browser tests, showing framework (WDIO / Cypress), framework version,
`wdio-mediawiki` version, gated-selenium status, a 7-day daily-job pass/fail tally,
and the individual test names. Expand a row to see every test; tests that run in the
repo's daily Jenkins job are tagged `daily`. The panel honours the shared Steward
filter.

---

- Authored via Claude Code with prompting.

Designed to be run locally via `npm run dev`.

## Prerequisites

- **Node.js 20.19+ or 22.12+** and **npm** (required by Vite 8)
- A Phabricator Conduit API token (optional but recommended — raises the rate-limit ceiling)
- Network access to [`integration.wikimedia.org`](https://integration.wikimedia.org/ci), [`doc.wikimedia.org`](https://doc.wikimedia.org/cover-extensions/), [`phabricator.wikimedia.org`](https://phabricator.wikimedia.org), and [`www.mediawiki.org`](https://www.mediawiki.org)

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
| Automated tests service | `src/test/services/automatedTests.test.js` | `normaliseFramework`, `shortRepoName`, `normaliseEnvelope` (array- and object-of-repos shapes, missing fields, per-test `daily` flag preservation, malformed-row resilience) |
| Data hook | `src/test/hooks/useDashboardData.test.js` | Initial state, per-source error isolation, error recovery on refresh, manual refresh, auto-refresh interval |
| PassFailPanel | `src/test/components/PassFailPanel.test.jsx` | Loading, error, empty, and data states; Job/Test view toggle; Failed jobs drill-down toggle |
| FailedJobsDetails | `src/test/components/FailedJobsDetails.test.jsx` | 24h grouping, hourly breakdown, console-tail lazy-load (success / error / static-mode) |
| CoveragePanel | `src/test/components/CoveragePanel.test.jsx` | Loading, error, null, and data states; Wikipedia filter toggle; null core |
| ExecutionTimePanel | `src/test/components/ExecutionTimePanel.test.jsx` | Loading, error, empty, and data states; slow-job colour legend |
| BugsPanel | `src/test/components/BugsPanel.test.jsx` | Loading, error, empty, and data states; priority sort; suspected-bug filter; status card filter; hasMore indicator |
| AutomatedTestsPanel | `src/test/components/AutomatedTestsPanel.test.jsx` | Loading, error, empty, and data states; framework toggle; stats cards; expandable rows; steward filter (`filterReposBySteward`) |
| AutomatedTestsPanel (integration) | `src/test/integration/AutomatedTestsPanel.integration.test.jsx` | Hook-contract rendering for loading / error / empty / populated states; end-to-end wiring with the shared Steward filter |
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
- **Failed-jobs console logs** are fetched live from Jenkins on expand. In the static
  (snapshot) build mode (`VITE_STATIC_DATA=true`) they are not available, and the
  drill-down falls back to an "open build in Jenkins" link instead.
- The Tailwind CSS CDN script ([cdn.tailwindcss.com](https://cdn.tailwindcss.com)) is used for development
  convenience. For production, replace it with the PostCSS plugin and a proper build step.
- The Vite proxy (`vite.config.js`) handles CORS for [Phabricator](https://phabricator.wikimedia.org), [Jenkins](https://integration.wikimedia.org/ci), and the
  coverage index during development. A production deployment needs a real server-side
  reverse proxy in its place.

---

## Deployment (Wikimedia Toolforge)

Production hosting lives on [Wikimedia Toolforge](https://wikitech.wikimedia.org/wiki/Help:Toolforge)
as the tool **`mw-qa-dashboard`**, served at https://mw-qa-dashboard.toolforge.org/.
GitHub Pages remains live in parallel during cutover and will be retired in a follow-up PR.

**Architecture**:
- Toolforge's [Build Service](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Build_Service)
  clones this repo, runs Cloud Native Buildpacks (Heroku Node.js buildpack) to install
  dependencies and run `npm run build`, then bakes the result into a container image.
- The webservice runs `node server.js` (per `Procfile`), which serves the Vite output
  from `dist/` and JSON snapshots from `$HOME/snapshot-data/`.
- A scheduled [Toolforge Job](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Jobs_framework)
  re-runs `scripts/fetch-snapshot-data.js` every 6 hours to refresh snapshots
  without rebuilding the app.

**One-time setup** (run from a workstation with SSH access to Toolforge):

```bash
ssh <shell-user>@login.toolforge.org
become mw-qa-dashboard

# Secrets and snapshot paths
toolforge envvars create PHABRICATOR_TOKEN     # paste token when prompted
toolforge envvars create SNAPSHOT_OUTPUT_DIR /data/project/mw-qa-dashboard/snapshot-data
toolforge envvars create SNAPSHOT_DIR        /data/project/mw-qa-dashboard/snapshot-data

# Build the image from GitHub. The build script bakes VITE_STATIC_DATA=true
# into the bundle so the frontend reads from /data/*.json at runtime.
toolforge build start https://github.com/slong-wmf/mediawiki-qa-dashboard --ref main

# Seed snapshot data so the site has something to serve on first hit.
# --mount=all  exposes the tool's NFS $HOME inside the job container so
#              SNAPSHOT_OUTPUT_DIR can actually be written.
# --filelog    writes stdout/stderr to ~/snapshot-seed.{out,err} for debugging.
mkdir -p $HOME/snapshot-data
toolforge jobs run snapshot-seed \
  --command "node scripts/fetch-snapshot-data.js" \
  --image tool-mw-qa-dashboard/tool-mw-qa-dashboard:latest \
  --mount=all \
  --filelog \
  --wait

# Schedule the recurring refresh (every 6 h) — same flags as the seed job.
toolforge jobs run snapshot-refresh \
  --command "node scripts/fetch-snapshot-data.js" \
  --image tool-mw-qa-dashboard/tool-mw-qa-dashboard:latest \
  --mount=all \
  --filelog \
  --schedule "0 */6 * * *" \
  --emails onfailure

# Start the webservice. --mount=all is required so server.js can read
# snapshots from the NFS-mounted SNAPSHOT_DIR.
toolforge webservice buildservice start --mount=all
```

**Releasing a new version** (after merging to `main`):

```bash
toolforge build start https://github.com/slong-wmf/mediawiki-qa-dashboard --ref main
toolforge webservice buildservice restart --mount=all
```

**Operational commands**:

| Command | Purpose |
|---|---|
| `toolforge build logs` | View the most recent build output |
| `toolforge webservice logs` | Tail the running webservice's stdout/stderr |
| `toolforge webservice status` | Show whether the webservice is running |
| `toolforge jobs list` | List scheduled / running jobs |
| `toolforge jobs logs snapshot-refresh` | Inspect the last snapshot-refresh run |
| `toolforge envvars list` | Show configured secrets/env (values redacted) |

The server reads `process.env.PORT` (Toolforge sets `8000` on Kubernetes), `DIST_DIR`
(default `./dist`), and `SNAPSHOT_DIR` (default `./snapshot-data`). Run locally with
`npm run build && npm start` to smoke-test the production server before deploying.

---

## Further Reading

- [About](docs/about.md) — dependencies, frameworks, coding methodologies, and testing strategy
- [API Setup Guide](docs/api-setup.md) — how to create tokens for each service
- [Architecture](docs/architecture.md) — data flow diagram and component tree
- [Security](docs/security.md) — security checklist and rate-limiting notes
