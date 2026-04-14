# Architecture

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  External APIs                                                        │
│                                                                       │
│  [Jenkins CI]            [Coverage Index]      [Phabricator API]     │
│  integration.wikimedia.org  doc.wikimedia.org  phabricator.wmo       │
│  (17 tracked jobs)          /cover/ + /cover-extensions/             │
└──────────┬───────────────────────┬──────────────────┬────────────────┘
           │  (via Vite proxy —    │  (via Vite proxy │  (via Vite proxy —
           │   no CORS headers)    │   no CORS headers)   CORS blocked)
           ▼                       ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  src/services/                                                        │
│                                                                       │
│  [jenkins.js]             [coverage.js]        [phabricator.js]      │
│  fetchRecentBuilds()      fetchCoverageData()  fetchRecentBugs()     │
│  → build[]                → { core,            → { tasks[],         │
│                               extensions[] }      totalFetched,      │
│                                                    hasMore,          │
│                                                    cutoffDate }      │
└──────────┬───────────────────────┬──────────────────┬────────────────┘
           │                       │                  │
           └───────────────────────┼──────────────────┘
                                   ▼
                   ┌───────────────────────────────┐
                   │  src/hooks/useDashboardData.js │
                   │                               │
                   │  Promise.allSettled([          │
                   │    fetchRecentBuilds(),        │
                   │    fetchCoverageData(),        │
                   │    fetchRecentBugs()           │
                   │  ])                           │
                   │                               │
                   │  State: builds[], coverage{}, │
                   │  bugs{}, loading, errors{},   │
                   │  lastRefreshed                │
                   │                               │
                   │  setInterval(REFRESH_MS)      │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                         ┌─────────────────┐
                         │  src/App.jsx    │
                         │  (layout shell) │
                         └──┬──┬────┬───┬──┘
                            │  │    │   │
          ┌─────────────────┘  │    │   └──────────────────┐
          ▼                    ▼    ▼                        ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐ ┌────────────────┐
│ PassFailPanel    │ │ CoveragePanel    │ │ ExecutionTimePanel   │ │ BugsPanel      │
│                  │ │                  │ │                      │ │                │
│ Props: builds[]  │ │ Props: coverage{}│ │ Props: builds[]      │ │ Props: bugs{}  │
│                  │ │                  │ │                      │ │                │
│ Recharts         │ │ Recharts         │ │ Recharts BarChart    │ │ Task table     │
│ PieChart         │ │ BarChart         │ │ (avg job duration,   │ │ (full-width    │
│ + builds table   │ │ (top/bottom 15   │ │  top 15 slowest)     │ │  row, past 7   │
│                  │ │  by coverage %)  │ │                      │ │  days)         │
└──────────────────┘ └──────────────────┘ └──────────────────────┘ └────────────────┘
```

---

## Component Tree

```
App (owns all state via useDashboardData)
├── <header>  — title, last-refreshed timestamp, Refresh button
├── <main>
│   ├── Panel (wrapper: title bar, skeleton, error banner)
│   │   └── PassFailPanel
│   │       ├── Tab toggle: "Job results" vs "Test results"
│   │       ├── Recharts PieChart (passed / failed / other)
│   │       ├── Failed-jobs drill-down toggle → FailedJobsDetails
│   │       │     ├── One card per failed job (past 24h)
│   │       │     ├── Hourly failure breakdown (24 hour-slot strip)
│   │       │     ├── Link to most recent failed build
│   │       │     └── Lazy-loaded Jenkins consoleText tail
│   │       └── <table> (10 most recent builds, clickable rows → Jenkins)
│   ├── Panel
│   │   └── CoveragePanel
│   │       ├── Wikipedia-only filter toggle
│   │       ├── mediawiki-core headline coverage %
│   │       ├── Recharts BarChart (top 15 / lowest 15 extensions)
│   │       └── Stat buckets: ≥80% · 60–79% · <60% · 0%
│   ├── Panel
│   │   └── ExecutionTimePanel
│   │       ├── Recharts BarChart (avg total runtime, top 15 slowest)
│   │       └── Colour thresholds: green <2 min · amber 2–5 min · red ≥5 min
│   └── Panel (full-width row)
│       └── BugsPanel
│           ├── Status group tabs: open · in-progress · stalled · needs-triage · other
│           ├── "Suspected bugs" filter (title keyword matching)
│           └── <table> (T#, title, status, priority, last updated → Phabricator)
└── <footer>  — data sources label, refresh interval
```

---

## Polling Mechanism

`useDashboardData` sets up a `setInterval` on mount using the value of
`VITE_REFRESH_INTERVAL_MS` (default: 3,600,000 ms = 1 hour). On each tick, all
three fetch functions are called in parallel via `Promise.allSettled`. Errors from
individual sources are stored per-source so one failing API does not blank the
other panels. A manual `refresh()` function is also exported for the Refresh button.

The interval is cleaned up in the `useEffect` return function to prevent memory leaks
when the component unmounts.

---

## Vite Proxy and CORS

At development time, the Vite dev server proxies three path prefixes to their
respective upstream services. All three are routed through the proxy because none
of the upstream services send CORS headers that permit browser requests.

| Proxy path | Target | Reason |
|---|---|---|
| `/api/jenkins/*` | `https://integration.wikimedia.org/ci` | No CORS headers on Jenkins responses |
| `/api/coverage/*` | `https://doc.wikimedia.org` | No CORS headers on coverage index pages |
| `/api/phabricator/*` | `https://phabricator.wikimedia.org/api` | No CORS headers; Conduit API is server-only |

For production deployments, replace the Vite proxy with a server-side reverse proxy
(e.g. Nginx, a Cloudflare Worker, or a Node.js edge function) that forwards requests
to the upstream services. No API secrets need to be injected server-side for Jenkins
or coverage — only the optional Phabricator token.

---

## Lazy-loaded Failed Jobs drill-down

`FailedJobsDetails` (inside the Pass/Fail Rates panel) surfaces per-job detail for
builds that failed in the last 24 hours. Data flow:

1. The panel filters the existing `builds[]` array for `status === 'failed'` within
   the 24h window and groups by `job`. No new top-level fetch is triggered.
2. For each group's most recent failed build, the card lazy-calls
   `fetchBuildConsoleTail(build_url)` from `src/services/jenkins.js`, which hits
   `/api/jenkins/job/<slug>/<n>/consoleText` via the proxy and returns the last ~40
   non-empty lines.
3. Results are cached at module scope keyed by `build_url`, so toggling the drill-down
   closed and open again does not re-fetch.
4. In static snapshot mode (`VITE_STATIC_DATA=true`), `fetchBuildConsoleTail` returns
   `null` without calling `fetch`; the UI renders a link back to Jenkins instead.
