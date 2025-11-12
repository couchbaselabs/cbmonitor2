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
func (ms *MetadataService) CollectClusterMetadata(hostname string, port int, username, password string) (*models.SnapshotMetadata, error) {
	baseURL := fmt.Sprintf("http://%s:%d", hostname, port) // "http://%s:%d"_all_dbs

	services, server, err := ms.GetMetadata(baseURL, username, password)
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}

	return &models.SnapshotMetadata{
		SnapshotID: "",
		Services:   services,
		Server:     server,
		TsStart:    time.Now(),
		
	}, nil
}
// this gets both the services and the server version from the /pools/nodes endpoint
func (ms *MetadataService) GetMetadata(baseURL, username, password string) ([]string, string, error) {
	url := fmt.Sprintf("%s/pools/nodes", baseURL)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}

	req.SetBasicAuth(username, password)

	resp, err := ms.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("failed to get services: status %d", resp.StatusCode)
	}

	var poolInfo models.PoolsDefault

	if err := json.NewDecoder(resp.Body).Decode(&poolInfo); err != nil {
		return nil, "", err
	}

	var uniqueServices = make(map[string]struct{})
	var serviceList []string

	// collect unique services from all nodes
	for _, node := range poolInfo.Nodes {
		for _, service := range node.Services { 
			if _, exists := uniqueServices[service]; !exists {
				uniqueServices[service] = struct{}{}
				serviceList = append(serviceList, service)
			}
		}
	}
	// the server version is taken from the first node, because it is the same across all nodes
	return serviceList, poolInfo.Nodes[0].Server, nil
}