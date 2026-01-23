require('dotenv').config();
const axios = require('axios');

// Sendar.io SMS API Configuration
const API_KEY =
  process.env.SENDAR_API_KEY || '4ccd91fa-387c-4f19-bd53-b84206d76348';
const DEFAULT_SENDER_ID = process.env.SENDAR_SENDER_ID || 'LTHOUSE';
const API_BASE_URL = 'https://sendar.io/api';
const SEND_ENDPOINT = `${API_BASE_URL}/sms/send`;
const STATUS_ENDPOINT = `${API_BASE_URL}/get/sms`;

/**
 * Send SMS using POST method
 * @param {string|string[]} contacts - Phone number(s) to send SMS to (without + prefix)
 * @param {string} message - Message content
 * @param {Object} options - Additional options
 * @param {string} options.walletType - "promotional" or "transactional" (default: "promotional")
 * @param {string} options.senderId - Approved sender ID (required)
 * @param {string} options.scheduleAt - Optional schedule time in format "YYYY-MM-DD HH:mm:ss"
 * @returns {Promise<Object>} Response from API
 */
async function sendSMS(contacts, message, options = {}) {
  try {
    const {
      walletType = 'promotional',
      senderId = null, // Will use DEFAULT_SENDER_ID or try without sender_id
      scheduleAt = null,
    } = options;

    // Ensure contacts is an array
    const contactsArray = Array.isArray(contacts) ? contacts : [contacts];

    // Build contact array according to API spec
    const contactData = contactsArray.map((contact) => {
      // Remove + prefix if present, convert to number
      const number = String(contact).replace(/^\+/, '');
      const contactObj = {
        number: parseInt(number, 10),
        body: message,
      };

      // Add schedule_at if provided
      if (scheduleAt) {
        contactObj.schedule_at = scheduleAt;
      }

      return contactObj;
    });

    // Build post data - try with sender_id if provided, otherwise use default or omit
    const postData = {
      wallet_type: walletType,
      contact: contactData,
    };

    // Only include sender_id if provided (null means omit it to use account default)
    if (senderId !== null && senderId !== undefined && senderId !== '') {
      postData.sender_id = senderId;
    }

    const response = await axios.post(SEND_ENDPOINT, postData, {
      headers: {
        'Api-key': API_KEY, // Note: Api-key with hyphen, as per API spec
        'Content-Type': 'application/json',
      },
    });

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error('Error sending SMS:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

/**
 * Get SMS status
 * @param {string|number} uid - SMS UID/ID from send response
 * @returns {Promise<Object>} Status information
 */
async function getSMSStatus(uid) {
  try {
    const response = await axios.get(`${STATUS_ENDPOINT}/${uid}`, {
      headers: {
        'Api-key': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error(
      'Error getting SMS status:',
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Main execution
async function main() {
  console.log('=== Sendar.io SMS Test Script ===\n');
  console.log(
    `Using API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(
      API_KEY.length - 4
    )}\n`
  );

  // Get parameters from command line
  // Usage: node send-sms.js <phone_number> <message> [wallet_type] [sender_id] [schedule_at]
  // Example: node send-sms.js 2347031111111 "Hello test" promotional test
  const phoneNumber = process.argv[2];
  const message = process.argv[3];
  const walletType = process.argv[4] || 'promotional';
  // Allow explicitly passing 'none' or empty string to omit sender_id
  const senderIdArg = process.argv[5];
  const senderId =
    senderIdArg === 'none' || senderIdArg === ''
      ? null
      : senderIdArg || DEFAULT_SENDER_ID;
  const scheduleAt = process.argv[6] || null;

  if (!phoneNumber || !message) {
    console.log(
      'Usage: node send-sms.js <phone_number> <message> [wallet_type] [sender_id] [schedule_at]'
    );
    console.log('\nExamples:');
    console.log('  node send-sms.js 2347031111111 "Hello from Saby Backend"');
    console.log('  node send-sms.js 2347031111111 "Hello" promotional LTHOUSE');
    console.log(
      '  node send-sms.js 2347031111111 "Hello" promotional LTHOUSE "2024-07-10 14:39:00"'
    );
    console.log(
      '\nNote: Phone numbers should be without + prefix (e.g., 2347031111111)'
    );
    process.exit(1);
  }

  console.log(`Phone Number: ${phoneNumber}`);
  console.log(`Message: ${message}`);
  console.log(`Wallet Type: ${walletType}`);
  console.log(`Sender ID: ${senderId}`);
  if (scheduleAt) {
    console.log(`Schedule At: ${scheduleAt}`);
  }
  console.log('');

  const options = {
    walletType,
    senderId,
    ...(scheduleAt && { scheduleAt }),
  };

  console.log('Sending SMS...');
  const result = await sendSMS(phoneNumber, message, options);

  if (result.success) {
    console.log('\n✅ SMS sent successfully!');
    console.log('\nResponse:', JSON.stringify(result.data, null, 2));

    // If response contains data array with IDs, we can check status
    if (
      result.data?.data &&
      Array.isArray(result.data.data) &&
      result.data.data.length > 0
    ) {
      const firstMessage = result.data.data[0];
      if (firstMessage.id) {
        console.log(`\nSMS ID: ${firstMessage.id}`);
        console.log(`Status: ${firstMessage.status}`);
        console.log('\nChecking detailed status...');

        // Wait a moment before checking status
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusResult = await getSMSStatus(firstMessage.id);
        if (statusResult.success) {
          console.log(
            'Detailed Status:',
            JSON.stringify(statusResult.data, null, 2)
          );
        } else {
          console.log(
            'Could not retrieve detailed status:',
            statusResult.error
          );
        }
      }
    }
  } else {
    console.log('\n❌ Failed to send SMS');
    console.log('Error:', JSON.stringify(result.error, null, 2));
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n=== Script completed ===');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { sendSMS, getSMSStatus };
