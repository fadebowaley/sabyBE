# 🚀 Halo Backend GitHub Actions Workflows

This directory contains GitHub Actions workflows for the Halo Backend Docker CI/CD pipeline.

## 📋 Available Workflows

### 1. 🚀 Docker CI/CD (`docker-cicd.yml`)
**Main workflow for continuous integration and deployment**

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Git tags starting with `v*`

**Jobs:**
- **Test & Quality Checks**: Runs linting, formatting, and tests with database services
- **Build & Security Scan**: Builds Docker images with multi-platform support and security scanning
- **Validate Docker Compose**: Tests Docker Compose configurations and health checks
- **Deploy to Staging**: Auto-deploys to staging when pushing to `develop`
- **Deploy to Production**: Auto-deploys to production when creating version tags
- **Cleanup**: Cleans up old Docker images

### 2. 🚨 Manual Deployment (`manual-deploy.yml`)
**Emergency or manual deployment workflow**

**Triggers:**
- Manual workflow dispatch from GitHub Actions UI

**Features:**
- Choose environment (staging/production)
- Specify custom image tag
- Option to skip tests for emergency deployments
- Uses existing `docker-build.sh` script

### 3. 🧹 Docker Image Cleanup (`cleanup.yml`)
**Automated cleanup of old Docker images**

**Triggers:**
- Weekly schedule (Sundays at 2 AM UTC)
- Manual workflow dispatch

**Features:**
- Keeps latest 10 versions
- Removes untagged versions
- Preserves important tags (latest, main, develop)

## 🔧 Setup Requirements

### 1. GitHub Secrets
Ensure these secrets are configured in your repository:

```bash
# Required for container registry
GITHUB_TOKEN  # Automatically provided by GitHub

# Optional: For external notifications
SLACK_WEBHOOK_URL  # If you want Slack notifications
DISCORD_WEBHOOK_URL  # If you want Discord notifications
```

### 2. GitHub Environments
Create these environments in your repository settings:

- **staging**: For staging deployments
- **production**: For production deployments (with protection rules)

### 3. Container Registry
The workflows use GitHub Container Registry (`ghcr.io`) by default. Images will be available at:
```
ghcr.io/your-username/sabyBackend/halobe:latest
ghcr.io/your-username/sabyBackend/halobe:develop
ghcr.io/your-username/sabyBackend/halobe:v1.0.0
```

## 🚀 Usage

### Automatic Deployments

1. **Staging Deployment**: Push to `develop` branch
2. **Production Deployment**: Create and push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

### Manual Deployments

1. Go to GitHub Actions tab
2. Select "Manual Deployment" workflow
3. Click "Run workflow"
4. Choose environment and options
5. Click "Run workflow"

### Local Testing

Use your existing `docker-build.sh` script for local development:

```bash
# Build and start local environment
./docker-build.sh build local
./docker-build.sh start local

# Build and start production environment
./docker-build.sh build prod
./docker-build.sh start prod

# Check health
./docker-build.sh health prod
```

## 🔒 Security Features

- **Vulnerability Scanning**: Trivy scans all Docker images
- **Multi-platform Builds**: Supports AMD64 and ARM64 architectures
- **Layer Caching**: Optimized builds with GitHub Actions cache
- **Non-root User**: Production images run as non-root user
- **Health Checks**: Built-in health checks for all services

## 📊 Monitoring

### Workflow Status
- View workflow runs in GitHub Actions tab
- Check deployment status in Environments section
- Monitor security scan results in Security tab

### Health Checks
The workflows include comprehensive health checks:
- Database connectivity (MongoDB, PostgreSQL, Redis)
- Service availability on port 4000
- Docker Compose service health

## 🛠️ Customization

### Environment Variables
Modify the `env` section in workflows to customize:
- Container registry
- Image names
- Service ports
- Build platforms

### Deployment Scripts
The workflows integrate with your existing `docker-build.sh` script. To modify deployment behavior, update the script rather than the workflows.

### Notification Integration
Add notification steps to workflows for:
- Slack notifications
- Discord notifications
- Email alerts
- Custom webhooks

## 🐛 Troubleshooting

### Common Issues

1. **Build Failures**: Check Dockerfile syntax and dependencies
2. **Test Failures**: Verify database service configurations
3. **Deployment Failures**: Check environment secrets and permissions
4. **Health Check Failures**: Verify service configurations and ports

### Debug Mode
Enable debug logging by adding this to workflow steps:
```yaml
env:
  ACTIONS_STEP_DEBUG: true
  ACTIONS_RUNNER_DEBUG: true
```

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Buildx Documentation](https://docs.docker.com/buildx/)
- [Trivy Security Scanner](https://trivy.dev/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
