#!/usr/bin/env node

const { runTelegramBotTests } = require('./test_telegram_bot_full_flow');

console.log('🤖 Starting Telegram Bot Full Flow Tests...');
console.log('==========================================\n');

runTelegramBotTests()
  .then(() => {
    console.log('\n🎉 All tests completed successfully!');
  })
  .catch((error) => {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  });
