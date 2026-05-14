
import { PLUGIN_BASE_URL } from '../constants';

// Top-level route names (no leading slash)
export const ROUTES = {
  CBMonitor: 'snapshots',
  Compare: 'compare',
  Preferences: 'preferences',
  // Add more top-level routes here as needed
} as const;

// Subpath builders for maintainability and type safety
export const ROUTE_PATHS = {
  // Landing pages
  search: () => `/${ROUTES.CBMonitor}`,
  cbmonitor: () => `/${ROUTES.CBMonitor}`,
  compare: () => `/${ROUTES.Compare}`,
  preferences: () => `/${ROUTES.Preferences}`,

  // Path-based snapshot viewer: /snapshots/<id>
  snapshotView: (snapshotId: string) => `/${ROUTES.CBMonitor}/${encodeURIComponent(snapshotId)}`,

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

/**
 * Extracts the snapshotId from a pathname like `/a/cbmonitor/snapshots/<id>[/...]`.
 * Returns undefined when on the search landing (`/a/cbmonitor/snapshots`) or any
 * non-snapshots route. The returned id is URL-decoded.
 */
export function parseSnapshotIdFromPath(pathname: string): string | undefined {
  const prefix = `${PLUGIN_BASE_URL}/${ROUTES.CBMonitor}`;
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const rest = pathname.slice(prefix.length);
  const segments = rest.split('/').filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }
  return decodeURIComponent(segments[0]);
}
