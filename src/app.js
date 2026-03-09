const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const mongoose = require('mongoose');
const http = require('http');
const httpStatus = require('http-status');
const path = require('path');
const { Queue } = require('bullmq');
const config = require('./config/config');
const morgan = require('./config/morgan');
const packageJson = require('../package.json');
const { jwtStrategy } = require('./config/passport');
const { postgresPool } = require('./config/postgres');
const { testRedisConnection, getRedisConnectionOptions } = require('./config/redis');
const User = require('./models/user.model');
const Nodes = require('./models/node.model');
const Role = require('./models/role.model');
const Report = require('./models/reports.model');
const Storage = require('./models/storage.model');
const { submissionQueue } = require('./middlewares/queues');
const notificationQueueService = require('./services/notificationQueue.service');
const {
  nodeBaselineQueue,
  networkBaselineQueue,
  batchChangeQueue,
} = require('./queues/baseline.queue');
const { paymentRemittanceQueue } = require('./queues/paymentRemittance.queue');
const {
  paymentReconciliationQueue,
} = require('./queues/paymentReconciliation.queue');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');
const logger = require('./config/logger');

const app = express();

const APP_VERSION = process.env.APP_VERSION || packageJson.version || '1.0.0';
const REQUEST_TIMELINE_WINDOW_MINUTES = 60;
const REQUEST_TIMELINE_RESPONSE_WINDOW = 12;
const REQUEST_ROLLING_WINDOW_MINUTES = 5;
const LATENCY_SAMPLE_LIMIT = 500;
const STATUS_SUMMARY_CACHE_TTL_MS = Math.max(
  Number(process.env.STATUS_SUMMARY_CACHE_TTL_MS) || 60000,
  10000
);

const requestTelemetry = {
  startedAt: Date.now(),
  inFlight: 0,
  totalRequests: 0,
  totalErrors: 0,
  totalDurationMs: 0,
  latencySamples: [],
  perMinute: new Map(),
};

const statusSummaryCache = {
  payload: null,
  generatedAt: 0,
  expiresAt: 0,
};

const permNotificationQueue = new Queue('permNotificationQueue', {
  connection: getRedisConnectionOptions(),
});

const formatUptime = (uptimeSeconds) => {
  const safeSeconds = Math.max(0, Math.floor(uptimeSeconds || 0));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

const nowMinuteKey = () => Math.floor(Date.now() / 60000);

const pruneMinuteBuckets = () => {
  const cutoff = nowMinuteKey() - REQUEST_TIMELINE_WINDOW_MINUTES;
  for (const key of requestTelemetry.perMinute.keys()) {
    if (key < cutoff) {
      requestTelemetry.perMinute.delete(key);
    }
  }
};

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
};

const withTimeout = async (task, timeoutMs, fallbackValue) => {
  let timer;
  const taskPromise = Promise.resolve()
    .then(task)
    .catch(() => fallbackValue);

  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });

  const result = await Promise.race([taskPromise, timeoutPromise]);
  clearTimeout(timer);
  return result;
};

const dependencyStatus = (connected) => (connected ? 'connected' : 'error');

const checkMongoDependency = async () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { status: 'disconnected', latencyMs: null };
  }

  const started = Date.now();
  const pingResult = await withTimeout(
    () => mongoose.connection.db.admin().ping(),
    2500,
    null
  );

  if (!pingResult || pingResult.ok !== 1) {
    return { status: 'error', latencyMs: null };
  }

  return { status: 'connected', latencyMs: Date.now() - started };
};

const checkPostgresDependency = async () => {
  const started = Date.now();
  const result = await withTimeout(
    () => postgresPool.query('SELECT 1'),
    2500,
    null
  );

  if (!result) {
    return { status: 'error', latencyMs: null };
  }

  return { status: 'connected', latencyMs: Date.now() - started };
};

const checkRedisDependency = async () => {
  const started = Date.now();
  const isConnected = await withTimeout(() => testRedisConnection(), 2500, false);
  if (!isConnected) {
    return { status: 'error', latencyMs: null };
  }
  return { status: 'connected', latencyMs: Date.now() - started };
};

const deriveOverallStatus = (dependencies) => {
  const statuses = Object.values(dependencies).map((entry) => entry.status);
  const connected = statuses.filter((status) => status === 'connected').length;

  if (connected === statuses.length) return 'operational';
  if (connected > 0) return 'degraded';
  return 'critical';
};

