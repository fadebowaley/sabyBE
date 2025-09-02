# 🚀 Halo Backend Docker - Quick Reference Card

## 📊 Daily Health Check (5 minutes)

```bash
# 1. Check all containers are running
./docker-monitor.sh status

# 2. Verify API is responding
./docker-monitor.sh health

# 3. Check database connections
./docker-monitor.sh databases

# 4. Review recent logs for errors
./docker-monitor.sh summary
```

## 🔍 Quick Commands

| Command                         | Purpose                | Example                                            |
| ------------------------------- | ---------------------- | -------------------------------------------------- |
| `./docker-monitor.sh status`    | Check container status | -                                                  |
| `./docker-monitor.sh logs`      | View backend logs      | `./docker-monitor.sh logs halo-local-postgres 100` |
| `./docker-monitor.sh follow`    | Real-time logs         | `./docker-monitor.sh follow halo-local-backend`    |
| `./docker-monitor.sh health`    | Check API health       | -                                                  |
| `./docker-monitor.sh pm2`       | Show PM2 status        | -                                                  |
| `./docker-monitor.sh resources` | Check resource usage   | -                                                  |

## 🚨 Emergency Commands

```bash
# Container not responding
./docker-monitor.sh restart

# Complete rebuild needed
./docker-monitor.sh rebuild

# Clean up everything
./docker-monitor.sh cleanup
```

## 📱 Container Names

- **halo-local-backend** - Main API server (port 4000)
- **halo-local-postgres** - PostgreSQL database (port 5432)
- **halo-local-mongodb** - MongoDB database (port 27017)
- **halo-local-redis** - Redis cache (port 6379)

## 🔧 Manual Docker Commands

```bash
# View all containers
docker ps -a

# View specific container logs
docker logs halo-local-backend

# Access container shell
docker exec -it halo-local-backend sh

# Check container stats
docker stats
```

## 📈 PM2 Commands (Inside Backend Container)

```bash
# Access container
docker exec -it halo-local-backend sh

# Navigate to app
cd /app

# PM2 commands
yarn pm2 list                    # List processes
yarn pm2 monit                   # Monitor processes
yarn pm2 logs                    # View logs
yarn pm2 restart haloBE-app      # Restart app
```

## 🌐 API Endpoints

- **Health Check**: `http://localhost:4000/`
- **API Base**: `http://localhost:4000/v1/`
- **Swagger Docs**: `http://localhost:4000/api-docs/`

## 📋 Monitoring Schedule

| Time              | Action                                                       |
| ----------------- | ------------------------------------------------------------ |
| **Morning**       | `./docker-monitor.sh status` + `./docker-monitor.sh health`  |
| **Every 2 hours** | `./docker-monitor.sh status`                                 |
| **Lunch**         | `./docker-monitor.sh summary`                                |
| **End of day**    | `./docker-monitor.sh status` + `./docker-monitor.sh summary` |

## 🆘 Troubleshooting Flow

1. **Container down?** → `./docker-monitor.sh restart`
2. **API not responding?** → `./docker-monitor.sh logs` + check PM2
3. **Database issues?** → `./docker-monitor.sh databases`
4. **High resource usage?** → `./docker-monitor.sh resources`
5. **Still having issues?** → `./docker-monitor.sh rebuild`

## 📞 Support

- **Documentation**: `./docker-monitor.sh help`
- **Full Guide**: `DOCKER_MONITORING_GUIDE.md`
- **Issues**: Check GitHub issues page

---

**Remember**: Always check logs first before restarting containers!
