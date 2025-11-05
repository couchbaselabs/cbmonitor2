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
                createMetricPanel(snapshotId, 'sgw_resource_utilization_process_memory_resident', 'Process Memory Resident'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_system_memory_total', 'System Memory Total'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_pub_net_bytes_sent', 'Public Network Bytes Sent'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_pub_net_bytes_recv', 'Public Network Bytes Received'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_admin_net_bytes_recv', 'Admin Network Bytes Received'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_admin_net_bytes_sent', 'Admin Network Bytes Sent'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_num_goroutines', 'Number of Goroutines'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_goroutines_high_watermark', 'Goroutines High Watermark'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_go_memstats_sys', 'Go Memory Stats System'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_go_memstats_pausetotalns', 'Go Memory Stats Pause Total NS'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_go_memstats_heapalloc', 'Go Memory Stats Heap Allocated'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_go_memstats_heapidle', 'Go Memory Stats Heap Idle'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_go_memstats_heapinuse', 'Go Memory Stats Heap In Use'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_go_memstats_heapreleased', 'Go Memory Stats Heap Released'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_go_memstats_stackinuse', 'Go Memory Stats Stack In Use'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_go_memstats_stacksys', 'Go Memory Stats Stack System'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_error_count', 'Error Count'),
                createMetricPanel(snapshotId, 'sgw_resource_utilization_warn_count', 'Warning Count'),

                // Cache Metrics
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_max_entries', 'Channel Cache Max Entries', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_hits', 'Channel Cache Hits', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_misses', 'Channel Cache Misses', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_pending_queries', 'Channel Cache Pending Queries', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_num_channels', 'Channel Cache Number of Channels', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_removal_revs', 'Channel Cache Removal Revisions', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_tombstone_revs', 'Channel Cache Tombstone Revisions', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_active_revs', 'Channel Cache Active Revisions', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_bypass_count', 'Channel Cache Bypass Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_channels_added', 'Channel Cache Channels Added', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_channels_evicted_inactive', 'Channel Cache Channels Evicted Inactive', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_channels_evicted_nru', 'Channel Cache Channels Evicted NRU', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_chan_cache_compact_count', 'Channel Cache Compact Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_abandoned_seqs', 'Cache Abandoned Sequences', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_num_skipped_seqs', 'Cache Number of Skipped Sequences', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_high_seq_cached', 'Cache High Sequence Cached', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_high_seq_stable', 'Cache High Sequence Stable', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_skipped_seq_len', 'Cache Skipped Sequence Length', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_pending_seq_len', 'Cache Pending Sequence Length', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_cache_current_skipped_seq_count', 'Cache Current Skipped Sequence Count', {
                    extraFields: ['d.labels.`database`']
                }),

                // Database Metrics
                createMetricPanel(snapshotId, 'sgw_database_sequence_get_count', 'Database Sequence Get Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_sequence_incr_count', 'Database Sequence Increment Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_sequence_reserved_count', 'Database Sequence Reserved Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_sequence_assigned_count', 'Database Sequence Assigned Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_sequence_released_count', 'Database Sequence Released Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_crc32c_match_count', 'Database CRC32C Match Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_num_replications_active', 'Database Number of Active Replications', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_num_replications_total', 'Database Number of Total Replications', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_num_doc_writes', 'Database Number of Document Writes', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_num_tombstones_compacted', 'Database Number of Tombstones Compacted', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_doc_writes_bytes', 'Database Document Write Bytes', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_doc_writes_xattr_bytes', 'Database Document Write XAttr Bytes', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_num_doc_reads_rest', 'Database Number of Document Reads REST', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_num_doc_reads_blip', 'Database Number of Document Reads BLIP', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_doc_writes_bytes_blip', 'Database Document Write Bytes BLIP', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_doc_reads_bytes_blip', 'Database Document Read Bytes BLIP', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_warn_xattr_size_count', 'Database Warning XAttr Size Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_warn_channels_per_doc_count', 'Database Warning Channels Per Document Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_warn_grants_per_doc_count', 'Database Warning Grants Per Document Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_dcp_received_count', 'Database DCP Received Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_high_seq_feed', 'Database High Sequence Feed', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_dcp_received_time', 'Database DCP Received Time', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_dcp_caching_count', 'Database DCP Caching Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_dcp_caching_time', 'Database DCP Caching Time', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_sync_function_time', 'Database Sync Function Time', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_sync_function_count', 'Database Sync Function Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_database_conflict_write_count', 'Database Conflict Write Count', {
                    extraFields: ['d.labels.`database`']
                }),

                // Replication Push Metrics
                createMetricPanel(snapshotId, 'sgw_replication_push_doc_push_count', 'Replication Push Document Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_push_write_processing_time', 'Replication Push Write Processing Time', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_push_propose_change_time', 'Replication Push Propose Change Time', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_push_propose_change_count', 'Replication Push Propose Change Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_push_attachment_push_count', 'Replication Push Attachment Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_push_attachment_push_bytes', 'Replication Push Attachment Bytes', {
                    extraFields: ['d.labels.`database`']
                }),

                // Replication Pull Metrics
                createMetricPanel(snapshotId, 'sgw_replication_pull_num_pull_repl_active_one_shot', 'Replication Pull Active One-Shot', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_num_pull_repl_active_continuous', 'Replication Pull Active Continuous', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_num_pull_repl_total_one_shot', 'Replication Pull Total One-Shot', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_num_pull_repl_total_continuous', 'Replication Pull Total Continuous', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_num_pull_repl_since_zero', 'Replication Pull Since Zero', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_num_pull_repl_caught_up', 'Replication Pull Caught Up', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_request_changes_count', 'Replication Pull Request Changes Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_request_changes_time', 'Replication Pull Request Changes Time', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_rev_send_count', 'Replication Pull Revision Send Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_rev_send_latency', 'Replication Pull Revision Send Latency', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_rev_processing_time', 'Replication Pull Revision Processing Time', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_max_pending', 'Replication Pull Max Pending', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_attachment_pull_count', 'Replication Pull Attachment Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_replication_pull_attachment_pull_bytes', 'Replication Pull Attachment Bytes', {
                    extraFields: ['d.labels.`database`']
                }),

                // Security Metrics
                createMetricPanel(snapshotId, 'sgw_security_num_docs_rejected', 'Security Documents Rejected', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_security_num_access_errors', 'Security Access Errors', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_security_auth_success_count', 'Security Authentication Success Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_security_auth_failed_count', 'Security Authentication Failed Count', {
                    extraFields: ['d.labels.`database`']
                }),
                createMetricPanel(snapshotId, 'sgw_security_total_auth_time', 'Security Total Authentication Time', {
                    extraFields: ['d.labels.`database`']
                }),
            ],
        })
    });
}
