const mongoose = require('mongoose');
const config = require('./src/config/config');
const TelegramSession = require('./src/models/telegramSession.model');
const logger = require('./src/config/logger');

async function debugSession() {
  console.log('🔍 Debugging Session Management\n');

  try {
    // Test database connection
    console.log('1️⃣ Testing database connection...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Database connected successfully');

    // Test TelegramSession model
    console.log('\n2️⃣ Testing TelegramSession model...');
    const testChatId = 'test_chat_123';

    // Try to create a session
    console.log('   Creating test session...');
    const session = new TelegramSession({
      chatId: testChatId,
      status: 'authenticating',
      metadata: {
        sessionStartTime: new Date(),
        lastActivity: new Date(),
      },
      userId: null,
      tenantId: null,
      projectId: null,
      formId: null,
    });

    await session.save();
    console.log('✅ Test session created successfully');

    // Try to find the session
    console.log('   Finding test session...');
    const foundSession = await TelegramSession.findByChatId(testChatId);
    console.log('✅ Test session found:', foundSession ? 'Yes' : 'No');

    // Clean up
    await TelegramSession.deleteOne({ chatId: testChatId });
    console.log('✅ Test session cleaned up');

    console.log('\n🎉 Session management test completed successfully!');
  } catch (error) {
    console.error('❌ Session management test failed:', error.message);
    console.error('Full error:', error);

    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
    }

    if (error.name === 'MongoError') {
      console.error('MongoDB error code:', error.code);
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

// Run debug
debugSession();
