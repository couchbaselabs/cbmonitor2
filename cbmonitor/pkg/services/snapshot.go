package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/couchbase/cbmonitor/pkg/models"
	"github.com/couchbase/gocb/v2"
)

// SnapshotService handles snapshot-related operations
type SnapshotService struct {
	cluster *gocb.Cluster
	bucket  *gocb.Bucket
}

// NewSnapshotService creates a new snapshot service instance
func NewSnapshotService(connectionString, username, password, bucketName string) (*SnapshotService, error) {
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

	log.Printf("Snapshot service connected to Couchbase cluster: %s, bucket: %s", connectionString, bucketName)

	return &SnapshotService{
		cluster: cluster,
		bucket:  bucket,
	}, nil
}

// GetSnapshotByID fetches a snapshot document by its ID from Couchbase
func (ss *SnapshotService) GetSnapshotByID(ctx context.Context, snapshotID string) (*models.SnapshotData, error) {
	collection := ss.bucket.DefaultCollection()

	// Fetch the snapshot document
	result, err := collection.Get(snapshotID, &gocb.GetOptions{
		Timeout: 30 * time.Second,
	})
	if err != nil {
		if err == gocb.ErrDocumentNotFound {
			return nil, fmt.Errorf("snapshot not found: %s", snapshotID)
		}
		return nil, fmt.Errorf("failed to fetch snapshot: %w", err)
	}

	// Parse the document into a map to get the raw data
	var rawData map[string]interface{}
	err = result.Content(&rawData)
	if err != nil {
		return nil, fmt.Errorf("failed to parse snapshot document: %w", err)
	}

	// Parse metadata from raw data
	metadata := models.SnapshotMetadata{
		SnapshotID: snapshotID,
	}

	// Extract buckets
	if buckets, ok := rawData["buckets"].([]interface{}); ok {
		metadata.Buckets = make([]string, len(buckets))
		for i, b := range buckets {
			if bucketStr, ok := b.(string); ok {
				metadata.Buckets[i] = bucketStr
			}
		}
	}

	// Extract services
	if services, ok := rawData["services"].([]interface{}); ok {
		metadata.Services = make([]string, len(services))
		for i, s := range services {
			if serviceStr, ok := s.(string); ok {
				metadata.Services[i] = serviceStr
			}
		}
	}

	// Extract nodes
	if nodes, ok := rawData["nodes"].([]interface{}); ok {
		metadata.Nodes = make([]string, len(nodes))
		for i, n := range nodes {
			if nodeStr, ok := n.(string); ok {
				metadata.Nodes[i] = nodeStr
			}
		}
	}

	// Extract indexes
	if indexes, ok := rawData["indexes"].([]interface{}); ok {
		metadata.Indexes = make([]string, len(indexes))
		for i, idx := range indexes {
			if indexStr, ok := idx.(string); ok {
				metadata.Indexes[i] = indexStr
			}
		}
	} else {
		metadata.Indexes = []string{}
	}

	// Extract timestamps
	if tsStart, ok := rawData["ts_start"].(string); ok {
		if parsed, err := time.Parse(time.RFC3339, tsStart); err == nil {
			metadata.TSStart = parsed
		}
	}
	if tsEnd, ok := rawData["ts_end"].(string); ok {
		if parsed, err := time.Parse(time.RFC3339, tsEnd); err == nil {
			metadata.TSEnd = parsed
		}
	}

	// Determine which dashboards to show based on services
	dashboards := ss.determineDashboards(metadata.Services)

	// Create snapshot data structure
	snapshotData := &models.SnapshotData{
		Metadata:   metadata,
		Data:       rawData,
		Dashboards: dashboards,
	}

	log.Printf("Successfully fetched snapshot: %s with %d services and %d nodes", 
		snapshotID, len(metadata.Services), len(metadata.Nodes))

	return snapshotData, nil
}

// determineDashboards returns a list of dashboard IDs based on the services in the snapshot
func (ss *SnapshotService) determineDashboards(services []string) []string {
	dashboardMap := map[string]string{
		"kv":             "kv_basic",
		"index":          "index_basic",
		"query":          "query_basic",
		"fts":            "fts_basic",
		"eventing":       "eventing_basic",
		"analytics":      "analytics_basic",
		"cbas":           "analytics_basic",
		"n1ql":           "query_basic",
		"data":           "kv_basic",
		"xdcr":           "xdcr_basic",
		"cluster_manager": "cluster_manager_basic",
	}

	dashboards := []string{}
	seenDashboards := make(map[string]bool)

	// Add dashboards based on services
	for _, service := range services {
		if dashboardID, ok := dashboardMap[service]; ok {
			if !seenDashboards[dashboardID] {
				dashboards = append(dashboards, dashboardID)
				seenDashboards[dashboardID] = true
			}
		}
	}

	// Always include system dashboard
	if !seenDashboards["system_basic"] {
		dashboards = append(dashboards, "system_basic")
	}

	return dashboards
}

// Close closes the Couchbase connection
func (ss *SnapshotService) Close() error {
	if ss.cluster != nil {
		return ss.cluster.Close(nil)
	}
	return nil
}