const buildTrafficSnapshot = () => {
  pruneMinuteBuckets();
  const currentMinute = nowMinuteKey();
  let requestsLast5m = 0;
  let errorsLast5m = 0;

  for (let offset = 0; offset < REQUEST_ROLLING_WINDOW_MINUTES; offset += 1) {
    const bucket = requestTelemetry.perMinute.get(currentMinute - offset);
    if (bucket) {
      requestsLast5m += bucket.requests;
      errorsLast5m += bucket.errors;
    }
  }

  const timeline = [];
  for (
    let offset = REQUEST_TIMELINE_RESPONSE_WINDOW - 1;
    offset >= 0;
    offset -= 1
  ) {
    const key = currentMinute - offset;
    const bucket = requestTelemetry.perMinute.get(key) || {
      requests: 0,
      errors: 0,
    };
    const label = new Date(key * 60000).toISOString().slice(11, 16);
    timeline.push({
      minute: label,
      requests: bucket.requests,
      errors: bucket.errors,
    });
  }

  const averageLatencyMs =
    requestTelemetry.totalRequests > 0
      ? Number(
          (requestTelemetry.totalDurationMs / requestTelemetry.totalRequests).toFixed(
            2
          )
        )
      : 0;

  const errorRatePercent =
    requestsLast5m > 0
      ? Number(((errorsLast5m / requestsLast5m) * 100).toFixed(2))
      : 0;

  return {
    inFlight: requestTelemetry.inFlight,
    totalRequests: requestTelemetry.totalRequests,
    totalErrors: requestTelemetry.totalErrors,
    requestsPerMinute5m: Number(
      (requestsLast5m / REQUEST_ROLLING_WINDOW_MINUTES).toFixed(2)
    ),
    errorRatePercent5m: errorRatePercent,
    averageLatencyMs,
    p95LatencyMs: percentile(requestTelemetry.latencySamples, 95),
    timeline,
  };
};

const countModelSafely = async (model) =>
  withTimeout(() => model.estimatedDocumentCount(), 2500, null);

const getQueueSnapshot = async (queue) => {
  const counts = await withTimeout(
    async () => {
      const [waiting, active, delayed, failed, completed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getFailedCount(),
        queue.getCompletedCount(),
      ]);
      return { waiting, active, delayed, failed, completed };
    },
    2500,
    null
  );

  if (!counts) {
    return {
      status: 'error',
      waiting: null,
      active: null,
      delayed: null,
      failed: null,
      completed: null,
    };
  }

  return {
    status: 'connected',
    ...counts,
  };
};

const getQueueHealth = async () => {
  const [
    submission,
    notification,
    permNotification,
    baselineNode,
    baselineNetwork,
    baselineBatch,
    paymentRemittance,
    paymentReconciliation,
  ] = await Promise.all([
    getQueueSnapshot(submissionQueue),
    getQueueSnapshot(notificationQueueService.queue),
    getQueueSnapshot(permNotificationQueue),
    getQueueSnapshot(nodeBaselineQueue),
    getQueueSnapshot(networkBaselineQueue),
    getQueueSnapshot(batchChangeQueue),
    getQueueSnapshot(paymentRemittanceQueue),
    getQueueSnapshot(paymentReconciliationQueue),
  ]);

  return {
    submission,
    notification,
    permNotification,
    baselineNode,
    baselineNetwork,
    baselineBatch,
    paymentRemittance,
    paymentReconciliation,
  };
};

const getPostgresTableEstimates = async () => {
  const tables = ['form_submissions', 'submission_activity_log', 'dead_letter_queue'];
  const rows = await withTimeout(
    async () => {
      const query = `
        SELECT relname, GREATEST(reltuples, 0)::bigint AS estimated_rows
        FROM pg_class
        WHERE relkind = 'r'
          AND relname = ANY($1::text[])
      `;
      const result = await postgresPool.query(query, [tables]);
      return result.rows;
    },
    2500,
    []
  );

  const estimates = {
    formSubmissions: null,
    submissionActivityLog: null,
    deadLetterQueue: null,
  };

  rows.forEach((row) => {
    if (row.relname === 'form_submissions') {
      estimates.formSubmissions = Number(row.estimated_rows);
    }
    if (row.relname === 'submission_activity_log') {
      estimates.submissionActivityLog = Number(row.estimated_rows);
    }
    if (row.relname === 'dead_letter_queue') {
      estimates.deadLetterQueue = Number(row.estimated_rows);
    }
  });

  return estimates;
};

