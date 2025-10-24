# 📊 Production Monitoring & Alerting Setup

**Complete Real-Time System Monitoring**

---

## 🎯 MONITORING STRATEGY

### What to Monitor:
1. ✅ Submission success/failure rates
2. ✅ Worker processing times
3. ✅ Queue sizes and backlogs
4. ✅ Database connection health
5. ✅ Redis connection health
6. ✅ Email delivery rates
7. ✅ API response times
8. ✅ Error rates by type
9. ✅ Tenant-specific metrics
10. ✅ Compliance percentages

---

## 📈 STEP 1: Create Monitoring Service

### File: `src/services/monitoring.service.js`

```javascript
const { postgresPool } = require('../config/postgres');
const { redisClient } = require('../config/redis');
const mongoose = require('mongoose');
const logger = require('../config/logger');
const emailService = require('./email.service');
const config = require('../config/config');

class MonitoringService {
  constructor() {
    this.metrics = {
      submissions: {
        total: 0,
        successful: 0,
        failed: 0,
        avgProcessingTime: 0,
        lastReset: new Date(),
      },
      api: {
        requests: 0,
        errors: 0,
        avgResponseTime: 0,
      },
    };

    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Check system health
   */
  async getSystemHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: this.getMemoryUsage(),
      services: {},
    };

    try {
      // Check MongoDB
      health.services.mongodb = await this.checkMongoDB();

      // Check PostgreSQL
      health.services.postgresql = await this.checkPostgreSQL();

      // Check Redis
      health.services.redis = await this.checkRedis();

      // Check Email
      health.services.email = await this.checkEmailService();

      // Check Workers
      health.services.workers = await this.checkWorkers();

      // Overall status
      const allHealthy = Object.values(health.services).every(
        (service) => service.status === 'healthy'
      );
      health.status = allHealthy ? 'healthy' : 'degraded';
    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  /**
   * Check MongoDB connection
   */
  async checkMongoDB() {
    try {
      const state = mongoose.connection.readyState;
      const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
      };

      return {
        status: state === 1 ? 'healthy' : 'unhealthy',
        state: states[state],
        host: mongoose.connection.host,
        database: mongoose.connection.name,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Check PostgreSQL connection
   */
  async checkPostgreSQL() {
    try {
      const startTime = Date.now();
      const result = await postgresPool.query('SELECT NOW()');
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        serverTime: result.rows[0].now,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Check Redis connection
   */
  async checkRedis() {
    try {
      const startTime = Date.now();
      await redisClient.ping();
      const responseTime = Date.now() - startTime;

      // Get queue sizes
      const waitingJobs = await redisClient.llen('bull:submissionQueue:wait');
      const activeJobs = await redisClient.llen('bull:submissionQueue:active');

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        queue: {
          waiting: waitingJobs,
          active: activeJobs,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Check email service
   */
  async checkEmailService() {
    try {
      if (!emailService.transport) {
        return {
          status: 'not_configured',
          message: 'Email service not configured',
        };
      }

      await emailService.transport.verify();

      return {
        status: 'healthy',
        host: config.email?.smtp?.host || 'unknown',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Check worker status
   */
  async checkWorkers() {
    try {
      // Check submission queue
      const stats = await postgresPool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE action = 'queued') as queued,
          COUNT(*) FILTER (WHERE action = 'processing') as processing,
          COUNT(*) FILTER (WHERE action = 'completed') as completed,
          COUNT(*) FILTER (WHERE action = 'failed') as failed,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as last_hour
        FROM submission_activity_log
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      const { queued, processing, completed, failed, last_hour } =
        stats.rows[0];

      const successRate =
        completed + failed > 0
          ? ((completed / (completed + failed)) * 100).toFixed(2)
          : 100;

      return {
        status: queued > 1000 || failed > 100 ? 'degraded' : 'healthy',
        stats: {
          queued: parseInt(queued),
          processing: parseInt(processing),
          completed: parseInt(completed),
          failed: parseInt(failed),
          lastHour: parseInt(last_hour),
          successRate: `${successRate}%`,
        },
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message,
      };
    }
  }

  /**
   * Get memory usage
   */
  getMemoryUsage() {
    const used = process.memoryUsage();
    return {
      rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(used.external / 1024 / 1024)} MB`,
    };
  }

  /**
   * Check for anomalies and send alerts
   */
  async checkAnomalies() {
    try {
      const health = await this.getSystemHealth();

      // Alert if any service is unhealthy
      for (const [serviceName, serviceHealth] of Object.entries(
        health.services
      )) {
        if (serviceHealth.status !== 'healthy') {
          await this.sendAlert({
            level: 'CRITICAL',
            type: `service_${serviceName}_unhealthy`,
            message: `${serviceName} service is ${serviceHealth.status}`,
            error: serviceHealth.error || 'Unknown error',
            details: serviceHealth,
          });
        }
      }

      // Alert if queue backlog
      if (health.services.workers?.stats?.queued > 1000) {
        await this.sendAlert({
          level: 'WARNING',
          type: 'queue_backlog',
          message: `Queue backlog detected: ${health.services.workers.stats.queued} jobs waiting`,
          details: health.services.workers.stats,
        });
      }

      // Alert if high failure rate
      const successRate = parseFloat(
        health.services.workers?.stats?.successRate || '100'
      );
      if (successRate < 90) {
        await this.sendAlert({
          level: 'WARNING',
          type: 'high_failure_rate',
          message: `High failure rate detected: ${successRate}% success rate`,
          details: health.services.workers.stats,
        });
      }
    } catch (error) {
      logger.error('Error checking anomalies:', error.message);
    }
  }

  /**
   * Send monitoring alert
   */
  async sendAlert(alert) {
    const { level, type, message, error, details } = alert;

    try {
      logger.error(`🚨 MONITORING ALERT [${level}]: ${message}`);

      // Send email to admin
      const adminEmail =
        config.alerts?.adminEmail || config.email?.from || 'admin@example.com';

      if (emailService.sendEmail) {
        await emailService.sendEmail(
          adminEmail,
          `🚨 ${level} Alert: ${type}`,
          `
Monitoring Alert

Level: ${level}
Type: ${type}
Message: ${message}
${error ? `Error: ${error}` : ''}

Details:
${JSON.stringify(details, null, 2)}

Timestamp: ${new Date().toISOString()}
Environment: ${config.env}

Please investigate immediately.
          `
        );
      }

      // Store alert in database
      await postgresPool.query(
        `
        INSERT INTO system_alerts (
          id, level, type, message, error_message, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, NOW()
        )
        `,
        [level, type, message, error || null]
      );

      return true;
    } catch (err) {
      logger.error(`❌ Failed to send alert:`, err.message);
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    // Check health every 5 minutes
    setInterval(async () => {
      try {
        await this.checkAnomalies();
      } catch (error) {
        logger.error('Health check failed:', error.message);
      }
    }, 5 * 60 * 1000);

    logger.info('✅ Health monitoring started (checks every 5 minutes)');
  }

  /**
   * Get submission statistics
   */
  async getSubmissionStats(timeframe = '24h') {
    const intervals = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days',
    };

    const interval = intervals[timeframe] || '24 hours';

    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE perm_enabled = TRUE) as perm_submissions,
          AVG(event_compliance_percentage) FILTER (WHERE perm_enabled = TRUE) as avg_compliance,
          COUNT(DISTINCT tenant_id) as unique_tenants,
          COUNT(DISTINCT node_id) FILTER (WHERE node_id IS NOT NULL) as unique_nodes
        FROM form_submissions
        WHERE created_at >= NOW() - INTERVAL '${interval}'
      `;

      const result = await postgresPool.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get submission stats:', error.message);
      throw error;
    }
  }
}

module.exports = new MonitoringService();
```

