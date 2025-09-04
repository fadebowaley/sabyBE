#!/bin/bash

# 🧪 Test Remote Deployment Script
# This script tests the remote deployment setup

set -e

# Configuration
REMOTE_HOST="172.191.51.123"
REMOTE_USER="haloadmin"
SSH_KEY="~/.ssh/id_ed25519"

echo "🧪 Testing Remote Deployment Setup"
echo "=================================="

# Test 1: SSH Connection
echo "1️⃣ Testing SSH connection..."
if ssh -i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "echo 'SSH connection successful!'"; then
    echo "✅ SSH connection working"
else
    echo "❌ SSH connection failed"
    exit 1
fi

# Test 2: Check if Docker is installed
echo "2️⃣ Checking Docker installation..."
if ssh -i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "docker --version"; then
    echo "✅ Docker is installed"
else
    echo "❌ Docker is not installed"
    echo "Please install Docker on the remote server"
fi

# Test 3: Check if Docker Compose is installed
echo "3️⃣ Checking Docker Compose installation..."
if ssh -i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "docker-compose --version"; then
    echo "✅ Docker Compose is installed"
else
    echo "❌ Docker Compose is not installed"
    echo "Please install Docker Compose on the remote server"
fi

# Test 4: Check if Git is installed
echo "4️⃣ Checking Git installation..."
if ssh -i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "git --version"; then
    echo "✅ Git is installed"
else
    echo "❌ Git is not installed"
    echo "Please install Git on the remote server"
fi

# Test 5: Check if project directory exists
echo "5️⃣ Checking project directory..."
if ssh -i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "test -d ~/sabyBackend"; then
    echo "✅ Project directory exists"
else
    echo "⚠️ Project directory doesn't exist"
    echo "Creating project directory..."
    ssh -i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "mkdir -p ~/sabyBackend"
fi

# Test 6: Check if docker-build.sh exists
echo "6️⃣ Checking docker-build.sh script..."
if ssh -i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "test -f ~/sabyBackend/docker-build.sh"; then
    echo "✅ docker-build.sh script exists"
else
    echo "⚠️ docker-build.sh script doesn't exist"
    echo "Please ensure the project is cloned on the remote server"
fi

echo ""
echo "🎉 Remote deployment setup test completed!"
echo ""
echo "📋 Next steps:"
echo "1. Set up GitHub Secrets (SSH_PRIVATE_KEY)"
echo "2. Create environment files on remote server"
echo "3. Test the GitHub Actions workflow"
echo ""
echo "🔧 To set up GitHub Secrets:"
echo "1. Go to your repository → Settings → Secrets and variables → Actions"
echo "2. Add new secret: SSH_PRIVATE_KEY"
echo "3. Copy the content of your private key: cat ~/.ssh/id_ed25519"
