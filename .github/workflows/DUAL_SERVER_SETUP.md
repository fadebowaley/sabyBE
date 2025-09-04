# 🏗️ Dual Server Architecture Setup Guide

## 📋 Overview

This guide sets up a **dual-server architecture** with separate VMs for staging and production environments.

### 🏗️ Architecture
```
┌─────────────────┐    ┌─────────────────┐
│   STAGING VM    │    │ PRODUCTION VM   │
│                 │    │                 │
│ IP: [NEW IP]    │    │ IP: 172.191.51.123 │
│ Port: 4000      │    │ Port: 4000      │
│ Database: halo- │    │ Database: halo- │
│ staging         │    │ prod            │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
            ┌─────────────────┐
            │  GitHub Actions │
            │   CI/CD Pipeline│
            └─────────────────┘
```

## 🚀 Quick Setup

### Step 1: Create Staging VM
1. Create a new VM with the same specifications as your production server
2. Note the new IP address (e.g., `172.191.51.124`)
3. Ensure SSH access is configured

### Step 2: Run Setup Script
```bash
# Replace with your actual staging server IP
./setup-staging-server.sh 172.191.51.124
```

### Step 3: Configure GitHub Secrets
Add these secrets to your GitHub repository:

```
SSH_PRIVATE_KEY          # Your existing SSH private key
STAGING_SERVER_IP        # New staging server IP (e.g., 172.191.51.124)
```

### Step 4: Test Deployment
```bash
# Test staging deployment
git push origin develop

# Test production deployment
git tag v1.0.0
git push origin v1.0.0
```

## 📁 File Structure

### New Files Created:
- `.github/workflows/dual-server-deploy.yml` - Main deployment workflow
- `docker-compose.staging.yml` - Staging environment configuration
- `setup-staging-server.sh` - Staging server setup script
- `.github/workflows/DUAL_SERVER_SETUP.md` - This guide

### Updated Files:
- All existing workflows remain for backward compatibility

## 🔧 Server Configuration

### Production Server (172.191.51.123)
- **Environment**: Production
- **Database**: halo-prod
- **Deploy Trigger**: Version tags (v*)
- **Branch**: main

### Staging Server ([NEW IP])
- **Environment**: Staging  
- **Database**: halo-staging
- **Deploy Trigger**: develop branch
- **Branch**: develop

## 🚀 Deployment Workflows

### Automatic Deployments:
- **Staging**: Push to `develop` → Deploy to staging server
- **Production**: Create version tag → Deploy to production server

### Manual Deployments:
1. Go to GitHub Actions
2. Select "Dual Server Deployment" workflow
3. Choose environment: staging, production, or both
4. Run workflow

## 🔒 Security Features

- **Separate Environments**: Complete isolation between staging and production
- **Independent Scaling**: Each server can be scaled independently
- **Isolated Databases**: Separate database instances
- **SSH Key Authentication**: Secure server access
- **Environment-specific Secrets**: Different configurations per environment

## 🧪 Testing

### Test Staging:
```bash
# Deploy to staging
git push origin develop

# Check staging server
ssh haloadmin@[STAGING_IP] "cd ~/sabyBackend && ./docker-build.sh status staging"
```

### Test Production:
```bash
# Deploy to production
git tag v1.0.0
git push origin v1.0.0

# Check production server
ssh haloadmin@172.191.51.123 "cd ~/sabyBackend && ./docker-build.sh status prod"
```

## 🐛 Troubleshooting

### Common Issues:

1. **SSH Connection Failed**
   ```bash
   # Test connection
   ssh -i ~/.ssh/id_ed25519 haloadmin@[STAGING_IP]
   ```

2. **Docker Not Found**
   ```bash
   # Install Docker on staging server
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```

3. **Git Clone Failed**
   ```bash
   # Copy SSH key to staging server
   scp ~/.ssh/id_ed25519 haloadmin@[STAGING_IP]:~/.ssh/id_ed25519
   ```

4. **Environment Variables Missing**
   ```bash
   # Check environment files
   ssh haloadmin@[STAGING_IP] "cd ~/sabyBackend && ls -la .env*"
   ```

## 📊 Monitoring

### Check Server Status:
```bash
# Staging server
ssh haloadmin@[STAGING_IP] "cd ~/sabyBackend && ./docker-build.sh status staging"

# Production server  
ssh haloadmin@172.191.51.123 "cd ~/sabyBackend && ./docker-build.sh status prod"
```

### View Logs:
```bash
# Staging logs
ssh haloadmin@[STAGING_IP] "cd ~/sabyBackend && ./docker-build.sh logs staging"

# Production logs
ssh haloadmin@172.191.51.123 "cd ~/sabyBackend && ./docker-build.sh logs prod"
```

## 🎯 Benefits

✅ **Complete Isolation** - Staging and production are completely separate  
✅ **Independent Scaling** - Scale each environment independently  
✅ **Zero Downtime** - Deploy to staging without affecting production  
✅ **Easy Testing** - Test changes on staging before production  
✅ **Rollback Safety** - Production remains stable during staging tests  
✅ **Resource Optimization** - Allocate resources per environment needs  

## 📞 Support

If you encounter issues:
1. Check the GitHub Actions logs
2. Verify server connectivity
3. Check environment variables
4. Review Docker container status
5. Check application logs

## 🔄 Migration from Single Server

Your existing production server (172.191.51.123) will continue to work as before. The new setup adds staging capabilities without affecting your current production environment.
