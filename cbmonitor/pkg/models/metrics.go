package models

import "time"

// MetricDocument represents the metric document structure from Couchbase
type MetricDocument struct {
	ID          string `json:"id" couchbase:"id"`
	Title       string `json:"title" couchbase:"title"`
	Component   string `json:"component" couchbase:"component"`
	Category    string `json:"category" couchbase:"category"`
	OrderBy     int    `json:"orderBy" couchbase:"orderBy"`
	SubCategory string `json:"subCategory" couchbase:"subCategory"`
	MemQuota    string `json:"memquota" couchbase:"memquota"`
	Provider    string `json:"provider" couchbase:"provider"`
	Cluster     string `json:"cluster" couchbase:"cluster"`
}

// MetricValue represents a metric value for a specific version
type MetricValue struct {
	Version     string    `json:"version"`
	Value       float64   `json:"value"`
	Timestamp   time.Time `json:"timestamp"`
	BuildNumber string    `json:"buildNumber,omitempty"`
}

// Metric represents a complete metric with its historical values
type Metric struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Unit        string        `json:"unit"`
	Category    string        `json:"category"`
	Values      []MetricValue `json:"values"`
}

// ComponentMetrics represents all metrics for a component
type ComponentMetrics struct {
	ComponentID   string    `json:"componentId"`
	ComponentName string    `json:"componentName"`
	Metrics       []Metric  `json:"metrics"`
	LastUpdated   time.Time `json:"lastUpdated"`
}

// MetricsResponse represents the API response structure
type MetricsResponse struct {
	Success bool             `json:"success"`
	Data    ComponentMetrics `json:"data,omitempty"`
	Error   string           `json:"error,omitempty"`
}

// MetricsQueryParams represents query parameters for metrics
type MetricsQueryParams struct {
	Component   string `json:"component"`
	Category    string `json:"category"`
	SubCategory string `json:"subCategory"`
	Limit       int    `json:"limit,omitempty"`
}