const getCopilotOperationalMetrics = async () => {
  const hasResolutionLogs = await withTimeout(
    async () => {
      const result = await postgresPool.query(
        `SELECT to_regclass('copilot.entity_resolution_logs')::text AS table_name`
      );
      return Boolean(result.rows[0]?.table_name);
    },
    1000,
    false
  );

  const resolutionCte = hasResolutionLogs
    ? `,
         resolutions AS (
           SELECT
             COUNT(*)::bigint AS total_24h,
             COUNT(*) FILTER (WHERE status = 'resolved')::bigint AS resolved_24h,
             COUNT(*) FILTER (WHERE status = 'ambiguous')::bigint AS ambiguous_24h,
             COUNT(*) FILTER (WHERE status = 'not_found')::bigint AS not_found_24h,
             COALESCE(
               PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms),
               0
             ) AS p95_latency_ms
           FROM copilot.entity_resolution_logs
           WHERE created_at >= NOW() - INTERVAL '24 hours'
         )`
    : '';
  const resolutionSelect = hasResolutionLogs
    ? `,
           (SELECT total_24h FROM resolutions) AS resolutions_total_24h,
           (SELECT resolved_24h FROM resolutions) AS resolutions_resolved_24h,
           (SELECT ambiguous_24h FROM resolutions) AS resolutions_ambiguous_24h,
           (SELECT not_found_24h FROM resolutions) AS resolutions_not_found_24h,
           (SELECT p95_latency_ms FROM resolutions) AS resolutions_p95_latency_ms`
    : `,
           NULL::bigint AS resolutions_total_24h,
           NULL::bigint AS resolutions_resolved_24h,
           NULL::bigint AS resolutions_ambiguous_24h,
           NULL::bigint AS resolutions_not_found_24h,
           NULL::numeric AS resolutions_p95_latency_ms`;

  const row = await withTimeout(
    async () => {
      const result = await postgresPool.query(
        `WITH outbox AS (
           SELECT
             COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))), 0) AS lag_seconds,
             COUNT(*)::bigint AS pending_count
           FROM copilot.action_outbox
           WHERE status = 'pending'
         ),
         dlq AS (
           SELECT
             COUNT(*)::bigint AS total,
             COUNT(*) FILTER (
               WHERE created_at >= NOW() - INTERVAL '24 hours'
             )::bigint AS last_24h
           FROM copilot.action_dlq
         ),
         latency AS (
           SELECT
             COALESCE(AVG(minutes), 0) AS avg_minutes,
             COALESCE(
               PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY minutes),
               0
             ) AS p95_minutes
           FROM (
             SELECT
               EXTRACT(EPOCH FROM (completed_at - created_at)) / 60.0 AS minutes
             FROM copilot.action_events
             WHERE status = 'completed'
               AND completed_at IS NOT NULL
               AND created_at IS NOT NULL
               AND completed_at >= NOW() - INTERVAL '24 hours'
           ) durations
         ),
         deliveries AS (
           SELECT
             COUNT(*)::bigint AS total,
             COUNT(*) FILTER (
               WHERE delivery_status IN ('sent', 'delivered')
             )::bigint AS success
           FROM copilot.notification_deliveries
           WHERE created_at >= NOW() - INTERVAL '24 hours'
         )${resolutionCte}
         SELECT
           (SELECT lag_seconds FROM outbox) AS outbox_lag_seconds,
           (SELECT pending_count FROM outbox) AS outbox_pending,
           (SELECT total FROM dlq) AS dlq_total,
           (SELECT last_24h FROM dlq) AS dlq_last_24h,
           (SELECT avg_minutes FROM latency) AS action_latency_avg_minutes,
           (SELECT p95_minutes FROM latency) AS action_latency_p95_minutes,
           (SELECT total FROM deliveries) AS deliveries_total_24h,
           (SELECT success FROM deliveries) AS deliveries_success_24h
           ${resolutionSelect}`
      );
      return result.rows[0] || null;
    },
    2500,
    null
  );

  if (!row) {
    return {
      status: 'error',
      outboxLagSeconds: null,
      outboxPending: null,
      dlqTotal: null,
      dlqLast24h: null,
      actionLatencyAvgMinutes: null,
      actionLatencyP95Minutes: null,
      notificationDeliverySuccessRate24h: null,
      entityResolutionTotal24h: null,
      entityResolutionResolved24h: null,
      entityResolutionAmbiguous24h: null,
      entityResolutionNotFound24h: null,
      entityResolutionAutoResolveRate24h: null,
      entityResolutionP95LatencyMs: null,
    };
  }

  const deliveriesTotal = Number(row.deliveries_total_24h || 0);
  const deliveriesSuccess = Number(row.deliveries_success_24h || 0);
  const deliveryRate =
    deliveriesTotal > 0
      ? Number(((deliveriesSuccess / deliveriesTotal) * 100).toFixed(2))
      : null;
  const resolutionsTotal = Number(row.resolutions_total_24h || 0);
  const resolutionsResolved = Number(row.resolutions_resolved_24h || 0);
  const resolutionsAmbiguous = Number(row.resolutions_ambiguous_24h || 0);
  const resolutionsNotFound = Number(row.resolutions_not_found_24h || 0);
  const resolutionAutoRate =
    resolutionsTotal > 0
      ? Number(((resolutionsResolved / resolutionsTotal) * 100).toFixed(2))
      : null;

  return {
    status: 'connected',
    outboxLagSeconds: Number(row.outbox_lag_seconds || 0),
    outboxPending: Number(row.outbox_pending || 0),
    dlqTotal: Number(row.dlq_total || 0),
    dlqLast24h: Number(row.dlq_last_24h || 0),
    actionLatencyAvgMinutes: Number(row.action_latency_avg_minutes || 0),
    actionLatencyP95Minutes: Number(row.action_latency_p95_minutes || 0),
    notificationDeliverySuccessRate24h: deliveryRate,
    entityResolutionTotal24h: resolutionsTotal,
    entityResolutionResolved24h: resolutionsResolved,
    entityResolutionAmbiguous24h: resolutionsAmbiguous,
    entityResolutionNotFound24h: resolutionsNotFound,
    entityResolutionAutoResolveRate24h: resolutionAutoRate,
    entityResolutionP95LatencyMs:
      row.resolutions_p95_latency_ms === null
        ? null
        : Number(row.resolutions_p95_latency_ms || 0),
  };
};

