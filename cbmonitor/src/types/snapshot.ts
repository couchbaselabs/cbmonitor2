// Types for snapshot metadata data structure

/*
Example of snapshot metadata:
{
  "id": "ab-server",
  "services": [
    "kv",
    "index",
    "query"
  ],
  "ts_start": "2025-09-28T17:09:29.808391+01:00",
  "ts_end": "2025-09-28T17:09:29.808391+01:00",
  "phases": [
    {
      "label": "load",
      "ts_start": "2025-11-06T05:10:30.215996665Z",
      "ts_end": "2025-11-06T05:15:02.070763458Z"
    },
    {
      "label": "access",
      "ts_start": "2025-11-06T05:20:30.215996665Z",
      "ts_end": "2025-11-06T05:26:02.070763458Z"
    }
  ]
}
*/

export interface Phase {
  label: string;
  ts_start: string;
  ts_end: string;
}

export interface SnapshotMetadata {
  snapshotId: string;
  services: string[];
  version: string;
  ts_start: string;
  ts_end: string;
  phases?: Phase[];
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
