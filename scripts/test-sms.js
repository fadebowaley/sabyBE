// Load environment variables (try multiple possible locations)
const path = require('path');
const dotenv = require('dotenv');

// Try loading from different possible .env locations
const envPaths = [
  path.join(__dirname, '../../.env'), // Workspace root
  path.join(__dirname, '../.env'), // Backend root
  path.join(__dirname, '../../sabyBackend/.env'), // Alternative
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`Loaded .env from: ${envPath}`);
    break;
  }
}

// Also try loading from process.env directly
dotenv.config();

const { sendSms } = require('../src/services/sms.service');
const logger = require('../src/config/logger');

/**
 * Test script to send SMS to 08145045108
 */
async function testSms() {
  try {
    const config = require('../src/config/config');

    // Log configuration (masking sensitive data)
    console.log('SMS Configuration:');
    console.log(
      '  Base URL:',
      config.sms.sms_base_url
        ? `${config.sms.sms_base_url.substring(0, 20)}...`
        : 'NOT SET'
    );
    console.log(
      '  API Key:',
      config.sms.sms_api_key
        ? `${config.sms.sms_api_key.substring(0, 10)}...`
        : 'NOT SET'
    );
    console.log(
      '  Has Config:',
      config.sms.sms_api_key && config.sms.sms_base_url
    );
    console.log('');

    if (!config.sms.sms_api_key || !config.sms.sms_base_url) {
      console.error('❌ SMS configuration is missing!');
      console.error(
        'Please ensure SMS_API_KEY and SMS_BASE_URL are set in your .env file'
      );
      process.exit(1);
    }

    const phoneNumber = '08145045108';
    const message = 'Your saby verification Pin is: 123456. It expires in 30 minutes.';

    console.log(`Sending test SMS to ${phoneNumber}...`);
    console.log(`Message: ${message}`);
    console.log('');

    const result = await sendSms(phoneNumber, message);

    console.log('✅ SMS sent successfully!');
    console.log('Response:', JSON.stringify(result, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error sending SMS:', error.message);
    if (error.response) {
      console.error(
        'Response data:',
        JSON.stringify(error.response.data, null, 2)
      );
      console.error('Response status:', error.response.status);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testSms();
