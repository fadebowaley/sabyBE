const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

// Determine the correct host - if running locally (not in Docker), use localhost
// Docker service name 'postgres' only works inside Docker network
const isRunningInDocker = process.env.DOCKER_ENV === 'true' || process.env.POSTGRES_HOST === 'postgres';
const postgresHost = config.postgres.host === 'postgres' && !isRunningInDocker 
  ? 'localhost' 
  : config.postgres.host;

// Create a PostgreSQL connection pool
const postgresPool = new Pool({
  host: postgresHost,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 30000, // Increased to 30 seconds for better reliability
  ssl: false, // Try without SSL first
});

// Test the connection with better error reporting
const testConnection = async () => {
  try {
    logger.info('🔄 Testing PostgreSQL connection...');
    logger.info(`📊 Host: ${postgresHost}:${config.postgres.port} (resolved from ${config.postgres.host})`);
    logger.info(`👤 User: ${config.postgres.user}`);
    logger.info(`🗄️  Database: ${config.postgres.database}`);

    const client = await postgresPool.connect();
    logger.info('✅ PostgreSQL connected successfully');

    // Test a simple query
    const result = await client.query('SELECT version()');
    logger.info(`📋 PostgreSQL Version: ${result.rows[0].version}`);

    client.release();
    return true;
  } catch (error) {
    logger.error('❌ PostgreSQL connection failed:');
    logger.error(`   Error Code: ${error.code}`);
    logger.error(`   Error Message: ${error.message}`);

    // Provide specific guidance based on error
    if (error.code === '28000') {
      logger.error('   📋 Authentication failed - check pg_hba.conf');
      logger.error('   💡 This could be due to:');
      logger.error('      - IP address not allowed in pg_hba.conf');
      logger.error('      - Wrong authentication method');
      logger.error('      - SSL requirements mismatch');
    }

    logger.error(
      `   Connection String: postgresql://${config.postgres.user}:***@${postgresHost}:${config.postgres.port}/${config.postgres.database}`
    );
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
