#!/usr/bin/env node
const mongoose = require('mongoose');
const User = require('../models/user.model');
const config = require('../config/config');
const logger = require('../config/logger');
const { sendSms, formatPhoneNumber } = require('./send-login-credentials-sms');

/**
 * Check if a phone number is a Nigerian phone number
 * Nigerian numbers: +234XXXXXXXXXX or 234XXXXXXXXXX or 0XXXXXXXXXX
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} - True if Nigerian number
 */
const isNigerianPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }

  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');

  // Nigerian numbers:
  // - 13 digits starting with 234 (international format)
  // - 11 digits starting with 0 (local format)
  // - Must be exactly 13 digits after cleaning if starts with 234
  // - Must be exactly 11 digits after cleaning if starts with 0

  if (cleaned.startsWith('234')) {
    // International format: 234 + 10 digits = 13 total
    return cleaned.length === 13;
  } else if (cleaned.startsWith('0')) {
    // Local format: 0 + 10 digits = 11 total
    return cleaned.length === 11;
  }

  return false;
};

/**
 * Create SOTSM Portal message template
 * @param {Object} user - User object
 * @param {string} defaultPassword - Default password for all users
 * @returns {string} - Formatted message
 */
const createSotsmMessage = (user, defaultPassword = 'password123') => {
  const title = user.profile?.title || '';
  const firstname = user.firstname || '';
  const lastname = user.lastname || '';
  const email = (user.email || '').replace('@', '[at]');

  // Format title with space if exists
  const titleWithSpace = title ? `${title} ` : '';

  return `Welcome to SOTSM Portal !
Dear ${titleWithSpace}${firstname} ${lastname},
Your Email : ${email}
Go to : https://portal.sotsm.org
Enjoy the Great Harvest !`;
};

/**
 * Send SMS to all users in the database
 * @param {Object} options - Options for bulk sending
 * @param {string} options.defaultPassword - Default password to use (default: 'password123')
 * @param {boolean} options.dryRun - If true, only show preview without sending (default: false)
 * @param {number} options.batchSize - Number of SMS to send per batch (default: 10)
 * @param {number} options.delayBetweenBatches - Delay in ms between batches (default: 1000)
 * @returns {Promise<Object>} - Summary of results
 */
