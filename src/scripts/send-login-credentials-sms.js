#!/usr/bin/env node
const axios = require('axios');
const logger = require('../config/logger');

// BulkSMS Nigeria API Configuration
const API_TOKEN =
  'f0gseuBtPU1gwSanvolb3gxIIyaJIeJeI81ucwliNO8Pqa3JM9YPDRtqPS4r';
const API_URL = 'https://www.bulksmsnigeria.com/api/v2/sms';
const DEFAULT_SENDER_ID = 'Saby';

/**
 * Format phone number to international format (e.g., 08107771205 -> 2348107771205)
 * @param {string} phoneNumber - Phone number in local or international format
 * @returns {string} - Phone number in international format
 */
const formatPhoneNumber = (phoneNumber) => {
  const cleaned = phoneNumber.replace(/\D/g, ''); // Remove all non-digits

  // If starts with 0, replace with 234
  if (cleaned.startsWith('0')) {
    return '234' + cleaned.substring(1);
  }

  // If doesn't start with 234, add it
  if (!cleaned.startsWith('234')) {
    return '234' + cleaned;
  }

  return cleaned;
};

/**
 * Format multiple phone numbers (comma-separated string or array)
 * @param {string|string[]} phoneNumbers - Phone number(s) to format
 * @returns {string} - Comma-separated formatted phone numbers
 */
const formatPhoneNumbers = (phoneNumbers) => {
  if (Array.isArray(phoneNumbers)) {
    return phoneNumbers.map(formatPhoneNumber).join(',');
  }

  // Handle comma-separated string
  if (typeof phoneNumbers === 'string' && phoneNumbers.includes(',')) {
    return phoneNumbers
      .split(',')
      .map((num) => formatPhoneNumber(num.trim()))
      .join(',');
  }

  return formatPhoneNumber(phoneNumbers);
};

/**
 * Create login credentials message template
 * @param {Object} credentials - User credentials
 * @param {string} credentials.username - Username
 * @param {string} credentials.password - Password
 * @param {string} credentials.loginUrl - Login URL
 * @returns {string} - Formatted message
 */
const createLoginCredentialsMessage = ({ username, password, loginUrl }) => {
  return `Welcome to Saby!

Your details:
Email: ${username}
default_access: ${password}

Access: ${loginUrl}

Keep this information private.

Thank you!`;
};

/**
 * Send SMS using BulkSMS Nigeria API
 * @param {string|string[]} phoneNumbers - Phone number(s) to send SMS to
 * @param {string} message - Message text
 * @param {string} senderId - Sender ID (default: 'Saby')
 * @returns {Promise<Object>} - API response
 */
const sendSms = async (phoneNumbers, message, senderId = DEFAULT_SENDER_ID) => {
  const formattedPhoneNumbers = formatPhoneNumbers(phoneNumbers);

  const data = {
    from: senderId,
    to: formattedPhoneNumbers,
    body: message,
  };

  logger.info('Sending SMS via BulkSMS Nigeria API', {
    to: formattedPhoneNumbers,
    from: senderId,
    messageLength: message.length,
  });

  try {
    const response = await axios.post(API_URL, data, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000, // 30 seconds timeout
      family: 4, // Force IPv4
    });

    logger.info('SMS sent successfully', { result: response.data });
    return response.data;
  } catch (error) {
    const errorDetails = {
      error: error.message,
      phoneNumbers: formattedPhoneNumbers,
      response: error.response?.data,
      status: error.response?.status,
    };
    logger.error('Error sending SMS', errorDetails);
    console.error('Full error details:', JSON.stringify(errorDetails, null, 2));
    if (error.response) {
      console.error('API Response:', error.response.data);
      console.error('Status Code:', error.response.status);
    }
    throw error;
  }
};

/**
 * Send login credentials SMS to user(s)
 * @param {string|string[]} phoneNumbers - Phone number(s) to send to
 * @param {Object} credentials - User credentials
 * @param {string} credentials.username - Username
 * @param {string} credentials.password - Password
 * @param {string} credentials.loginUrl - Login URL
 * @param {string} senderId - Optional sender ID
 * @returns {Promise<Object>} - API response
 */
const sendLoginCredentialsSms = async (
  phoneNumbers,
  credentials,
  senderId = DEFAULT_SENDER_ID
) => {
  const message = createLoginCredentialsMessage(credentials);
  return sendSms(phoneNumbers, message, senderId);
};

/**
 * Main function to test the SMS sending
 */
async function main() {
  try {
    // Test data
    const testPhoneNumber = '+2348145045108, +2347069646671';
    const testCredentials = {
      username: 'testuser',
      password: 'TempPass123!',
      loginUrl: 'https://saby.ai/login',
    };

    // Show sample message before sending
    const sampleMessage = createLoginCredentialsMessage(testCredentials);
    console.log('\n📝 Sample Message Preview:');
    console.log('─'.repeat(50));
    console.log(sampleMessage);
    console.log('─'.repeat(50));
    console.log(`Message length: ${sampleMessage.length} characters\n`);

    logger.info('🚀 Starting SMS test...');
    logger.info('Test phone numbers:', testPhoneNumber);
    logger.info('Test credentials:', {
      username: testCredentials.username,
      password: '***',
      loginUrl: testCredentials.loginUrl,
    });

    // Send SMS
    const result = await sendLoginCredentialsSms(
      testPhoneNumber,
      testCredentials
    );

    logger.info('✅ SMS sent successfully!');
    console.log('\n📱 SMS API Response:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n');

    return result;
  } catch (error) {
    logger.error('❌ Failed to send SMS:', error.message);
    console.error('Full error:', error);
    if (error.response) {
      console.error('API Response:', error.response.data);
      console.error('Status Code:', error.response.status);
    }
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  main()
    .then(() => {
      logger.info('🎉 SMS script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 SMS script failed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  sendSms,
  sendLoginCredentialsSms,
  createLoginCredentialsMessage,
  formatPhoneNumber,
  formatPhoneNumbers,
};
