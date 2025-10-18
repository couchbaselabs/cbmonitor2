// Types for snapshot metadata data structure

/*
Example of snapshot metadata:
{
  "id": "ab-server",
  "buckets": [
    "cbmonitor",
    "metadata"
  ],
  "services": [
    "kv",
    "index",
    "query"
  ],
  "nodes": [
    "<ip_address>:8091",
    "<ip_address_2>:8091"
  ],
  "indexes": [],
  "ts_start": "2025-09-28T17:09:29.808391+01:00",
  "ts_end": "2025-09-28T17:09:29.808391+01:00"
}
*/
export interface SnapshotMetadata {
  snapshotId: string;
  buckets: string[];
  services: string[];
  nodes: string[];
  indexes: string[];
  ts_start: string;
  ts_end: string;
}

export interface SnapshotData {
  metadata: SnapshotMetadata;
  data: Record<string, any>; // The actual snapshot data - flexible structure
  dashboards?: string[]; // List of dashboard IDs to load
}

// API response types
export interface SnapshotApiResponse {
  success: boolean;
  data: SnapshotData;
  error?: string;
}
