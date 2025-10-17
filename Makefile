.PHONY: build clean test lint help push

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
build-pluginmake build-plugin-production-docker: build-plugin move-datasource-build-artifacts
	@echo "Building cbmonitor grafana-app plugin docker image..."
	@cd cbmonitor && npm run server

# Build the datasource plugin
build-couchbase-datasource:
	@cd mfork-grafana-plugin && cd couchbase-datasource && \
    yarn upgrade && \
    yarn install && \
    yarn build && \
    mage -v

# Move the datasource build artifacts to the cbmonitor dist directory
move-datasource-build-artifacts:
	@echo "Moving datasource build artifacts..."
	@mkdir -p cbmonitor/dist/couchbase-datasource/
	@cp -r mfork-grafana-plugin/couchbase-datasource/dist/* cbmonitor/dist/couchbase-datasource/

# Build PRODUCTION container image with embedded plugins
build-plugin-production: build-plugin move-datasource-build-artifacts
	@echo "Building production cbmonitor plugin container image..."
	@docker build -t cbmonitor2:latest -f Dockerfile.production .
	@echo "Production image built: cbmonitor2:latest"
	@echo "To run: docker run -p 3000:3000 cbmonitor2:latest"

# Tag and push to DockerHub (replace 'your-username' with your DockerHub username)
push-plugin-production: build-plugin-production
	@echo "Tagging and pushing to DockerHub..."
	@read -p "Enter your DockerHub username: " username; \
	docker tag cbmonitor2:latest $$username/cbmonitor2:latest && \
    docker push $$username/cbmonitor2:latest && \
    echo "Pushed to DockerHub: $$username/cbmonitor2:latest"


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
	@echo "  build-plugin-production - Build production container image with embedded plugins"
	@echo "  push-plugin-production  - Build and push production image to DockerHub"
	@echo "  test-cm     		- Run config-manager tests"
	@echo "  clean       		- Clean all build artifacts"
	@echo "  clean-cm    		- Clean config-manager service build artifacts"
	@echo "  clean-plugin  		- Clean cbmonitor grafana-app plugin build artifacts"
	@echo "  help        		- Show this help message"
