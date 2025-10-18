package models

import "time"

// SnapshotMetadata represents the snapshot metadata structure from Couchbase
type SnapshotMetadata struct {
	SnapshotID string    `json:"snapshotId" couchbase:"id"`
	Buckets    []string  `json:"buckets" couchbase:"buckets"`
	Services   []string  `json:"services" couchbase:"services"`
	Nodes      []string  `json:"nodes" couchbase:"nodes"`
	Indexes    []string  `json:"indexes" couchbase:"indexes"`
	TSStart    time.Time `json:"ts_start" couchbase:"ts_start"`
	TSEnd      time.Time `json:"ts_end" couchbase:"ts_end"`
}

// SnapshotData represents the complete snapshot data including metadata and raw data
type SnapshotData struct {
	Metadata   SnapshotMetadata       `json:"metadata"`
	Data       map[string]interface{} `json:"data"`
	Dashboards []string               `json:"dashboards,omitempty"`
}

// SnapshotResponse represents the API response structure for snapshots
type SnapshotResponse struct {
	Success bool         `json:"success"`
	Data    SnapshotData `json:"data,omitempty"`
	Error   string       `json:"error,omitempty"`
}

