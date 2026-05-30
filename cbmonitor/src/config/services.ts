import type { ServiceBuilder } from '../dashboards/types';
import { systemBuilder } from '../dashboards/system';
import { clusterManagerBuilder } from '../dashboards/clusterManager';
import { eventingBuilder } from '../dashboards/eventing';
import { xdcrBuilder } from '../dashboards/xdcr';
import { queryBuilder } from '../dashboards/query';
import { ftsBuilder } from '../dashboards/fts';
import { analyticsBuilder } from '../dashboards/analytics';
import { kvBuilder } from '../dashboards/kv';
import { indexBuilder } from '../dashboards/index';
import { sgwBuilder } from '../dashboards/sgw';

/**
 * Configuration for a Couchbase service.
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
    /** Panel emitter; consumed by the scene driver in `pageBuilder.ts`. */
    builder: ServiceBuilder;
    /**
     * Prometheus metric used to discover the set of `instance` values
     * — drives the per-instance / fallback split in single-mode and
     * the per-instance rendering pass in overlap-mode.
     */
    instanceMetric: string;
    /**
     * Optional overlap-mode override. If unset, `instanceMetric` is
     * used for both modes. Distinct values are usually only needed
     * when a snapshot-scoped service metric isn't reliably present
     * in proxy-Prometheus's broader scope.
     */
    overlapInstanceMetric?: string;
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
        builder: systemBuilder,
        instanceMetric: 'sys_disk_read_bytes',
        overlapInstanceMetric: 'sys_cpu_utilization_rate',
    },
    {
        key: 'kv',
        title: 'KV Metrics',
        segment: 'kv',
        aliases: [],
        builder: kvBuilder,
        instanceMetric: 'kv_ops',
    },
    {
        key: 'index',
        title: 'Index Metrics',
        segment: 'index',
        aliases: [],
        builder: indexBuilder,
        instanceMetric: 'index_avg_scan_latency',
        overlapInstanceMetric: 'index_total_data_size',
    },
    {
        key: 'query',
        title: 'Query Engine Metrics',
        segment: 'query',
        aliases: ['n1ql'],
        builder: queryBuilder,
        instanceMetric: 'n1ql_requests',
    },
    {
        key: 'fts',
        title: 'FTS Metrics',
        segment: 'fts',
        aliases: [],
        builder: ftsBuilder,
        instanceMetric: 'fts_total_queries',
    },
    {
        key: 'eventing',
        title: 'Eventing Metrics',
        segment: 'eventing',
        aliases: [],
        builder: eventingBuilder,
        instanceMetric: 'eventing_worker_restart_count',
    },
    {
        key: 'sgw',
        title: 'Sync Gateway Metrics',
        segment: 'sgw',
        aliases: ['sync-gateway'],
        builder: sgwBuilder,
        instanceMetric: 'sgw_resource_utilization_system_memory_total',
    },
    {
        key: 'xdcr',
        title: 'XDCR Metrics',
        segment: 'xdcr',
        aliases: [],
        builder: xdcrBuilder,
        instanceMetric: 'xdcr_changes_left_total',
    },
    {
        key: 'analytics',
        title: 'Analytics Metrics',
        segment: 'analytics',
        aliases: ['cbas'],
        builder: analyticsBuilder,
        instanceMetric: 'cbas_io_writes_total',
    },
    {
        key: 'cluster_manager',
        title: 'Cluster Manager Metrics',
        segment: 'cluster-manager',
        aliases: [],
        builder: clusterManagerBuilder,
        instanceMetric: 'cm_http_requests_total',
        overlapInstanceMetric: 'sys_cpu_utilization_rate',
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
 * normaliseServiceName('n1ql') // returns 'query'
 * normaliseServiceName('SYNC-GATEWAY') // returns 'sgw'
 * normaliseServiceName('KV') // returns 'kv'
 */
export function normaliseServiceName(service: string): string {
    const normalised = service.toLowerCase().trim();

    // Check if it's already a canonical key
    const directMatch = SERVICE_CONFIGS.find(c => c.key === normalised);
    if (directMatch) {
        return directMatch.key;
    }

    // Check aliases
    const aliasMatch = SERVICE_CONFIGS.find(c =>
        c.aliases.some(alias => alias.toLowerCase() === normalised)
    );

    return aliasMatch?.key ?? normalised;
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
    const normalisedServices = new Set(services.map(s => normaliseServiceName(s)));

    return SERVICE_CONFIGS.filter(config => normalisedServices.has(config.key));
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
 * // Returns: ['kv', 'query']
 *
 * This is a pure intersection of detected services in canonical display order.
 */
export function findCommonServices(serviceLists: string[][]): string[] {
    if (serviceLists.length === 0) {
        return [];
    }

    // Normalise all service names in each list
    const normalisedSets = serviceLists.map(list =>
        new Set(list.map(s => normaliseServiceName(s)))
    );

    // Find services that exist in all sets
    return SERVICE_CONFIGS
        .filter(config => normalisedSets.every(set => set.has(config.key)))
        .map(config => config.key);
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
