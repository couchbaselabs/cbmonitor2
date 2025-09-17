# cbmonitor v2
cbmonitor build with Grafana for Couchbase Server Prometheus Metrics.

## Project Structure

This repo contains two main services organized as independent projects:

### 1. Grafana App (`cbmonitor/`)
The main cbmonitor implementation. It is built as a Grafana app plugin containing multiple dashboards and backend services.

### 2. Config Manager Service (`config-manager/`)
A REST server responsible for creating and managing scrape target configurations for metrics collection agents such as the Grafana Alloy. It provides APIs to:
- Create scrape target configurations
- List existing configurations
- Update configurations
- Remove configurations when no longer needed

## Directory Structure

```
├── config-manager/              # Config manager service
│   ├── internal/
│   │   ├── api/                 # REST API handlers
│   │   ├── config/              # Configuration management
│   │   ├── storage/             # File storage for scrape targets
│   │   └── models/              # Data models
│   ├── tests/                   # Service-specific tests
│   ├── go.mod
│   └── main.go
├── cbmonitor/                   # Grafana app extension (mixed Go/Node.js)
│   ├── src/                     # Frontend source code
│   ├── pkg/                     # Go backend packages
│   ├── package.json
│   └── go.mod
├── pkg/                         # Shared packages
├── configs/                     # Configuration files
├── deployments/                 # Deployment configurations
│   └── docker/                  # Docker files
├── docs/                        # Documentation
├── scripts/                     # Build and utility scripts
```

## Quick Start

### Local Development

1. **Build all services:**
   ```bash
   make build
   ```

2. **Build individual services:**
   ```bash
   make build-cm    # Config manager
   make build-plugin # Grafana app plugin
   ```

3. **Run tests:**
   ```bash
   make test-cm     # Config manager tests
   ```

### Docker Development

1. **Build and run config-manager with docker:**
   ```bash
   make build-cm-docker
   ```
2. **Build and run the Grafana plugin with docker:**
   ```
   make build-plugin-docker
   ```


For more make commands see: `make help`

## Configuration

- Config Manager: `configs/config-manager/config.yaml`
- Grafana extension: `cbmonitor/example.env`

## Development

This project uses **independent Go modules** for each service. Each service manages its own dependencies and can be built independently.

### Module Structure

- **config-manager**: `github.com/couchbase/config-manager`
- **cbmonitor**: `github.com/couchbase/cbmonitor`

### Running Services

```bash
# Config Manager
./bin/config-manager -config /path/to/config # config path is optional
```

### Running with overrides
Configurations can be overriden as startup flags. Flag overrides take precedence over config file values. The format is: `section.field=value`. The section and field should match the yaml values of the `Config` struct.
Examples:
```
config-manager server.port=8081
config-manager server.port=8081 agent.directory=/custom/path
config-manager logging.level=debug
```

To run the Grafana app, use the docker command above or follow the instructions at [cbmonitor/README.md](cbmonitor/README.md).

## Testing

### Service Tests
Each service has its own tests located in the service directory:
- **config-manager**: `config-manager/tests/`
- **cbmonitor**: `cbmonitor/tests/` (when implemented)


## Steps to build with the datasource
1. git clone the repo
2. cd cbmonitor2
3. git submodule init 
4. git submodule update 

or, just do 
1. git clone --recurse-submodules <repo-link>
