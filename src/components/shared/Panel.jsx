import { PanelSkeleton } from './Skeleton.jsx';
import { ErrorBanner } from './ErrorBanner.jsx';

/**
 * Generic panel wrapper with title bar, optional header action, skeleton
 * loader, and error banner. Children are only rendered once data has loaded
 * and there is no error.
 *
 * @param {{
 *   title: string,
 *   loading?: boolean,
 *   error?: Error|null,
 *   source?: string,
 *   action?: import('react').ReactNode,
 *   children: import('react').ReactNode,
 * }} props
 */
export function Panel({ title, loading, error, source, action, children }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          {title}
        </h2>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <div className="p-4">
        {error && <ErrorBanner source={source} error={error} />}
        {loading ? <PanelSkeleton /> : children}
      </div>
    </div>
  );
}