---

## 🔔 STEP 2: Create Health Check Endpoint

### File: `src/routes/v1/health.route.js`

```javascript
const express = require('express');
const monitoringService = require('../../services/monitoring.service');
const { requireAccess } = require('../../middlewares/requireAccess');

const router = express.Router();

// Public health check (for load balancers)
router.get('/', async (req, res) => {
  const health = await monitoringService.getSystemHealth();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Detailed health check (Admin only)
router.get(
  '/detailed',
  requireAccess({ permissions: ['admin:system'], jwtOnly: true }),
  async (req, res) => {
    const health = await monitoringService.getSystemHealth();
    const stats = await monitoringService.getSubmissionStats('24h');
    
    res.json({
      ...health,
      submissions: stats,
    });
  }
);

// Submission statistics (Admin/Owner)
router.get(
  '/stats/:timeframe',
  requireAccess({ permissions: ['view:analytics'], jwtOnly: true }),
  async (req, res) => {
    const { timeframe } = req.params;
    const stats = await monitoringService.getSubmissionStats(timeframe);
    res.json(stats);
  }
);

module.exports = router;
```

### Add to main routes:

```javascript
// src/routes/v1/index.js

const healthRoute = require('./health.route');

router.use('/health', healthRoute);
```

---

## 🧪 STEP 3: Test Monitoring

