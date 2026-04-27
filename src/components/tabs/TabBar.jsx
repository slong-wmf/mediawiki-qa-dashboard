/**
 * Pill-style tab bar shown in the dashboard header. Used to switch the main
 * panel surface between Web (MediaWiki/Wikimedia), iOS, and Android.
 *
 * Internal tab keys (`web`, `ios`, `android`) double as URL hash slugs and
 * snapshot file-name prefixes; the user-facing labels are kept separate so
 * proper-cased presentation does not leak into URLs and file paths.
 */

/**
 * Ordered list of tab keys. The first entry is the default when the URL hash
 * is missing or unrecognised.
 */
export const TABS = ['web', 'ios', 'android'];

/**
 * Display labels for each tab key. Kept separate from the keys so we can use
 * proper casing ("iOS") in the UI without affecting the URL hash.
 */
export const TAB_LABELS = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
};

/**
 * Tailwind classes for the active state of each tab. Slight platform tinting
 * helps the user visually confirm which tab is active without scanning text.
 */
const ACTIVE_CLASSES = {
  web:     'bg-blue-600 text-white border-blue-500',
  ios:     'bg-indigo-600 text-white border-indigo-500',
  android: 'bg-emerald-600 text-white border-emerald-500',
};

const INACTIVE_CLASSES =
  'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 hover:text-white';

/**
 * @param {{ activeTab: string, onChange: (tab: string) => void }} props
 */
export function TabBar({ activeTab, onChange }) {
  return (
    <nav role="tablist" aria-label="Dashboard sections" className="flex items-center gap-1">
      {TABS.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab}`}
            id={`tab-${tab}`}
            onClick={() => onChange(tab)}
            className={`px-3 py-1.5 text-sm font-medium rounded border transition-colors
              ${isActive ? ACTIVE_CLASSES[tab] : INACTIVE_CLASSES}`}
          >
            {TAB_LABELS[tab]}
          </button>
        );
      })}
    </nav>
  );
}
