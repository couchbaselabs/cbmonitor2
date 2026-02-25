import {
    EmbeddedScene,
    SceneFlexLayout,
} from '@grafana/scenes';
import { createMetricPanel } from 'utils/utils.panel';

export function sgwMetricsDashboard(snapshotId: string): EmbeddedScene {

    return new EmbeddedScene({
        body: new SceneFlexLayout({
            minHeight: 50, // Intentional to allow the layout to be visible when  no data is available
            direction: 'row',
            wrap: 'wrap',
            children: [
                // Resource Utilization Metrics
                createMetricPanel('sgw_resource_utilization_process_memory_resident', 'Process Memory Resident', {
                    expr: `sgw_resource_utilization_process_memory_resident{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_system_memory_total', 'System Memory Total', {
                    expr: `sgw_resource_utilization_system_memory_total{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_pub_net_bytes_sent', 'Public Network Bytes Sent', {
                    expr: `sgw_resource_utilization_pub_net_bytes_sent{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_pub_net_bytes_recv', 'Public Network Bytes Received', {
                    expr: `sgw_resource_utilization_pub_net_bytes_recv{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_admin_net_bytes_recv', 'Admin Network Bytes Received', {
                    expr: `sgw_resource_utilization_admin_net_bytes_recv{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_resource_utilization_admin_net_bytes_sent', 'Admin Network Bytes Sent', {
                    expr: `sgw_resource_utilization_admin_net_bytes_sent{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'bytes'
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
                createMetricPanel('sgw_resource_utilization_error_count', 'Error Count', {
                    expr: `sgw_resource_utilization_error_count{job="${snapshotId}"}`,
                    snapshotId,
                    unit: 'short'
                }),
                createMetricPanel('sgw_resource_utilization_warn_count', 'Warning Count', {
                    expr: `sgw_resource_utilization_warn_count{job="${snapshotId}"}`,
                    snapshotId,
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
                createMetricPanel('sgw_cache_chan_cache_hits', 'Channel Cache Hits', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_hits{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_misses', 'Channel Cache Misses', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_misses{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
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
                createMetricPanel('sgw_cache_chan_cache_bypass_count', 'Channel Cache Bypass Count', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_bypass_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_channels_added', 'Channel Cache Channels Added', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_channels_added{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_channels_evicted_inactive', 'Channel Cache Channels Evicted Inactive', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_channels_evicted_inactive{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_channels_evicted_nru', 'Channel Cache Channels Evicted NRU', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_channels_evicted_nru{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_chan_cache_compact_count', 'Channel Cache Compact Count', {
                    expr: `sum by (instance, database) (sgw_cache_chan_cache_compact_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance', 'd.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_abandoned_seqs', 'Cache Abandoned Sequences', {
                    expr: `sum by (instance, database) (sgw_cache_abandoned_seqs{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_num_skipped_seqs', 'Cache Number of Skipped Sequences', {
                    expr: `sum by (instance, database) (sgw_cache_num_skipped_seqs{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_high_seq_cached', 'Cache High Sequence Cached', {
                    expr: `sum by (instance, database) (sgw_cache_high_seq_cached{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_cache_high_seq_stable', 'Cache High Sequence Stable', {
                    expr: `sum by (instance, database) (sgw_cache_high_seq_stable{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
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
                createMetricPanel('sgw_cache_current_skipped_seq_count', 'Cache Current Skipped Sequence Count', {
                    expr: `sum by (instance, database) (sgw_cache_current_skipped_seq_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),

                // Database Metrics
                createMetricPanel('sgw_database_sequence_get_count', 'Database Sequence Get Count', {
                    expr: `sum by (instance, database) (sgw_database_sequence_get_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sequence_incr_count', 'Database Sequence Increment Count', {
                    expr: `sum by (instance, database) (sgw_database_sequence_incr_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sequence_reserved_count', 'Database Sequence Reserved Count', {
                    expr: `sum by (instance, database) (sgw_database_sequence_reserved_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sequence_assigned_count', 'Database Sequence Assigned Count', {
                    expr: `sum by (instance, database) (sgw_database_sequence_assigned_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_sequence_released_count', 'Database Sequence Released Count', {
                    expr: `sum by (instance, database) (sgw_database_sequence_released_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
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
                createMetricPanel('sgw_database_num_replications_total', 'Database Number of Total Replications', {
                    expr: `sum by (instance, database) (sgw_database_num_replications_total{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_num_doc_writes', 'Database Number of Document Writes', {
                    expr: `sum by (instance, database) (sgw_database_num_doc_writes{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_num_tombstones_compacted', 'Database Number of Tombstones Compacted', {
                    expr: `sum by (instance, database) (sgw_database_num_tombstones_compacted{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_doc_writes_bytes', 'Database Document Write Bytes', {
                    expr: `sum by (instance, database) (sgw_database_doc_writes_bytes{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_database_doc_writes_xattr_bytes', 'Database Document Write XAttr Bytes', {
                    expr: `sum by (instance, database) (sgw_database_doc_writes_xattr_bytes{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_database_num_doc_reads_rest', 'Database Number of Document Reads REST', {
                    expr: `sum by (instance, database) (sgw_database_num_doc_reads_rest{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_num_doc_reads_blip', 'Database Number of Document Reads BLIP', {
                    expr: `sum by (instance, database) (sgw_database_num_doc_reads_blip{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_doc_writes_bytes_blip', 'Database Document Write Bytes BLIP', {
                    expr: `sum by (instance, database) (sgw_database_doc_writes_bytes_blip{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_database_doc_reads_bytes_blip', 'Database Document Read Bytes BLIP', {
                    expr: `sum by (instance, database) (sgw_database_doc_reads_bytes_blip{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'bytes'
                }),
                createMetricPanel('sgw_database_warn_xattr_size_count', 'Database Warning XAttr Size Count', {
                    expr: `sum by (instance, database) (sgw_database_warn_xattr_size_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_warn_channels_per_doc_count', 'Database Warning Channels Per Document Count', {
                    expr: `sum by (instance, database) (sgw_database_warn_channels_per_doc_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_warn_grants_per_doc_count', 'Database Warning Grants Per Document Count', {
                    expr: `sum by (instance, database) (sgw_database_warn_grants_per_doc_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_dcp_received_count', 'Database DCP Received Count', {
                    expr: `sum by (instance, database) (sgw_database_dcp_received_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_high_seq_feed', 'Database High Sequence Feed', {
                    expr: `sum by (instance, database) (sgw_database_high_seq_feed{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
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
                createMetricPanel('sgw_database_sync_function_time', 'Database Sync Function Time', {
                    expr: `sum by (instance, database) (sgw_database_sync_function_time{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
                }),
                createMetricPanel('sgw_database_sync_function_count', 'Database Sync Function Count', {
                    expr: `sum by (instance, database) (sgw_database_sync_function_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_database_conflict_write_count', 'Database Conflict Write Count', {
                    expr: `sum by (instance, database) (sgw_database_conflict_write_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
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
                createMetricPanel('sgw_replication_push_propose_change_time', 'Replication Push Propose Change Time', {
                    expr: `sum by (instance, database) (sgw_replication_push_propose_change_time{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
                }),
                createMetricPanel('sgw_replication_push_propose_change_count', 'Replication Push Propose Change Count', {
                    expr: `sum by (instance, database) (sgw_replication_push_propose_change_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_push_attachment_push_count', 'Replication Push Attachment Count', {
                    expr: `sum by (instance, database) (sgw_replication_push_attachment_push_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_push_attachment_push_bytes', 'Replication Push Attachment Bytes', {
                    expr: `sum by (instance, database) (sgw_replication_push_attachment_push_bytes{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'bytes'
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
                createMetricPanel('sgw_replication_pull_num_pull_repl_since_zero', 'Replication Pull Since Zero', {
                    expr: `sum by (instance, database) (sgw_replication_pull_num_pull_repl_since_zero{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_num_pull_repl_caught_up', 'Replication Pull Caught Up', {
                    expr: `sum by (instance, database) (sgw_replication_pull_num_pull_repl_caught_up{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_request_changes_count', 'Replication Pull Request Changes Count', {
                    expr: `sum by (instance, database) (sgw_replication_pull_request_changes_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_request_changes_time', 'Replication Pull Request Changes Time', {
                    expr: `sum by (instance, database) (sgw_replication_pull_request_changes_time{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
                }),
                createMetricPanel('sgw_replication_pull_rev_send_count', 'Replication Pull Revision Send Count', {
                    expr: `sum by (instance, database) (sgw_replication_pull_rev_send_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_rev_send_latency', 'Replication Pull Revision Send Latency', {
                    expr: `sum by (instance, database) (sgw_replication_pull_rev_send_latency{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'ms'
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
                createMetricPanel('sgw_replication_pull_attachment_pull_count', 'Replication Pull Attachment Count', {
                    expr: `sum by (instance, database) (sgw_replication_pull_attachment_pull_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_replication_pull_attachment_pull_bytes', 'Replication Pull Attachment Bytes', {
                    expr: `sum by (instance, database) (sgw_replication_pull_attachment_pull_bytes{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'bytes'
                }),

                // Security Metrics
                createMetricPanel('sgw_security_num_docs_rejected', 'Security Documents Rejected', {
                    expr: `sum by (instance, database) (sgw_security_num_docs_rejected{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_security_num_access_errors', 'Security Access Errors', {
                    expr: `sum by (instance, database) (sgw_security_num_access_errors{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_security_auth_success_count', 'Security Authentication Success Count', {
                    expr: `sum by (instance, database) (sgw_security_auth_success_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
                    unit: 'short'
                }),
                createMetricPanel('sgw_security_auth_failed_count', 'Security Authentication Failed Count', {
                    expr: `sum by (instance, database) (sgw_security_auth_failed_count{job="${snapshotId}"})`,
                    legendFormat: '{{instance}} , {{database}}',
                    snapshotId,
                    extraFields: ['d.labels.instance','d.labels.\`database\`'],
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
