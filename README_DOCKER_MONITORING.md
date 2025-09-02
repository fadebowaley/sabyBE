# 🐳 Halo Backend Docker Monitoring Setup

This directory contains comprehensive Docker monitoring and administration tools for your haloBE containers.

## 📁 Files Overview

| File                             | Purpose                    | Usage                           |
| -------------------------------- | -------------------------- | ------------------------------- |
| **`docker-monitor.sh`**          | Main monitoring script     | `./docker-monitor.sh [command]` |
| **`DOCKER_MONITORING_GUIDE.md`** | Comprehensive guide        | Reference for all features      |
| **`DOCKER_QUICK_REFERENCE.md`**  | Quick reference card       | Daily operations                |
| **`docker-build.sh`**            | Your existing build script | Container building              |
| **`docker-compose.local.yml`**   | Container orchestration    | Container management            |

## 🚀 Quick Start

### 1. Make the monitoring script executable

```bash
chmod +x docker-monitor.sh
```

### 2. Check container status

```bash
./docker-monitor.sh status
```

### 3. View help

```bash
./docker-monitor.sh help
```

## 🔧 What's New

### ✅ **Redis Connection Issues Fixed**

- Updated BullMQ configurations to use explicit Redis connection options
- Eliminated localhost connection attempts
- All Redis connections now use container hostname `redis`

### 🆕 **Comprehensive Monitoring Script**

- **15+ monitoring commands** for complete container oversight
- **Real-time log following** for continuous monitoring
- **Resource usage tracking** for performance monitoring
- **Database health checks** for infrastructure monitoring
- **API health verification** for application monitoring
- **PM2 process management** for Node.js process monitoring

### 📚 **Complete Documentation**

- **Step-by-step guides** for all operations
- **Troubleshooting flows** for common issues
- **Daily operation schedules** for consistent monitoring
- **Emergency procedures** for critical situations

## 🎯 Key Benefits

1. **Time Savings**: Single command monitoring instead of multiple Docker commands
2. **Error Prevention**: Structured commands reduce human error
3. **Comprehensive Coverage**: Monitor containers, databases, APIs, and processes
4. **Real-time Insights**: Live log monitoring and resource tracking
5. **Easy Troubleshooting**: Built-in diagnostic commands and flows
6. **Consistent Operations**: Standardized monitoring procedures

## 📊 Daily Monitoring Workflow

### Morning Health Check (5 minutes)

```bash
./docker-monitor.sh status      # Check all containers
./docker-monitor.sh health      # Verify API is responding
./docker-monitor.sh databases   # Check database connections
./docker-monitor.sh summary     # Review recent logs
```

### Continuous Monitoring

```bash
./docker-monitor.sh follow      # Real-time backend logs
./docker-monitor.sh resources   # Monitor resource usage
./docker-monitor.sh pm2         # Check PM2 processes
```

### End-of-Day Summary

```bash
./docker-monitor.sh summary     # Log summary for all containers
./docker-monitor.sh status      # Final status check
```

## 🛠️ Troubleshooting

### Common Issues & Quick Fixes

| Issue                    | Quick Fix                            | Detailed Investigation        |
| ------------------------ | ------------------------------------ | ----------------------------- |
| Container not responding | `./docker-monitor.sh restart`        | `./docker-monitor.sh logs`    |
| API down                 | Check PM2: `./docker-monitor.sh pm2` | `./docker-monitor.sh logs`    |
| Database issues          | `./docker-monitor.sh databases`      | Check specific container logs |
| High resource usage      | `./docker-monitor.sh resources`      | `./docker-monitor.sh details` |

### Emergency Recovery

```bash
# Quick restart
./docker-monitor.sh restart

# Complete rebuild
./docker-monitor.sh rebuild

# Full cleanup
./docker-monitor.sh cleanup
```

## 🔍 Monitoring Commands Reference

### Container Status & Health

- `./docker-monitor.sh status` - Check all containers
- `./docker-monitor.sh health` - Verify API health
- `./docker-monitor.sh databases` - Check database connections

### Logs & Monitoring

