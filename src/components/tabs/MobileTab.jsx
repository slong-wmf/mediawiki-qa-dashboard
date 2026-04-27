/**
 * Generic mobile-app tab — used by both iOS and Android. Renders the three
 * GitHub-sourced panels for the given platform, owning its own data hook.
 *
 * The hook (`useMobileData`) is colocated inside the tab so each platform
 * fetches independently and a failure on one platform does not affect the
 * others. Tabs stay mounted (hidden via CSS in App.jsx) so the initial
 * fetch happens once per platform on first visit.
 */

import { Panel } from '../shared/Panel.jsx';
import { MobileWorkflowsPanel } from '../mobile/MobileWorkflowsPanel.jsx';
import { MobileReleasesPanel } from '../mobile/MobileReleasesPanel.jsx';
import { MobileTestInventoryPanel } from '../mobile/MobileTestInventoryPanel.jsx';
import { useMobileData } from '../../hooks/useMobileData.js';
import { repoFor } from '../../services/github/repos.js';

/**
 * @param {{ platform: 'ios' | 'android' }} props
 */
export function MobileTab({ platform }) {
  const { workflows, releases, tests, errors, initialLoading } = useMobileData(platform);
  const repo = repoFor(platform);

  return (
    <>
      {/* Repo header — small banner so the user knows which GitHub repo
          backs the data on this tab. */}
      <div className="mb-4 px-4 py-2 rounded border border-gray-700 bg-gray-800/40 text-xs text-gray-400 flex items-center justify-between">
        <span>
          Data source:{' '}
          <a
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-200 font-mono hover:text-blue-400 hover:underline"
          >
            {repo.fullName}
          </a>
        </span>
        <span className="text-gray-500">via GitHub Actions / Releases / repo tree</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title={`${repo.label} — Workflow Health`}
          loading={initialLoading}
          error={errors.workflows}
          source="GitHub Actions"
        >
          <MobileWorkflowsPanel
            data={workflows}
            error={errors.workflows}
            loading={initialLoading}
            platform={platform}
          />
        </Panel>

        <Panel
          title={`${repo.label} — Recent Releases`}
          loading={initialLoading}
          error={errors.releases}
          source="GitHub Releases"
        >
          <MobileReleasesPanel
            data={releases}
            error={errors.releases}
            loading={initialLoading}
            platform={platform}
          />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          title={`${repo.label} — Test Inventory`}
          loading={initialLoading}
          error={errors.tests}
          source="GitHub repo tree"
        >
          <MobileTestInventoryPanel
            data={tests}
            error={errors.tests}
            loading={initialLoading}
            platform={platform}
          />
        </Panel>
      </div>
    </>
  );
}

export default MobileTab;
