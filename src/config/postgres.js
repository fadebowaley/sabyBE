const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

// Create a PostgreSQL connection pool
const postgresPool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test the connection
const testConnection = async () => {
  try {
    const client = await postgresPool.connect();
    logger.info('✅ PostgreSQL connected successfully');
    logger.info(`📊 PostgreSQL Connection String: ${config.postgres.connectionString}`);
    logger.info(`🗄️  Database: ${config.postgres.database}`);
    client.release();
    return true;
  } catch (error) {
    logger.error('❌ PostgreSQL connection failed:', error.message);
    return false;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await postgresPool.end();
    logger.info('PostgreSQL pool closed');
  } catch (error) {
    logger.error('Error closing PostgreSQL pool:', error);
  }
};

// Handle pool errors
postgresPool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  postgresPool,
  testConnection,
  closePool,
};
