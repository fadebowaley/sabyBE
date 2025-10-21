const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config/config');
const User = require('../src/models/user.model');

/**
 * Script to debug why isSaby is not appearing in login response
 */

const debugLogin = async () => {
  try {
    console.log('🔍 Debugging SabyUser Login...\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);

    // Find user by email (same as login does)
    console.log('1️⃣ Finding user by email: saby@saby.ai');
    const user = await User.findOne({ email: 'saby@saby.ai' });

    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    console.log('✅ User found in database\n');

    // Check raw document
    console.log('📋 Raw document fields:');
    console.log('======================');
    const rawDoc = user.toObject();
    console.log('isOwner:', rawDoc.isOwner);
    console.log('isSuper:', rawDoc.isSuper);
    console.log('isSaby:', rawDoc.isSaby);
    console.log();

    // Check user object properties
    console.log('📋 User object properties:');
    console.log('=========================');
    console.log('user.isOwner:', user.isOwner);
    console.log('user.isSuper:', user.isSuper);
    console.log('user.isSaby:', user.isSaby);
    console.log();

    // Simulate what login controller sends
    console.log('📋 What login controller would send:');
    console.log('====================================');
    const userResponse = {
      id: user.id,
      userId: user.userId,
      haloId: user.haloId,
      tenantId: user.tenantId,
      firstname: user.firstname,
      lastname: user.lastname,
      name: `${user.firstname} ${user.lastname}`.trim(),
      email: user.email,
      phoneNumber: user.phoneNumber,
      avatar: user.avatar,
      isOwner: user.isOwner,
      isSuper: user.isSuper,
      isSaby: user.isSaby,
      isAgreed: user.isAgreed,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      status: user.status,
      createdAt: user.createdAt,
      roles: user.roles,
    };

    console.log(JSON.stringify(userResponse, null, 2));
    console.log();

    // Check if isSaby is undefined vs false
    console.log('🔍 Type checking:');
    console.log('=================');
    console.log('typeof user.isSaby:', typeof user.isSaby);
    console.log('user.isSaby === true:', user.isSaby === true);
    console.log('user.isSaby === false:', user.isSaby === false);
    console.log('user.isSaby === undefined:', user.isSaby === undefined);
    console.log();

    if (user.isSaby !== true) {
      console.log('❌ PROBLEM FOUND: isSaby is not true!');
      console.log('Current value:', user.isSaby);
      console.log('\n🔧 Fixing isSaby field...');

      user.isSaby = true;
      await user.save();

      console.log('✅ isSaby set to true');

      // Verify
      const updatedUser = await User.findOne({ email: 'saby@saby.ai' });
      console.log('✅ Verification: isSaby is now', updatedUser.isSaby);
    } else {
      console.log('✅ isSaby field is correct (true)');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

// Run the script
debugLogin();
