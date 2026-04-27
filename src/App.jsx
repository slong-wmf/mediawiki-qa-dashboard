/**
 * Root dashboard component. Owns the top-level tab state (web / iOS / Android),
 * synced two-ways with the URL hash for deep-linking, bookmarking, and the
 * browser back button — no router library needed for a 3-way switch.
 *
 * The Web tab's data hook (`useDashboardData`) is lifted here so the header
 * can show the last-refreshed timestamp and drive the global Refresh button
 * without WebTab having to duplicate the call. The mobile tabs own their own
 * `useMobileData` calls inside MobileTab so a failure on one platform does
 * not affect the others.
 *
 * Each non-Web tab is mounted lazily on its first visit and then stays
 * mounted (hidden via CSS) so the platform's initial fetch fires only once
 * per session and a tab switch never re-fetches.
 */

import { useState, useEffect } from 'react';
import { useDashboardData } from './hooks/useDashboardData.js';
import { TabBar, TABS } from './components/tabs/TabBar.jsx';
import { WebTab } from './components/tabs/WebTab.jsx';
import { MobileTab } from './components/tabs/MobileTab.jsx';
import { USE_STATIC_DATA } from './services/staticData.js';

/**
 * Format a Date into HH:MM:SS local time.
 */
function formatTime(date) {
  if (!date) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Read the active tab from `window.location.hash`. Falls back to the first
 * tab in TABS when the hash is missing, malformed, or names an unknown tab.
 */
function readTabFromHash() {
  if (typeof window === 'undefined') return TABS[0];
  const h = window.location.hash.replace(/^#\/?/, '');
  return TABS.includes(h) ? h : TABS[0];
}

export default function App() {
  // Web tab data is lifted to App so the header (last-refreshed, Refresh
  // button) can use it without WebTab having to call useDashboardData
  // separately and double-fetch.
  const dashboardData = useDashboardData();
  const { lastRefreshed, loading, refresh } = dashboardData;

  // Active tab kept in sync with `window.location.hash` (e.g. `#/ios`).
  const [activeTab, setActiveTab] = useState(readTabFromHash);

  // Track which non-Web tabs have been visited so we can mount them lazily
  // (avoid burning GitHub API quota for platforms the user never opens) but
  // keep them mounted afterwards so their data hooks don't re-fetch on tab
  // switch. Web is implicitly always-mounted because its data is already
  // fetched at App level for the header.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)));
  }, [activeTab]);

  // Push activeTab → URL hash. Guard against unnecessary writes so we don't
  // trigger our own hashchange listener and create a feedback loop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const desired = `#/${activeTab}`;
    if (window.location.hash !== desired) {
      window.location.hash = `/${activeTab}`;
    }
  }, [activeTab]);

  // Pull URL hash → activeTab so back/forward and manual hash edits work.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHash = () => {
      const next = readTabFromHash();
      setActiveTab((curr) => (curr === next ? curr : next));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshIntervalMin = Math.round(
    (Number(import.meta.env.VITE_REFRESH_INTERVAL_MS) || 3_600_000) / 60_000,
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-gray-950 border-b border-gray-700 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-xl font-bold tracking-tight text-white">
            MediaWiki Testing Dashboard
          </h1>
          <TabBar activeTab={activeTab} onChange={setActiveTab} />
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>
            Last refreshed:{' '}
            <span className="text-gray-200 font-mono">{formatTime(lastRefreshed)}</span>
          </span>
          {!USE_STATIC_DATA && (
            <button
              onClick={refresh}
              disabled={loading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                         text-white text-sm rounded transition-colors"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
      </header>

      {/* ── Snapshot notice (GitHub Pages / Toolforge static build only) ── */}
      {USE_STATIC_DATA && (
        <div className="bg-amber-900/40 border-b border-amber-700/50 px-6 py-2 text-xs text-amber-300 flex items-center gap-2">
          <span>⚡</span>
          <span>
            <strong>Snapshot data</strong> — generated {lastRefreshed ? lastRefreshed.toLocaleString() : '…'}.
            {' '}For live data, run the dashboard locally.
          </span>
        </div>
      )}

      {/* ── Tab panels ──
          Each panel renders into a `role="tabpanel"` wrapper that stays in
          the DOM once mounted; hidden ones get `display:none` via Tailwind's
          `hidden` class so React state and the platform's data hook are
          preserved across tab switches. */}
      <main className="flex-1 p-6">
        <div
          role="tabpanel"
          id="tabpanel-web"
          aria-labelledby="tab-web"
          hidden={activeTab !== 'web'}
          className={activeTab === 'web' ? '' : 'hidden'}
        >
          <WebTab data={dashboardData} />
        </div>

        <div
          role="tabpanel"
          id="tabpanel-ios"
          aria-labelledby="tab-ios"
          hidden={activeTab !== 'ios'}
          className={activeTab === 'ios' ? '' : 'hidden'}
        >
          {visitedTabs.has('ios') && <MobileTab platform="ios" />}
        </div>

        <div
          role="tabpanel"
          id="tabpanel-android"
          aria-labelledby="tab-android"
          hidden={activeTab !== 'android'}
          className={activeTab === 'android' ? '' : 'hidden'}
        >
          {visitedTabs.has('android') && <MobileTab platform="android" />}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-gray-950 border-t border-gray-700 px-6 py-3 text-xs text-gray-500 flex items-center justify-between">
        <span>
          Data sources: Jenkins · doc.wikimedia.org · Phabricator · browser-test-scanner · GitHub Actions / Releases
        </span>
        <span>Refresh interval: {refreshIntervalMin} min</span>
      </footer>

    </div>
  );
}
