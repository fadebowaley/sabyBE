# 🚀 Halo Backend Docker Monitoring & Administration Guide

This guide provides comprehensive instructions for monitoring and administering your haloBE Docker containers.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Container Overview](#container-overview)
- [Monitoring Scripts](#monitoring-scripts)
- [Daily Operations](#daily-operations)
- [Troubleshooting](#troubleshooting)
- [Advanced Monitoring](#advanced-monitoring)
- [Security & Best Practices](#security--best-practices)

## 🚀 Quick Start

### 1. Check Container Status

```bash
./docker-monitor.sh status
```

### 2. View Backend Logs

```bash
./docker-monitor.sh logs
```

### 3. Check API Health

```bash
./docker-monitor.sh health
```

### 4. Monitor Real-time Logs

```bash
./docker-monitor.sh follow
```

## 🐳 Container Overview

Your haloBE environment consists of 4 main containers:

| Container               | Purpose                  | Port  | Health Check                    |
| ----------------------- | ------------------------ | ----- | ------------------------------- |
| **halo-local-backend**  | Main API server with PM2 | 4000  | `./docker-monitor.sh health`    |
| **halo-local-postgres** | PostgreSQL database      | 5432  | `./docker-monitor.sh databases` |
| **halo-local-mongodb**  | MongoDB database         | 27017 | `./docker-monitor.sh databases` |
| **halo-local-redis**    | Redis cache              | 6379  | `./docker-monitor.sh databases` |

## 📊 Monitoring Scripts

### Primary Monitoring Script: `docker-monitor.sh`

This script provides comprehensive monitoring and administration capabilities:

```bash
# Make executable (first time only)
chmod +x docker-monitor.sh

# Show help
./docker-monitor.sh help

# Check status of all containers
./docker-monitor.sh status

# View logs (default: backend, last 50 lines)
./docker-monitor.sh logs
./docker-monitor.sh logs halo-local-postgres 100

# Follow logs in real-time
./docker-monitor.sh follow halo-local-backend

# Check resource usage
./docker-monitor.sh resources

# View container details
./docker-monitor.sh details halo-local-backend

# Check database connections
./docker-monitor.sh databases

# Check API health
./docker-monitor.sh health

# Show PM2 process status
./docker-monitor.sh pm2

# View logs summary for all containers
./docker-monitor.sh summary
```

### Container Management Commands

```bash
# Restart all containers
./docker-monitor.sh restart

# Rebuild and restart containers
./docker-monitor.sh rebuild

# Clean up containers and resources
./docker-monitor.sh cleanup
```

## 🔄 Daily Operations

### Morning Health Check

```bash
# 1. Check if all containers are running
./docker-monitor.sh status

# 2. Verify API is responding
./docker-monitor.sh health

# 3. Check database connections
./docker-monitor.sh databases

# 4. Review recent logs for errors
./docker-monitor.sh summary
```

### Continuous Monitoring

```bash
# Follow backend logs for real-time monitoring
./docker-monitor.sh follow halo-local-backend

# Monitor resource usage
./docker-monitor.sh resources

# Check PM2 process status
./docker-monitor.sh pm2
```

### End-of-Day Summary

```bash
# Get logs summary for all containers
./docker-monitor.sh summary

# Check final status
./docker-monitor.sh status
```

## 🛠️ Troubleshooting

### Common Issues & Solutions

#### 1. Container Not Starting

```bash
# Check container logs
./docker-monitor.sh logs halo-local-backend

# Check container details
./docker-monitor.sh details halo-local-backend

# Restart containers
./docker-monitor.sh restart
```

#### 2. API Not Responding

```bash
# Check API health
./docker-monitor.sh health

# Check backend logs
./docker-monitor.sh logs halo-local-backend

# Check PM2 status
./docker-monitor.sh pm2
```

#### 3. Database Connection Issues

```bash
# Check database connections
./docker-monitor.sh databases

# Check database container logs
./docker-monitor.sh logs halo-local-postgres
./docker-monitor.sh logs halo-local-mongodb
./docker-monitor.sh logs halo-local-redis
```

#### 4. High Resource Usage

```bash
# Check resource usage
./docker-monitor.sh resources

# Check container details
./docker-monitor.sh details halo-local-backend
```

### Manual Docker Commands

If you need to use Docker commands directly:

```bash
# List all containers
docker ps -a

# View container logs
docker logs halo-local-backend

# Execute commands in container
docker exec -it halo-local-backend sh

# Check container stats
docker stats

# View container information
docker inspect halo-local-backend
```

## 🔍 Advanced Monitoring

### PM2 Process Management

Inside the backend container, you can manage PM2 processes:

```bash
# Access container
docker exec -it halo-local-backend sh

# Navigate to app directory
cd /app

# PM2 commands
yarn pm2 list                    # List all processes
yarn pm2 monit                   # Monitor processes
yarn pm2 logs                    # View all PM2 logs
yarn pm2 logs haloBE-app        # View specific process logs
yarn pm2 restart haloBE-app      # Restart specific process
yarn pm2 reload all             # Reload all processes
```

### Database Monitoring

#### PostgreSQL

```bash
# Connect to PostgreSQL
docker exec -it halo-local-postgres psql -U postgres -d halo-local

# Check connections
SELECT * FROM pg_stat_activity;

# Check database size
SELECT pg_size_pretty(pg_database_size('halo-local'));
```

#### MongoDB

```bash
# Connect to MongoDB
docker exec -it halo-local-mongodb mongosh

# Check database stats
use halo-local
db.stats()
```

#### Redis

```bash
# Connect to Redis
docker exec -it halo-local-redis redis-cli

# Check Redis info
INFO
MONITOR
```

### Log Analysis

```bash
# Search for errors in logs
docker logs halo-local-backend | grep -i error

# Search for warnings
docker logs halo-local-backend | grep -i warn

# Search for specific patterns
docker logs halo-local-backend | grep -E "(ERROR|WARN|Exception)"

# View logs with timestamps
docker logs -t halo-local-backend
```

## 🔒 Security & Best Practices

### Environment Variables

- Never commit `.env` files to version control
- Use `.env.example` as a template
- Rotate sensitive credentials regularly

### Container Security

- Keep containers updated
- Use specific image tags (avoid `latest`)
- Limit container privileges
- Monitor container resource usage

### Network Security

- Containers communicate via internal Docker network
- External access only through mapped ports
- Use firewall rules to restrict access

### Data Persistence

- Database data is persisted in Docker volumes
- Regular backups recommended
- Monitor volume usage

## 📈 Performance Monitoring

### Key Metrics to Watch

1. **Container Resource Usage**

   - CPU usage
   - Memory consumption
   - Network I/O
   - Disk I/O

2. **Application Performance**

   - API response times
   - Database query performance
   - Queue processing speed
   - Error rates

3. **Infrastructure Health**
   - Container uptime
   - Restart frequency
   - Log volume
   - Connection pool status

### Performance Tuning

```bash
# Monitor resource usage
./docker-monitor.sh resources

# Check for memory leaks
docker stats --no-stream

# Monitor network connections
docker exec halo-local-backend netstat -an
```

## 🚨 Emergency Procedures

### Container Crash Recovery

```bash
# 1. Check container status
./docker-monitor.sh status

# 2. View crash logs
./docker-monitor.sh logs halo-local-backend

# 3. Restart containers
./docker-monitor.sh restart

# 4. Verify recovery
./docker-monitor.sh health
```

### Database Recovery

```bash
# 1. Check database status
./docker-monitor.sh databases

# 2. Restart database containers
docker restart halo-local-postgres
docker restart halo-local-mongodb

# 3. Verify connections
./docker-monitor.sh databases
```

### Complete System Recovery

```bash
# 1. Stop all containers
docker-compose -f docker-compose.local.yml down

# 2. Clean up resources
./docker-monitor.sh cleanup

# 3. Rebuild and start
./docker-monitor.sh rebuild

# 4. Verify all systems
./docker-monitor.sh status
./docker-monitor.sh health
./docker-monitor.sh databases
```

## 📚 Additional Resources

### Useful Commands Reference

```bash
# Container management
docker-compose -f docker-compose.local.yml up -d      # Start containers
docker-compose -f docker-compose.local.yml down       # Stop containers
docker-compose -f docker-compose.local.yml logs       # View all logs
docker-compose -f docker-compose.local.yml ps         # List containers

# Docker system
docker system df                                      # Check disk usage
docker system prune                                   # Clean up unused resources
docker volume ls                                      # List volumes
docker network ls                                     # List networks

# Container inspection
docker top halo-local-backend                         # Process list
docker exec -it halo-local-backend sh                 # Interactive shell
docker cp halo-local-backend:/app/logs ./logs        # Copy files from container
```

### Log Locations

- **Application Logs**: Inside container at `/app/logs/`
- **PM2 Logs**: Inside container at `/root/.pm2/logs/`
- **Docker Logs**: Accessible via `docker logs` command
- **System Logs**: Host system logs (if using systemd)

### Monitoring Schedule

| Frequency            | Action                     | Command                         |
| -------------------- | -------------------------- | ------------------------------- |
| **Every 15 minutes** | Check container status     | `./docker-monitor.sh status`    |
| **Every hour**       | Check API health           | `./docker-monitor.sh health`    |
| **Every 4 hours**    | Check database connections | `./docker-monitor.sh databases` |
| **Daily**            | Review logs summary        | `./docker-monitor.sh summary`   |
| **Weekly**           | Check resource usage       | `./docker-monitor.sh resources` |
| **Monthly**          | Clean up resources         | `./docker-monitor.sh cleanup`   |

---

## 🆘 Support

If you encounter issues not covered in this guide:

1. Check the troubleshooting section
2. Review container logs
3. Check the [Halo Backend Issues](https://github.com/fadebowaley/halo/issues) page
4. Contact the development team

---

**Last Updated**: $(date)
**Version**: 1.0.0
**Maintainer**: Halo Development Team
