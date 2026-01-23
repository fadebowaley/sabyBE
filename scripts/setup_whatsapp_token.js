#!/usr/bin/env node

/**
 * WhatsApp Business API Token Setup Script
 * 
 * This script helps you set up your WhatsApp Business API tokens
 * by guiding you through the process and updating your .env file.
 * 
 * Usage: node scripts/setup_whatsapp_token.js
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logHeader(message) {
  log('\n' + '='.repeat(60), colors.cyan);
  log(message, colors.bright + colors.cyan);
  log('='.repeat(60) + '\n', colors.cyan);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function generateVerifyToken() {
  return crypto.randomBytes(32).toString('hex');
}

function readEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    return fs.readFileSync(envPath, 'utf8');
  }
  return '';
}

function updateEnvFile(updates) {
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = readEnvFile();
  
  // Update or add each variable
  Object.entries(updates).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      // Update existing
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // Add new
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `\n# WhatsApp Business API Configuration\n${key}=${value}\n`;
    }
  });
  
  fs.writeFileSync(envPath, envContent);
  logSuccess(`Updated .env file at ${envPath}`);
}

async function main() {
  logHeader('WhatsApp Business API Token Setup');
  
  logInfo('This script will help you configure your WhatsApp Business API tokens.');
  logInfo('You will need:');
  log('  1. Access to Meta for Developers (https://developers.facebook.com/)');
  log('  2. A WhatsApp Business Account');
  log('  3. Your Phone Number ID from Meta');
  log('  4. Your Access Token from Meta');
  log('');
  
  const proceed = await question('Do you want to continue? (y/n): ');
  if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
    logInfo('Setup cancelled.');
    rl.close();
    return;
  }
  
  logHeader('Step 1: Phone Number ID');
  logInfo('To find your Phone Number ID:');
  log('  1. Go to https://developers.facebook.com/');
  log('  2. Select your app');
  log('  3. Go to WhatsApp → API Setup');
  log('  4. Copy the "Phone number ID" (it\'s a long numeric string)');
  log('');
  
  const phoneNumberId = await question('Enter your Phone Number ID: ');
  if (!phoneNumberId || phoneNumberId.trim() === '') {
    logError('Phone Number ID is required!');
    rl.close();
    return;
  }
  
  logHeader('Step 2: Access Token');
  logInfo('To get your Access Token:');
  log('  1. In WhatsApp → API Setup, click "Generate access token"');
  log('  2. Select your WhatsApp Business Account');
  log('  3. Copy the generated token');
  log('');
  logWarning('Note: Temporary tokens expire in 24 hours.');
  logWarning('For production, use a System User token (see docs/WHATSAPP_SETUP.md)');
  log('');
  
  const accessToken = await question('Enter your Access Token: ');
  if (!accessToken || accessToken.trim() === '') {
    logError('Access Token is required!');
    rl.close();
    return;
  }
  
  logHeader('Step 3: Verify Token');
  logInfo('The Verify Token is used to verify your webhook with Meta.');
  logInfo('You can generate a secure random token or create your own.');
  log('');
  
  const generateToken = await question('Generate a random verify token? (y/n): ');
  let verifyToken;
  
  if (generateToken.toLowerCase() === 'y' || generateToken.toLowerCase() === 'yes') {
    verifyToken = generateVerifyToken();
    logSuccess(`Generated Verify Token: ${verifyToken}`);
  } else {
    verifyToken = await question('Enter your Verify Token (min 32 characters recommended): ');
    if (!verifyToken || verifyToken.trim() === '') {
      logError('Verify Token is required!');
      rl.close();
      return;
    }
    if (verifyToken.length < 16) {
      logWarning('Verify Token is short. Consider using a longer token for security.');
    }
  }
  
  logHeader('Step 4: Webhook Configuration');
  logInfo('Next, you need to configure your webhook in Meta:');
  log('');
  log('  1. Go to WhatsApp → Configuration');
  log('  2. Under "Webhook", click "Edit"');
  log('  3. Enter your webhook URL:');
  log('     Production: https://your-domain.com/webhook');
  log('     Staging: https://your-staging-domain.com/webhook');
  log(`  4. Enter this Verify Token: ${verifyToken}`);
  log('  5. Click "Verify and save"');
  log('');
  logInfo('Also subscribe to these webhook fields:');
  log('  - messages');
  log('  - message_status');
  log('  - message_template_status_update');
  log('');
  
  await question('Press Enter when you have configured the webhook in Meta...');
  
  logHeader('Step 5: Update Environment Variables');
  
  const updates = {
    PHONE_NUMBER_ID: phoneNumberId.trim(),
    WHATSAPP_TOKEN: accessToken.trim(),
    VERIFY_TOKEN: verifyToken.trim(),
  };
  
  logInfo('Updating .env file with the following values:');
  log(`  PHONE_NUMBER_ID=${updates.PHONE_NUMBER_ID}`);
  log(`  WHATSAPP_TOKEN=${updates.WHATSAPP_TOKEN.substring(0, 20)}...`);
  log(`  VERIFY_TOKEN=${updates.VERIFY_TOKEN.substring(0, 20)}...`);
  log('');
  
  const confirm = await question('Update .env file? (y/n): ');
  if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
    try {
      updateEnvFile(updates);
      logSuccess('Environment variables updated successfully!');
    } catch (error) {
      logError(`Failed to update .env file: ${error.message}`);
      logInfo('Please manually update your .env file with:');
      Object.entries(updates).forEach(([key, value]) => {
        log(`  ${key}=${value}`);
      });
    }
  } else {
    logInfo('Skipping .env update. Please manually add:');
    Object.entries(updates).forEach(([key, value]) => {
      log(`  ${key}=${value}`);
    });
  }
  
  logHeader('Step 6: Testing');
  logInfo('To test your setup:');
  log('  1. Restart your WhatsApp bot server');
  log('  2. Check the logs for connection confirmation');
  log('  3. Send a test message to your WhatsApp Business number');
  log('');
  logInfo('Expected log output:');
  log('  ✅ WhatsApp Business API connected for phone number: +XXX XXX XXX XXXX');
  log('  ✅ WhatsApp Business API connection verified');
  log('');
  
  logHeader('Setup Complete!');
  logSuccess('Your WhatsApp Business API tokens have been configured.');
  log('');
  logInfo('Next steps:');
  log('  1. Restart your WhatsApp bot server');
  log('  2. Verify webhook is working by sending a test message');
  log('  3. Check server logs for any errors');
  log('');
  logWarning('Remember:');
  log('  - Temporary tokens expire in 24 hours');
  log('  - For production, use System User tokens (see docs/WHATSAPP_SETUP.md)');
  log('  - Never commit tokens to version control');
  log('');
  
  rl.close();
}

// Handle errors
process.on('unhandledRejection', (error) => {
  logError(`Unexpected error: ${error.message}`);
  rl.close();
  process.exit(1);
});

// Run the script
main().catch((error) => {
  logError(`Setup failed: ${error.message}`);
  rl.close();
  process.exit(1);
});

