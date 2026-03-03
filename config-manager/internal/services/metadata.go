package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/couchbase/config-manager/internal/models"
)

type prometheusSDConfigEntry struct {
	Labels map[string]string `json:"labels"`
}

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
func (ms *MetadataService) CollectClusterMetadata(hostname string, port int, username, password, scheme string) (*models.SnapshotMetadata, error) {
	if scheme == "" {
		scheme = "http"
	}

	baseURL := fmt.Sprintf("%s://%s:%d", scheme, hostname, port)

	services, server, err := ms.GetMetadata(baseURL, username, password)
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}

	clusters, err := ms.GetClusters(baseURL, username, password)
	if err != nil {
		return nil, fmt.Errorf("failed to get clusters: %w", err)
	}

	return &models.SnapshotMetadata{
		SnapshotID: "",
		Services:   services,
		Clusters:   clusters,
		Server:     server,
		TsStart:    time.Now(),
		TsEnd:      "now",
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

func (ms *MetadataService) GetClusters(baseURL, username, password string) ([]models.Cluster, error) {
	endpoint, err := url.Parse(fmt.Sprintf("%s/prometheus_sd_config", baseURL))
	if err != nil {
		return nil, err
	}

	query := endpoint.Query()
	query.Set("clusterLabels", "uuidAndName")
	endpoint.RawQuery = query.Encode()

	req, err := http.NewRequest("GET", endpoint.String(), nil)
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
		return nil, fmt.Errorf("failed to get clusters: status %d", resp.StatusCode)
	}

	var entries []prometheusSDConfigEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return nil, err
	}

	clusters := make([]models.Cluster, 0)
	seen := make(map[string]struct{})

	for _, entry := range entries {
		name := entry.Labels["cluster_name"]
		if name == "" {
			name = entry.Labels["__meta_couchbase_cluster_name"]
		}

		uuid := entry.Labels["cluster_uuid"]
		if uuid == "" {
			uuid = entry.Labels["__meta_couchbase_cluster_uuid"]
		}

		if name == "" && uuid == "" {
			continue
		}

		key := uuid + "|" + name
		if _, ok := seen[key]; ok {
			continue
		}

		seen[key] = struct{}{}
		clusters = append(clusters, models.Cluster{
			Name: name,
			UID:  uuid,
		})
	}

	return clusters, nil
}
