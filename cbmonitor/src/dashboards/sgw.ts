import { SceneFlexItem } from '@grafana/scenes';
import type { MetricContext, ServiceBuilder } from './types';

// Tuple shape used by every SGW metric table: [metric, title, unit, rate?]
type SgwMetric = readonly [metric: string, title: string, unit: string, rate: boolean];

/**
 * Resource-utilization metrics. Single mode emits them with a raw
 * (un-aggregated) selector — preserving Prometheus' native label set.
 * Overlap mode aggregates with `sum by (job)` (no `instance`), which
 * collapses series across instances for snapshot-to-snapshot comparison.
 */
const SGW_RESOURCE_METRICS: readonly SgwMetric[] = [
    ['sgw_resource_utilization_process_memory_resident',    'Process Memory Resident',          'bytes', false],
    ['sgw_resource_utilization_system_memory_total',        'System Memory Total',              'bytes', false],
    ['sgw_resource_utilization_pub_net_bytes_sent',         'Public Network Bytes Sent/Sec',    'Bps',   true],
    ['sgw_resource_utilization_pub_net_bytes_recv',         'Public Network Bytes Received/Sec','Bps',   true],
    ['sgw_resource_utilization_admin_net_bytes_recv',       'Admin Network Bytes Received/Sec', 'Bps',   true],
    ['sgw_resource_utilization_admin_net_bytes_sent',       'Admin Network Bytes Sent/Sec',     'Bps',   true],
    ['sgw_resource_utilization_num_goroutines',             'Number of Goroutines',             'short', false],
    ['sgw_resource_utilization_goroutines_high_watermark',  'Goroutines High Watermark',        'short', false],
    ['sgw_resource_utilization_go_memstats_sys',            'Go Memory Stats System',           'bytes', false],
    ['sgw_resource_utilization_go_memstats_pausetotalns',   'Go Memory Stats Pause Total NS',   'ns',    false],
    ['sgw_resource_utilization_go_memstats_heapalloc',      'Go Memory Stats Heap Allocated',   'bytes', false],
    ['sgw_resource_utilization_go_memstats_heapidle',       'Go Memory Stats Heap Idle',        'bytes', false],
    ['sgw_resource_utilization_go_memstats_heapinuse',      'Go Memory Stats Heap In Use',      'bytes', false],
    ['sgw_resource_utilization_go_memstats_heapreleased',   'Go Memory Stats Heap Released',    'bytes', false],
    ['sgw_resource_utilization_go_memstats_stackinuse',     'Go Memory Stats Stack In Use',     'bytes', false],
    ['sgw_resource_utilization_go_memstats_stacksys',       'Go Memory Stats Stack System',     'bytes', false],
    ['sgw_resource_utilization_error_count',                'Errors/Sec',                       'short', true],
    ['sgw_resource_utilization_warn_count',                 'Warnings/Sec',                     'short', true],
];

/**
 * Cache metrics — all share the database-scoped shape:
 * single: `sum by (instance, database)`, overlap: `sum by (job, database)`.
 */