- `./docker-monitor.sh logs [container] [lines]` - View logs
- `./docker-monitor.sh follow [container]` - Real-time logs
- `./docker-monitor.sh summary` - Logs summary for all containers

### Resource & Performance

- `./docker-monitor.sh resources` - Container resource usage
- `./docker-monitor.sh details [container]` - Detailed container info
- `./docker-monitor.sh pm2` - PM2 process status

### Container Management

- `./docker-monitor.sh restart` - Restart all containers
- `./docker-monitor.sh rebuild` - Rebuild and restart
- `./docker-monitor.sh cleanup` - Clean up resources

## 🌐 Integration with Existing Tools

### Works Alongside Your Existing Scripts

- **`docker-build.sh`** - Use for building containers
- **`docker-monitor.sh`** - Use for monitoring and administration
- **`docker-compose.local.yml`** - Manages container orchestration

### Complementary Commands

```bash
# Build containers
./docker-build.sh

# Monitor containers
./docker-monitor.sh status

# Check health
./docker-monitor.sh health

# View logs
./docker-monitor.sh logs
```

## 📈 Performance Monitoring

### Key Metrics to Track

1. **Container Resource Usage** - CPU, Memory, Network, Disk
2. **Application Performance** - API response times, error rates
3. **Database Health** - Connection status, query performance
4. **Process Management** - PM2 process status and health

### Monitoring Schedule

- **Every 15 minutes**: Container status check
- **Every hour**: API health verification
- **Every 4 hours**: Database connection check
- **Daily**: Comprehensive logs review
- **Weekly**: Resource usage analysis

## 🔒 Security & Best Practices

### Environment Management

- Use `.env.example` as template
- Never commit `.env` files
- Rotate credentials regularly

### Container Security

- Keep containers updated
- Use specific image tags
- Monitor resource usage
- Limit container privileges

### Network Security

- Containers communicate internally
- External access via mapped ports only
- Use firewall rules for access control

## 📚 Learning Path

### 1. **Start Here** (Day 1)

- Read `DOCKER_QUICK_REFERENCE.md`
- Run `./docker-monitor.sh help`
- Try `./docker-monitor.sh status`

### 2. **Daily Operations** (Week 1)

- Use daily health check commands
- Practice log monitoring
- Learn container management

### 3. **Advanced Features** (Week 2+)

- Explore troubleshooting commands
- Use resource monitoring
- Implement monitoring schedule

### 4. **Expert Level** (Month 1+)

- Customize monitoring scripts
- Integrate with CI/CD
- Set up automated alerts

## 🆘 Support & Troubleshooting

### Getting Help

1. **Check the help**: `./docker-monitor.sh help`
2. **Quick Reference**: `DOCKER_QUICK_REFERENCE.md`
3. **Full Guide**: `DOCKER_MONITORING_GUIDE.md`
4. **GitHub Issues**: Report bugs and request features

### Common Questions

**Q: How do I check if my containers are running?**
A: `./docker-monitor.sh status`

**Q: How do I view real-time logs?**
A: `./docker-monitor.sh follow`

**Q: How do I restart all containers?**
A: `./docker-monitor.sh restart`

**Q: How do I check API health?**
A: `./docker-monitor.sh health`

**Q: How do I monitor resource usage?**
A: `./docker-monitor.sh resources`

## 🎉 What You've Accomplished

✅ **Fixed Redis connection issues** - No more localhost connection errors
✅ **Created comprehensive monitoring** - 15+ monitoring commands
✅ **Built troubleshooting flows** - Quick fixes for common issues
✅ **Documented everything** - Complete guides and references
✅ **Automated daily operations** - Streamlined monitoring workflow

## 🚀 Next Steps

1. **Start using the monitoring script** for daily operations
2. **Implement the monitoring schedule** for consistent oversight
3. **Explore advanced features** as you become comfortable
4. **Customize the scripts** to fit your specific needs
5. **Share feedback** to improve the monitoring tools

---

**Happy Monitoring! 🎯**

Your haloBE Docker environment is now fully monitored and manageable with professional-grade tools.
