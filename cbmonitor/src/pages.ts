// Create all the Scene pages to be used in the app

import { EmbeddedScene, SceneAppPage } from '@grafana/scenes';
import { prefixRoute } from './utils/utils.routing';
import { ROUTES } from './constants';
import { systemMetricsDashboard } from 'dashboards/system';
import { clusterManagerMetricsDashboard } from 'dashboards/clusterManager';
import { kvMetricsDashboard } from 'dashboards/kv';
import { indexMetricsDashboard } from 'dashboards/index';
import { queryMetricsDashboard } from 'dashboards/query';
import { ftsMetricsDashboard } from 'dashboards/fts';
import { xdcrMetricsDashboard} from 'dashboards/xdcr';
import { sgwMetricsDashboard } from 'dashboards/sgw';
import { eventingMetricsDashboard } from 'dashboards/eventing';

/**
 * Factory functions to create dashboard pages for a provided list of services in a snapshot
 */

export function getDashboardsForServices(services: string[], snapshotId: string): SceneAppPage[] {
    // Always include system metrics, make it the first tab
    const dashboards: SceneAppPage[] = [
        getSystemMetricsPage(snapshotId)
    ];

    //Conditionally add other dashboards based on the services listed. 
    // Would prefer to have a predictable order for services irregardless
    // of how they are listed in the snapshot.
    if (services.map(s => s.toLowerCase()).includes('kv')) {
        dashboards.push(getKvMetricsPage(snapshotId));
    }

    if (services.map(s => s.toLowerCase()).includes('index')) {
        dashboards.push(getIndexMetricsPage(snapshotId));
    }

    if (services.map(s => s.toLowerCase()).includes('query')) {
        dashboards.push(getQueryMetricsPage(snapshotId));
    }

    if (services.map(s => s.toLowerCase()).includes('fts')) {
        dashboards.push(getFtsMetricsPage(snapshotId));
    }

    if (services.map(s => s.toLowerCase()).includes('eventing')) {
        dashboards.push(getEventingMetricsPage(snapshotId));
    }

    if (services.map(s => s.toLowerCase()).includes('sgw')) {
        dashboards.push(getSGWMetricsPage(snapshotId));
    }

    if (services.map(s => s.toLowerCase()).includes('xdcr')) {
        dashboards.push(getXDCRMetricsPage(snapshotId));
    }

    // Add cluster manager metrics, make it the last tab
    dashboards.push(getClusterManagerMetricsPage(snapshotId));

    return dashboards;
}

function getMetricsDashboardPage(dashboardComponent: (snapshotId: string) => EmbeddedScene, dashboardTitle: string, snapshotId: string, dashboardRoutePath: string): SceneAppPage {
    return new SceneAppPage({
        title: dashboardTitle,
        url: prefixRoute(`${ROUTES.CBMonitor}/${dashboardRoutePath}`),
        routePath: `/${dashboardRoutePath}`,
        getScene: () => dashboardComponent(snapshotId),
    });
}

function getSystemMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(systemMetricsDashboard, 'System Metrics', snapshotId, '');
}

function getKvMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(kvMetricsDashboard, 'KV Metrics', snapshotId, 'kv');
}

function getIndexMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(indexMetricsDashboard, 'Index Metrics', snapshotId, 'index');
}

function getQueryMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(queryMetricsDashboard, 'Query Engine Metrics', snapshotId, 'query');
}

function getFtsMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(ftsMetricsDashboard, 'FTS Metrics', snapshotId, 'fts');
}

function getClusterManagerMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(clusterManagerMetricsDashboard, 'Cluster Manager Metrics', snapshotId, 'cluster-manager');
}

function getEventingMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(eventingMetricsDashboard, 'Eventing Metrics', snapshotId, 'eventing');
}

function getSGWMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(sgwMetricsDashboard, 'Sync Gateway Metrics', snapshotId, 'sgw');
}

function getXDCRMetricsPage(snapshotId: string): SceneAppPage {
    return getMetricsDashboardPage(xdcrMetricsDashboard, 'XDCR Metrics', snapshotId, 'xdcr');
}