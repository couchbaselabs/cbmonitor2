import pluginJson from './plugin.json';

export const PLUGIN_BASE_URL = `/a/${pluginJson.id}`;

export enum ROUTES {
  CBMonitor = 'cbmonitor',
  Showfast = 'showfast',
}

export const DASHBOARD_UIDS = {
  cluster_manager: 'cluster_manager',
  kv_basic: '12b2cb59-bdeb-4015-a7c6-7367a7ff3878'
} as const;

export type DashboardId = keyof typeof DASHBOARD_UIDS;

// Helper function to get UID from dashboard name
export function getDashboardUid(dashboardId: string): string {
  return DASHBOARD_UIDS[dashboardId as DashboardId] || dashboardId;
}

// Helper function to get dashboard display name
export function getDashboardDisplayName(dashboardId: string): string {
  return dashboardId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}