#!/usr/bin/env node
const mongoose = require('mongoose');
const User = require('../models/user.model');
const config = require('../config/config');
const logger = require('../config/logger');

/**
 * List all users in the database
 */
async function listUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Find all users
    const users = await User.find({}).select(
      '-password -otp -otpExpires -otpVerified'
    );

    if (users.length === 0) {
      logger.info('📭 No users found in the database');
      return;
    }

    logger.info(`📊 Found ${users.length} user(s):`);
    logger.info('─'.repeat(80));

    users.forEach((user, index) => {
      logger.info(`${index + 1}. User Details:`);
      logger.info(`   Name: ${user.firstname} ${user.lastname}`);
      logger.info(`   Email: ${user.email}`);
      logger.info(`   Halo ID: ${user.haloId}`);
      logger.info(`   User ID: ${user.userId}`);
      logger.info(`   Tenant ID: ${user.tenantId}`);
      logger.info(`   Status: ${user.status ? '✅ Active' : '❌ Inactive'}`);
      logger.info(`   Owner: ${user.isOwner ? '👑 Yes' : '❌ No'}`);
      logger.info(`   Super: ${user.isSuper ? '⭐ Yes' : '❌ No'}`);
      logger.info(
        `   Email Verified: ${user.isEmailVerified ? '✅ Yes' : '❌ No'}`
      );
      logger.info(
        `   Phone Verified: ${user.isPhoneVerified ? '✅ Yes' : '❌ No'}`
      );
      logger.info(`   Phone: ${user.phoneNumber || 'N/A'}`);
      logger.info(`   Created: ${user.createdAt.toLocaleDateString()}`);
      logger.info(`   Avatar: ${user.avatar || 'N/A'}`);

      if (user.roles && user.roles.length > 0) {
        logger.info(`   Roles: ${user.roles.length} role(s) assigned`);
      } else {
        logger.info(`   Roles: No roles assigned`);
      }

      logger.info('─'.repeat(80));
    });

    // Summary
    const activeUsers = users.filter((u) => u.status).length;
    const owners = users.filter((u) => u.isOwner).length;
    const superUsers = users.filter((u) => u.isSuper).length;
    const verifiedEmails = users.filter((u) => u.isEmailVerified).length;
    const verifiedPhones = users.filter((u) => u.isPhoneVerified).length;

    logger.info('📈 Summary:');
    logger.info(`   Total Users: ${users.length}`);
    logger.info(`   Active Users: ${activeUsers}`);
    logger.info(`   Owners: ${owners}`);
    logger.info(`   Super Users: ${superUsers}`);
    logger.info(`   Email Verified: ${verifiedEmails}`);
    logger.info(`   Phone Verified: ${verifiedPhones}`);
  } catch (error) {
    logger.error('❌ Failed to list users:', error.message);
    throw error;
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    logger.info('🔌 MongoDB connection closed');
  }
}

// Run the script if called directly
if (require.main === module) {
  listUsers()
    .then(() => {
      logger.info('🎉 User listing completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 User listing failed:', error.message);
      process.exit(1);
    });
}

module.exports = { listUsers };