### Test Health Endpoint:

```bash
# Public health check
curl http://localhost:4000/v1/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-10-23T11:30:00.000Z",
  "uptime": 12345,
  "memory": {
    "rss": "150 MB",
    "heapUsed": "80 MB"
  },
  "services": {
    "mongodb": { "status": "healthy", "state": "connected" },
    "postgresql": { "status": "healthy", "responseTime": "5ms" },
    "redis": { "status": "healthy", "queue": { "waiting": 0, "active": 1 } },
    "email": { "status": "healthy" },
    "workers": { "status": "healthy", "stats": { "successRate": "98.5%" } }
  }
}
```

---

## 📊 STEP 4: Add Metrics Dashboard API

### File: `src/controllers/monitoring.controller.js`

```javascript
const monitoringService = require('../services/monitoring.service');
const catchAsync = require('../utils/catchAsync');

/**
 * Get real-time metrics dashboard
 */
const getDashboardMetrics = catchAsync(async (req, res) => {
  const { tenant_id } = req.query;
  
  const metrics = {
    overview: await monitoringService.getSubmissionStats('24h'),
    health: await monitoringService.getSystemHealth(),
    trends: await getTrends(tenant_id),
  };

  res.json(metrics);
});

/**
 * Get trend data
 */
const getTrends = async (tenantId) => {
  const query = `
    SELECT 
      DATE_TRUNC('hour', created_at) as hour,
      COUNT(*) as submissions,
      COUNT(*) FILTER (WHERE status = 'completed') as successful,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      AVG(event_compliance_percentage) FILTER (WHERE perm_enabled = TRUE) as avg_compliance
    FROM form_submissions
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      ${tenantId ? 'AND tenant_id = $1' : ''}
    GROUP BY hour
    ORDER BY hour DESC
  `;

  const values = tenantId ? [tenantId] : [];
  const result = await postgresPool.query(query, values);
  
  return result.rows;
};

module.exports = {
  getDashboardMetrics,
};
```

---

## 🚨 STEP 5: Implement Alerting

### Alert Triggers:

```javascript
// src/services/monitoring.service.js

/**
 * Start automated alerting
 */
startAlerting() {
  // Check every 5 minutes
  setInterval(async () => {
    try {
      await this.checkAnomalies();
    } catch (error) {
      logger.error('Anomaly check failed:', error.message);
    }
  }, 5 * 60 * 1000);

  logger.info('✅ Automated alerting started');
}

/**
 * Check for anomalies
 */
async checkAnomalies() {
  const stats = await this.getSubmissionStats('1h');

  // 1. Check failure rate
  const failureRate = stats.failed / (stats.completed + stats.failed);
  if (failureRate > 0.1) {
    // > 10% failures
    await this.sendAlert({
      level: 'WARNING',
      type: 'high_failure_rate',
      message: `High failure rate: ${(failureRate * 100).toFixed(2)}% in last hour`,
      details: stats,
    });
  }

  // 2. Check queue backlog
  const queueSize = await redisClient.llen('bull:submissionQueue:wait');
  if (queueSize > 1000) {
    await this.sendAlert({
      level: 'WARNING',
      type: 'queue_backlog',
      message: `Large queue backlog: ${queueSize} jobs waiting`,
      details: { queueSize },
    });
  }

  // 3. Check low compliance
  if (stats.avg_compliance < 50 && stats.perm_submissions > 10) {
    await this.sendAlert({
      level: 'INFO',
      type: 'low_compliance',
      message: `Average compliance is low: ${stats.avg_compliance.toFixed(2)}%`,
      details: stats,
    });
  }

  // 4. Check system health
  const health = await this.getSystemHealth();
  if (health.status !== 'healthy') {
    await this.sendAlert({
      level: 'CRITICAL',
      type: 'system_unhealthy',
      message: `System health degraded: ${health.status}`,
      details: health.services,
    });
  }
}
```

