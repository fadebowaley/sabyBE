# 🚀 Docker Deployment Guide - Remote PostgreSQL Configuration

This guide covers deploying the Halo Backend with the new remote PostgreSQL database setup.

## 📊 Architecture Overview

### Previous Setup (Deprecated)

- ❌ **PostgreSQL**: Local Docker container
- ✅ **MongoDB**: Docker container
- ✅ **Redis**: Docker container
- ✅ **Backend API**: Docker container

### New Setup (Current)

- ✅ **PostgreSQL**: Remote database on VM (20.169.129.160)
- ✅ **MongoDB**: Docker container
- ✅ **Redis**: Docker container
- ✅ **Backend API**: Docker container

## 🔄 Migration Benefits

### ✅ Advantages of Remote PostgreSQL

- **Scalability**: Better performance and resource management
- **Consistency**: Single source of truth across all environments
- **Production-Ready**: Production-like setup in development
- **Team Collaboration**: Shared database state for development teams
- **Backup & Recovery**: Centralized database management
- **Security**: Dedicated database server with proper security configurations

## 🛠️ Quick Start

### 1. Environment Setup

Create your environment file:

```bash
cp env.docker.example .env
```

The default configuration uses the remote PostgreSQL database:

```env
# Remote PostgreSQL Configuration (Default)
POSTGRES_HOST=20.169.129.160
POSTGRES_PORT=5432
POSTGRES_USER=sabyagentic_user
POSTGRES_PASSWORD=WcKoT/m9hFGMaiztjci/reLyMVln9qE0ReAaHc0Cb8E=
POSTGRES_DB=halograph
```

### 2. Start Development Environment

```bash
# Start all services (without PostgreSQL container)
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Check service status
docker-compose -f docker-compose.dev.yml ps
```

### 3. Verify Database Connection

```bash
# Test PostgreSQL connection
curl http://localhost:4000/v1/postgres/status

# Expected response:
{
  "success": true,
  "message": "PostgreSQL connection is working",
  "data": {
    "status": "connected",
    "database": "halograph",
    "user": "sabyagentic_user",
    "version": "PostgreSQL 15.14 (...)"
  }
}
```

## 🏗️ Docker Compose Configurations

### Development (docker-compose.dev.yml)

```yaml
services:
  halobe:
    environment:
      # Remote PostgreSQL (no local container)
      - POSTGRES_HOST=20.169.129.160
      - POSTGRES_PORT=5432
      - POSTGRES_USER=sabyagentic_user
      - POSTGRES_PASSWORD=WcKoT/m9hFGMaiztjci/reLyMVln9qE0ReAaHc0Cb8E=
      - POSTGRES_DB=halograph
    depends_on:
      - mongodb # PostgreSQL removed from dependencies
      - redis
      - mailhog

  # PostgreSQL service removed completely

  mongodb:
    # ... existing configuration
  redis:
    # ... existing configuration
  mailhog:
    # ... existing configuration
```

### Production (docker-compose.prod.yml)

```yaml
services:
  halobe:
    environment:
      # Remote PostgreSQL with environment variable support
      - POSTGRES_HOST=20.169.129.160
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-WcKoT/m9hFGMaiztjci/reLyMVln9qE0ReAaHc0Cb8E=}
    depends_on:
      - mongodb # PostgreSQL removed from dependencies
      - redis

  # PostgreSQL service removed completely
```

### Local Testing (docker-compose.local.yml)

```yaml
# Supports both remote and local PostgreSQL

services:
  postgres:
    # Local PostgreSQL available with profile
    profiles:
      - local-postgres

  halobe:
    environment:
      # Defaults to remote, can be overridden
      - POSTGRES_HOST=${POSTGRES_HOST:-20.169.129.160}
      - POSTGRES_USER=${POSTGRES_USER:-sabyagentic_user}
# Use local PostgreSQL:
# docker-compose --profile local-postgres -f docker-compose.local.yml up
```

## 🔄 CI/CD Pipeline Updates

### GitHub Actions Workflow Changes

#### 1. Environment Variables Added

```yaml
env:
  # Remote PostgreSQL Configuration
  POSTGRES_HOST: ${{ secrets.POSTGRES_HOST }}
  POSTGRES_PORT: ${{ secrets.POSTGRES_PORT }}
  POSTGRES_USER: ${{ secrets.POSTGRES_USER }}
  POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD }}
  POSTGRES_DB: ${{ secrets.POSTGRES_DB }}
```

#### 2. PostgreSQL Connection Test

```yaml
- name: 🧪 Test PostgreSQL connection
  run: |
    echo "Testing PostgreSQL connection to remote database..."
    if timeout 10 bash -c "</dev/tcp/${{ env.POSTGRES_HOST }}/${{ env.POSTGRES_PORT }}"; then
      echo "✅ PostgreSQL server is reachable"
    else
      echo "❌ Cannot reach PostgreSQL server"
      exit 1
    fi
```

#### 3. Deployment Environment Files

