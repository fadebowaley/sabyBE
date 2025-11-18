const axios = require('axios');
const { NigeriaBulkSMSClient } = require('nigeriabulksms-sdk');
const config = require('../config/config');
const logger = require('../config/logger');

const PROVIDERS = {
  SENDAR: 'sendar',
  NIGERIA_BULKSMS: 'nigeriabulksms',
};

const provider = (config.sms?.provider || PROVIDERS.SENDAR).toLowerCase();
const DEFAULT_SENDER_ID =
  config.sms?.senderId || process.env.SMS_SENDER_ID || 'Saby';
const DEFAULT_WALLET_TYPE =
  config.sms?.walletType || process.env.SMS_WALLET_TYPE || 'promotional';

const sanitizePhoneNumber = (value = '', { keepPlus = false } = {}) => {
  if (!value && value !== 0) {
    return '';
  }
  const stringValue = value.toString().trim();
  if (keepPlus) {
    return stringValue.replace(/\s+/g, '');
  }
  return stringValue.replace(/[^\d,]/g, '');
};

const sanitizeSenderId = (value = DEFAULT_SENDER_ID) =>
  (value || DEFAULT_SENDER_ID).toString().slice(0, 11);

let nigeriaBulkSmsClient = null;
if (provider === PROVIDERS.NIGERIA_BULKSMS) {
  const credentials = config.sms?.nigeriaBulkSms || {};
  if (credentials.username && credentials.password) {
    const clientOptions = {
      username: credentials.username,
      password: credentials.password,
    };
    if (credentials.baseUrl) {
      clientOptions.baseUrl = credentials.baseUrl;
    }
    if (Number.isFinite(credentials.timeout)) {
      clientOptions.timeout = credentials.timeout;
    }
    if (Number.isFinite(credentials.retries)) {
      clientOptions.retries = credentials.retries;
    }
    try {
      nigeriaBulkSmsClient = new NigeriaBulkSMSClient(clientOptions);
      logger.info('NigeriaBulkSMS client initialised');
    } catch (error) {
      logger.error(
        'Failed to initialise NigeriaBulkSMS client:',
        error.message
      );
    }
  } else {
    logger.warn(
      'NigeriaBulkSMS credentials missing. SMS will be skipped until configured.'
    );
  }
}

const isSendarConfigured =
  !!config.sms?.sendar_api_url && !!config.sms?.sms_api_key?.length;

const hasSmsConfig =
  (provider === PROVIDERS.SENDAR && isSendarConfigured) ||
  (provider === PROVIDERS.NIGERIA_BULKSMS && !!nigeriaBulkSmsClient);

/**
 * Sends SMS to multiple recipients
 * @param {string} senderId
 * @param {Array<{number: string, body: string, sms_type?: string, schedule_at?: string}>} messages
 * @param {string} walletType
 * @returns {Promise<object>}
 */
async function sendSms(
  senderId = DEFAULT_SENDER_ID,
  messages = [],
  walletType = DEFAULT_WALLET_TYPE
) {
  if (!messages.length) {
    logger.warn('No SMS messages supplied. Nothing to send.');
    return { skipped: true, reason: 'no_messages' };
  }

  if (!hasSmsConfig) {
    logger.warn('SMS service not configured. Skipping send.');
    return { skipped: true, reason: 'sms_not_configured' };
  }

  const normalisedSenderId = sanitizeSenderId(senderId);

  if (provider === PROVIDERS.NIGERIA_BULKSMS) {
    if (!nigeriaBulkSmsClient) {
      throw new Error('NigeriaBulkSMS client not initialised');
    }

    const preparedMessages = messages
      .map((message) => {
        const rawNumber = message.number || message.numbers || message.mobiles;
        if (!rawNumber) {
          logger.warn('Missing recipient number for NigeriaBulkSMS payload.');
          return null;
        }
        const mobiles = sanitizePhoneNumber(rawNumber);
        if (!mobiles) {
          logger.warn(
            `Recipient ${rawNumber} is invalid for NigeriaBulkSMS; skipping.`
          );
          return null;
        }
        return {
          mobiles,
          body: message.body,
        };
      })
      .filter(Boolean);

    if (!preparedMessages.length) {
      return { skipped: true, reason: 'invalid_recipients' };
    }

    try {
      const responses = await Promise.all(
        preparedMessages.map((message) =>
          nigeriaBulkSmsClient.sms.send({
            message: message.body,
            sender: normalisedSenderId,
            mobiles: message.mobiles,
          })
        )
      );
      logger.info('NigeriaBulkSMS dispatched successfully.');
      return responses.length === 1 ? responses[0] : responses;
    } catch (error) {
      const errorPayload = error?.response?.data || error.message;
      logger.error('NigeriaBulkSMS dispatch failed:', errorPayload);
      throw error;
    }
  }

  const payload = {
    wallet_type: walletType,
    sender_id: normalisedSenderId,
    contact: messages.map((message) => ({
      sms_type: 'plain',
      ...message,
      number: sanitizePhoneNumber(message.number, { keepPlus: true }),
    })),
  };

  logger.debug(
    `Sending SMS via Sendar (${config.sms.sendar_api_url})`,
    JSON.stringify(payload, null, 2)
  );

  try {
    const response = await axios.post(
      `${config.sms.sendar_api_url}/sms/send`,
      payload,
      {
        headers: {
          'Api-key': config.sms.sms_api_key,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('SMS dispatched successfully.');
    return response.data;
  } catch (error) {
    const errorPayload = error.response?.data || error.message;
    logger.error('SMS dispatch failed:', errorPayload);
    throw error;
  }
}

/**
 * Send OTP SMS to a single recipient
 * @param {Object} params
 * @param {string} params.recipient - Phone number in international format
 * @param {string} params.otp - OTP code
 * @param {string} [params.senderId]
 */
async function sendOtpSms({ recipient, otp, senderId = DEFAULT_SENDER_ID }) {
  if (!recipient || !otp) {
    logger.warn('Missing recipient or OTP; skipping SMS send.');
    return { skipped: true, reason: 'missing_data' };
  }

  const message = {
    number: recipient,
    body: `Your Saby OTP code is ${otp}. It expires in 10 minutes.`,
  };

  return sendSms(senderId, [message]);
}

/**
 * Retrieves SMS status by UID
 * @param {string} uid
 * @returns {Promise<object>}
 */
async function getSmsStatus(uid) {
  if (provider !== PROVIDERS.SENDAR) {
    logger.warn('SMS status retrieval not supported for this provider.');
    return { skipped: true, reason: 'sms_not_configured' };
  }

  if (!uid) {
    logger.warn('Missing SMS UID; skipping status check.');
    return { skipped: true, reason: 'missing_uid' };
  }

  try {
    const response = await axios.get(
      `${config.sms.sendar_api_url}/get/sms/${uid}`,
      {
        headers: {
          'Api-key': config.sms.sms_api_key,
        },
      }
    );

    logger.debug('SMS status retrieved successfully.', response.data);
    return response.data;
  } catch (error) {
    const errorPayload = error.response?.data || error.message;
    logger.error('Failed to fetch SMS status:', errorPayload);
    throw error;
  }
}

module.exports = {
  hasSmsConfig,
  sendSms,
  sendOtpSms,
  getSmsStatus,
};