const collectStatusSummary = async () => {
  const generatedAt = Date.now();
  const [mongodb, postgresql, redis] = await Promise.all([
    checkMongoDependency(),
    checkPostgresDependency(),
    checkRedisDependency(),
  ]);

  const dependencies = { mongodb, postgresql, redis };
  const [
    users,
    roles,
    nodes,
    reports,
    storageFiles,
    postgresTables,
    queues,
    copilotOperational,
  ] =
    await Promise.all([
      countModelSafely(User),
      countModelSafely(Role),
      countModelSafely(Nodes),
      countModelSafely(Report),
      countModelSafely(Storage),
      getPostgresTableEstimates(),
      getQueueHealth(),
      getCopilotOperationalMetrics(),
    ]);

  const memoryUsage = process.memoryUsage();

  return {
    status: deriveOverallStatus(dependencies),
    generatedAt: new Date(generatedAt).toISOString(),
    service: {
      name: 'Saby API',
      environment: config.env || 'development',
      version: APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      startedAt: new Date(requestTelemetry.startedAt).toISOString(),
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      memoryMb: {
        rss: Number((memoryUsage.rss / 1024 / 1024).toFixed(2)),
        heapUsed: Number((memoryUsage.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotal: Number((memoryUsage.heapTotal / 1024 / 1024).toFixed(2)),
      },
    },
    dependencies,
    traffic: buildTrafficSnapshot(),
    queues,
    metrics: {
      users,
      roles,
      nodes,
      reports,
      storageFiles,
      formSubmissionsEstimate: postgresTables.formSubmissions,
      submissionActivityEstimate: postgresTables.submissionActivityLog,
      deadLetterQueueEstimate: postgresTables.deadLetterQueue,
      copilotOperational,
    },
    links: {
      docs: '/v1/docs',
      health: '/api/health',
      status: '/api/status/summary',
      apiBase: '/v1',
    },
  };
};

// Trust proxy to get real client IPs from nginx
app.set('trust proxy', 1); // Trust first proxy (nginx)

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());

// parse json request body
app.use(
  express.json({
    verify: (req, res, buf) => {
      if (
        req.originalUrl &&
        (req.originalUrl.startsWith('/v1/payment/webhook') ||
          req.originalUrl.startsWith('/v1/payments/webhook'))
      ) {
        req.rawBody = buf.toString('utf8');
      }
    },
  })
);

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// sanitize request data
app.use(xss());
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// CORS configuration
// For production, consider using environment variables for origins
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://0.0.0.0:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://0.0.0.0:3001',
    // Production frontend domains (priority order)
    'https://dashboard.saby.ai', // Main production dashboard
    'https://app.saby.ai', // Current production frontend
    'https://www.app.saby.ai',
    'https://saby.ai',
    'https://www.saby.ai',
    'https://web.saby.ai',
    'https://stg.saby.ai',
    'https://portal.saby.ai',
    'https://www.portal.saby.ai',
    // External domains that need API access
    'https://portal.sotsm.org',
    // Add production origins from environment variables if needed
    ...(config.cors?.allowedOrigins || []),
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  // Allow custom headers for API key authentication and other integrations
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key', // API key header for authentication
    'x-api-key', // Lowercase variant (browsers may normalize)
    'X-Requested-With', // Common header for AJAX requests
    'Accept', // Accept header for content negotiation
    'Origin', // Origin header for CORS
    'Access-Control-Request-Method', // CORS preflight
    'Access-Control-Request-Headers', // CORS preflight
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
  ],
  credentials: true,
  // Preflight cache duration (24 hours)
  maxAge: 86400,
};

