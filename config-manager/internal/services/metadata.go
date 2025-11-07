package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/couchbase/config-manager/internal/models"
)

// MetadataService handles collection of Couchbase cluster metadata
type MetadataService struct {
	httpClient *http.Client
}

// NewMetadataService creates a new metadata service instance
func NewMetadataService() *MetadataService {
	return &MetadataService{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// CollectClusterMetadata collects metadata from a Couchbase cluster
func (ms *MetadataService) CollectClusterMetadata(hostname string, port int, username, password string) (*models.ClusterMetadata, error) {
	baseURL := fmt.Sprintf("http://%s:%d", hostname, port)
	// "http://%s:%d"_all_dbs
	// Collect buckets
	buckets, err := ms.getBuckets(baseURL, username, password)
	if err != nil {
		return nil, fmt.Errorf("failed to get buckets: %w", err)
	}

	// Collect nodes
	nodes, err := ms.getNodes(baseURL, username, password)
	if err != nil {
		return nil, fmt.Errorf("failed to get nodes: %w", err)
	}

	return &models.ClusterMetadata{
		Buckets:   buckets,
		Nodes:     nodes,
		Indexes:   []string{}, //TODO: add indexes
		Timestamp: time.Now(),
	}, nil
}

// getBuckets retrieves the list of buckets from the cluster
func (ms *MetadataService) getBuckets(baseURL, username, password string) ([]string, error) {
	url := fmt.Sprintf("%s/pools/default/buckets", baseURL)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.SetBasicAuth(username, password)

	resp, err := ms.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get buckets: status %d", resp.StatusCode)
	}

	var buckets []models.BucketInfo
	if err := json.NewDecoder(resp.Body).Decode(&buckets); err != nil {
		return nil, err
	}

	// Extract just the bucket names
	bucketNames := make([]string, len(buckets))
	for i, bucket := range buckets {
		bucketNames[i] = bucket.Name
	}

	return bucketNames, nil
}

// getNodes retrieves the list of nodes from the cluster
func (ms *MetadataService) getNodes(baseURL, username, password string) ([]string, error) {
	url := fmt.Sprintf("%s/pools/nodes", baseURL)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.SetBasicAuth(username, password)

	resp, err := ms.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to get nodes: status %d", resp.StatusCode)
	}

	var nodeResponse struct {
		Nodes []models.NodeInfo `json:"nodes"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&nodeResponse); err != nil {
		return nil, err
	}

	// Extract just the node hostnames
	nodeNames := make([]string, len(nodeResponse.Nodes))
	for i, node := range nodeResponse.Nodes {
		nodeNames[i] = node.Hostname
	}

	return nodeNames, nil
}
