/**
 * Reusable pulse-skeleton block. Accepts Tailwind class overrides so callers
 * can customise height/width without forking the component.
 */
export function Skeleton({ className = 'h-48 bg-gray-700 rounded' }) {
  return <div className={`animate-pulse ${className}`} />;
}

/**
 * Multi-line skeleton wrapper used by panels while data is loading.
 * Mirrors the previous in-file Skeleton implementations so the visual stays
 * consistent after refactoring.
 */
export function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="h-4 bg-gray-700 rounded w-1/3"></div>
      <div className="h-48 bg-gray-700 rounded"></div>
      <div className="h-3 bg-gray-700 rounded w-2/3"></div>
      <div className="h-3 bg-gray-700 rounded w-1/2"></div>
    </div>
  );
}
