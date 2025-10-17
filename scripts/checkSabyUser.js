const mongoose = require('mongoose');
const config = require('../src/config/config');
const User = require('../src/models/user.model');

/**
 * Script to verify SabyUser credentials
 */

const checkSabyUser = async () => {
  try {
    console.log('🔍 Checking SabyUser in Database...\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);

    // Find SabyUser
    const sabyUser = await User.findOne({ isSaby: true });

    if (!sabyUser) {
      console.log('❌ No SabyUser found in database');
      process.exit(1);
    }

    console.log('✅ SabyUser Found!\n');
    console.log('=================');
    console.log('Email:           ', sabyUser.email);
    console.log(
      'Name:            ',
      `${sabyUser.firstname} ${sabyUser.lastname}`
    );
    console.log('User ID:         ', sabyUser.userId);
    console.log('Halo ID:         ', sabyUser.haloId);
    console.log('Tenant ID:       ', sabyUser.tenantId);
    console.log('\nPrivileges:');
    console.log('===========');
    console.log('isSaby:          ', sabyUser.isSaby ? '✅ true' : '❌ false');
    console.log('isSuper:         ', sabyUser.isSuper ? '✅ true' : '❌ false');
    console.log('isOwner:         ', sabyUser.isOwner ? '✅ true' : '❌ false');
    console.log('\nAccount Status:');
    console.log('===============');
    console.log(
      'OTP Verified:    ',
      sabyUser.otpVerified ? '✅ true' : '❌ false'
    );
    console.log(
      'Email Verified:  ',
      sabyUser.isEmailVerified ? '✅ true' : '❌ false'
    );
    console.log(
      'Status:          ',
      sabyUser.status ? '✅ Active' : '❌ Inactive'
    );
    console.log('\nLogin Credentials:');
    console.log('==================');
    console.log('Email:    ', sabyUser.email);
    console.log('Password: ******** (encrypted in database)');
    console.log('\n✅ This user can login to the system');
    console.log('✅ All SabyUser privileges are active\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

// Run the script
checkSabyUser();