```yaml
# Create environment file with remote PostgreSQL configuration
cat > .env.production << ENVEOF
NODE_ENV=production
PORT=4000

# Remote PostgreSQL Configuration
POSTGRES_HOST=${{ env.POSTGRES_HOST }}
POSTGRES_PORT=${{ env.POSTGRES_PORT }}
POSTGRES_USER=${{ env.POSTGRES_USER }}
POSTGRES_PASSWORD=${{ env.POSTGRES_PASSWORD }}
POSTGRES_DB=${{ env.POSTGRES_DB }}
ENVEOF
```

#### 4. Health Checks Updated

```yaml
# Test PostgreSQL endpoint
curl -f http://${{ env.PRODUCTION_HOST }}:4000/v1/postgres/status || exit 1
echo "✅ PostgreSQL endpoint test passed"
```

## 📋 Required GitHub Secrets

Add these secrets to your GitHub repository:

```
POSTGRES_HOST=20.169.129.160
POSTGRES_PORT=5432
POSTGRES_USER=sabyagentic_user
POSTGRES_PASSWORD=WcKoT/m9hFGMaiztjci/reLyMVln9qE0ReAaHc0Cb8E=
POSTGRES_DB=halograph
```

## 🔧 Local Development Options

### Option 1: Remote PostgreSQL (Recommended)

```bash
# Uses remote database (default)
docker-compose -f docker-compose.dev.yml up -d
```

### Option 2: Local PostgreSQL (Alternative)

```bash
# Create local environment
cat > .env.local << EOF
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=halo-local
EOF

# Start with local PostgreSQL
docker-compose --profile local-postgres -f docker-compose.local.yml up -d
```

## 📊 Service Management

### Start Services

```bash
# Development
docker-compose -f docker-compose.dev.yml up -d

# Production
docker-compose -f docker-compose.prod.yml up -d

# Local with remote PostgreSQL
docker-compose -f docker-compose.local.yml up -d

# Local with local PostgreSQL
docker-compose --profile local-postgres -f docker-compose.local.yml up -d
```

### Stop Services

```bash
docker-compose -f docker-compose.dev.yml down
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.dev.yml logs -f

# Specific service
docker-compose -f docker-compose.dev.yml logs -f halobe
```

### Health Checks

```bash
# API health
curl http://localhost:4000/

# PostgreSQL status
curl http://localhost:4000/v1/postgres/status

# Service status
docker-compose -f docker-compose.dev.yml ps
```

## 🔍 Troubleshooting

### PostgreSQL Connection Issues

#### Issue: "Connection refused"

```bash
# Check if PostgreSQL server is reachable
telnet 20.169.129.160 5432

# Test from container
docker exec -it halo-dev-backend bash
# Inside container:
curl http://localhost:4000/v1/postgres/status
```

#### Issue: "Authentication failed"

```bash
# Verify credentials in environment
docker-compose -f docker-compose.dev.yml exec halobe env | grep POSTGRES
```

#### Issue: "Database does not exist"

```bash
# Check database name
curl http://localhost:4000/v1/postgres/status | jq '.data.database'
```

### Container Issues

#### View container logs

```bash
docker-compose -f docker-compose.dev.yml logs halobe
```

#### Restart specific service

```bash
docker-compose -f docker-compose.dev.yml restart halobe
```

#### Clean restart

```bash
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d
```

## 📈 Performance Monitoring

### Database Monitoring

```bash
# PostgreSQL connection status
curl http://localhost:4000/v1/postgres/status

# Response time monitoring
time curl -s http://localhost:4000/v1/postgres/status > /dev/null
```

### Container Resource Usage

```bash
# Resource usage
docker stats

# Specific container
docker stats halo-dev-backend
```

## 🔐 Security Considerations

### Environment Variables

- Never commit `.env` files to version control
- Use GitHub Secrets for CI/CD variables
- Rotate database passwords regularly

### Network Security

- PostgreSQL server should only accept connections from authorized IPs
- Use SSL/TLS for database connections in production
- Implement proper firewall rules on the database server

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Environment Variables Best Practices](https://12factor.net/config)

## 🆘 Support

If you encounter issues:

1. **Check the logs**: `docker-compose logs -f`
2. **Verify network connectivity**: `telnet 20.169.129.160 5432`
3. **Test API endpoints**: `curl http://localhost:4000/v1/postgres/status`
4. **Review environment variables**: Ensure all required variables are set
5. **Check GitHub Actions**: Review deployment logs for CI/CD issues

---

## 📋 Migration Checklist

- [x] Update Docker Compose files to remove local PostgreSQL
- [x] Configure remote PostgreSQL connection
- [x] Update environment configurations
- [x] Modify CI/CD workflows
- [x] Add GitHub Secrets for database credentials
- [x] Test local development setup
- [x] Verify staging deployment
- [x] Test production deployment
- [x] Update documentation
- [x] Train team on new setup

---

_Last updated: $(date) - Remote PostgreSQL migration completed_
