#!/bin/bash

# Script to run test-api-keys-and-usage-limit.js inside Docker container
# Usage: ./scripts/run-test-inside-docker.sh

echo "🐳 Running API Keys Test Script Inside Docker Container..."
echo ""

# Find the backend container name
CONTAINER_NAME="saby-backend-local"

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "❌ Container '$CONTAINER_NAME' is not running"
    echo "   Please start it with: docker-compose -f docker-compose.local.yml up -d"
    exit 1
fi

echo "✅ Found container: $CONTAINER_NAME"
echo ""

# Run the script inside the container
docker exec -it "$CONTAINER_NAME" node scripts/test-api-keys-and-usage-limit.js

echo ""
echo "✅ Script execution completed"

