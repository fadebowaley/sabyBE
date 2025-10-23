// 📁 config/redis.js
const Redis = require('ioredis');
const config = require('./config');
const logger = require('./logger');

let redisClient;

const connectRedis = () => {
  try {
    // Create Redis client with explicit configuration
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db || 0,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        logger.warn(
          `🔁 Redis reconnect attempt #${times}, retrying in ${delay}ms`
        );
        return delay;
      },
      reconnectOnError(err) {
        logger.error('🔌 Redis reconnect on error:', err);
        return true;
      },
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      // Ensure consistent connection settings
      lazyConnect: false,
      // Add connection timeout
      connectTimeout: 10000,
      // Add command timeout
      commandTimeout: 5000,
    });

    redisClient.on('connect', () => logger.info('✅ Redis connected'));
    redisClient.on('ready', () => logger.info('⚙️  Redis ready for commands'));
    redisClient.on('error', (err) => {
      // Only log connection refused errors once to avoid spam
      if (err.code === 'ECONNREFUSED' && err.address === '127.0.0.1') {
        logger.warn(
          '⚠️ Redis connection refused to localhost - this may be a BullMQ internal connection issue'
        );
      } else {
        logger.error('❌ Redis error:', err);
      }
    });
    redisClient.on('end', () => logger.warn('📴 Redis connection closed'));
  } catch (err) {
    logger.error('🚫 Failed to initialize Redis:', err);
    throw err;
  }
};

const testRedisConnection = async () => {
  try {
    await redisClient.ping();
    logger.info('✅ Redis ping successful');
    return true;
  } catch (err) {
    logger.error('❌ Redis ping failed:', err);
    return false;
  }
};

const closeRedis = async () => {
  try {
    await redisClient.quit();
    logger.info('🚪 Redis client closed');
  } catch (err) {
    logger.error('⚠️ Error closing Redis:', err);
  }
};

// Export a function to get Redis connection options for BullMQ
const getRedisConnectionOptions = () => ({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db || 0,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: false, // Disable ready check for BullMQ
  lazyConnect: false,
  connectTimeout: 30000, // Increased from 10s to 30s
  // Remove commandTimeout to prevent timeout errors in workers
  // commandTimeout: 5000,
  // Add keepAlive to prevent connection drops
  keepAlive: 30000,
  // Disable offline queue to prevent memory buildup
  enableOfflineQueue: false,
});

module.exports = {
  redisClient,
  connectRedis,
  testRedisConnection,
  closeRedis,
  getRedisConnectionOptions,
};
