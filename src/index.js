const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const {
  testConnection: testPostgresConnection,
  closePool: closePostgresPool,
} = require('./config/postgres');
const {
  connectRedis,
  testRedisConnection,
  closeRedis,
} = require('./config/redis');
const { initializeSocket } = require('./config/socket');
const { initializeWorkers, shutdownWorkers } = require('./workers/index');

let server;

// Connect to both MongoDB and PostgreSQL
const connectToDatabases = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Connect to PostgreSQL
    const postgresConnected = await testPostgresConnection();

    // Connect to Redis
    connectRedis();
    const redisConnected = await testRedisConnection();

    if (postgresConnected && redisConnected) {
      // Start the server only if both databases are connected
      server = app.listen(config.port, '::', () => {
        logger.info(`🚀 Server is running on port ${config.port}`);
        logger.info(`🌍 Environment: ${config.env}`);
        logger.info('📊 Database Status:');
        logger.info('   - MongoDB: ✅ Connected');
        logger.info('   - PostgreSQL: ✅ Connected');
        logger.info('   - Redis: ✅ Connected');
      });

      // Initialize Socket.IO
      initializeSocket(server);

      // Initialize scheduled jobs (only in production/staging)
      if (config.env === 'production' || config.env === 'staging') {
        const { scheduleCleanup } = require('./jobs/cleanupDeletedForms');
        scheduleCleanup();
        logger.info('✅ Scheduled jobs initialized');
      }

      // Start all background workers automatically
      await initializeWorkers();
    } else {
      logger.error(
        '❌ Failed to connect to PostgreSQLor Redis. Server not started.'
      );
      process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

// Initialize database connections
connectToDatabases();

const exitHandler = async () => {
  // Stop workers first
  try {
    await shutdownWorkers();
  } catch (error) {
    logger.error('Error shutting down workers:', error);
  }

  if (server) {
    server.close(() => {
      logger.info('Server closed');
      closePostgresPool();
      process.exit(1);
    });
  } else {
    closePostgresPool();
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
  closePostgresPool();
});
