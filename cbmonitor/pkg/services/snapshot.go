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
	cluster        *gocb.Cluster
	bucket         *gocb.Bucket
	scopeName      string
	collectionName string
}

// NewSnapshotService creates a new snapshot service instance.
// Empty values fall back to "_default" scope and collection.
func NewSnapshotService(connectionString, username, password, bucketName, scopeName, collectionName string) (*SnapshotService, error) {
	if scopeName == "" {
		scopeName = "_default"
	}
	if collectionName == "" {
		collectionName = "_default"
	}

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

	// Verify readiness in the background instead of blocking the caller.
	// gocb.Connect/Bucket return without network I/O; only WaitUntilReady
	// blocks. Blocking here would stall App instantiation in the Grafana plugin,
	// which in turn gates the datasource/dashboard reconcile. Operations are queued until
	// the cluster is ready, so the first query still succeeds once bootstrap
	// completes.
	go func() {
		if err := bucket.WaitUntilReady(30*time.Second, nil); err != nil {
			log.Printf("Snapshot service: bucket %q not ready within 30s: %v", bucketName, err)
			return
		}
		log.Printf("Snapshot service connected to Couchbase cluster: %s, bucket: %s, scope: %s, collection: %s",
			connectionString, bucketName, scopeName, collectionName)
	}()

	return &SnapshotService{
		cluster:        cluster,
		bucket:         bucket,
		scopeName:      scopeName,
		collectionName: collectionName,
	}, nil
}

// GetSnapshotByID fetches a snapshot document by its ID from Couchbase
func (ss *SnapshotService) GetSnapshotByID(ctx context.Context, snapshotID string) (*models.SnapshotData, error) {
	collection := ss.bucket.Scope(ss.scopeName).Collection(ss.collectionName)

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

	// Extract services
	if services, ok := rawData["services"].([]interface{}); ok {
		metadata.Services = make([]string, len(services))
		for i, s := range services {
			if serviceStr, ok := s.(string); ok {
				metadata.Services[i] = serviceStr
			}
		}
	}

	// Extract version from "server" field (backend stores as "server", frontend expects "version")
	if server, ok := rawData["server"].(string); ok {
		metadata.Version = server
	}

	// Extract timestamps
	if tsStart, ok := rawData["ts_start"].(string); ok {
		metadata.TSStart = tsStart
	}
	if tsEnd, ok := rawData["ts_end"].(string); ok {
		metadata.TSEnd = tsEnd
	}

	// Extract phases if present
	if phases, ok := rawData["phases"].([]interface{}); ok {
		metadata.Phases = make([]models.Phase, 0, len(phases))
		for _, p := range phases {
			if phaseMap, ok := p.(map[string]interface{}); ok {
				phase := models.Phase{}
				if label, ok := phaseMap["label"].(string); ok {
					phase.Label = label
				}
				if tsStart, ok := phaseMap["ts_start"].(string); ok {
					phase.TSStart = tsStart
				}
				if tsEnd, ok := phaseMap["ts_end"].(string); ok {
					phase.TSEnd = tsEnd
				}
				metadata.Phases = append(metadata.Phases, phase)
			}
		}
	}

	// Extract label if present
	if label, ok := rawData["label"].(string); ok {
		metadata.Label = label
	}

	// Extract products (the distinct set this snapshot scrapes, e.g.
	// ["couchbase"] or ["kafka"]). Drives the frontend's Couchbase-baseline
	// tab decision.
	if products, ok := rawData["products"].([]interface{}); ok {
		metadata.Products = make([]string, 0, len(products))
		for _, p := range products {
			if productStr, ok := p.(string); ok {
				metadata.Products = append(metadata.Products, productStr)
			}
		}
	}

	// Extract optional custom_panels config(s). Accepts either a single
	// object (legacy single-tab form) or an array of objects (each
	// becomes its own tab). Entries with an empty match are dropped.
	switch raw := rawData["custom_panels"].(type) {
	case []interface{}:
		for _, entry := range raw {
			if m, ok := entry.(map[string]interface{}); ok {
				if cp, ok := parseCustomPanelsConfig(m); ok {
					metadata.CustomPanels = append(metadata.CustomPanels, cp)
				}
			}
		}
	case map[string]interface{}:
		if cp, ok := parseCustomPanelsConfig(raw); ok {
			metadata.CustomPanels = append(metadata.CustomPanels, cp)
		}
	}

	// Extract clusters if present
	if clusters, ok := rawData["clusters"].([]interface{}); ok {
		metadata.Clusters = make([]models.Cluster, 0, len(clusters))
		for i, c := range clusters {
			if clusterMap, ok := c.(map[string]interface{}); ok {
				cluster := models.Cluster{}
				if uid, ok := clusterMap["uid"].(string); ok {
					cluster.UID = uid
				}
				if name, ok := clusterMap["name"].(string); ok {
					cluster.Name = name
				}
				// Assign default name if not provided
				if cluster.Name == "" {
					cluster.Name = fmt.Sprintf("cluster%d", i+1)
				}
				if targets, ok := clusterMap["targets"].([]interface{}); ok {
					cluster.Targets = make([]string, 0, len(targets))
					for _, t := range targets {
						if target, ok := t.(string); ok {
							cluster.Targets = append(cluster.Targets, target)
						}
					}
				}
				metadata.Clusters = append(metadata.Clusters, cluster)
			}
		}
	}

	// Create a copy of rawData without metadata fields to avoid duplication
	dataWithoutMetadata := make(map[string]interface{})
	metadataFields := map[string]bool{
		"id":            true,
		"services":      true,
		"server":        true,
		"version":       true,
		"ts_start":      true,
		"ts_end":        true,
		"phases":        true,
		"label":         true,
		"clusters":      true,
		"custom_panels": true,
		"products":      true,
	}
	for k, v := range rawData {
		if !metadataFields[k] {
			dataWithoutMetadata[k] = v
		}
	}

	// Determine which dashboards to show based on services
	dashboards := ss.determineDashboards(metadata.Services)

	// Create snapshot data structure
	snapshotData := &models.SnapshotData{
		Metadata:   metadata,
		Data:       dataWithoutMetadata,
		Dashboards: dashboards,
	}

	log.Printf("Successfully fetched snapshot: %s with %d services.", snapshotID, len(metadata.Services))

	return snapshotData, nil
}