const SGW_CACHE_METRICS: readonly SgwMetric[] = [
    ['sgw_cache_chan_cache_max_entries',                  'Channel Cache Max Entries',                       'short', false],
    ['sgw_cache_chan_cache_hits',                         'Channel Cache Hits/Sec',                          'short', true],
    ['sgw_cache_chan_cache_misses',                       'Channel Cache Misses/Sec',                        'short', true],
    ['sgw_cache_chan_cache_pending_queries',              'Channel Cache Pending Queries',                   'short', false],
    ['sgw_cache_chan_cache_num_channels',                 'Channel Cache Number of Channels',                'short', false],
    ['sgw_cache_chan_cache_removal_revs',                 'Channel Cache Removal Revisions',                 'short', false],
    ['sgw_cache_chan_cache_tombstone_revs',               'Channel Cache Tombstone Revisions',               'short', false],
    ['sgw_cache_chan_cache_active_revs',                  'Channel Cache Active Revisions',                  'short', false],
    ['sgw_cache_chan_cache_bypass_count',                 'Channel Cache Bypass/Sec',                        'short', true],
    ['sgw_cache_chan_cache_channels_added',               'Channel Cache Channels Added/Sec',                'short', true],
    ['sgw_cache_chan_cache_channels_evicted_inactive',    'Channel Cache Channels Evicted Inactive/Sec',     'short', true],
    ['sgw_cache_chan_cache_channels_evicted_nru',         'Channel Cache Channels Evicted NRU/Sec',          'short', true],
    ['sgw_cache_chan_cache_compact_count',                'Channel Cache Compactions/Sec',                   'short', true],
    ['sgw_cache_abandoned_seqs',                          'Cache Abandoned Sequences/Sec',                   'short', true],
    ['sgw_cache_num_skipped_seqs',                        'Cache Skipped Sequences/Sec',                     'short', true],
    ['sgw_cache_high_seq_cached',                         'Cache High Sequence Cached Rate (seq/sec)',       'short', true],
    ['sgw_cache_high_seq_stable',                         'Cache High Sequence Stable Rate (seq/sec)',       'short', true],
    ['sgw_cache_skipped_seq_len',                         'Cache Skipped Sequence Length',                   'short', false],
    ['sgw_cache_pending_seq_len',                         'Cache Pending Sequence Length',                   'short', false],
    ['sgw_cache_current_skipped_seq_count',               'Cache Current Skipped Sequences/Sec',             'short', true],
];

const SGW_DATABASE_METRICS: readonly SgwMetric[] = [
    ['sgw_database_sequence_get_count',          'Database Sequence Gets/Sec',                  'short', true],
    ['sgw_database_sequence_incr_count',         'Database Sequence Increments/Sec',            'short', true],
    ['sgw_database_sequence_reserved_count',     'Database Sequence Reservations/Sec',          'short', true],
    ['sgw_database_sequence_assigned_count',     'Database Sequence Assignments/Sec',           'short', true],
    ['sgw_database_sequence_released_count',     'Database Sequence Releases/Sec',              'short', true],
    ['sgw_database_crc32c_match_count',          'Database CRC32C Match Count',                 'short', false],
    ['sgw_database_num_replications_active',     'Database Number of Active Replications',     'short', false],
    ['sgw_database_num_replications_total',      'Database Replications Started/Sec',           'short', true],
    ['sgw_database_num_doc_writes',              'Database Document Writes/Sec',                'short', true],
    ['sgw_database_num_tombstones_compacted',    'Database Tombstones Compacted/Sec',           'short', true],
    ['sgw_database_doc_writes_bytes',            'Database Document Write Bytes/Sec',           'Bps',   true],
    ['sgw_database_doc_writes_xattr_bytes',      'Database Document Write XAttr Bytes/Sec',     'Bps',   true],
    ['sgw_database_num_doc_reads_rest',          'Database Document Reads REST/Sec',            'short', true],
    ['sgw_database_num_doc_reads_blip',          'Database Document Reads BLIP/Sec',            'short', true],
    ['sgw_database_doc_writes_bytes_blip',       'Database Document Write Bytes BLIP/Sec',      'Bps',   true],
    ['sgw_database_doc_reads_bytes_blip',        'Database Document Read Bytes BLIP/Sec',       'Bps',   true],
    ['sgw_database_warn_xattr_size_count',       'Database XAttr Size Warnings/Sec',            'short', true],
    ['sgw_database_warn_channels_per_doc_count', 'Database Channels-Per-Doc Warnings/Sec',      'short', true],
    ['sgw_database_warn_grants_per_doc_count',   'Database Grants-Per-Doc Warnings/Sec',        'short', true],
    ['sgw_database_dcp_received_count',          'Database DCP Received Count',                 'short', false],
    ['sgw_database_high_seq_feed',               'Database High Sequence Feed Rate (seq/sec)', 'short', true],
    ['sgw_database_dcp_received_time',           'Database DCP Received Time',                  'ns',    false],
    ['sgw_database_dcp_caching_count',           'Database DCP Caching Count',                  'short', false],
    ['sgw_database_dcp_caching_time',            'Database DCP Caching Time',                   'ns',    false],
    ['sgw_database_sync_function_time',          'Database Sync Function Time Rate (ns/sec)',   'short', true],
    ['sgw_database_sync_function_count',         'Database Sync Function Invocations/Sec',      'short', true],
    ['sgw_database_conflict_write_count',        'Database Conflict Writes/Sec',                'short', true],
];

