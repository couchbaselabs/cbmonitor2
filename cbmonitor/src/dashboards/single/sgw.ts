import { EmbeddedScene } from '@grafana/scenes';
import { createMetricPanel, createFlexLayout } from 'utils/utils.panel';

export function sgwMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: createFlexLayout({
            children: [
                // Resource Utilization Metrics
                createMetricPanel('sgw_resource_utilization_process_memory_resident', 'Process Memory Resident', {
                    expr: `sgw_resource_utilization_process_memory_resident{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                // NOTE: gauge, not a counter — do not wrap in rate(). Reports total
                // system memory available, which is a point-in-time value.
                createMetricPanel('sgw_resource_utilization_system_memory_total', 'System Memory Total', {
                    expr: `sgw_resource_utilization_system_memory_total{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_pub_net_bytes_sent', 'Public Network Bytes Sent/Sec', {
                    expr: `rate(sgw_resource_utilization_pub_net_bytes_sent{job="${snapshotId}"}[$__rate_interval])`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('sgw_resource_utilization_pub_net_bytes_recv', 'Public Network Bytes Received/Sec', {
                    expr: `rate(sgw_resource_utilization_pub_net_bytes_recv{job="${snapshotId}"}[$__rate_interval])`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('sgw_resource_utilization_admin_net_bytes_recv', 'Admin Network Bytes Received/Sec', {
                    expr: `rate(sgw_resource_utilization_admin_net_bytes_recv{job="${snapshotId}"}[$__rate_interval])`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('sgw_resource_utilization_admin_net_bytes_sent', 'Admin Network Bytes Sent/Sec', {
                    expr: `rate(sgw_resource_utilization_admin_net_bytes_sent{job="${snapshotId}"}[$__rate_interval])`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('sgw_resource_utilization_num_goroutines', 'Number of Goroutines', {
                    expr: `sgw_resource_utilization_num_goroutines{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('sgw_resource_utilization_goroutines_high_watermark', 'Goroutines High Watermark', {
                    expr: `sgw_resource_utilization_goroutines_high_watermark{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('sgw_resource_utilization_go_memstats_sys', 'Go Memory Stats System', {
                    expr: `sgw_resource_utilization_go_memstats_sys{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_go_memstats_pausetotalns', 'Go Memory Stats Pause Total NS', {
                    expr: `sgw_resource_utilization_go_memstats_pausetotalns{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'ns'
                }),
                createMetricPanel('sgw_resource_utilization_go_memstats_heapalloc', 'Go Memory Stats Heap Allocated', {
                    expr: `sgw_resource_utilization_go_memstats_heapalloc{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_go_memstats_heapidle', 'Go Memory Stats Heap Idle', {
                    expr: `sgw_resource_utilization_go_memstats_heapidle{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_go_memstats_heapinuse', 'Go Memory Stats Heap In Use', {
                    expr: `sgw_resource_utilization_go_memstats_heapinuse{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_go_memstats_heapreleased', 'Go Memory Stats Heap Released', {
                    expr: `sgw_resource_utilization_go_memstats_heapreleased{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_go_memstats_stackinuse', 'Go Memory Stats Stack In Use', {
                    expr: `sgw_resource_utilization_go_memstats_stackinuse{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_go_memstats_stacksys', 'Go Memory Stats Stack System', {
                    expr: `sgw_resource_utilization_go_memstats_stacksys{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_error_count', 'Errors/Sec', {
                    expr: `rate(sgw_resource_utilization_error_count{job="${snapshotId}"}[$__rate_interval])`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_resource_utilization_warn_count', 'Warnings/Sec', {
                    expr: `rate(sgw_resource_utilization_warn_count{job="${snapshotId}"}[$__rate_interval])`,
                    snapshotId,
                    transformFunction: 'rate',
                    unit: 'short'
                }),

                // Cache Metrics
                createMetricPanel('sgw_cache_chan_cache_max_entries', 'Channel Cache Max Entries', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_max_entries{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_hits', 'Channel Cache Hits/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_chan_cache_hits{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_misses', 'Channel Cache Misses/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_chan_cache_misses{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_pending_queries', 'Channel Cache Pending Queries', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_pending_queries{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_num_channels', 'Channel Cache Number of Channels', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_num_channels{job="${snapshotId}"}) `,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_removal_revs', 'Channel Cache Removal Revisions', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_removal_revs{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_tombstone_revs', 'Channel Cache Tombstone Revisions', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_tombstone_revs{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_active_revs', 'Channel Cache Active Revisions', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_active_revs{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_bypass_count', 'Channel Cache Bypass/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_chan_cache_bypass_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_channels_added', 'Channel Cache Channels Added/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_chan_cache_channels_added{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_channels_evicted_inactive', 'Channel Cache Channels Evicted Inactive/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_chan_cache_channels_evicted_inactive{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_channels_evicted_nru', 'Channel Cache Channels Evicted NRU/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_chan_cache_channels_evicted_nru{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_compact_count', 'Channel Cache Compactions/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_chan_cache_compact_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance', 'd.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_abandoned_seqs', 'Cache Abandoned Sequences/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_abandoned_seqs{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_num_skipped_seqs', 'Cache Skipped Sequences/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_num_skipped_seqs{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_high_seq_cached', 'Cache High Sequence Cached Rate (seq/sec)', {
                    expr: `sum by (instance, database) (rate(sgw_cache_high_seq_cached{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_high_seq_stable', 'Cache High Sequence Stable Rate (seq/sec)', {
                    expr: `sum by (instance, database) (rate(sgw_cache_high_seq_stable{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_skipped_seq_len', 'Cache Skipped Sequence Length', {
                    expr: `sum by (instance, database) (sgw_cache_skipped_seq_len{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_pending_seq_len', 'Cache Pending Sequence Length', {
                    expr: `sum by (instance, database) (sgw_cache_pending_seq_len{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_current_skipped_seq_count', 'Cache Current Skipped Sequences/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_cache_current_skipped_seq_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),

                // Database Metrics
                createMetricPanel('sgw_database_sequence_get_count', 'Database Sequence Gets/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_sequence_get_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sequence_incr_count', 'Database Sequence Increments/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_sequence_incr_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sequence_reserved_count', 'Database Sequence Reservations/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_sequence_reserved_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sequence_assigned_count', 'Database Sequence Assignments/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_sequence_assigned_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sequence_released_count', 'Database Sequence Releases/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_sequence_released_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_crc32c_match_count', 'Database CRC32C Match Count', {
                    expr: `sum by (instance, database) (sgw_database_crc32c_match_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_num_replications_active', 'Database Number of Active Replications', {
                    expr: `sum by (instance, database) (sgw_database_num_replications_active{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_num_replications_total', 'Database Replications Started/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_num_replications_total{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_num_doc_writes', 'Database Document Writes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_num_doc_writes{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_num_tombstones_compacted', 'Database Tombstones Compacted/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_num_tombstones_compacted{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_doc_writes_bytes', 'Database Document Write Bytes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_doc_writes_bytes{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('sgw_database_doc_writes_xattr_bytes', 'Database Document Write XAttr Bytes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_doc_writes_xattr_bytes{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('sgw_database_num_doc_reads_rest', 'Database Document Reads REST/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_num_doc_reads_rest{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_num_doc_reads_blip', 'Database Document Reads BLIP/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_num_doc_reads_blip{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_doc_writes_bytes_blip', 'Database Document Write Bytes BLIP/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_doc_writes_bytes_blip{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('sgw_database_doc_reads_bytes_blip', 'Database Document Read Bytes BLIP/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_doc_reads_bytes_blip{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),
                createMetricPanel('sgw_database_warn_xattr_size_count', 'Database XAttr Size Warnings/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_warn_xattr_size_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_warn_channels_per_doc_count', 'Database Channels-Per-Doc Warnings/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_warn_channels_per_doc_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_warn_grants_per_doc_count', 'Database Grants-Per-Doc Warnings/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_warn_grants_per_doc_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_dcp_received_count', 'Database DCP Received Count', {
                    expr: `sum by (instance, database) (sgw_database_dcp_received_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_high_seq_feed', 'Database High Sequence Feed Rate (seq/sec)', {
                    expr: `sum by (instance, database) (rate(sgw_database_high_seq_feed{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_dcp_received_time', 'Database DCP Received Time', {
                    expr: `sum by (instance, database) (sgw_database_dcp_received_time{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
                }),
                createMetricPanel('sgw_database_dcp_caching_count', 'Database DCP Caching Count', {
                    expr: `sum by (instance, database) (sgw_database_dcp_caching_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_dcp_caching_time', 'Database DCP Caching Time', {
                    expr: `sum by (instance, database) (sgw_database_dcp_caching_time{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
                }),
                createMetricPanel('sgw_database_sync_function_time', 'Database Sync Function Time Rate (ns/sec)', {
                    expr: `sum by (instance, database) (rate(sgw_database_sync_function_time{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sync_function_count', 'Database Sync Function Invocations/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_sync_function_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_conflict_write_count', 'Database Conflict Writes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_database_conflict_write_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),

                // Replication Push Metrics
                createMetricPanel('sgw_replication_push_doc_push_count', 'Replication Push Document Count', {
                    expr: `sum by (instance, database) (sgw_replication_push_doc_push_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_push_write_processing_time', 'Replication Push Write Processing Time', {
                    expr: `sum by (instance, database) (sgw_replication_push_write_processing_time{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
                }),
                createMetricPanel('sgw_replication_push_propose_change_time', 'Replication Push Propose Change Time Rate (ns/sec)', {
                    expr: `sum by (instance, database) (rate(sgw_replication_push_propose_change_time{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_push_propose_change_count', 'Replication Push Propose Changes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_replication_push_propose_change_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_push_attachment_push_count', 'Replication Push Attachments/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_replication_push_attachment_push_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_push_attachment_push_bytes', 'Replication Push Attachment Bytes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_replication_push_attachment_push_bytes{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),

                // Replication Pull Metrics
                createMetricPanel('sgw_replication_pull_num_pull_repl_active_one_shot', 'Replication Pull Active One-Shot', {
                    expr: `sum by (instance, database) (sgw_replication_pull_num_pull_repl_active_one_shot{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_num_pull_repl_active_continuous', 'Replication Pull Active Continuous', {
                    expr: `sum by (instance, database) (sgw_replication_pull_num_pull_repl_active_continuous{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_num_pull_repl_total_one_shot', 'Replication Pull Total One-Shot', {
                    expr: `sum by (instance, database) (sgw_replication_pull_num_pull_repl_total_one_shot{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_num_pull_repl_total_continuous', 'Replication Pull Total Continuous', {
                    expr: `sum by (instance, database) (sgw_replication_pull_num_pull_repl_total_continuous{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_num_pull_repl_since_zero', 'Replication Pull Since Zero/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_replication_pull_num_pull_repl_since_zero{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_num_pull_repl_caught_up', 'Replication Pull Caught Up', {
                    expr: `sum by (instance, database) (sgw_replication_pull_num_pull_repl_caught_up{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_request_changes_count', 'Replication Pull Request Changes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_replication_pull_request_changes_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_request_changes_time', 'Replication Pull Request Changes Time Rate (ns/sec)', {
                    expr: `sum by (instance, database) (rate(sgw_replication_pull_request_changes_time{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_rev_send_count', 'Replication Pull Revisions Sent/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_replication_pull_rev_send_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_rev_send_latency', 'Replication Pull Revision Send Latency Rate (ns/sec)', {
                    expr: `sum by (instance, database) (rate(sgw_replication_pull_rev_send_latency{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_rev_processing_time', 'Replication Pull Revision Processing Time', {
                    expr: `sum by (instance, database) (sgw_replication_pull_rev_processing_time{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
                }),
                createMetricPanel('sgw_replication_pull_max_pending', 'Replication Pull Max Pending', {
                    expr: `sum by (instance, database) (sgw_replication_pull_max_pending{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_attachment_pull_count', 'Replication Pull Attachments/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_replication_pull_attachment_pull_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_attachment_pull_bytes', 'Replication Pull Attachment Bytes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_replication_pull_attachment_pull_bytes{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'Bps'
                }),

                // Security Metrics
                createMetricPanel('sgw_security_num_docs_rejected', 'Security Documents Rejected/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_security_num_docs_rejected{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_security_num_access_errors', 'Security Access Errors/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_security_num_access_errors{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_security_auth_success_count', 'Security Auth Successes/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_security_auth_success_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_security_auth_failed_count', 'Security Auth Failures/Sec', {
                    expr: `sum by (instance, database) (rate(sgw_security_auth_failed_count{job="${snapshotId}"}[$__rate_interval]))`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    transformFunction: 'rate',
                    unit: 'short'
                }),
                createMetricPanel('sgw_security_total_auth_time', 'Security Total Authentication Time', {
                    expr: `sum by (instance, database) (sgw_security_total_auth_time{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
                }),
            ],
        })
    });
}
