package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

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