const SGW_REPLICATION_PUSH_METRICS: readonly SgwMetric[] = [
    ['sgw_replication_push_doc_push_count',          'Replication Push Document Count',                       'short', false],
    ['sgw_replication_push_write_processing_time',   'Replication Push Write Processing Time',                'ms',    false],
    ['sgw_replication_push_propose_change_time',     'Replication Push Propose Change Time Rate (ns/sec)',    'short', true],
    ['sgw_replication_push_propose_change_count',    'Replication Push Propose Changes/Sec',                  'short', true],
    ['sgw_replication_push_attachment_push_count',   'Replication Push Attachments/Sec',                      'short', true],
    ['sgw_replication_push_attachment_push_bytes',   'Replication Push Attachment Bytes/Sec',                 'Bps',   true],
];

const SGW_REPLICATION_PULL_METRICS: readonly SgwMetric[] = [
    ['sgw_replication_pull_num_pull_repl_active_one_shot',    'Replication Pull Active One-Shot',                        'short', false],
    ['sgw_replication_pull_num_pull_repl_active_continuous',  'Replication Pull Active Continuous',                      'short', false],
    ['sgw_replication_pull_num_pull_repl_total_one_shot',     'Replication Pull Total One-Shot',                         'short', false],
    ['sgw_replication_pull_num_pull_repl_total_continuous',   'Replication Pull Total Continuous',                       'short', false],
    ['sgw_replication_pull_num_pull_repl_since_zero',         'Replication Pull Since Zero/Sec',                         'short', true],
    ['sgw_replication_pull_num_pull_repl_caught_up',          'Replication Pull Caught Up',                              'short', false],
    ['sgw_replication_pull_request_changes_count',            'Replication Pull Request Changes/Sec',                    'short', true],
    ['sgw_replication_pull_request_changes_time',             'Replication Pull Request Changes Time Rate (ns/sec)',     'short', true],
    ['sgw_replication_pull_rev_send_count',                   'Replication Pull Revisions Sent/Sec',                     'short', true],
    ['sgw_replication_pull_rev_send_latency',                 'Replication Pull Revision Send Latency Rate (ns/sec)',    'short', true],
    ['sgw_replication_pull_rev_processing_time',              'Replication Pull Revision Processing Time',               'ms',    false],
    ['sgw_replication_pull_max_pending',                      'Replication Pull Max Pending',                            'short', false],
    ['sgw_replication_pull_attachment_pull_count',            'Replication Pull Attachments/Sec',                        'short', true],
    ['sgw_replication_pull_attachment_pull_bytes',            'Replication Pull Attachment Bytes/Sec',                   'Bps',   true],
];

const SGW_SECURITY_METRICS: readonly SgwMetric[] = [
    ['sgw_security_num_docs_rejected',   'Security Documents Rejected/Sec',  'short', true],
    ['sgw_security_num_access_errors',   'Security Access Errors/Sec',       'short', true],
    ['sgw_security_auth_success_count',  'Security Auth Successes/Sec',      'short', true],
    ['sgw_security_auth_failed_count',   'Security Auth Failures/Sec',       'short', true],
    ['sgw_security_total_auth_time',     'Security Total Authentication Time','ns',   false],
];

