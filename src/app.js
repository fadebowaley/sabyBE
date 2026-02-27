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
const config = require('./config/config');
const morgan = require('./config/morgan');
const packageJson = require('../package.json');
const { jwtStrategy } = require('./config/passport');
const { postgresPool } = require('./config/postgres');
const { testRedisConnection } = require('./config/redis');
const User = require('./models/user.model');
const Nodes = require('./models/node.model');
const Role = require('./models/role.model');
const Report = require('./models/reports.model');
const Storage = require('./models/storage.model');
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

const collectStatusSummary = async () => {
  const generatedAt = Date.now();
  const [mongodb, postgresql, redis] = await Promise.all([
    checkMongoDependency(),
    checkPostgresDependency(),
    checkRedisDependency(),
  ]);

  const dependencies = { mongodb, postgresql, redis };
  const [users, roles, nodes, reports, storageFiles, postgresTables] =
    await Promise.all([
      countModelSafely(User),
      countModelSafely(Role),
      countModelSafely(Nodes),
      countModelSafely(Report),
      countModelSafely(Storage),
      getPostgresTableEstimates(),
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
    metrics: {
      users,
      roles,
      nodes,
      reports,
      storageFiles,
      formSubmissionsEstimate: postgresTables.formSubmissions,
      submissionActivityEstimate: postgresTables.submissionActivityLog,
      deadLetterQueueEstimate: postgresTables.deadLetterQueue,
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
app.use(express.json());

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
