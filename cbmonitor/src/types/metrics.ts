// Types for metrics data structure
export interface MetricValue {
  version: string;
  value: number;
  timestamp?: string;
  buildNumber?: string;
}

export interface Metric {
  id: string;
  name: string;
  description: string;
  unit: string; // e.g., "ms", "ops/sec", "MB", "%"
  category: string; // e.g., "performance", "throughput", "latency"
  values: MetricValue[];
}

export interface ComponentMetrics {
  componentId: string;
  componentName: string;
  metrics: Metric[];
  lastUpdated: string;
}

// API response types
export interface MetricsApiResponse {
  success: boolean;
  data: ComponentMetrics;
  error?: string;
}

// Example metric definitions for each component
export const METRIC_DEFINITIONS: Record<string, string[]> = {
  kv: [
    'kv_99p_throughput',
    'kv_95p_latency', 
    'kv_set_latency',
    'kv_get_latency',
    'kv_ops_per_second',
    'draft-1'
  ],
  hidd: [
    'hidd_read_throughput',
    'hidd_write_throughput',
    'hidd_io_latency'
  ],
  rebalance: [
    'rebalance_duration',
    'rebalance_data_transfer_rate',
    'rebalance_vbucket_moves'
  ],
  xdcr: [
    'xdcr_replication_lag',
    'xdcr_throughput',
    'xdcr_conflict_rate'
  ],
  query: [
    'query_response_time',
    'query_throughput',
    'query_cache_hit_rate'
  ],
  search: [
    'search_index_size',
    'search_query_latency',
    'search_indexing_rate'
  ],
  analytics: [
    'analytics_query_time',
    'analytics_data_ingestion_rate',
    'analytics_memory_usage'
  ],
  eventing: [
    'eventing_function_execution_time',
    'eventing_doc_processing_rate',
    'eventing_error_rate'
  ],
  tools: [
    'backup_duration',
    'restore_duration',
    'compaction_rate'
  ],
  'sync-gateway': [
    'sync_gateway_connections',
    'sync_gateway_sync_latency',
    'sync_gateway_conflict_rate'
  ],
  mobile: [
    'mobile_sync_time',
    'mobile_offline_data_size',
    'mobile_push_latency'
  ],
  sdks: [
    'sdk_connection_time',
    'sdk_operation_latency',
    'sdk_error_rate'
  ],
  fio: [
    'fio_read_iops',
    'fio_write_iops',
    'fio_bandwidth'
  ]
};
