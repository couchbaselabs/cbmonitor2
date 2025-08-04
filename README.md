# cbmonitor v2
cbmonitor build with Grafana for Couchbase Server Prometheus Metrics

## Project Structure

This repo contains two main services:

### 1. Grafana App (`cmd/grafana-app`)
The main cbmonitor implementation. It is built as a Grafana app plugin containing multiple dashboards and backend services.

### 2. Config Manager Service (`cmd/config-manager`)
A REST server responsible for creating and managing scrape target configurations for metrics collection agents such as the Grafana Alloy. It provides APIs to:
- Create scrape target configurations
- List existing configurations
- Update configurations
- Remove configurations when no longer needed

## Directory Structure

```
├── cmd/
│   ├── config-manager/           # Config manager service
│   └── grafana-app/             # Grafana app extension
├── internal/
│   ├── config-manager/           # Config manager implementation
│   │   ├── api/                 # REST API handlers
│   │   ├── config/              # Configuration management
│   │   ├── storage/             # File storage for scrape targets
│   │   └── models/              # Data models
│   └── grafana-app/             # Grafana app implementation
│       ├── dashboards/          # Dashboard definitions
│       ├── backend/             # Backend services
│       └── plugin/              # Couchbase plugin integration
├── pkg/
│   ├── couchbase/               # Couchbase utilities
│   ├── grafana/                 # Grafana integration utilities
│   └── config/                  # Shared configuration utilities
├── configs/                     # Configuration files
├── deployments/                 # Deployment configurations
│   └── docker/                  # Docker files
├── docs/                        # Documentation
├── scripts/                     # Build and utility scripts
├── test/                        # Integration tests
├── web/                         # Frontend assets
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
   make build-ga    # Grafana app
   ```

3. **Run tests:**
   ```bash
   make test
   ```

### Docker Development

1. **Build and run with Docker Compose:**
   ```bash
   cd deployments/docker
   docker compose up --build
   ```

## Configuration

- Config Manager: `configs/config-manager/config.yaml`
- Grafana App: `configs/grafana-app/config.yaml`

## Development

This project uses Go workspaces for managing the monorepo. Each service has its own module, and shared code is organized in the `pkg/` directory. Add dependencies to the appropriate service's `go.mod` file.

Note: This project uses `github.com/couchbase/cbmonitor` as the module although it is hosted at `cbmonitor2` repo.

### Running Services

```bash
# Config Manager
cd cmd/config-manager
go run .

# Grafana App
cd cmd/grafana-app
go run .
```
