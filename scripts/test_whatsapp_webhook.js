#!/usr/bin/env node

/**
 * WhatsApp Webhook Test Script
 *
 * This script tests your WhatsApp webhook endpoint to ensure it's working correctly.
 *
 * Usage:
 *   node scripts/test_whatsapp_webhook.js
 *   node scripts/test_whatsapp_webhook.js --url https://stg.saby.ai/webhook --token YOUR_VERIFY_TOKEN
 */

const axios = require('axios');
const crypto = require('crypto');
const readline = require('readline');

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

/**
 * Test webhook verification (GET request)
 */
async function testWebhookVerification(webhookUrl, verifyToken) {
  logHeader('Test 1: Webhook Verification (GET)');

  const challenge = crypto.randomBytes(32).toString('hex');
  const params = {
    'hub.mode': 'subscribe',
    'hub.verify_token': verifyToken,
    'hub.challenge': challenge,
  };

  logInfo(`Testing: ${webhookUrl}`);
  logInfo(`Parameters:`);
  log(`  hub.mode: ${params['hub.mode']}`);
  log(`  hub.verify_token: ${params['hub.verify_token']}`);
  log(`  hub.challenge: ${challenge.substring(0, 20)}...`);
  log('');

  try {
    const response = await axios.get(webhookUrl, {
      params,
      timeout: 10000,
      validateStatus: (status) => status < 500, // Don't throw on 403
    });

    logInfo(`Response Status: ${response.status}`);
    logInfo(`Response Headers:`, JSON.stringify(response.headers, null, 2));
    logInfo(`Response Body: ${response.data}`);

    if (response.status === 200 && response.data === challenge) {
      logSuccess('Webhook verification PASSED!');
      logSuccess('Meta will be able to verify your webhook.');
      return true;
    } else if (response.status === 403) {
      logError('Webhook verification FAILED!');
      logError('The verify token does not match.');
      logWarning(
        'Check that VERIFY_TOKEN in your .env matches the token in Meta.'
      );
      return false;
    } else {
      logWarning(`Unexpected response: ${response.status}`);
      logWarning(`Expected: 200 with challenge "${challenge}"`);
      logWarning(`Got: ${response.status} with "${response.data}"`);
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logError('Connection refused!');
      logError('The webhook endpoint is not accessible.');
      logWarning('Check that:');
      logWarning('  1. Your server is running');
      logWarning('  2. The URL is correct');
      logWarning('  3. The server is publicly accessible');
    } else if (error.code === 'ENOTFOUND') {
      logError('Domain not found!');
      logError(`Could not resolve: ${new URL(webhookUrl).hostname}`);
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      logError('Request timeout!');
      logError('The server took too long to respond.');
    } else {
      logError(`Error: ${error.message}`);
      if (error.response) {
        logError(`Status: ${error.response.status}`);
        logError(`Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    return false;
  }
}

/**
 * Test webhook message reception (POST request)
 */
async function testWebhookMessage(webhookUrl) {
  logHeader('Test 2: Webhook Message Reception (POST)');

  // Sample webhook payload (similar to what Meta sends)
  const samplePayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: 'PHONE_NUMBER_ID',
              },
              contacts: [
                {
                  profile: {
                    name: 'Test User',
                  },
                  wa_id: '1234567890',
                },
              ],
              messages: [
                {
                  from: '1234567890',
                  id: 'wamid.test123',
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: {
                    body: 'Test message from webhook test script',
                  },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  logInfo(`Testing: ${webhookUrl}`);
  logInfo(`Sending sample webhook payload...`);
  log('');

  try {
    const response = await axios.post(webhookUrl, samplePayload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
      validateStatus: (status) => status < 500,
    });

    logInfo(`Response Status: ${response.status}`);
    logInfo(`Response Body: ${response.data}`);

    if (response.status === 200) {
      logSuccess('Webhook message reception PASSED!');
      logSuccess('Your server accepted the webhook message.');
      logInfo('Check your server logs to see if the message was processed.');
      return true;
    } else {
      logWarning(`Unexpected status: ${response.status}`);
      logWarning(`Expected: 200`);
      logWarning(`Got: ${response.status}`);
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logError('Connection refused!');
      logError('The webhook endpoint is not accessible.');
    } else if (error.code === 'ENOTFOUND') {
      logError('Domain not found!');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      logError('Request timeout!');
    } else {
      logError(`Error: ${error.message}`);
      if (error.response) {
        logError(`Status: ${error.response.status}`);
        logError(`Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    return false;
  }
}

/**
 * Test endpoint accessibility
 */
async function testEndpointAccessibility(webhookUrl) {
  logHeader('Test 0: Endpoint Accessibility');

  logInfo(`Checking if endpoint is accessible: ${webhookUrl}`);
  log('');

  try {
    const response = await axios.get(webhookUrl, {
      timeout: 5000,
      validateStatus: () => true, // Accept any status
    });

    logInfo(`Endpoint is accessible!`);
    logInfo(`Status: ${response.status}`);
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logError('Connection refused!');
      logError('The endpoint is not accessible.');
    } else if (error.code === 'ENOTFOUND') {
      logError('Domain not found!');
      logError(`Could not resolve: ${new URL(webhookUrl).hostname}`);
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      logError('Request timeout!');
    } else {
      logError(`Error: ${error.message}`);
    }
    return false;
  }
}

/**
 * Main test function
 */
async function main() {
  logHeader('WhatsApp Webhook Test Suite');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let webhookUrl = 'https://stg.saby.ai/webhook';
  let verifyToken = '';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      webhookUrl = args[i + 1];
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      verifyToken = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      log('Usage: node scripts/test_whatsapp_webhook.js [options]');
      log('');
      log('Options:');
      log(
        '  --url <url>     Webhook URL (default: https://stg.saby.ai/webhook)'
      );
      log('  --token <token> Verify token from your .env file');
      log('  --help, -h      Show this help message');
      log('');
      process.exit(0);
    }
  }

  logInfo(`Webhook URL: ${webhookUrl}`);
  log('');

  // Get verify token if not provided
  if (!verifyToken) {
    logInfo('To test webhook verification, we need your VERIFY_TOKEN.');
    verifyToken = await question(
      'Enter your VERIFY_TOKEN (or press Enter to skip verification test): '
    );
  }

  // Test 0: Check accessibility
  const isAccessible = await testEndpointAccessibility(webhookUrl);
  if (!isAccessible) {
    logError(
      '\n❌ Endpoint is not accessible. Please check your server configuration.'
    );
    rl.close();
    process.exit(1);
  }

  log('');

  // Test 1: Webhook verification
  let verificationPassed = false;
  if (verifyToken && verifyToken.trim() !== '') {
    verificationPassed = await testWebhookVerification(
      webhookUrl,
      verifyToken.trim()
    );
  } else {
    logWarning('Skipping verification test (no token provided)');
  }

  log('');

  // Test 2: Message reception
  const messagePassed = await testWebhookMessage(webhookUrl);

  log('');
  logHeader('Test Summary');

  if (verifyToken && verifyToken.trim() !== '') {
    log(
      verificationPassed
        ? '✅ Verification: PASSED'
        : '❌ Verification: FAILED',
      verificationPassed ? colors.green : colors.red
    );
  }
  log(
    messagePassed
      ? '✅ Message Reception: PASSED'
      : '❌ Message Reception: FAILED',
    messagePassed ? colors.green : colors.red
  );

  log('');

  if (verificationPassed && messagePassed) {
    logSuccess('🎉 All tests passed! Your webhook is ready for Meta.');
    logInfo('Next steps:');
    logInfo('  1. Go to Meta → WhatsApp → Configuration');
    logInfo('  2. Set webhook URL: ' + webhookUrl);
    logInfo('  3. Set verify token: ' + verifyToken);
    logInfo('  4. Click "Verify and save"');
    logInfo('  5. Subscribe to webhook fields: messages, message_status');
  } else {
    logWarning(
      '⚠️  Some tests failed. Please fix the issues before configuring in Meta.'
    );
  }

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
  logError(`Test failed: ${error.message}`);
  rl.close();
  process.exit(1);
});
