
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
  cbmonitor: () => `/${ROUTES.CBMonitor}`,
  compare: () => `/${ROUTES.Compare}`,
  showfast: () => `/${ROUTES.Showfast}`,
  snapshot: (snapshotId: string) => `/${ROUTES.CBMonitor}?snapshot=${encodeURIComponent(snapshotId)}`,
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
