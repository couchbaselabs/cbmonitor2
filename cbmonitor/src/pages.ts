// Create all the Scene pages to be used in the app

import { SceneAppPage } from '@grafana/scenes';
import { ROUTES } from './utils/utils.routing';
import { sceneCacheService } from './services/sceneCache';
import { buildServiceTabs } from './services/pageBuilder';

/**
 * Factory functions to create dashboard pages for a provided list of services in a snapshot
 */
export function getDashboardsForServices(services: string[], snapshotId: string): SceneAppPage[] {
    // Check if we already have tabs cached for this snapshot
    if (sceneCacheService.hasTabs(snapshotId)) {
        return sceneCacheService.getTabs(snapshotId)!;
    }

    // Build new tabs using the unified page builder
    const tabs = buildServiceTabs({
        snapshotIds: [snapshotId],
        services,
        mode: 'single',
        routePrefix: ROUTES.CBMonitor
    });

    // Cache the tabs before returning
    sceneCacheService.setTabs(snapshotId, tabs);

    return tabs;
}