/**
 * Unified panel emitter for the Sync Gateway service.
 *
 * SGW dashboards diverge from every other service in two important ways:
 * 1. Single-mode resource-utilization panels use raw (un-summed) selectors
 *    instead of the usual `sum by (instance, …)` pattern.
 * 2. Overlap-mode aggregation drops `instance` (uses `sum by (job)` or
 *    `sum by (job, database)`) — collapsing series across instances for
 *    snapshot-to-snapshot comparison. Other services keep `instance`.
 *
 * Because `ctx.sumBy()` / `ctx.legend()` assume the standard per-service
 * pattern, SGW uses two local helpers that dispatch on `ctx.mode` to
 * reproduce the originals exactly.
 *
 * Panel set is identical across modes (~90 panels split into six
 * categories listed above), so there's no `modeOnly` here — only shape
 * divergence inside each panel.
 */
export const sgwBuilder: ServiceBuilder = (ctx) => {
    if (ctx.branch !== 'base') {
        return [];
    }
    return [
        ...SGW_RESOURCE_METRICS.map((m) => sgwResourcePanel(ctx, m)),
        ...SGW_CACHE_METRICS.map((m) => sgwDatabasePanel(ctx, m)),
        ...SGW_DATABASE_METRICS.map((m) => sgwDatabasePanel(ctx, m)),
        ...SGW_REPLICATION_PUSH_METRICS.map((m) => sgwDatabasePanel(ctx, m)),
        ...SGW_REPLICATION_PULL_METRICS.map((m) => sgwDatabasePanel(ctx, m)),
        ...SGW_SECURITY_METRICS.map((m) => sgwDatabasePanel(ctx, m)),
    ];
};

/**
 * Resource utilization shape:
 * - single: raw `{metric}{job="…"}` (or `rate(…)`)
 * - overlap: `sum by (job) ({metric}{job=~"…",instance="…"})` (or `rate(…)`)
 *
 * Original single sets no `legendFormat` (defaults to `${__field.labels.instance}`).
 * Original overlap sets no `legendFormat` (Grafana series-default). The unified
 * version always passes `ctx.legend()` for display consistency — `'{{instance}}'`
 * in single (matches default) and `'{{job}}, {{instance}}'` in overlap (cleaner
 * than the default).
 */
function sgwResourcePanel(ctx: MetricContext, [metric, title, unit, rate]: SgwMetric): SceneFlexItem {
    const inner = `${metric}{${ctx.jobSelector}${ctx.instanceFilter}}`;
    const series = rate ? `rate(${inner}[$__rate_interval])` : inner;
    const expr = ctx.mode === 'single' ? series : `sum by (job) (${series})`;
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr,
        legendFormat: ctx.legend(),
        ...(rate ? { transformFunction: 'rate' } : {}),
        unit,
    });
}

/**
 * Database-scoped shape (cache / database / replication / security):
 * - single: `sum by (instance, database) ({metric}{job="…"})` (or `rate(…)`)
 * - overlap: `sum by (job, database) ({metric}{job=~"…",instance="…"})` (or `rate(…)`)
 *
 * Legend `'{{instance}} , {{database}}'` is hardcoded in both modes — the
 * originals share that exact literal, even though overlap aggregates instance
 * away (so `{{instance}}` renders empty in overlap). Preserved verbatim.
 */
function sgwDatabasePanel(ctx: MetricContext, [metric, title, unit, rate]: SgwMetric): SceneFlexItem {
    const inner = `${metric}{${ctx.jobSelector}${ctx.instanceFilter}}`;
    const series = rate ? `rate(${inner}[$__rate_interval])` : inner;
    const groupBy = ctx.mode === 'single' ? 'instance, database' : 'job, database';
    return ctx.panel(metric, `${title}${ctx.titleSuffix}`, {
        expr: `sum by (${groupBy}) (${series})`,
        legendFormat: '{{instance}} , {{database}}',
        extraFields: ['d.labels.instance', 'd.labels.`database`'],
        ...(rate ? { transformFunction: 'rate' } : {}),
        unit,
    });
}

