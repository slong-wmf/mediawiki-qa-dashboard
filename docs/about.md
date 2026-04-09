# About — MediaWiki QA Dashboard

Technical reference covering the frameworks, libraries, coding methodologies, and testing strategy used in this project.

---

## Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `react` | ^19.2.4 | UI component model and rendering lifecycle |
| `react-dom` | ^19.2.4 | Mounts the React tree into the browser DOM |
| `recharts` | ^3.8.1 | SVG-based charting (pie charts, bar charts) |

**Tailwind CSS** is loaded via the CDN script in `index.html` for development convenience. For production, replace with the PostCSS plugin and a proper build step so unused styles are purged.

---

## Build & Development Tooling

| Package | Version | Purpose |
|---|---|---|
| `vite` | ^8.0.5 | Dev server, HMR, and production bundler |
| `@vitejs/plugin-react` | ^6.0.1 | JSX compilation and React Fast Refresh |

Vite was chosen for its near-instant cold start and Hot Module Replacement, which keeps iteration fast for a component-heavy dashboard. The dev server also hosts three API proxies that forward browser requests to external services, avoiding CORS errors during local development:

| Proxy path | Forwards to |
|---|---|
| `/api/jenkins` | `https://integration.wikimedia.org/ci` |
| `/api/phabricator` | `https://phabricator.wikimedia.org/api` |
| `/api/coverage` | `https://doc.wikimedia.org` |

A production deployment requires a real server-side reverse proxy in place of the Vite proxy.

---

## Testing Framework

| Package | Version | Purpose |
|---|---|---|
| `vitest` | ^4.1.2 | Test runner and assertion library |
| `jsdom` | ^29.0.1 | In-process browser DOM environment |
| `@testing-library/react` | ^16.3.2 | Component rendering and querying |
| `@testing-library/jest-dom` | ^6.9.1 | Semantic DOM matchers (`.toBeInTheDocument()`, etc.) |
| `@testing-library/user-event` | ^14.6.1 | Realistic user interaction simulation |

**Why Vitest?**  
Vitest was chosen over Jest because it shares Vite's configuration and module resolution pipeline. This means the same `vite.config.js` that drives the dev server also drives the test runner — no separate Babel or transformer setup, no mismatches between how modules are resolved in tests versus production, and significantly faster startup due to Vite's native ES module handling.

**Test environment**  
Tests run in `jsdom` (configured in `vite.config.js` under `test.environment`), giving each test file an in-process DOM without launching a real browser. Two global patches are applied in `src/test/setup.js`:

- `ResizeObserver` is stubbed — Recharts requires it but jsdom does not implement it.
- A console filter suppresses React's `act()` warning for intentionally non-awaited state updates in unit tests.

**Mocking strategy**  
- Service modules (`jenkins.js`, `coverage.js`, `phabricator.js`) are mocked with `vi.mock()` in component and hook tests so that network calls never leave the process.
- Recharts chart components are mocked with lightweight stubs in component tests to avoid ResizeObserver and canvas layout issues.
- `vi.useFakeTimers()` is used in the data-hook tests to simulate the auto-refresh interval without waiting real time.

**What the tests cover**

| Area | File | What is tested |
|---|---|---|
| Jenkins service | `src/test/services/jenkins.test.js` | `normaliseStatus`, `extractTestCounts`, `fetchRecentBuilds`, `fetchTrackedJobs` — partial failure, in-progress build filtering, result sorting, view deduplication |
| Coverage service | `src/test/services/coverage.test.js` | `parseRows` (valid HTML, missing elements, edge cases), `fetchCoverageData` (success, HTTP errors, empty page) |
| Phabricator service | `src/test/services/phabricator.test.js` | `statusGroup`, `mapPriority`, `shapeTask`, `fetchRecentBugs` — pagination, MAX_PAGES cap, Conduit error codes |
| Data hook | `src/test/hooks/useDashboardData.test.js` | Initial state, per-source error isolation, error recovery on refresh, manual refresh, auto-refresh interval |
| PassFailPanel | `src/test/components/PassFailPanel.test.jsx` | Loading / error / empty / data states; Jobs and Tests view toggle |
| CoveragePanel | `src/test/components/CoveragePanel.test.jsx` | Loading / error / null / data states; Wikipedia-only filter; null core handling |
| ExecutionTimePanel | `src/test/components/ExecutionTimePanel.test.jsx` | Loading / error / empty / data states; slow-job colour legend |
| BugsPanel | `src/test/components/BugsPanel.test.jsx` | Loading / error / empty / data states; priority sort; status card filter; hasMore indicator |
| Extension data | `src/test/data/activeExtensions.test.js` | Set size, known extensions, alias resolution, case-sensitivity, date format |
| URL validation | `src/test/urls.test.js` | Every URL in every source and documentation file is syntactically valid; service files use HTTPS only; Vite proxy targets are present and correct; no placeholder text in source URLs |

