// Load environment variables
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

const axios = require('axios');

/**
 * Test script to send OTP via auth/resend-otp endpoint
 * Usage: node scripts/test-auth-otp-sms.js <email> [baseUrl]
 */
async function testAuthOtpSms() {
  const [, , email, baseUrlArg] = process.argv;

  if (!email) {
    console.error(
      '❌ Usage: node scripts/test-auth-otp-sms.js <email> [baseUrl]'
    );
    console.error('');
    console.error('Example:');
    console.error('  node scripts/test-auth-otp-sms.js user@example.com');
    console.error(
      '  node scripts/test-auth-otp-sms.js user@example.com http://localhost:4000'
    );
    process.exit(1);
  }

  const baseUrl =
    baseUrlArg || process.env.HALOFE_URL || 'http://localhost:4000';
  const apiUrl = `${baseUrl}/v1/auth/resend-otp`;

  console.log('📧 Testing OTP SMS via Auth Route');
  console.log('================================');
  console.log(`Email: ${email}`);
  console.log(`API URL: ${apiUrl}`);
  console.log('');

  try {
    console.log('Sending request...');
    const response = await axios.post(
      apiUrl,
      { email },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ OTP resent successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('');
    console.log("📱 Check the user's phone number for SMS");
    console.log("📧 Check the user's email for OTP email");
    console.log('');
    console.log('Note: SMS will only be sent if:');
    console.log('  1. SMS_API_KEY and SMS_BASE_URL are configured');
    console.log('  2. User has a phoneNumber field set');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error sending OTP request:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error(
        'Response data:',
        JSON.stringify(error.response.data, null, 2)
      );
    } else if (error.request) {
      console.error('No response received. Is the server running?');
      console.error('Request URL:', apiUrl);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testAuthOtpSms();
