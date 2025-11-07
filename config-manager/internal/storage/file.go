package storage

import (
	"fmt"
	// "go/format"
	// "net/http"
	"os"
	"path/filepath"
	// "strconv"
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
	content, err := fs.generateConfigContent(clusterInfo, agentType, id)
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
func (fs *FileStorage) generateConfigContent(clusterInfo interface{}, agentType string, id string) ([]byte, error) {
	if strings.ToLower(agentType) != "vmagent" {
		return nil, fmt.Errorf("unsupported agent type: %s, only vmagent is supported", agentType)
	}
	return fs.generateVMAgentConfig(clusterInfo, id)
}

// generateVMAgentConfig creates VM Agent scrape configuration
func (fs *FileStorage) generateVMAgentConfig(clusterInfo interface{}, id string) ([]byte, error) {
	clusterMap, ok := clusterInfo.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid cluster info format")
	}

	// Extract configs 
	configsRaw, ok := clusterMap["configs"].([]interface{})
	if !ok || len(configsRaw) == 0 {
		return nil, fmt.Errorf("invalid configs format")
	}

	configs := make([]map[string]interface{}, len(configsRaw))
	for i, c := range configsRaw {
		m, ok := c.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("invalid config object format")
		}
		configs[i] = m
	}

	// Extract credentials
	credentials, ok := clusterMap["credentials"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid credentials format")
	}

	username := credentials["username"].(string)
	password := credentials["password"].(string)

	// Extract scheme, default to http if not provided
	scheme, ok := clusterMap["scheme"].(string)
	if !ok || scheme == "" {
		scheme = "http"
	}

	// Generate UUID for job_name
	jobName := id

	//. preparing yaml sections for configs
	httpSDConfigs := []map[string]interface{}{}
	staticConfigs := []map[string]interface{}{}

	for _, config := range configs {
		hostnames, ok := config["hostnames"].([]string)
		if !ok || len(hostnames) == 0 {
			return nil, fmt.Errorf("invalid hostnames format")
		}

		port, ok := config["port"].(int)
		if !ok {
			return nil, fmt.Errorf("invalid port format")
		}

		switch configType := config["type"].(string); configType {
		case "sd":
			for _, hostname := range hostnames {
				httpSDConfigs = append(httpSDConfigs, map[string]interface{}{
					"url": fmt.Sprintf("%s://%s:%d/prometheus_sd_config?port=insecure", scheme, hostname, port),
				})
			}
		case "static":
			targetList := []string{}
			for _, hostname := range hostnames {
				targetList = append(targetList, fmt.Sprintf("%s:%d", hostname, port))
			}
			staticConfigs = append(staticConfigs, map[string]interface{}{
				"targets": targetList,
			})
		default:
			return nil, fmt.Errorf("unsupported config type: %s", configType)
		}
	}

	yamlConfig := map[string]interface{}{
		"job_name": jobName,
		"basic_auth": map[string]interface{}{
			"username": username,
			"password": password,
		},
		"scheme": scheme,
	}

	if len(httpSDConfigs) > 0 {
		yamlConfig["http_sd_configs"] = httpSDConfigs
	}

	if len(staticConfigs) > 0 {
		yamlConfig["static_configs"] = staticConfigs
	}

	return yaml.Marshal([]map[string]interface{}{yamlConfig})
}

func (fs *FileStorage) GetSnapshot(id string) (models.DisplaySnapshot, error) {
	filePath := filepath.Join(fs.baseDirectory, fmt.Sprintf("%s.yml", id))

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return models.DisplaySnapshot{}, fmt.Errorf("config file does not exist: %s", filePath)
	} else if err != nil {
		return models.DisplaySnapshot{}, fmt.Errorf("error checking config file: %w", err)
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		return models.DisplaySnapshot{}, fmt.Errorf("failed to read config file: %w", err)
	}

	// this will need to be changed depending on the config format or agent
	var snapshot []map[string]interface{}
	if err := yaml.Unmarshal(content, &snapshot); err != nil {
		return models.DisplaySnapshot{}, fmt.Errorf("failed to unmarshal config file: %w", err)
	}

	var name string
	if v, ok := snapshot[0]["job_name"].(string); ok {
		name = v
	}
	// extract urls from http_sd_configs
	var urls []string
	if sdConfigs, ok := snapshot[0]["http_sd_configs"].([]interface{}); ok && len(sdConfigs) > 0 {
		for _, url := range sdConfigs {
			if m, ok := url.(map[string]interface{}); ok {
				if url, ok := m["url"].(string); ok {
					urls = append(urls, url)
				}
			}
		}
	}
	
	// extract targets from static_configs
	var targets []string
	if staticConfigs, ok := snapshot[0]["static_configs"].([]interface{}); ok && len(staticConfigs) > 0 {
		for _, eachTarget := range staticConfigs {
			if m, ok := eachTarget.(map[string]interface{}); ok {
				if target, ok := m["target"].(string); ok {
					targets = append(targets, target)
				}
			}
		}
	}

	info, err := os.Stat(filePath)
	if err != nil {
		return models.DisplaySnapshot{}, fmt.Errorf("error getting file info: %w", err)
	}

	// get the file modification time
	timestamp := info.ModTime()

	snapshotData := models.DisplaySnapshot{
		Name:      name,
		Urls:      urls,
		Targets:   targets,
		TimeStamp: timestamp,
	}

	return snapshotData, nil
}

// func ExtractFromURL(url string) (string, int) {
// 	segments := strings.Split(url, "/")

// 	extractee := strings.Split(segments[2], ":")
// 	if len(extractee) != 2 {
// 		// add error managemenyt here
// 		return "", 0
// 	}
// 	hostname := extractee[0]
// 	port, _ := strconv.Atoi(extractee[1])
// 	return hostname, port
// }

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
	// TO DO: update this, in the future, to also update other configs
	filePath := filepath.Join(fs.baseDirectory, fmt.Sprintf("%s.yml", id))
	now := time.Now()
	return os.Chtimes(filePath, now, now)
}
