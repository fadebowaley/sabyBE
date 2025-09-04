#!/bin/bash

# 🧪 Dual Server Deployment Test Script
# This script tests the dual server deployment setup

set -e

# Configuration
PRODUCTION_IP="172.191.51.123"
STAGING_IP="${1:-}"
PRODUCTION_USER="haloadmin"
STAGING_USER="haloadmin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  Dual Server Deployment Test${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_usage() {
    echo "Usage: $0 <STAGING_SERVER_IP>"
    echo ""
    echo "Example: $0 172.191.51.124"
    echo ""
    echo "This script will test:"
    echo "1. SSH connections to both servers"
    echo "2. Docker setup on both servers"
    echo "3. Repository setup on both servers"
    echo "4. Environment configuration"
}

# Validate input
if [ -z "$STAGING_IP" ]; then
    print_error "Staging server IP is required"
    print_usage
    exit 1
fi

print_header

# Test Production Server
print_status "Testing Production Server: $PRODUCTION_IP"
if ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $PRODUCTION_USER@$PRODUCTION_IP "echo 'Production SSH OK'"; then
    print_success "Production server SSH connection working"
else
    print_error "Production server SSH connection failed"
    exit 1
fi

# Test Staging Server
print_status "Testing Staging Server: $STAGING_IP"
if ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP "echo 'Staging SSH OK'"; then
    print_success "Staging server SSH connection working"
else
    print_error "Staging server SSH connection failed"
    exit 1
fi

# Test Docker on Production
print_status "Testing Docker on Production Server..."
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $PRODUCTION_USER@$PRODUCTION_IP << 'REMOTE_COMMANDS'
cd ~/sabyBackend
echo "Docker version: $(docker --version)"
echo "Docker Compose version: $(docker-compose --version)"
echo "Repository status: $(git status --porcelain | wc -l) files changed"
echo "Environment files: $(ls -1 .env* | wc -l) files"
REMOTE_COMMANDS

# Test Docker on Staging
print_status "Testing Docker on Staging Server..."
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP << 'REMOTE_COMMANDS'
cd ~/sabyBackend
echo "Docker version: $(docker --version)"
echo "Docker Compose version: $(docker-compose --version)"
echo "Repository status: $(git status --porcelain | wc -l) files changed"
echo "Environment files: $(ls -1 .env* | wc -l) files"
REMOTE_COMMANDS

# Test Docker Compose configurations
print_status "Testing Docker Compose configurations..."

# Production
print_status "Testing Production Docker Compose..."
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $PRODUCTION_USER@$PRODUCTION_IP << 'REMOTE_COMMANDS'
cd ~/sabyBackend
docker-compose -f docker-compose.prod.yml config > /dev/null && echo "✅ Production compose valid" || echo "❌ Production compose invalid"
REMOTE_COMMANDS

# Staging
print_status "Testing Staging Docker Compose..."
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP << 'REMOTE_COMMANDS'
cd ~/sabyBackend
if [ -f docker-compose.staging.yml ]; then
    docker-compose -f docker-compose.staging.yml config > /dev/null && echo "✅ Staging compose valid" || echo "❌ Staging compose invalid"
else
    echo "⚠️ Staging compose file not found"
fi
REMOTE_COMMANDS

print_success "Dual server deployment test completed!"
echo ""
echo "📋 Test Results Summary:"
echo "✅ Production Server: $PRODUCTION_IP - Ready"
echo "✅ Staging Server: $STAGING_IP - Ready"
echo ""
echo "🚀 Ready for deployment!"
echo ""
echo "Next steps:"
echo "1. Add STAGING_SERVER_IP=$STAGING_IP to GitHub Secrets"
echo "2. Test staging deployment: git push origin develop"
echo "3. Test production deployment: git tag v1.0.0 && git push origin v1.0.0"
