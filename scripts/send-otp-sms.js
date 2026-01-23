#!/usr/bin/env node

require('../src/config/config');
const logger = require('../src/config/logger');
const smsService = require('../src/services/sms.service');

async function main() {
  const [, , phoneNumber, otpArg, senderIdArg] = process.argv;

  if (!phoneNumber) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: node scripts/send-otp-sms.js <phoneNumber> [otp] [senderId]'
    );
    process.exit(1);
  }

  const otp = otpArg || '000000';
  const senderId = senderIdArg || process.env.SMS_SENDER_ID || 'Saby';

  if (!smsService.hasSmsConfig) {
    logger.warn('SMS configuration missing; update env before sending.');
    process.exit(1);
  }

  try {
    const response = await smsService.sendOtpSms({
      recipient: phoneNumber,
      otp,
      senderId,
    });
    logger.info('OTP SMS dispatch response:', response);
  } catch (error) {
    logger.error('Failed to send OTP SMS:', error.response?.data || error);
    process.exit(1);
  }

  process.exit(0);
}

main();
