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

// MetricDataPoint represents a single time-series data point
type MetricDataPoint struct {
	Time  string  `json:"time"`
	Value float64 `json:"value"`
}

// MetricDataResponse represents raw metric data for a snapshot
type MetricDataResponse struct {
	Success   bool            `json:"success"`
	Metric    string          `json:"metric"`
	Snapshot  string          `json:"snapshot"`
	TimeRange *TimeRange      `json:"timeRange,omitempty"`
	Values    []MetricDataPoint `json:"values"`
	Count     int             `json:"count"`
	Error     string          `json:"error,omitempty"`
}

// TimeRange represents a time range
type TimeRange struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// MetricSummary represents pre-computed summary statistics
type MetricSummary struct {
	Count      int                `json:"count"`
	Avg        float64            `json:"avg"`
	Min        float64            `json:"min"`
	Max        float64            `json:"max"`
	Percentiles map[string]float64 `json:"percentiles"` // Always includes P50, P90, P99, plus any custom percentiles
}

// MetricSummaryResponse represents summary statistics for a metric
type MetricSummaryResponse struct {
	Success  bool          `json:"success"`
	Metric   string        `json:"metric"`
	Snapshot string        `json:"snapshot"`
	Phase    string        `json:"phase,omitempty"`
	Summary  *MetricSummary `json:"summary,omitempty"`
	Error    string        `json:"error,omitempty"`
}
