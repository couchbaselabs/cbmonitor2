package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/couchbase/config-manager/internal/models"
	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

// FileStorage handles saving configurations to files
type FileStorage struct {
	baseDirectory string
}

// NewFileStorage creates a new file storage instance
func NewFileStorage(baseDirectory string) *FileStorage {
	return &FileStorage{
		baseDirectory: baseDirectory,
	}
}

// SaveSnapshot saves a snapshot configuration to a file
func (fs *FileStorage) SaveSnapshot(clusterInfo interface{}, agentType string) (string, error) {
	// Generate UUID for filename
	id := uuid.New().String()

	// Create filename based on agent type
	filename := fmt.Sprintf("%s.yml", id)

	// Create file path
	filePath := filepath.Join(fs.baseDirectory, filename)

	// Generate configuration content based on agent type
	content, err := fs.generateConfigContent(clusterInfo, agentType)
	if err != nil {
		return "", fmt.Errorf("failed to generate config content: %w", err)
	}

	// Write to file
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		return "", fmt.Errorf("failed to write config file: %w", err)
	}

	return id, nil
}

// generateConfigContent creates vmagent configuration format
func (fs *FileStorage) generateConfigContent(clusterInfo interface{}, agentType string) ([]byte, error) {
	if strings.ToLower(agentType) != "vmagent" {
		return nil, fmt.Errorf("unsupported agent type: %s, only vmagent is supported", agentType)
	}
	return fs.generateVMAgentConfig(clusterInfo)
}

// generateVMAgentConfig creates VM Agent scrape configuration
func (fs *FileStorage) generateVMAgentConfig(clusterInfo interface{}) ([]byte, error) {
	clusterMap, ok := clusterInfo.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid cluster info format")
	}

	// Extract credentials
	credentials, ok := clusterMap["credentials"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid credentials format")
	}

	username := credentials["username"].(string)
	password := credentials["password"].(string)

	// Generate UUID for job_name
	jobName := uuid.New().String()

	config := []map[string]interface{}{
		{
			"job_name": jobName,
			"basic_auth": map[string]interface{}{
				"username": username,
				"password": password,
			},
			"scheme": "http",
			"http_sd_configs": []map[string]interface{}{
				{
					"url": fmt.Sprintf("http://%s:%d/prometheus_sd_config?port=insecure", clusterMap["hostname"].(string), clusterMap["port"].(int)),
					"basic_auth": map[string]interface{}{
						"username": username,
						"password": password,
					},
				},
			},
		},
	}

	return yaml.Marshal(config)
}

func (fs *FileStorage) GetSnapshot(id string) (models.SnapshotRequest, error) {
	filePath := filepath.Join(fs.baseDirectory, fmt.Sprintf("%s.yml", id))

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return models.SnapshotRequest{}, fmt.Errorf("config file does not exist: %s", filePath)
	} else if err != nil {
		return models.SnapshotRequest{}, fmt.Errorf("error checking config file: %w", err)
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		return models.SnapshotRequest{}, fmt.Errorf("failed to read config file: %w", err)
	}

	// this will need to be changed depending on the config format or agent
	var snapshot []map[string]interface{}
	if err := yaml.Unmarshal(content, &snapshot); err != nil {
		return models.SnapshotRequest{}, fmt.Errorf("failed to unmarshal config file: %w", err)
	}

	var name string
	if v, ok := snapshot[0]["job_name"].(string); ok {
		name = v
	}

	var url string
	if sdConfigs, ok := snapshot[0]["http_sd_configs"].([]interface{}); ok && len(sdConfigs) > 0 {
		if sdConfig, ok := sdConfigs[0].(map[string]interface{}); ok {
			if placeholder, ok := sdConfig["url"].(string); ok {
				url = placeholder
			}
		}
	}
	hostname, port := ExtractFromURL(url)
	if hostname == "" || port == 0 {
		return models.SnapshotRequest{}, fmt.Errorf("invalid URL format: %s", url)
	}

	info, err := os.Stat(filePath)
	if err != nil {
		return models.SnapshotRequest{}, fmt.Errorf("error getting file info: %w", err)
	}
	timestamp := info.ModTime()

	snapshotData := models.SnapshotRequest{
		Name:      name,
		Hostname:  hostname,
		Port:      port,
		TimeStamp: timestamp,
	}

	return snapshotData, nil
}

func ExtractFromURL(url string) (string, int) {
	segments := strings.Split(url, "/")

	extractee := strings.Split(segments[2], ":")
	if len(extractee) != 2 {
		// add error managemenyt here
		return "", 0
	}
	hostname := extractee[0]
	port, _ := strconv.Atoi(extractee[1])
	return hostname, port
}

func (fs *FileStorage) DeleteSnapshot(id string) error {
	// Creates the file path to the snapshot file
	filePath := filepath.Join(fs.baseDirectory, fmt.Sprintf("%s.yml", id))

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return fmt.Errorf("config file does not exist: %s", filePath)
	} else if err != nil {
		return fmt.Errorf("error checking config file: %w", err)
	}

	// Removes the file
	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("failed to delete config file: %w", err)
	}

	return nil
}

func (fs *FileStorage) PatchSnapshot(id string) error {
	filePath := filepath.Join(fs.baseDirectory, fmt.Sprintf("%s.yml", id))
	now := time.Now()
	return os.Chtimes(filePath, now, now)
}
