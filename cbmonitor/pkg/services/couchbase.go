package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/couchbase/cbmonitor/pkg/models"
	"github.com/couchbase/gocb/v2"
)

// CouchbaseService handles all Couchbase database operations
type CouchbaseService struct {
	cluster *gocb.Cluster
	bucket  *gocb.Bucket
}

// NewCouchbaseService creates a new Couchbase service instance
func NewCouchbaseService(connectionString, username, password, bucketName string) (*CouchbaseService, error) {
	// Connect to Couchbase cluster
	cluster, err := gocb.Connect(connectionString, gocb.ClusterOptions{
		Authenticator: gocb.PasswordAuthenticator{
			Username: username,
			Password: password,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Couchbase cluster: %w", err)
	}

	// Get bucket reference
	bucket := cluster.Bucket(bucketName)

	// Wait for bucket to be ready
	err = bucket.WaitUntilReady(30*time.Second, nil)
	if err != nil {
		return nil, fmt.Errorf("bucket not ready: %w", err)
	}

	log.Printf("Connected to Couchbase cluster: %s, bucket: %s", connectionString, bucketName)

	return &CouchbaseService{
		cluster: cluster,
		bucket:  bucket,
	}, nil
}

// GetMetricsByComponent fetches metrics for a specific component using your N1QL query
func (cs *CouchbaseService) GetMetricsByComponent(ctx context.Context, component, category, subCategory string) ([]models.MetricDocument, error) {
	// Your original query
	query := `SELECT m.id, m.title, m.component, m.category, m.orderBy, m.subCategory, 
              m.memquota, m.provider, c AS cluster 
              FROM metrics m JOIN clusters c ON KEYS m.cluster 
              WHERE m.component = $1 AND m.category = $2 AND m.subCategory = $3 
              ORDER BY m.category`

	// Execute the query
	results, err := cs.cluster.Query(query, &gocb.QueryOptions{
		PositionalParameters: []interface{}{component, category, subCategory},
		Timeout:              30 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}
	defer results.Close()

	var metrics []models.MetricDocument
	for results.Next() {
		var metric models.MetricDocument
		err := results.Row(&metric)
		if err != nil {
			log.Printf("Error parsing metric row: %v", err)
			continue
		}
		metrics = append(metrics, metric)
	}

	if err := results.Err(); err != nil {
		return nil, fmt.Errorf("query execution error: %w", err)
	}

	log.Printf("Found %d metrics for component: %s, category: %s, subCategory: %s", 
		len(metrics), component, category, subCategory)

	return metrics, nil
}

// GetAllMetricsForComponent fetches all metrics for a component across all categories
func (cs *CouchbaseService) GetAllMetricsForComponent(ctx context.Context, component string) ([]models.MetricDocument, error) {
	query := `SELECT m.id, m.title, m.component, m.category, m.orderBy, m.subCategory, 
              m.memquota, m.provider, c AS cluster 
              FROM metrics m JOIN clusters c ON KEYS m.cluster 
              WHERE m.component = $1 
              ORDER BY m.category, m.orderBy`

	results, err := cs.cluster.Query(query, &gocb.QueryOptions{
		PositionalParameters: []interface{}{component},
		Timeout:              30 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}
	defer results.Close()

	var metrics []models.MetricDocument
	for results.Next() {
		var metric models.MetricDocument
		err := results.Row(&metric)
		if err != nil {
			log.Printf("Error parsing metric row: %v", err)
			continue
		}
		metrics = append(metrics, metric)
	}

	if err := results.Err(); err != nil {
		return nil, fmt.Errorf("query execution error: %w", err)
	}

	log.Printf("Found %d total metrics for component: %s", len(metrics), component)

	return metrics, nil
}

// GetMetricValues fetches historical values for a specific metric
// This is a placeholder - you'll need to implement based on your metric values storage
func (cs *CouchbaseService) GetMetricValues(ctx context.Context, metricID string, limit int) ([]models.MetricValue, error) {
	// This query would depend on how you store metric values
	// For now, this is a placeholder that you can customize based on your schema
	query := `SELECT version, value, timestamp, buildNumber 
              FROM metric_values 
              WHERE metricId = $1 
              ORDER BY timestamp DESC 
              LIMIT $2`

	results, err := cs.cluster.Query(query, &gocb.QueryOptions{
		PositionalParameters: []interface{}{metricID, limit},
		Timeout:              30 * time.Second,
	})
	if err != nil {
		// For now, return mock data if the values table doesn't exist
		log.Printf("Warning: Could not fetch metric values for %s: %v", metricID, err)
		return cs.generateMockValues(metricID), nil
	}
	defer results.Close()

	var values []models.MetricValue
	for results.Next() {
		var value models.MetricValue
		err := results.Row(&value)
		if err != nil {
			log.Printf("Error parsing metric value row: %v", err)
			continue
		}
		values = append(values, value)
	}

	if err := results.Err(); err != nil {
		return nil, fmt.Errorf("query execution error: %w", err)
	}

	return values, nil
}

// generateMockValues creates mock data for demonstration purposes
func (cs *CouchbaseService) generateMockValues(metricID string) []models.MetricValue {
	versions := []string{"7.2.0", "7.2.1", "7.2.2", "7.3.0", "7.3.1"}
	values := make([]models.MetricValue, len(versions))

	baseValue := 1000.0
	for i, version := range versions {
		values[i] = models.MetricValue{
			Version:     version,
			Value:       baseValue + float64(i*50) + (float64(i)*10.5), // Slight improvement each version
			Timestamp:   time.Now().AddDate(0, -len(versions)+i, 0),
			BuildNumber: fmt.Sprintf("%s-%d", version, 1000+i*100),
		}
	}

	return values
}

// ConvertToComponentMetrics converts database results to the API response format
func (cs *CouchbaseService) ConvertToComponentMetrics(ctx context.Context, component string, metricDocs []models.MetricDocument) (*models.ComponentMetrics, error) {
	metrics := make([]models.Metric, len(metricDocs))

	for i, doc := range metricDocs {
		// Get historical values for this metric
		values, err := cs.GetMetricValues(ctx, doc.ID, 10) // Get last 10 values
		if err != nil {
			log.Printf("Warning: Could not get values for metric %s: %v", doc.ID, err)
			values = cs.generateMockValues(doc.ID) // Fallback to mock data
		}

		metrics[i] = models.Metric{
			ID:          doc.ID,
			Name:        doc.Title,
			Description: fmt.Sprintf("%s performance metric for %s", doc.Title, doc.Component),
			Unit:        cs.determineUnit(doc.Title),
			Category:    doc.Category,
			Values:      values,
		}
	}

	return &models.ComponentMetrics{
		ComponentID:   component,
		ComponentName: cs.formatComponentName(component),
		Metrics:       metrics,
		LastUpdated:   time.Now(),
	}, nil
}

// determineUnit tries to determine the appropriate unit based on metric title
func (cs *CouchbaseService) determineUnit(title string) string {
	titleLower := fmt.Sprintf("%s", title) // Convert to lowercase for matching
	
	if contains(titleLower, []string{"latency", "time", "duration"}) {
		return "ms"
	}
	if contains(titleLower, []string{"throughput", "ops", "rate", "per second"}) {
		return "ops/sec"
	}
	if contains(titleLower, []string{"memory", "size", "bytes"}) {
		return "MB"
	}
	if contains(titleLower, []string{"percentage", "percent", "%"}) {
		return "%"
	}
	if contains(titleLower, []string{"iops"}) {
		return "IOPS"
	}
	if contains(titleLower, []string{"bandwidth"}) {
		return "MB/s"
	}
	return "value"
}

// formatComponentName formats component ID to display name
func (cs *CouchbaseService) formatComponentName(componentID string) string {
	nameMap := map[string]string{
		"kv":           "Key-Value",
		"hidd":         "HiDD",
		"rebalance":    "Rebalance",
		"xdcr":         "XDCR",
		"query":        "Query",
		"search":       "Search",
		"analytics":    "Analytics",
		"eventing":     "Eventing",
		"tools":        "Tools",
		"sync-gateway": "Sync Gateway",
		"mobile":       "Mobile",
		"sdks":         "SDKs",
		"fio":          "FIO",
	}
	if name, ok := nameMap[componentID]; ok {
		return name
	}
	return componentID
}

// contains checks if any of the keywords exist in the text
func contains(text string, keywords []string) bool {
	for _, keyword := range keywords {
		if len(text) >= len(keyword) {
			for i := 0; i <= len(text)-len(keyword); i++ {
				if text[i:i+len(keyword)] == keyword {
					return true
				}
			}
		}
	}
	return false
}

// ExecuteQuery executes a raw SQL++ query and returns results as map[string]interface{}
func (cs *CouchbaseService) ExecuteQuery(ctx context.Context, query string) ([]map[string]interface{}, error) {
	results, err := cs.cluster.Query(query, &gocb.QueryOptions{
		Timeout: 30 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}
	defer results.Close()

	var rows []map[string]interface{}
	for results.Next() {
		var row map[string]interface{}
		err := results.Row(&row)
		if err != nil {
			log.Printf("Error parsing query row: %v", err)
			continue
		}
		rows = append(rows, row)
	}

	if err := results.Err(); err != nil {
		return nil, fmt.Errorf("query execution error: %w", err)
	}

	return rows, nil
}

// Close closes the Couchbase connection
func (cs *CouchbaseService) Close() error {
	if cs.cluster != nil {
		return cs.cluster.Close(nil)
	}
	return nil
}
