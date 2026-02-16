import { EmbeddedScene } from '@grafana/scenes';
import { systemMetricsDashboard } from '../dashboards/system';
import { clusterManagerMetricsDashboard } from '../dashboards/clusterManager';
import { kvMetricsDashboard } from '../dashboards/kv';
import { indexMetricsDashboard } from '../dashboards/index';
import { queryMetricsDashboard } from '../dashboards/query';
import { ftsMetricsDashboard } from '../dashboards/fts';
import { xdcrMetricsDashboard } from '../dashboards/xdcr';
import { sgwMetricsDashboard } from '../dashboards/sgw';
import { eventingMetricsDashboard } from '../dashboards/eventing';
import { analyticsMetricsDashboard } from '../dashboards/analytics';

/**
 * Configuration for a Couchbase service with all metadata needed for UI rendering
 */
export interface ServiceConfig {
    /** Canonical service key (lowercase, no spaces) */
    key: string;
    /** Display title for UI */
    title: string;
    /** URL segment for routing */
    segment: string;
    /** Alternative names/aliases for this service */
    aliases: string[];
    /** Dashboard builder function */
    dashboardBuilder: (snapshotId: string) => EmbeddedScene;
    /** Always include this service even if not in snapshot */
    alwaysInclude?: boolean;
}

/**
 * Canonical service configurations in display order.
 * This is the single source of truth for all service metadata.
 */
export const SERVICE_CONFIGS: ServiceConfig[] = [
    {
        key: 'system',
        title: 'System Metrics',
        segment: '',
        aliases: [],
        dashboardBuilder: systemMetricsDashboard,
        alwaysInclude: true,
    },
    {
        key: 'kv',
        title: 'KV Metrics',
        segment: 'kv',
        aliases: [],
        dashboardBuilder: kvMetricsDashboard,
    },
    {
        key: 'index',
        title: 'Index Metrics',
        segment: 'index',
        aliases: [],
        dashboardBuilder: indexMetricsDashboard,
    },
    {
        key: 'query',
        title: 'Query Engine Metrics',
        segment: 'query',
        aliases: ['n1ql'],
        dashboardBuilder: queryMetricsDashboard,
    },
    {
        key: 'fts',
        title: 'FTS Metrics',
        segment: 'fts',
        aliases: [],
        dashboardBuilder: ftsMetricsDashboard,
    },
    {
        key: 'eventing',
        title: 'Eventing Metrics',
        segment: 'eventing',
        aliases: [],
        dashboardBuilder: eventingMetricsDashboard,
    },
    {
        key: 'sgw',
        title: 'Sync Gateway Metrics',
        segment: 'sgw',
        aliases: ['sync-gateway'],
        dashboardBuilder: sgwMetricsDashboard,
    },
    {
        key: 'xdcr',
        title: 'XDCR Metrics',
        segment: 'xdcr',
        aliases: [],
        dashboardBuilder: xdcrMetricsDashboard,
    },
    {
        key: 'analytics',
        title: 'Analytics Metrics',
        segment: 'analytics',
        aliases: ['cbas'],
        dashboardBuilder: analyticsMetricsDashboard,
    },
    {
        key: 'cluster_manager',
        title: 'Cluster Manager Metrics',
        segment: 'cluster-manager',
        aliases: [],
        dashboardBuilder: clusterManagerMetricsDashboard,
        alwaysInclude: true,
    },
];

/**
 * Normalize a service name to its canonical form.
 * Handles aliases and case-insensitive matching.
 *
 * @param service - Service name to normalize
 * @returns Canonical service key, or original if not found
 *
 * @example
 * normalizeServiceName('n1ql') // returns 'query'
 * normalizeServiceName('SYNC-GATEWAY') // returns 'sgw'
 * normalizeServiceName('KV') // returns 'kv'
 */
export function normalizeServiceName(service: string): string {
    const normalized = service.toLowerCase().trim();

    // Check if it's already a canonical key
    const directMatch = SERVICE_CONFIGS.find(c => c.key === normalized);
    if (directMatch) {
        return directMatch.key;
    }

    // Check aliases
    const aliasMatch = SERVICE_CONFIGS.find(c =>
        c.aliases.some(alias => alias.toLowerCase() === normalized)
    );

    return aliasMatch?.key ?? normalized;
}

/**
 * Get service configuration by key.
 *
 * @param serviceKey - Canonical service key
 * @returns Service configuration or undefined if not found
 */
export function getServiceConfig(serviceKey: string): ServiceConfig | undefined {
    return SERVICE_CONFIGS.find(c => c.key === serviceKey);
}

/**
 * Get all service configurations for a list of service names.
 * Normalizes names and filters to available configs.
 *
 * @param services - Array of service names (may include aliases)
 * @returns Array of service configurations in canonical order
 */
export function getServiceConfigs(services: string[]): ServiceConfig[] {
    const normalizedServices = new Set(services.map(s => normalizeServiceName(s)));

    return SERVICE_CONFIGS.filter(config =>
        config.alwaysInclude || normalizedServices.has(config.key)
    );
}

/**
 * Find common services across multiple service lists.
 * Useful for comparison views where only common services should be shown.
 *
 * @param serviceLists - Array of service arrays (one per snapshot)
 * @returns Array of canonical service keys that exist in all lists
 *
 * @example
 * const common = findCommonServices([
 *   ['kv', 'query', 'index'],
 *   ['kv', 'n1ql', 'fts'],   // n1ql is alias for query
 *   ['kv', 'query']
 * ]);
 * // Returns: ['system', 'kv', 'query', 'cluster_manager']
 * // (system and cluster_manager are always included)
 */
export function findCommonServices(serviceLists: string[][]): string[] {
    if (serviceLists.length === 0) {
        return [];
    }

    // Normalize all service names in each list
    const normalizedSets = serviceLists.map(list =>
        new Set(list.map(s => normalizeServiceName(s)))
    );

    // Find services that exist in all sets
    const commonKeys = SERVICE_CONFIGS
        .filter(config => {
            if (config.alwaysInclude) {
                return true;
            }
            return normalizedSets.every(set => set.has(config.key));
        })
        .map(config => config.key);

    return commonKeys;
}

/**
 * Get ordered service keys based on canonical order.
 * Filters input services and returns them in the standard display order.
 *
 * @param services - Array of service names (normalized or not)
 * @returns Array of canonical service keys in display order
 */
export function getServicesInOrder(services: string[]): string[] {
    const configs = getServiceConfigs(services);
    return configs.map(c => c.key);
}
