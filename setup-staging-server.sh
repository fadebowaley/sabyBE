#!/bin/bash

# 🚀 Staging Server Setup Script
# This script sets up a new staging server with the same configuration as production

set -e

# Configuration
STAGING_IP="${1:-}"
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
    echo -e "${BLUE}  Staging Server Setup${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_usage() {
    echo "Usage: $0 <STAGING_SERVER_IP>"
    echo ""
    echo "Example: $0 172.191.51.124"
    echo ""
    echo "This script will:"
    echo "1. Test SSH connection to staging server"
    echo "2. Install Docker and Docker Compose"
    echo "3. Clone the repository"
    echo "4. Set up environment files"
    echo "5. Test the setup"
}

# Validate input
if [ -z "$STAGING_IP" ]; then
    print_error "Staging server IP is required"
    print_usage
    exit 1
fi

print_header

# Test SSH connection
print_status "Testing SSH connection to staging server: $STAGING_IP"
if ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP "echo 'SSH connection successful!'"; then
    print_success "SSH connection working"
else
    print_error "SSH connection failed. Please ensure:"
    echo "1. The staging server is running"
    echo "2. SSH key is properly configured"
    echo "3. User '$STAGING_USER' exists on the server"
    exit 1
fi

# Install Docker and Docker Compose
print_status "Installing Docker and Docker Compose on staging server..."
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP << 'REMOTE_COMMANDS'
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    echo "Docker already installed"
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    echo "Docker Compose already installed"
fi

# Install Git
if ! command -v git &> /dev/null; then
    echo "Installing Git..."
    sudo apt install git -y
else
    echo "Git already installed"
fi

echo "✅ System setup completed"
REMOTE_COMMANDS

# Copy SSH key to staging server
print_status "Setting up SSH key for Git access..."
scp -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no ~/.ssh/id_ed25519 $STAGING_USER@$STAGING_IP:~/.ssh/id_ed25519

# Set up SSH key permissions
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP << 'REMOTE_COMMANDS'
chmod 600 ~/.ssh/id_ed25519
chmod 700 ~/.ssh

# Test GitHub SSH connection
ssh -T git@github.com -o StrictHostKeyChecking=no || echo "GitHub SSH connection test completed"
REMOTE_COMMANDS

# Clone repository
print_status "Cloning repository on staging server..."
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP << 'REMOTE_COMMANDS'
cd ~
if [ -d "sabyBackend" ]; then
    echo "Removing existing directory..."
    rm -rf sabyBackend
fi

git clone git@github.com:fadebowaley/sabyBE.git sabyBackend
cd sabyBackend

# Make scripts executable
chmod +x docker-build.sh
chmod +x test-remote-deploy.sh

echo "✅ Repository cloned successfully"
REMOTE_COMMANDS

# Copy environment files
print_status "Setting up environment files..."
scp -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no .env $STAGING_USER@$STAGING_IP:~/sabyBackend/.env

# Create staging environment file
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP << 'REMOTE_COMMANDS'
cd ~/sabyBackend

# Create staging environment file
cp .env .env.staging
sed -i 's/NODE_ENV=development/NODE_ENV=staging/' .env.staging
sed -i 's/halo-dev/halo-staging/g' .env.staging

echo "✅ Environment files created"
echo "�� Files:"
ls -la .env*
REMOTE_COMMANDS

# Test the setup
print_status "Testing staging server setup..."
ssh -i ~/.ssh/id_ed25519 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_IP << 'REMOTE_COMMANDS'
cd ~/sabyBackend

echo "�� Testing Docker Compose configurations..."

# Test staging compose
if [ -f docker-compose.staging.yml ]; then
    docker-compose -f docker-compose.staging.yml config > /dev/null && echo "✅ Staging compose is valid" || echo "❌ Staging compose has issues"
else
    echo "⚠️ Staging compose file not found"
fi

# Test production compose
docker-compose -f docker-compose.prod.yml config > /dev/null && echo "✅ Production compose is valid" || echo "❌ Production compose has issues"

echo "✅ Setup test completed"
REMOTE_COMMANDS

print_success "Staging server setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Add STAGING_SERVER_IP secret to GitHub: $STAGING_IP"
echo "2. Test deployment with: git push origin develop"
echo "3. Or test manually via GitHub Actions UI"
echo ""
echo "🔧 GitHub Secrets to add:"
echo "STAGING_SERVER_IP=$STAGING_IP"
echo ""
echo "🌐 Server Details:"
echo "Staging Server: $STAGING_IP"
echo "Production Server: 172.191.51.123"
