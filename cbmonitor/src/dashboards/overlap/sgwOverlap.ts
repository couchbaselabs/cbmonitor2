import { EmbeddedScene } from '@grafana/scenes';
import { createInstanceAwareOverlapScene } from 'utils/instanceScene';

export function sgwOverlapMetricsDashboard(snapshotIds: string, overlapEndTimeSeconds?: number): EmbeddedScene {
  return createInstanceAwareOverlapScene(
    snapshotIds,
    ({ titleSuffix, instanceFilter, createOverlapMetricPanel }) => [
        // Resource Utilization Metrics
        createOverlapMetricPanel('sgw_resource_utilization_process_memory_resident', `Process Memory Resident${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_process_memory_resident{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_system_memory_total', `System Memory Total${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_system_memory_total{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_pub_net_bytes_sent', `Public Network Bytes Sent${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_pub_net_bytes_sent{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_pub_net_bytes_recv', `Public Network Bytes Received${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_pub_net_bytes_recv{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_admin_net_bytes_recv', `Admin Network Bytes Received${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_admin_net_bytes_recv{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_admin_net_bytes_sent', `Admin Network Bytes Sent${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_admin_net_bytes_sent{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_num_goroutines', `Number of Goroutines${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_num_goroutines{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_goroutines_high_watermark', `Goroutines High Watermark${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_goroutines_high_watermark{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_go_memstats_sys', `Go Memory Stats System${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_go_memstats_sys{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_go_memstats_pausetotalns', `Go Memory Stats Pause Total NS${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_go_memstats_pausetotalns{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'ns'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_go_memstats_heapalloc', `Go Memory Stats Heap Allocated${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_go_memstats_heapalloc{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_go_memstats_heapidle', `Go Memory Stats Heap Idle${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_go_memstats_heapidle{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_go_memstats_heapinuse', `Go Memory Stats Heap In Use${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_go_memstats_heapinuse{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_go_memstats_heapreleased', `Go Memory Stats Heap Released${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_go_memstats_heapreleased{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_go_memstats_stackinuse', `Go Memory Stats Stack In Use${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_go_memstats_stackinuse{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_go_memstats_stacksys', `Go Memory Stats Stack System${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_go_memstats_stacksys{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_error_count', `Error Count${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_error_count{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_resource_utilization_warn_count', `Warning Count${titleSuffix}`, {
            expr: `sum by (job) (sgw_resource_utilization_warn_count{job=~"${snapshotIds}"${instanceFilter}})`,
            unit: 'short'
        }),

        // Cache Metrics
        createOverlapMetricPanel('sgw_cache_chan_cache_max_entries', `Channel Cache Max Entries${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_max_entries{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_hits', `Channel Cache Hits${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_hits{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_misses', `Channel Cache Misses${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_misses{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_pending_queries', `Channel Cache Pending Queries${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_pending_queries{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_num_channels', `Channel Cache Number of Channels${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_num_channels{job=~"${snapshotIds}"${instanceFilter}}) `,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_removal_revs', `Channel Cache Removal Revisions${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_removal_revs{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_tombstone_revs', `Channel Cache Tombstone Revisions${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_tombstone_revs{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_active_revs', `Channel Cache Active Revisions${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_active_revs{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_bypass_count', `Channel Cache Bypass Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_bypass_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_channels_added', `Channel Cache Channels Added${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_channels_added{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_channels_evicted_inactive', `Channel Cache Channels Evicted Inactive${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_channels_evicted_inactive{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_channels_evicted_nru', `Channel Cache Channels Evicted NRU${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_channels_evicted_nru{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_chan_cache_compact_count', `Channel Cache Compact Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_chan_cache_compact_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_abandoned_seqs', `Cache Abandoned Sequences${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_abandoned_seqs{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_num_skipped_seqs', `Cache Number of Skipped Sequences${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_num_skipped_seqs{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_high_seq_cached', `Cache High Sequence Cached${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_high_seq_cached{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_high_seq_stable', `Cache High Sequence Stable${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_high_seq_stable{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_skipped_seq_len', `Cache Skipped Sequence Length${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_skipped_seq_len{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_pending_seq_len', `Cache Pending Sequence Length${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_pending_seq_len{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_cache_current_skipped_seq_count', `Cache Current Skipped Sequence Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_cache_current_skipped_seq_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),

        // Database Metrics
        createOverlapMetricPanel('sgw_database_sequence_get_count', `Database Sequence Get Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_sequence_get_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_sequence_incr_count', `Database Sequence Increment Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_sequence_incr_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_sequence_reserved_count', `Database Sequence Reserved Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_sequence_reserved_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_sequence_assigned_count', `Database Sequence Assigned Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_sequence_assigned_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_sequence_released_count', `Database Sequence Released Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_sequence_released_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_crc32c_match_count', `Database CRC32C Match Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_crc32c_match_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_num_replications_active', `Database Number of Active Replications${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_num_replications_active{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_num_replications_total', `Database Number of Total Replications${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_num_replications_total{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_num_doc_writes', `Database Number of Document Writes${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_num_doc_writes{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_num_tombstones_compacted', `Database Number of Tombstones Compacted${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_num_tombstones_compacted{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_doc_writes_bytes', `Database Document Write Bytes${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_doc_writes_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_database_doc_writes_xattr_bytes', `Database Document Write XAttr Bytes${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_doc_writes_xattr_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_database_num_doc_reads_rest', `Database Number of Document Reads REST${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_num_doc_reads_rest{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_num_doc_reads_blip', `Database Number of Document Reads BLIP${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_num_doc_reads_blip{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_doc_writes_bytes_blip', `Database Document Write Bytes BLIP${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_doc_writes_bytes_blip{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_database_doc_reads_bytes_blip', `Database Document Read Bytes BLIP${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_doc_reads_bytes_blip{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'bytes'
        }),
        createOverlapMetricPanel('sgw_database_warn_xattr_size_count', `Database Warning XAttr Size Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_warn_xattr_size_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_warn_channels_per_doc_count', `Database Warning Channels Per Document Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_warn_channels_per_doc_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_warn_grants_per_doc_count', `Database Warning Grants Per Document Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_warn_grants_per_doc_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_dcp_received_count', `Database DCP Received Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_dcp_received_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_high_seq_feed', `Database High Sequence Feed${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_high_seq_feed{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_dcp_received_time', `Database DCP Received Time${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_dcp_received_time{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
        createOverlapMetricPanel('sgw_database_dcp_caching_count', `Database DCP Caching Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_dcp_caching_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_dcp_caching_time', `Database DCP Caching Time${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_dcp_caching_time{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
        createOverlapMetricPanel('sgw_database_sync_function_time', `Database Sync Function Time${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_sync_function_time{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
        createOverlapMetricPanel('sgw_database_sync_function_count', `Database Sync Function Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_sync_function_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_database_conflict_write_count', `Database Conflict Write Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_database_conflict_write_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),

        // Replication Push Metrics
        createOverlapMetricPanel('sgw_replication_push_doc_push_count', `Replication Push Document Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_push_doc_push_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_push_write_processing_time', `Replication Push Write Processing Time${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_push_write_processing_time{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
        createOverlapMetricPanel('sgw_replication_push_propose_change_time', `Replication Push Propose Change Time${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_push_propose_change_time{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
        createOverlapMetricPanel('sgw_replication_push_propose_change_count', `Replication Push Propose Change Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_push_propose_change_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_push_attachment_push_count', `Replication Push Attachment Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_push_attachment_push_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_push_attachment_push_bytes', `Replication Push Attachment Bytes${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_push_attachment_push_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'bytes'
        }),

        // Replication Pull Metrics
        createOverlapMetricPanel('sgw_replication_pull_num_pull_repl_active_one_shot', `Replication Pull Active One-Shot${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_num_pull_repl_active_one_shot{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_num_pull_repl_active_continuous', `Replication Pull Active Continuous${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_num_pull_repl_active_continuous{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_num_pull_repl_total_one_shot', `Replication Pull Total One-Shot${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_num_pull_repl_total_one_shot{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_num_pull_repl_total_continuous', `Replication Pull Total Continuous${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_num_pull_repl_total_continuous{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_num_pull_repl_since_zero', `Replication Pull Since Zero${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_num_pull_repl_since_zero{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_num_pull_repl_caught_up', `Replication Pull Caught Up${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_num_pull_repl_caught_up{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_request_changes_count', `Replication Pull Request Changes Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_request_changes_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_request_changes_time', `Replication Pull Request Changes Time${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_request_changes_time{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
        createOverlapMetricPanel('sgw_replication_pull_rev_send_count', `Replication Pull Revision Send Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_rev_send_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_rev_send_latency', `Replication Pull Revision Send Latency${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_rev_send_latency{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
        createOverlapMetricPanel('sgw_replication_pull_rev_processing_time', `Replication Pull Revision Processing Time${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_rev_processing_time{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
        createOverlapMetricPanel('sgw_replication_pull_max_pending', `Replication Pull Max Pending${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_max_pending{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_attachment_pull_count', `Replication Pull Attachment Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_attachment_pull_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_replication_pull_attachment_pull_bytes', `Replication Pull Attachment Bytes${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_replication_pull_attachment_pull_bytes{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'bytes'
        }),

        // Security Metrics
        createOverlapMetricPanel('sgw_security_num_docs_rejected', `Security Documents Rejected${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_security_num_docs_rejected{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_security_num_access_errors', `Security Access Errors${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_security_num_access_errors{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_security_auth_success_count', `Security Authentication Success Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_security_auth_success_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_security_auth_failed_count', `Security Authentication Failed Count${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_security_auth_failed_count{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'short'
        }),
        createOverlapMetricPanel('sgw_security_total_auth_time', `Security Total Authentication Time${titleSuffix}`, {
            expr: `sum by (job, database) (sgw_security_total_auth_time{job=~"${snapshotIds}"${instanceFilter}})`,
            legendFormat: '{{instance}} , {{database}}',
            unit: 'ms'
        }),
    ],
        { instanceMetric: 'sgw_resource_utilization_system_memory_total', overlapEndTimeSeconds }
  );
}