---

## 📱 STEP 6: Setup Slack/Discord Alerts (Optional)

### Slack Webhook Integration:

```javascript
// src/services/slackAlert.service.js

const axios = require('axios');
const config = require('../config/config');
const logger = require('../config/logger');

class SlackAlertService {
  async sendAlert(alert) {
    const { level, type, message, details } = alert;

    const webhookUrl = config.slack?.webhookUrl;
    if (!webhookUrl) {
      return false;
    }

    const colors = {
      CRITICAL: '#FF0000',
      WARNING: '#FFA500',
      INFO: '#0000FF',
    };

    try {
      await axios.post(webhookUrl, {
        attachments: [
          {
            color: colors[level] || '#808080',
            title: `${this.getEmoji(level)} ${level} Alert: ${type}`,
            text: message,
            fields: [
              {
                title: 'Environment',
                value: config.env,
                short: true,
              },
              {
                title: 'Timestamp',
                value: new Date().toISOString(),
                short: true,
              },
            ],
            footer: 'PERM Monitoring System',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      });

      logger.info(`✅ Slack alert sent for ${type}`);
      return true;
    } catch (error) {
      logger.error('Failed to send Slack alert:', error.message);
      return false;
    }
  }

  getEmoji(level) {
    const emojis = {
      CRITICAL: '🔴',
      WARNING: '⚠️',
      INFO: 'ℹ️',
    };
    return emojis[level] || '📢';
  }
}

module.exports = new SlackAlertService();
```

---

## 📊 STEP 7: Create Metrics Export (Prometheus)

### File: `src/routes/v1/metrics.route.js`

```javascript
const express = require('express');
const { postgresPool } = require('../../config/postgres');

const router = express.Router();

// Prometheus metrics endpoint
router.get('/', async (req, res) => {
  try {
    const stats = await postgresPool.query(`
      SELECT 
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_submissions,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_submissions,
        AVG(event_compliance_percentage) FILTER (WHERE perm_enabled = TRUE) as avg_compliance
      FROM form_submissions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    const { total_submissions, successful_submissions, failed_submissions, avg_compliance } =
      stats.rows[0];

    // Prometheus format
    const metrics = `
# HELP submissions_total Total number of submissions
# TYPE submissions_total counter
submissions_total ${total_submissions}

# HELP submissions_successful Successful submissions
# TYPE submissions_successful counter
submissions_successful ${successful_submissions}

# HELP submissions_failed Failed submissions
# TYPE submissions_failed counter
submissions_failed ${failed_submissions}

# HELP perm_compliance_average Average PERM compliance percentage
# TYPE perm_compliance_average gauge
perm_compliance_average ${avg_compliance || 0}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${process.uptime()}
    `.trim();

    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    res.status(500).send('Error generating metrics');
  }
});

module.exports = router;
```

---

## 🚀 QUICK START

```bash
# 1. Create monitoring service
# (Apply code from Step 1)

# 2. Add health check route
# (Apply code from Step 2)

# 3. Restart application
npm run dev

# 4. Test health endpoint
curl http://localhost:4000/v1/health

# 5. Test metrics endpoint
curl http://localhost:4000/v1/metrics

# 6. Setup Grafana dashboard (optional)
# Connect to /v1/metrics endpoint
```

---

## 📋 MONITORING CHECKLIST

- [ ] Health check endpoint implemented
- [ ] Monitoring service running
- [ ] Automated anomaly detection
- [ ] Email alerts configured
- [ ] Slack/Discord alerts (optional)
- [ ] Metrics export for Grafana/Prometheus
- [ ] Database health checks
- [ ] Worker health checks
- [ ] Queue monitoring
- [ ] Daily health reports

---

**Status:** Ready to implement  
**Estimated Time:** 6-8 hours  
**Priority:** HIGH


