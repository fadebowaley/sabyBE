const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const http = require('http');
const httpStatus = require('http-status');
const path = require('path');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');
const logger = require('./config/logger');

const app = express();

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
    'http://10.17.1.18:3000',
    'http://40.71.204.212:3000', // Old staging frontend
    'https://40.71.204.212:3000', // Old staging frontend HTTPS
    'https://dev.saby.ai', // Old unified staging frontend
    'https://stg.saby.ai', // Unified staging frontend
    'https://saby.ai', // Production frontend
    'https://www.saby.ai', // Production frontend (www)
    'https://app.saby.ai', // Production app frontend
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
if (config.env === 'production') {
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
  const { testConnection: testPostgresConnection } = require('./config/postgres');
  const { redisClient } = require('./config/redis');

  // Check database connections
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
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
    message: '🛠️ "I will restore you to health and heal your wounds." – Jeremiah 30:17',
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
