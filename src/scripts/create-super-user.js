#!/usr/bin/env node
const mongoose = require('mongoose');
const User = require('../models/user.model');
const config = require('../config/config');
const logger = require('../config/logger');

/**
 * Create a super user with owner and super privileges
 */
async function createSuperUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Check if super user already exists
    const existingSuperUser = await User.findOne({ isSuper: true });
    if (existingSuperUser) {
      logger.info('⚠️  Super user already exists:', {
        email: existingSuperUser.email,
        haloId: existingSuperUser.haloId,
        userId: existingSuperUser.userId,
      });
      return existingSuperUser;
    }

    // Create super user data
    const superUserData = {
      firstname: 'Super',
      lastname: 'Admin',
      email: 'admin@halo.com',
      password: 'admin123',
      isOwner: true,
      isSuper: true,
      isAgreed: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      status: true,
      phoneNumber: '+1234567890',
    };

    // Create the super user
    const superUser = await User.createUser(superUserData);

    logger.info('✅ Super user created successfully:', {
      email: superUser.email,
      haloId: superUser.haloId,
      userId: superUser.userId,
      tenantId: superUser.tenantId,
      isOwner: superUser.isOwner,
      isSuper: superUser.isSuper,
    });

    logger.info('🔑 Login Credentials:');
    logger.info(`   Email: ${superUser.email}`);
    logger.info(`   Password: ${superUserData.password}`);
    logger.info(`   Halo ID: ${superUser.haloId}`);

    return superUser;
  } catch (error) {
    logger.error('❌ Failed to create super user:', error.message);
    throw error;
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    logger.info('🔌 MongoDB connection closed');
  }
}

// Run the script if called directly
if (require.main === module) {
  createSuperUser()
    .then(() => {
      logger.info('🎉 Super user creation completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Super user creation failed:', error.message);
      process.exit(1);
    });
}

module.exports = { createSuperUser };
