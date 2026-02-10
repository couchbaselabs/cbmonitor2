
import { PLUGIN_BASE_URL } from '../constants';

// Top-level route names (no leading slash)
export const ROUTES = {
  CBMonitor: 'cbmonitor',
  Compare: 'compare',
  Showfast: 'showfast',
  // Add more top-level routes here as needed
} as const;

// Subpath builders for maintainability and type safety
export const ROUTE_PATHS = {
  // Landing pages
  search: () => `/${ROUTES.CBMonitor}`,
  cbmonitor: () => `/${ROUTES.CBMonitor}`,
  compare: () => `/${ROUTES.Compare}`,
  showfast: () => `/${ROUTES.Showfast}`,

  // Snapshot viewing with query parameter (for backward compatibility)
  snapshotView: (snapshotId: string) => `/${ROUTES.CBMonitor}?snapshotId=${encodeURIComponent(snapshotId)}`,

  // Comparison with multiple snapshots
  compareSnapshots: (snapshotIds: string[]) => {
    const query = snapshotIds.map(id => `snapshot=${encodeURIComponent(id)}`).join('&');
    return `/${ROUTES.Compare}?${query}`;
  },
};

/**
 * Prefixes a route with the plugin's base URL.
 * Accepts a route string (no leading slash) or a full path (with leading slash).
 *
 * @param route - Route string or path (e.g., 'cbmonitor', '/cbmonitor?snapshot=123')
 * @returns Full route prefixed with plugin base URL
 */
export function prefixRoute(route: string): string {
  if (route.startsWith('/')) {
    return `${PLUGIN_BASE_URL}${route}`;
  }
  return `${PLUGIN_BASE_URL}/${route}`;
}
