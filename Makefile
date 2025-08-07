.PHONY: build clean test lint help

# Default target: Build all services
build: build-cm build-ga

# Build config-manager service
build-cm:
	@echo "Building config-manager service..."
	@cd cmd/config-manager && go build -o ../../bin/config-manager .

# Build grafana-app service
build-ga:
	@echo "Building grafana-app service..."
	@cd cmd/grafana-app && go build -o ../../bin/grafana-app .

# Build grafana-app plugin
build-plugin:
	@echo "Building cbmonitor grafana-app plugin..."
	@cd couchbase-monitor-app && npm install && npm run dev

build-plugin-docker:
	@build-plugin && mage -v build:linuxARM64 # TODO: add platform detection

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf bin/
	@go clean -cache

# Run tests
test:
	@echo "Running tests..."
	@cd test && go test -v .

help:
	@echo "Available targets:"
	@echo "  build       - Build all services"
	@echo "  build-cm    - Build config-manager service"
	@echo "  build-ga    - Build grafana-app service"
	@echo "  clean       - Clean build artifacts"
	@echo "  test        - Run tests"
	@echo "  help        - Show this help message"
