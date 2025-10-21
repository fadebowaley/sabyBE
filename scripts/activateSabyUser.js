const mongoose = require('mongoose');
const config = require('../src/config/config');
const User = require('../src/models/user.model');

/**
 * Script to activate SabyUser account for login
 */

const activateSabyUser = async () => {
  try {
    console.log('🔧 Activating SabyUser Account...\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);

    // Find SabyUser
    const sabyUser = await User.findOne({ isSaby: true });

    if (!sabyUser) {
      console.log('❌ No SabyUser found');
      process.exit(1);
    }

    console.log('📋 Before Activation:');
    console.log('====================');
    console.log('Email:          ', sabyUser.email);
    console.log('OTP Verified:   ', sabyUser.otpVerified);
    console.log('Email Verified: ', sabyUser.isEmailVerified);
    console.log('Status:         ', sabyUser.status);
    console.log();

    // Activate account
    sabyUser.otpVerified = true;
    sabyUser.isEmailVerified = true;
    sabyUser.status = true;
    await sabyUser.save();

    console.log('✅ After Activation:');
    console.log('===================');
    console.log('Email:          ', sabyUser.email);
    console.log(
      'OTP Verified:   ',
      sabyUser.otpVerified ? '✅ true' : '❌ false'
    );
    console.log(
      'Email Verified: ',
      sabyUser.isEmailVerified ? '✅ true' : '❌ false'
    );
    console.log(
      'Status:         ',
      sabyUser.status ? '✅ Active' : '❌ Inactive'
    );
    console.log('\n🎉 Account Activated Successfully!\n');
    console.log('You can now login with:');
    console.log('=====================');
    console.log('Email:    saby@saby.ai');
    console.log('Password: @saby_Saby1');
    console.log();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

// Run the script
activateSabyUser();
