package models

// Phase represents a phase in the snapshot
type Phase struct {
	Label   string `json:"label"`
	TSStart string `json:"ts_start,omitempty"`
	TSEnd   string `json:"ts_end,omitempty"`
}

// SnapshotMetadata represents the snapshot metadata structure from Couchbase
type SnapshotMetadata struct {
	SnapshotID string    `json:"snapshotId" couchbase:"id"`
	Services   []string  `json:"services" couchbase:"services"`
	Version    string    `json:"version" couchbase:"server"`
	TSStart    string    `json:"ts_start" couchbase:"ts_start"`
	TSEnd      string    `json:"ts_end" couchbase:"ts_end"`
	Phases     []Phase   `json:"phases,omitempty"`
	Label      string    `json:"label,omitempty"`
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
