#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════
# Local Development Environment Setup Script
# ═══════════════════════════════════════════════════════════════════════
#
# This script helps set up the local development environment for testing
# the Internal Messaging/Chat features.
#
# Usage:
#   chmod +x scripts/local-setup.sh
#   ./scripts/local-setup.sh
#
# ═══════════════════════════════════════════════════════════════════════

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.local.yml"
MONGODB_CONTAINER="halo-local-mongodb"
MONGODB_USER="admin"
MONGODB_PASSWORD="local_mongo_2025"
MONGODB_AUTH_DB="admin"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SABY BACKEND - LOCAL DEVELOPMENT SETUP                             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "${RED}✗ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is installed${NC}"

if ! command_exists docker-compose; then
    echo -e "${RED}✗ docker-compose is not installed. Please install docker-compose first.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ docker-compose is installed${NC}"

echo ""

# Step 1: Start containers
echo -e "${YELLOW}Step 1: Starting Docker containers...${NC}"
docker-compose -f "$COMPOSE_FILE" up -d

echo -e "${GREEN}✓ Containers started${NC}"
echo ""

# Step 2: Wait for MongoDB to be ready
echo -e "${YELLOW}Step 2: Waiting for MongoDB to be ready...${NC}"
sleep 5

MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker exec "$MONGODB_CONTAINER" mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ MongoDB is ready${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ MongoDB failed to start within timeout period${NC}"
    exit 1
fi

echo ""

# Step 3: Initialize MongoDB replica set
echo -e "${YELLOW}Step 3: Initializing MongoDB replica set (required for NodeSync change streams)...${NC}"

# Check if replica set is already initialized
REPLICA_STATUS=$(docker exec "$MONGODB_CONTAINER" mongosh -u "$MONGODB_USER" -p "$MONGODB_PASSWORD" --authenticationDatabase "$MONGODB_AUTH_DB" --quiet --eval "rs.status().ok" 2>/dev/null || echo "0")

if [ "$REPLICA_STATUS" = "1" ]; then
    echo -e "${GREEN}✓ Replica set is already initialized${NC}"
else
    # Initialize replica set
    docker exec "$MONGODB_CONTAINER" mongosh -u "$MONGODB_USER" -p "$MONGODB_PASSWORD" --authenticationDatabase "$MONGODB_AUTH_DB" --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Replica set initialized successfully${NC}"
        echo -e "${YELLOW}  Note: It may take a few seconds for the replica set to become PRIMARY${NC}"
    else
        echo -e "${RED}✗ Failed to initialize replica set${NC}"
        echo -e "${YELLOW}  You can manually initialize it with:${NC}"
        echo -e "${YELLOW}  docker exec -it $MONGODB_CONTAINER mongosh -u $MONGODB_USER -p $MONGODB_PASSWORD --authenticationDatabase $MONGODB_AUTH_DB --eval \"rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})\"${NC}"
    fi
fi

echo ""

# Step 4: Verify services
echo -e "${YELLOW}Step 4: Verifying services...${NC}"

# Check PostgreSQL
if docker exec halo-local-postgres pg_isready -U halograph_user -d halograph >/dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
else
    echo -e "${YELLOW}⚠ PostgreSQL may still be starting...${NC}"
fi

# Check Redis
if docker exec halo-local-redis redis-cli -a redis_local_2025 ping >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis is ready${NC}"
else
    echo -e "${YELLOW}⚠ Redis may still be starting...${NC}"
fi

# Check Backend
sleep 5
if curl -s http://localhost:4000/api/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend API is responding${NC}"
else
    echo -e "${YELLOW}⚠ Backend may still be starting... Check logs with: docker-compose -f $COMPOSE_FILE logs -f halobe${NC}"
fi

echo ""

# Step 5: Display service information
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SERVICES READY                                                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Backend API:    ${GREEN}http://localhost:4000${NC}"
echo -e "MongoDB:        ${GREEN}localhost:27017${NC}"
echo -e "  Username:     admin"
echo -e "  Password:     local_mongo_2025"
echo -e "  Database:     halo-local"
echo -e "PostgreSQL:     ${GREEN}localhost:5432${NC}"
echo -e "  Username:     halograph_user"
echo -e "  Password:     local_test_password_2025"
echo -e "  Database:     halograph"
echo -e "Redis:          ${GREEN}localhost:6379${NC}"
echo -e "  Password:     redis_local_2025"
echo ""

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   USEFUL COMMANDS                                                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "View logs:"
echo -e "  ${YELLOW}docker-compose -f $COMPOSE_FILE logs -f halobe${NC}"
echo ""
echo -e "Stop services:"
echo -e "  ${YELLOW}docker-compose -f $COMPOSE_FILE down${NC}"
echo ""
echo -e "Stop and remove volumes (clean slate):"
echo -e "  ${YELLOW}docker-compose -f $COMPOSE_FILE down -v${NC}"
echo ""
echo -e "Restart backend:"
echo -e "  ${YELLOW}docker-compose -f $COMPOSE_FILE restart halobe${NC}"
echo ""
echo -e "MongoDB shell:"
echo -e "  ${YELLOW}docker exec -it $MONGODB_CONTAINER mongosh -u $MONGODB_USER -p $MONGODB_PASSWORD --authenticationDatabase $MONGODB_AUTH_DB${NC}"
echo ""

echo -e "${GREEN}✓ Setup complete! You can now test the Internal Messaging/Chat features.${NC}"
echo ""
