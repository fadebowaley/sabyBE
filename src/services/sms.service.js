const axios = require('axios');
const config = require('../config/config');
const logger = require('../config/logger');

// Constants
const DEFAULT_SENDER_ID = 'N-Alert';
const DEFAULT_CHANNEL = 'dnd';
const DEFAULT_TYPE = 'plain';
const NIGERIA_COUNTRY_CODE = '234';
const OTP_MESSAGE_TEMPLATE =
  'Your Saby verification Pin is: {otp}. It expires in 30 minutes.';

// Configuration check
const hasSmsConfig = config.sms.sms_api_key && config.sms.sms_base_url;

/**
 * Format phone number to international format (e.g., 08145045108 -> 2348145045108)
 * @param {string} phoneNumber - Phone number in local or international format
 * @returns {string} - Phone number in international format
 */
const formatPhoneNumber = (phoneNumber) => {
  const cleaned = phoneNumber.replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    return NIGERIA_COUNTRY_CODE + cleaned.substring(1);
  }
  if (!cleaned.startsWith(NIGERIA_COUNTRY_CODE)) {
    return NIGERIA_COUNTRY_CODE + cleaned;
  }
  return cleaned;
};

/**
 * Format phone numbers (single or array)
 * @param {string|string[]} phoneNumber - Phone number(s) to format
 * @returns {string|string[]} - Formatted phone number(s)
 */
const formatPhoneNumbers = (phoneNumber) => {
  if (Array.isArray(phoneNumber)) {
    return phoneNumber.map(formatPhoneNumber);
  }
  return formatPhoneNumber(phoneNumber);
};

/**
 * Get sender ID with fallback logic
 * @param {string|null} providedSenderId - Sender ID provided by caller
 * @returns {string} - Final sender ID to use
 */
const getSenderId = (providedSenderId = null) => {
  return providedSenderId || config.sms.senderId || DEFAULT_SENDER_ID;
};

/**
 * Make API request to Termii
 * @param {string} endpoint - API endpoint (relative to base URL)
 * @param {Object} data - Request data
 * @param {string} method - HTTP method (default: 'POST')
 * @returns {Promise<Object>} - API response
 */
const makeApiRequest = async (endpoint, data = null, method = 'POST') => {
  const url = `${config.sms.sms_base_url}${endpoint}`;
  const options = {
    method,
    url,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (method === 'GET') {
    options.params = data;
  } else {
    options.data = data;
  }

  try {
    const response = await axios(options);
    return response.data;
  } catch (error) {
    logger.error('SMS API error', {
      endpoint,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    throw error;
  }
};

/**
 * Send SMS using Termii API
 * @param {string|string[]} phoneNumber - Phone number(s) in local or international format
 * @param {string} message - Message text to send
 * @param {string|null} senderId - Sender ID. Defaults to 'N-Alert'
 * @param {string} channel - Channel type. Defaults to 'dnd'
 * @param {string} type - Message type. Defaults to 'plain'
 * @returns {Promise<Object>} - API response
 */
const sendSms = async (
  phoneNumber,
  message,
  senderId = null,
  channel = DEFAULT_CHANNEL,
  type = DEFAULT_TYPE
) => {
  if (!hasSmsConfig) {
    throw new Error(
      'SMS configuration is missing. Please set SMS_API_KEY and SMS_BASE_URL'
    );
  }

  const formattedPhoneNumbers = formatPhoneNumbers(phoneNumber);
  const from = getSenderId(senderId);

  const data = {
    to: formattedPhoneNumbers,
    from,
    sms: message,
    type,
    api_key: config.sms.sms_api_key,
    channel,
  };

  logger.info(
    `Sending SMS to ${
      Array.isArray(formattedPhoneNumbers)
        ? formattedPhoneNumbers.join(', ')
        : formattedPhoneNumbers
    }`
  );

  const response = await makeApiRequest('/api/sms/send', data);
  logger.info('SMS sent successfully', { response });
  return response;
};

/**
 * Parse sendOtpSms parameters (supports both object and individual parameters)
 * @param {string|Object} phoneNumberOrOptions - Phone number or options object
 * @param {string} [otp] - OTP code (if first param is string)
 * @param {string} [senderId] - Optional sender ID (if first param is string)
 * @returns {Object} - Parsed parameters { phoneNumber, otp, senderId }
 */
const parseOtpParameters = (phoneNumberOrOptions, otp, senderId = null) => {
  if (
    typeof phoneNumberOrOptions === 'object' &&
    phoneNumberOrOptions !== null
  ) {
    return {
      phoneNumber:
        phoneNumberOrOptions.recipient || phoneNumberOrOptions.phoneNumber,
      otp: phoneNumberOrOptions.otp,
      senderId: phoneNumberOrOptions.senderId || null,
    };
  }

  return {
    phoneNumber: phoneNumberOrOptions,
    otp,
    senderId,
  };
};

/**
 * Send OTP SMS
 * Supports both object parameter and individual parameters for backward compatibility
 * @param {string|Object} phoneNumberOrOptions - Phone number (string) or options object with {recipient, otp, senderId}
 * @param {string} [otp] - OTP code to send (if first param is string)
 * @param {string} [senderId] - Optional sender ID (if first param is string)
 * @returns {Promise<Object>} - API response
 */
const sendOtpSms = async (phoneNumberOrOptions, otp, senderId = null) => {
  const {
    phoneNumber,
    otp: otpCode,
    senderId: senderIdValue,
  } = parseOtpParameters(phoneNumberOrOptions, otp, senderId);

  const message = OTP_MESSAGE_TEMPLATE.replace('{otp}', otpCode);
  return sendSms(
    phoneNumber,
    message,
    senderIdValue,
    DEFAULT_CHANNEL,
    DEFAULT_TYPE
  );
};

/**
 * Get SMS status (if supported by Termii API)
 * @param {string} smsId - SMS ID from send response
 * @returns {Promise<Object>} - SMS status
 */
const getSmsStatus = async (smsId) => {
  if (!hasSmsConfig) {
    throw new Error(
      'SMS configuration is missing. Please set SMS_API_KEY and SMS_BASE_URL'
    );
  }

  return makeApiRequest(
    `/api/sms/${smsId}`,
    { api_key: config.sms.sms_api_key },
    'GET'
  );
};

module.exports = {
  hasSmsConfig,
  sendSms,
  sendOtpSms,
  getSmsStatus,
  formatPhoneNumber,
};
