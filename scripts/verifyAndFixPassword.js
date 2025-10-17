const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config/config');
const User = require('../src/models/user.model');

/**
 * Script to verify and fix password for SabyUser
 */

const verifyAndFixPassword = async () => {
  try {
    console.log('🔍 Verifying SabyUser Password...\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);

    // Find SabyUser
    const sabyUser = await User.findOne({ email: 'saby@saby.ai' });

    if (!sabyUser) {
      console.log('❌ User with email saby@saby.ai not found');
      console.log('\n💡 Check if email is correct in database');

      // Check if any SabyUser exists
      const anySabyUser = await User.findOne({ isSaby: true });
      if (anySabyUser) {
        console.log('\n📋 Found SabyUser with different email:');
        console.log('Email:', anySabyUser.email);
        console.log(
          'Name:',
          `${anySabyUser.firstname} ${anySabyUser.lastname}`
        );
      }
      process.exit(1);
    }

    console.log('✅ User found!');
    console.log('Email:', sabyUser.email);
    console.log('Name:', `${sabyUser.firstname} ${sabyUser.lastname}`);
    console.log('\n🔐 Testing password...\n');

    // Test the password
    const testPassword = '@saby_Saby1';
    const isPasswordValid = await bcrypt.compare(
      testPassword,
      sabyUser.password
    );

    if (isPasswordValid) {
      console.log('✅ Password is CORRECT!');
      console.log('\nYour login credentials:');
      console.log('======================');
      console.log('Email:    saby@saby.ai');
      console.log('Password: @saby_Saby1');
      console.log('\n✅ You should be able to login now!');
    } else {
      console.log('❌ Password does NOT match!');
      console.log('\n🔧 Updating password to: @saby_Saby1\n');

      // Hash and update password
      const newHashedPassword = await bcrypt.hash('@saby_Saby1', 8);
      sabyUser.password = newHashedPassword;
      await sabyUser.save();

      console.log('✅ Password updated successfully!');
      console.log('\nYour login credentials:');
      console.log('======================');
      console.log('Email:    saby@saby.ai');
      console.log('Password: @saby_Saby1');
      console.log('\n✅ Try logging in again now!');

      // Verify the new password
      const isNewPasswordValid = await bcrypt.compare(
        '@saby_Saby1',
        sabyUser.password
      );
      console.log(
        '\n🔍 Verification: Password now',
        isNewPasswordValid ? '✅ VALID' : '❌ INVALID'
      );
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

// Run the script
verifyAndFixPassword();

