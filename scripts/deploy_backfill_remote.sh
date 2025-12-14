#!/bin/bash

# Script to deploy and run backfill on remote server
# Usage: ./scripts/deploy_backfill_remote.sh

set -e  # Exit on error

REMOTE_USER="haloadmin"
REMOTE_HOST="172.191.143.248"
SSH_KEY="~/.ssh/id_ed25519"
REMOTE_PATH="/home/haloadmin/sabyBackend"
SCRIPT_NAME="backfill_levels_structures_nodes.js"

echo "🚀 Deploying backfill script to remote server..."
echo "================================================"

# Step 1: SSH into the server
echo ""
echo "Step 1: Testing SSH connection..."
ssh -i $SSH_KEY ${REMOTE_USER}@${REMOTE_HOST} "echo '✅ SSH connection successful'"

# Step 2: Copy script to remote server
echo ""
echo "Step 2: Copying script to remote server..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="${SCRIPT_DIR}/${SCRIPT_NAME}"

if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Error: Script not found at $SCRIPT_PATH"
    exit 1
fi

# Create remote directory if it doesn't exist
ssh -i $SSH_KEY ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${REMOTE_PATH}/scripts"

# Copy the script
scp -i $SSH_KEY "$SCRIPT_PATH" ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/scripts/

echo "✅ Script copied successfully"

# Step 3: Identify Postgres containers
echo ""
echo "Step 3: Identifying Postgres containers on remote server..."
echo "-----------------------------------------------------------"
ssh -i $SSH_KEY ${REMOTE_USER}@${REMOTE_HOST} << 'EOF'
echo "Docker containers:"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -i postgres || echo "No postgres containers found"

echo ""
echo "Docker containers (all):"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

echo ""
echo "Docker Compose services (if applicable):"
if [ -f docker-compose.yml ]; then
    docker-compose ps | grep -i postgres || echo "No postgres services in docker-compose"
fi
EOF

# Step 4: Instructions for running the script
echo ""
echo "================================================"
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. SSH into the server:"
echo "   ssh -i $SSH_KEY ${REMOTE_USER}@${REMOTE_HOST}"
echo ""
echo "2. Navigate to the backend directory:"
echo "   cd ${REMOTE_PATH}"
echo ""
echo "3. If using Docker, exec into the backend container:"
echo "   docker exec -it <backend-container-name> bash"
echo "   # OR if using docker-compose:"
echo "   docker-compose exec <service-name> bash"
echo ""
echo "4. Run the backfill script:"
echo "   node scripts/${SCRIPT_NAME}"
echo ""
echo "================================================"


