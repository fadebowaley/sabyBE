#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('./src/config/config');

/**
 * Telegram Bot Setup Script
 * Helps configure the bot token and test the setup
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupTelegramBot() {
  console.log('🤖 Telegram Bot Setup Script\n');

  try {
    // Check if .env file exists
    const envPath = path.join(__dirname, '.env');
    const envExists = fs.existsSync(envPath);

    if (!envExists) {
      console.log('❌ .env file not found. Please create one first.');
      console.log('   Copy .env.example to .env and configure your settings.');
      return;
    }

    // Check current token
    const currentToken = config.telegram.botToken;

    if (currentToken) {
      console.log('✅ Bot token is already configured');
      console.log(`   Token: ${currentToken.substring(0, 10)}...`);

      const updateToken = await question('\nDo you want to update the token? (y/N): ');
      if (updateToken.toLowerCase() !== 'y') {
        console.log('Keeping existing token.');
        await testBotToken(currentToken);
        return;
      }
    }

    // Get new token
    console.log('\n📱 To get your bot token:');
    console.log('1. Open Telegram and search for @BotFather');
    console.log('2. Send /newbot to create a new bot');
    console.log('3. Follow the instructions to create your bot');
    console.log('4. Copy the token provided by BotFather\n');

    const newToken = await question('Enter your bot token: ');

    if (!newToken || newToken.trim() === '') {
      console.log('❌ No token provided. Setup cancelled.');
      return;
    }

    // Validate token format
    if (!newToken.includes(':')) {
      console.log('❌ Invalid token format. Token should contain a colon (e.g., 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)');
      return;
    }

    // Update .env file
    await updateEnvFile(newToken);

    // Test the token
    await testBotToken(newToken);
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    rl.close();
  }
}

async function updateEnvFile(token) {
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  // Check if TELEGRAM_BOT_TOKEN already exists
  if (envContent.includes('TELEGRAM_BOT_TOKEN=')) {
    // Update existing token
    envContent = envContent.replace(/TELEGRAM_BOT_TOKEN=.*/, `TELEGRAM_BOT_TOKEN=${token}`);
  } else {
    // Add new token
    envContent += `\n# Telegram Bot Configuration\nTELEGRAM_BOT_TOKEN=${token}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log('✅ Bot token updated in .env file');
}

async function testBotToken(token) {
  console.log('\n🧪 Testing bot token...');

  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(token, { polling: false });

    // Test bot info
    const botInfo = await bot.getMe();
    console.log('✅ Bot token is valid!');
    console.log(`   Bot Name: ${botInfo.first_name}`);
    console.log(`   Bot Username: @${botInfo.username}`);
    console.log(`   Bot ID: ${botInfo.id}`);

    // Test webhook info
    try {
      const webhookInfo = await bot.getWebhookInfo();
      console.log(`   Webhook URL: ${webhookInfo.url || 'Not set'}`);
      console.log(`   Webhook Status: ${webhookInfo.ok ? 'Active' : 'Inactive'}`);
    } catch (webhookError) {
      console.log('   Webhook: Not configured (this is normal for development)');
    }

    console.log('\n🎉 Bot setup completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Start the bot: NODE_ENV=development node src/ingestion/telegram/bot.js');
    console.log('2. Open Telegram and find your bot: @' + botInfo.username);
    console.log('3. Send /start to begin testing');
    console.log('4. Follow the authentication and form filling flow');
  } catch (error) {
    console.log('❌ Bot token test failed:', error.message);
    console.log('   Please check your token and try again.');
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupTelegramBot().catch((error) => {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  setupTelegramBot,
  updateEnvFile,
  testBotToken,
};
