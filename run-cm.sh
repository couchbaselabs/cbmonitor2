#!/bin/bash
set -e

echo "Building standalone Config-Manager Docker image..."
echo ""

rm -f cm-standalone.tar.gz
# Build the Docker image
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build --build-arg CM_SERVER_PORT=8085 -f deployments/docker/Dockerfile.config-manager -t cm:latest .
docker save cm:latest | gzip > cm-standalone.tar.gz

echo "Done. Archive created: cm-standalone.tar.gz"
