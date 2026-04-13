# Integration Tests

## Purpose

Contract integration tests that verify each dashboard panel renders without
crashing for every data state the `useDashboardData` hook can produce —
including initial state, successful fetches, service rejections, and
malformed/unexpected data shapes.

## Motivation

The existing unit tests tested the hook and components in isolation. The hook
tests asserted the shape of state values, and the component tests rendered
with hand-crafted props. Neither caught mismatches between the two — for
example, the hook producing `[]` while the component expected
`null | { tasks: Array }`. That mismatch caused a production blank-screen
bug (BugsPanel crashed the entire React tree with no error boundary).

These integration tests bridge that gap by rendering each real component with
every value the hook can actually produce.

## Technologies

| Tool | Version | Role |
|------|---------|------|
| [Vitest](https://vitest.dev/) | 4.1.x | Test runner and assertion library. Provides `describe`, `it`, `expect`, `vi.mock`, `vi.fn`. |
| [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/) | 16.x | Renders React components in a jsdom environment. Provides `render`, `screen`. |
| [@testing-library/jest-dom](https://github.com/testing-library/jest-dom) | 6.x | Custom DOM matchers like `.toBeInTheDocument()`, `.toHaveTextContent()`. |
| [jsdom](https://github.com/jsdom/jsdom) | 29.x | Headless browser environment used by Vitest (configured in `vite.config.js`). |

**Recharts mocking** — Chart components (PieChart, BarChart, etc.) are mocked
to simple `<div>` wrappers in each test file to avoid canvas/SVG rendering
issues in jsdom. The mock must be inlined in each file because `vi.mock()`
factories are hoisted above imports and cannot reference external variables.

## How to Run

```bash
# Run only integration tests
npx vitest run src/test/integration/

# Run in watch mode during development
npx vitest src/test/integration/

# Run a single panel's tests
npx vitest run src/test/integration/BugsPanel.integration.test.jsx

# Run all tests (unit + integration)
npm test          # watch mode
npm run test:run  # single run (CI)
```

## File Structure

```
src/test/integration/
├── README.md                                      # this file
├── helpers.jsx                                    # shared mock data factories
├── BugsPanel.integration.test.jsx                 # Phabricator bugs panel
├── TrainBlockersPanel.integration.test.jsx        # Train blockers panel
├── PassFailPanel.integration.test.jsx             # Jenkins pass/fail panel
├── ExecutionTimePanel.integration.test.jsx        # Jenkins execution time panel
└── CoveragePanel.integration.test.jsx             # Code coverage panel
```

### helpers.jsx

Shared mock data factories that produce canonical "valid" data shapes matching
the contracts between `useDashboardData` and each panel component:

- `makeValidBuild(overrides)` — Jenkins build record
- `makeValidTask(overrides)` — Phabricator task
- `makeValidBugs(tasks, overrides)` — Phabricator bugs envelope
- `makeValidCoverage(overrides)` — Coverage data object
- `makeValidBlocker(overrides)` — Train blocker task
- `makeValidTrainBlockers(blockers, overrides)` — Train blockers envelope
- `expectNoCrash(renderFn)` — Asserts a render callback does not throw

## Test Organisation

Each test file is organized into four `describe` blocks:

| Block | What it tests |
|-------|---------------|
| **hook initial state** | The exact `useState(...)` default value before any fetch resolves. |
| **successful fetch** | Well-formed data from the service layer. |
| **service rejection** | `null` data + an Error prop (the `Promise.allSettled` rejection path). |
| **malformed data — no crash** | `null`, `undefined`, `[]`, `{}`, and missing nested fields. |

The "malformed data" block is the most important — it catches the exact class
of bug that caused the original blank-screen incident.

## Adding Tests for New Panels

When adding a new panel to the dashboard:

1. Identify its props and the corresponding `useState` initial values in
   `src/hooks/useDashboardData.js`
2. Create `src/test/integration/NewPanel.integration.test.jsx`
3. Add factories to `helpers.jsx` if the panel uses a new data shape
4. Cover all four state categories: initial, success, rejection, malformed
5. If the panel uses Recharts, add an inline `vi.mock('recharts', () => ({...}))`
   at the top of the test file (copy the pattern from an existing test)
