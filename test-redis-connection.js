/**
 * Test Redis Connection
 */

const Redis = require('ioredis');
const config = require('./src/config/config');

async function testRedis() {
  console.log('\n🧪 Testing Redis Connection...\n');
  console.log('Configuration:');
  console.log(`  Host: ${config.redis.host}`);
  console.log(`  Port: ${config.redis.port}`);
  console.log(`  DB: ${config.redis.db}`);
  console.log(`  Password: ${config.redis.password ? '***set***' : 'none'}\n`);

  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db || 0,
    lazyConnect: true,
    retryStrategy: () => null, // Don't retry for this test
  });

  try {
    console.log('📡 Connecting to Redis...');
    await redis.connect();
    console.log('✅ Connected!\n');

    console.log('📡 Testing PING...');
    const pong = await redis.ping();
    console.log(`✅ PING response: ${pong}\n`);

    console.log('📡 Checking keys...');
    const keys = await redis.keys('bull:submissionQueue:*');
    console.log(`✅ Found ${keys.length} queue keys\n`);

    if (keys.length > 0) {
      console.log('Queue keys:');
      keys.forEach(key => console.log(`  - ${key}`));
    }

    console.log('\n🎉 Redis connection is HEALTHY!\n');
    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Redis connection FAILED:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    console.error(`\n💡 Possible causes:`);
    console.error(`   1. Redis server not running`);
    console.error(`   2. Wrong host/port configuration`);
    console.error(`   3. Network/firewall blocking connection`);
    console.error(`   4. Wrong password\n`);
    process.exit(1);
  }
}

testRedis();


