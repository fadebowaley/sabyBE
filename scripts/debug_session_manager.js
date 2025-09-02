const sessionManager = require('./src/ingestion/telegram/session');

async function debugSessionManager() {
  console.log('🔍 Debugging Session Manager\n');

  try {
    console.log('1️⃣ Testing session manager import...');
    console.log('   SessionManager type:', typeof sessionManager);
    console.log('   getOrCreate method:', typeof sessionManager.getOrCreate);

    console.log('\n2️⃣ Testing session creation...');
    const testChatId = 'test_chat_272806227';

    console.log('   Calling getOrCreate...');
    const session = await sessionManager.getOrCreate(testChatId);
    console.log('✅ Session created successfully');
    console.log('   Session ID:', session._id);
    console.log('   Chat ID:', session.chatId);
    console.log('   Status:', session.status);

    console.log('\n3️⃣ Testing session retrieval...');
    const retrievedSession = await sessionManager.get(testChatId);
    console.log('✅ Session retrieved successfully');
    console.log('   Retrieved session ID:', retrievedSession._id);

    console.log('\n4️⃣ Testing session update...');
    const updatedSession = await sessionManager.update(testChatId, {
      status: 'filling_form',
      currentStep: 1,
    });
    console.log('✅ Session updated successfully');
    console.log('   Updated status:', updatedSession.status);
    console.log('   Updated step:', updatedSession.currentStep);

    console.log('\n5️⃣ Cleaning up...');
    await sessionManager.delete(testChatId);
    console.log('✅ Test session cleaned up');

    console.log('\n🎉 Session manager test completed successfully!');
  } catch (error) {
    console.error('❌ Session manager test failed:', error.message);
    console.error('Full error:', error);
    console.error('Stack trace:', error.stack);

    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
    }

    if (error.name === 'MongoError') {
      console.error('MongoDB error code:', error.code);
    }
  }
}

// Run debug
debugSessionManager();