// determineDashboards returns a list of dashboard IDs based on the services in the snapshot
func (ss *SnapshotService) determineDashboards(services []string) []string {
	dashboardMap := map[string]string{
		"kv":              "kv_basic",
		"index":           "index_basic",
		"query":           "query_basic",
		"fts":             "fts_basic",
		"eventing":        "eventing_basic",
		"analytics":       "analytics_basic",
		"cbas":            "analytics_basic",
		"n1ql":            "query_basic",
		"data":            "kv_basic",
		"xdcr":            "xdcr_basic",
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

// parseCustomPanelsConfig pulls a single CustomPanelsConfig out of a raw
// JSON object. Returns ok=false when the required `match` field is empty
// so callers can skip incomplete entries instead of rendering an empty tab.
func parseCustomPanelsConfig(raw map[string]interface{}) (models.CustomPanelsConfig, bool) {
	cp := models.CustomPanelsConfig{}
	if v, ok := raw["title"].(string); ok {
		cp.Title = v
	}
	if v, ok := raw["match"].(string); ok {
		cp.Match = v
	}
	if v, ok := raw["rate_match"].(string); ok {
		cp.RateMatch = v
	}
	if ovs, ok := raw["overrides"].(map[string]interface{}); ok {
		cp.Overrides = make(map[string]models.CustomPanelOverride, len(ovs))
		for name, val := range ovs {
			om, ok := val.(map[string]interface{})
			if !ok {
				continue
			}
			ov := models.CustomPanelOverride{}
			if s, ok := om["title"].(string); ok {
				ov.Title = s
			}
			if s, ok := om["unit"].(string); ok {
				ov.Unit = s
			}
			if s, ok := om["transformFunction"].(string); ok {
				ov.TransformFunction = s
			}
			if s, ok := om["legendFormat"].(string); ok {
				ov.LegendFormat = s
			}
			cp.Overrides[name] = ov
		}
	}
	if cp.Match == "" {
		return models.CustomPanelsConfig{}, false
	}
	return cp, true
}

// Close closes the Couchbase connection
func (ss *SnapshotService) Close() error {
	if ss.cluster != nil {
		return ss.cluster.Close(nil)
	}
	return nil
}