/*
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
 */

// enable cors
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// limit repeated failed requests to auth endpoints
// Enable in both production and staging
if (config.env === 'production' || config.env === 'staging') {
  app.use('/v1/auth', authLimiter);
}

// Serve static files for landing page
app.use(express.static(path.join(__dirname, '../public')));

// Landing page (root route)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check endpoint with detailed status
app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  const {
    testConnection: testPostgresConnection,
  } = require('./config/postgres');
  const { redisClient } = require('./config/redis');

  // Check database connections
  const mongoStatus =
    mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  let postgresStatus = 'disconnected';
  try {
    const isConnected = await testPostgresConnection();
    postgresStatus = isConnected ? 'connected' : 'disconnected';
  } catch (error) {
    postgresStatus = 'error';
  }

  let redisStatus = 'disconnected';
  try {
    if (redisClient && typeof redisClient.ping === 'function') {
      await redisClient.ping();
      redisStatus = 'connected';
    }
  } catch (error) {
    redisStatus = 'error';
  }

  res.status(200).json({
    status: 'OK',
    message:
      '🛠️ "I will restore you to health and heal your wounds." – Jeremiah 30:17',
    timestamp: new Date().toISOString(),
    environment: config.env || 'development',
    version: '1.0.4',
    uptime: process.uptime(),
    databases: {
      mongodb: mongoStatus,
      postgresql: postgresStatus,
      redis: redisStatus,
    },
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  });
});

// Status summary with dependency and queue insights.
app.get('/api/status/summary', async (req, res, next) => {
  try {
    const now = Date.now();
    if (
      statusSummaryCache.payload &&
      statusSummaryCache.expiresAt &&
      statusSummaryCache.expiresAt > now
    ) {
      return res.status(200).json(statusSummaryCache.payload);
    }

    const payload = await collectStatusSummary();
    statusSummaryCache.payload = payload;
    statusSummaryCache.generatedAt = now;
    statusSummaryCache.expiresAt = now + STATUS_SUMMARY_CACHE_TTL_MS;

    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

// v1 api routes
app.use('/v1', routes);

// WhatsApp webhook forwarding to separate bot
app.get('/whatsapp/webhook', (req, res) => {
  logger.info('WhatsApp webhook query params:', req.query);

  // Build query string manually
  const queryParams = new URLSearchParams();
  if (req.query['hub.mode'])
    queryParams.append('hub.mode', req.query['hub.mode']);
  if (req.query['hub.verify_token'])
    queryParams.append('hub.verify_token', req.query['hub.verify_token']);
  if (req.query['hub.challenge'])
    queryParams.append('hub.challenge', req.query['hub.challenge']);

  const url = `http://localhost:4001/webhook?${queryParams.toString()}`;
  logger.info('Proxying to:', url);

  // Proxy the request instead of redirecting
  const proxyReq = http.request(url, (proxyRes) => {
    let data = '';
    proxyRes.on('data', (chunk) => {
      data += chunk;
    });
    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode).send(data);
    });
  });

  proxyReq.on('error', (error) => {
    logger.error('Error proxying to WhatsApp bot:', error);
    res.status(500).send('Internal Server Error');
  });

  proxyReq.end();
});

app.post('/whatsapp/webhook', (req, res) => {
  // Forward the request to the WhatsApp bot
  const postData = JSON.stringify(req.body);
  const options = {
    hostname: 'localhost',
    port: 4001,
    path: '/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const request = http.request(options, (response) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });
    response.on('end', () => {
      res.status(response.statusCode).send(data);
    });
  });

  request.on('error', (error) => {
    logger.error('Error forwarding to WhatsApp bot:', error);
    res.status(500).send('Internal Server Error');
  });

  request.write(postData);
  request.end();
});

// Serve static files
app.use(
  '/telegram-webapp',
  express.static(path.join(__dirname, '../public/telegram-webapp'))
);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

module.exports = app;
