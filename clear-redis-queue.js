/**
 * Clear Redis Queue - Remove all stale/failed jobs
 */

const Redis = require('ioredis');
const config = require('./src/config/config');

async function clearQueue() {
  console.log('\n🧹 Clearing Redis Queue...\n');

  // Create direct Redis connection
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db || 0,
  });

  try {
    // Wait for connection
    await redis.ping();
    console.log('✅ Connected to Redis\n');

    // Get all keys related to submissionQueue
    const keys = await redis.keys('bull:submissionQueue:*');
    console.log(`📊 Found ${keys.length} keys for submissionQueue`);

    if (keys.length > 0) {
      // Delete all keys
      await redis.del(...keys);
      console.log(`✅ Cleared ${keys.length} keys`);
    } else {
      console.log('ℹ️  No keys to clear');
    }

    console.log('\n🎉 Queue cleared successfully!\n');
    console.log('Next steps:');
    console.log('1. Start worker: node src/workers/submission.worker.js &');
    console.log('2. Run test: node test-perm-unified-submission.js\n');

    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to clear queue:', error.message);
    console.error(error.stack);
    await redis.quit();
    process.exit(1);
  }
}

clearQueue();
