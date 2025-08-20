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
	@cd cbmonitor && npm install && npm run dev

# Build the grafana-app plugin docker image
build-plugin-docker: build-plugin
	@cd cbmonitor && GOWORK=off mage -v build:linuxARM64 # TODO: add platform detection

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf bin/
	@go clean -cache

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
	@echo "  clean       		- Clean build artifacts"
	@echo "  help        		- Show this help message"