async function sendBulkSmsToAllUsers({
  defaultPassword = 'password123',
  dryRun = false,
  batchSize = 10,
  delayBetweenBatches = 1000,
} = {}) {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Find all users with phone numbers
    const allUsers = await User.find({
      phoneNumber: { $exists: true, $ne: null, $ne: '' },
      status: true, // Only active users
    }).select('firstname lastname email phoneNumber profile.title');

    if (allUsers.length === 0) {
      logger.info('📭 No users with phone numbers found in the database');
      return {
        total: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
    }

    // Filter to only Nigerian phone numbers
    const users = allUsers.filter((user) => {
      return isNigerianPhoneNumber(user.phoneNumber);
    });

    const nonNigerianCount = allUsers.length - users.length;

    logger.info(`📊 Found ${allUsers.length} user(s) with phone numbers`);
    logger.info(`🇳🇬 Nigerian numbers: ${users.length}`);
    if (nonNigerianCount > 0) {
      logger.info(`⏭️  Non-Nigerian numbers (skipped): ${nonNigerianCount}`);
    }

    if (users.length === 0) {
      logger.info('📭 No users with Nigerian phone numbers found');
      return {
        total: 0,
        sent: 0,
        failed: 0,
        skipped: nonNigerianCount,
        results: [],
      };
    }

    // Show sample messages (up to 5)
    if (users.length > 0) {
      const sampleCount = Math.min(5, users.length);
      const sampleUsers = users.slice(0, sampleCount);

      console.log(
        `\n📝 Sample Message Preview (${sampleCount} of ${users.length}):`
      );

      sampleUsers.forEach((sampleUser, index) => {
        const sampleMessage = createSotsmMessage(sampleUser, defaultPassword);
        console.log('\n' + '─'.repeat(60));
        console.log(`Sample ${index + 1}:`);
        console.log(`To: ${sampleUser.phoneNumber}`);
        console.log(`Name: ${sampleUser.firstname} ${sampleUser.lastname}`);
        console.log(`Email: ${sampleUser.email}`);
        console.log('─'.repeat(60));
        console.log(sampleMessage);
        console.log('─'.repeat(60));
        console.log(`Message length: ${sampleMessage.length} characters`);
      });

      console.log('\n');

      if (dryRun) {
        logger.info('🔍 DRY RUN MODE - No SMS will be sent');
        logger.info(`Would send SMS to ${users.length} users`);
        return {
          total: users.length,
          sent: 0,
          failed: 0,
          skipped: 0,
          dryRun: true,
        };
      }
    }

    const results = {
      sent: [],
      failed: [],
      skipped: [],
    };

    // Process users in batches
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      logger.info(
        `\n📤 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          users.length / batchSize
        )} (${batch.length} users)`
      );

      // Process batch in parallel
      const batchPromises = batch.map(async (user) => {
        try {
          const phoneNumber = user.phoneNumber;

          // Skip if phone number is invalid or not Nigerian
          if (!phoneNumber || phoneNumber.trim() === '') {
            results.skipped.push({
              email: user.email,
              reason: 'No phone number',
            });
            return;
          }

          // Double-check it's a Nigerian number (should already be filtered, but safety check)
          if (!isNigerianPhoneNumber(phoneNumber)) {
            results.skipped.push({
              email: user.email,
              reason: 'Not a Nigerian phone number',
            });
            return;
          }

          const message = createSotsmMessage(user, defaultPassword);

          // Send SMS
          const smsResult = await sendSms(phoneNumber, message, 'SOTSM');

          results.sent.push({
            email: user.email,
            name: `${user.firstname} ${user.lastname}`,
            phoneNumber: phoneNumber,
            messageId: smsResult.data?.message_id,
          });

          logger.info(
            `✅ Sent to ${user.firstname} ${user.lastname} (${user.email})`
          );
        } catch (error) {
          results.failed.push({
            email: user.email,
            name: `${user.firstname} ${user.lastname}`,
            phoneNumber: user.phoneNumber,
            error: error.message,
          });
          logger.error(`❌ Failed to send to ${user.email}: ${error.message}`);
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches to avoid rate limiting
      if (i + batchSize < users.length) {
        logger.info(`⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches)
        );
      }
    }

    // Summary
    const summary = {
      total: users.length,
      sent: results.sent.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      results: results,
    };

    logger.info('\n📈 Summary:');
    logger.info(`   Total Users: ${summary.total}`);
    logger.info(`   ✅ Sent: ${summary.sent}`);
    logger.info(`   ❌ Failed: ${summary.failed}`);
    logger.info(`   ⏭️  Skipped: ${summary.skipped}`);

    if (results.failed.length > 0) {
      logger.info('\n❌ Failed Users:');
      results.failed.forEach((failure) => {
        logger.info(`   - ${failure.email}: ${failure.error}`);
      });
    }

    return summary;
  } catch (error) {
    logger.error('❌ Failed to send bulk SMS:', error.message);
    throw error;
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    logger.info('🔌 MongoDB connection closed');
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    const defaultPassword =
      args.find((arg) => arg.startsWith('--password='))?.split('=')[1] ||
      'password123';

    logger.info('🚀 Starting bulk SMS sending to all users...');
    if (dryRun) {
      logger.info('🔍 DRY RUN MODE enabled');
    }
    logger.info(`Default password: ${defaultPassword}`);

    const result = await sendBulkSmsToAllUsers({
      defaultPassword,
      dryRun,
      batchSize: 10,
      delayBetweenBatches: 1000,
    });

    logger.info('🎉 Bulk SMS sending completed');
    return result;
  } catch (error) {
    logger.error('💥 Bulk SMS sending failed:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.exit(1);
    });
}

module.exports = {
  sendBulkSmsToAllUsers,
  createSotsmMessage,
};