---

## Linting

| Package | Version | Purpose |
|---|---|---|
| `eslint` | ^9.17.0 | Static analysis and code quality |
| `eslint-plugin-react-hooks` | ^5.0.0 | Enforces the Rules of Hooks |
| `eslint-plugin-react-refresh` | ^0.4.16 | Validates Fast Refresh compatibility |
| `globals` | ^15.14.0 | Provides browser and Node global variable sets |

Run with `npm run lint`. No Prettier config is included; ESLint handles code quality and the team relies on editor defaults for formatting.

---

## Coding Methodologies

**Functional components with hooks**  
All UI is built with React functional components. State is managed with `useState`; side effects and subscriptions use `useEffect`; stable callback references use `useCallback`. No class components or legacy lifecycle methods are used.

**Custom hook for data fetching**  
`useDashboardData` (in `src/hooks/`) centralises all network calls, polling, and error state. Components receive pre-shaped data as props rather than fetching directly. This keeps components focused on presentation and makes the data layer independently testable.

**Parallel fetches with per-source error isolation**  
`Promise.allSettled()` is used for the initial data load so that a failure in one source (e.g. Phabricator is down) does not prevent other sources (Jenkins, coverage) from rendering. Each source has its own error state property (`errors.jenkins`, `errors.coverage`, `errors.phabricator`).

**Service layer**  
Each external API has its own module under `src/services/`:

- `jenkins.js` — Fetches build history and test result summaries from the Jenkins JSON API.
- `coverage.js` — Fetches the doc.wikimedia.org coverage index HTML and parses `<meter>` elements for coverage percentages. There is no JSON API for this data; HTML scraping is the only option.
- `phabricator.js` — Calls the Phabricator Conduit API (`maniphest.search`) to retrieve open bug and production error tasks. Tasks are filtered server-side by subtype (`bug`, `error`) so only genuine bug reports are returned, rather than pattern-matching titles.

**Pure transformation functions**  
Data shaping (e.g. `shapeTask`, `normaliseStatus`, `mapPriority`) is written as pure functions with no side effects. This makes them straightforward to unit test in isolation.

**Declarative, utility-first styling**  
All visual styling uses Tailwind CSS utility classes applied directly in JSX. There are no CSS modules or separate stylesheet files beyond the minimal base reset in `src/index.css`.

**Responsive layout**  
The dashboard uses a CSS grid that collapses from three columns (`lg:grid-cols-3`) to a single column on narrow viewports, requiring no JavaScript for layout.

**JSDoc on exported symbols**  
Exported functions and types carry JSDoc comments describing parameters, return types, and any non-obvious behaviour. Inline comments are used only where the logic is not self-evident from the code.

---

## Charting — Recharts

Recharts was chosen because it is built on standard React component composition and SVG, which means charts can be rendered and tested in jsdom without a canvas or WebGL environment. The library provides:

- `PieChart` / `Pie` — used in the Pass/Fail panel for job and test result distribution.
- `BarChart` / `Bar` — used in the Execution Time panel for per-job duration breakdowns (min / avg / max) and in the Coverage panel for extension coverage distribution.
- `ResponsiveContainer` — makes charts fill their parent width; requires `ResizeObserver`, which is stubbed in the test environment.

Custom `Tooltip` and `Cell` components from Recharts are used throughout to apply per-segment colouring (green / amber / red) based on thresholds.

---

## Further Reading

- [Architecture](architecture.md) — data flow diagram and component tree
- [API Setup Guide](api-setup.md) — how to create tokens for each service
- [Security](security.md) — security checklist and rate-limiting notes
