package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/couchbase/config-manager/internal/models"
	"github.com/couchbase/config-manager/internal/products"
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

	type scrapeBucket struct {
		httpSDConfigs []map[string]interface{}
		staticConfigs []map[string]interface{}
	}
	buckets := map[string]*scrapeBucket{}
	bucketFor := func(scheme string) *scrapeBucket {
		b, ok := buckets[scheme]
		if !ok {
			b = &scrapeBucket{}
			buckets[scheme] = b
		}
		return b
	}

	for _, config := range configs {
		hostnames, ok := config["hostnames"].([]string)
		if !ok || len(hostnames) == 0 {
			return nil, fmt.Errorf("invalid hostnames format")
		}

		port, ok := config["port"].(int)
		if !ok {
			return nil, fmt.Errorf("invalid port format")
		}

		configScheme, _ := config["scheme"].(string)
		if configScheme == "" {
			configScheme = "http"
		}
		bucket := bucketFor(configScheme)

		switch configType := config["type"].(string); configType {
		case "sd":
			product, _ := config["product"].(string)
			sdPath, _ := config["sd_path"].(string)
			// Caller-supplied sd_path wins; otherwise fall back to the
			// product registry's default. The validator has already
			// ensured one of the two is non-empty by this point.
			path := sdPath
			if path == "" {
				if p := products.Get(product); p != nil && p.ResolveSDPath != nil {
					path = p.ResolveSDPath(configScheme)
				}
			}
			for _, hostname := range hostnames {
				sdURL := fmt.Sprintf("%s://%s:%d%s", configScheme, hostname, port, path)
				sdEntry := map[string]interface{}{
					"url": sdURL,
					"basic_auth": map[string]interface{}{
						"username": username,
						"password": password,
					},
				}
				if configScheme == "https" {
					sdEntry["tls_config"] = map[string]interface{}{"insecure_skip_verify": true}
				}
				bucket.httpSDConfigs = append(bucket.httpSDConfigs, sdEntry)
			}
		case "static":
			targetList := []string{}
			for _, hostname := range hostnames {
				targetList = append(targetList, fmt.Sprintf("%s:%d", hostname, port))
			}
			bucket.staticConfigs = append(bucket.staticConfigs, map[string]interface{}{
				"targets": targetList,
			})
		default:
			return nil, fmt.Errorf("unsupported config type: %s", configType)
		}
	}

	// Emit one Prometheus job per scheme bucket. When the file contains
	// more than one bucket, suffix job_name with the scheme so each job is
	// uniquely named, and use relabel_configs to rewrite the scraped `job`
	// label back to the snapshot id — cbmonitor's PromQL selects by
	// job="<id>" and must stay green across both halves.
	jobs := []map[string]interface{}{}
	multiBucket := len(buckets) > 1
	for _, scheme := range []string{"http", "https"} {
		bucket, ok := buckets[scheme]
		if !ok {
			continue
		}

		jobName := id
		if multiBucket {
			jobName = id + "-" + scheme
		}

		yamlConfig := map[string]interface{}{
			"job_name": jobName,
			"basic_auth": map[string]interface{}{
				"username": username,
				"password": password,
			},
			"scheme": scheme,
		}

		if scheme == "https" {
			yamlConfig["tls_config"] = map[string]interface{}{"insecure_skip_verify": true}
		}

		if len(bucket.httpSDConfigs) > 0 {
			yamlConfig["http_sd_configs"] = bucket.httpSDConfigs
		}

		if len(bucket.staticConfigs) > 0 {
			yamlConfig["static_configs"] = bucket.staticConfigs
		}

		if multiBucket {
			yamlConfig["relabel_configs"] = []map[string]interface{}{
				{"target_label": "job", "replacement": id},
			}
		}

		jobs = append(jobs, yamlConfig)
	}

	return yaml.Marshal(jobs)
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

	// A snapshot file may contain multiple jobs (one per scheme) when the
	// payload mixed http and https configs; aggregate URLs and targets
	// across every job. The display name is always the snapshot id —
	// per-job job_name values may carry `-http`/`-https` suffixes.
	name := id
	var urls []string
	var targets []string
	for _, job := range snapshot {
		if sdConfigs, ok := job["http_sd_configs"].([]interface{}); ok {
			for _, sd := range sdConfigs {
				m, ok := sd.(map[string]interface{})
				if !ok {
					continue
				}
				if u, ok := m["url"].(string); ok {
					urls = append(urls, u)
				}
			}
		}
		if staticConfigs, ok := job["static_configs"].([]interface{}); ok {
			for _, eachStatic := range staticConfigs {
				m, ok := eachStatic.(map[string]interface{})
				if !ok {
					continue
				}
				tlist, ok := m["targets"].([]interface{})
				if !ok {
					continue
				}
				for _, t := range tlist {
					if target, ok := t.(string); ok {
						targets = append(targets, target)
					}
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
