.PHONY: build clean test lint help

# Default target: Build all services
build: build-cm

# Build the config-manager service
build-cm:
	@echo "Building config-manager service..."
	@cd config-manager && go build -o ../bin/config-manager .

# Build the config-manager service docker image
build-cm-docker: build-cm
	@echo "Building config-manager service docker image..."
	@cd deployments/docker && docker compose up --build -d

# Build the grafana-app plugin
build-plugin:
	@echo "Building cbmonitor grafana-app plugin..."
	@cd cbmonitor && npm install && npm run build && mage

# Build the grafana-app plugin docker image
build-plugin-docker: build-couchbase-datasource build-plugin
	@echo "Building cbmonitor grafana-app plugin docker image..."
	@cd cbmonitor && npm run server

build-couchbase-datasource:
	@cd couchbase-datasource && \
    pushd couchbase-datasource && \
    set -e && \
    yarn upgrade && \
    yarn install && \
    yarn build && \
    mage -v && \
    popd

# Clean build artifacts
clean-cm:
	@echo "Cleaning config-manager service build artifacts..."
	@rm -rf bin/
	@cd config-manager && go clean -cache

clean-plugin:
	@echo "Cleaning cbmonitor grafana-app plugin build artifacts..."
	@cd cbmonitor && mage clean

clean: clean-cm clean-plugin

# Run config-manager tests
test-cm:
	@echo "Running config-manager tests..."
	@cd config-manager/tests && go test -v .

help:
	@echo "Available targets:"
	@echo "  build       		- Build all services"
	@echo "  build-cm    		- Build config-manager service"
	@echo "  build-cm-docker 	- Build config-manager service docker image"
	@echo "  build-plugin 		- Build cbmonitor grafana-app plugin"
	@echo "  build-plugin-docker 	- Build cbmonitor grafana-app plugin docker image"
	@echo "  test-cm     		- Run config-manager tests"
	@echo "  clean       		- Clean all build artifacts"
	@echo "  clean-cm    		- Clean config-manager service build artifacts"
	@echo "  clean-plugin  		- Clean cbmonitor grafana-app plugin build artifacts"
	@echo "  help        		- Show this help message"
