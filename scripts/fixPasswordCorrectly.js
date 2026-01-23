const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config/config');
const User = require('../src/models/user.model');

/**
 * Script to fix SabyUser password CORRECTLY
 * The User model has a pre-save hook that auto-hashes passwords,
 * so we need to set the PLAIN TEXT password and let the model hash it
 */

const fixPasswordCorrectly = async () => {
  try {
    console.log('🔧 Fixing SabyUser Password (Correct Method)...\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);

    // Find SabyUser
    const sabyUser = await User.findOne({ email: 'saby@saby.ai' });

    if (!sabyUser) {
      console.log('❌ User with email saby@saby.ai not found');
      process.exit(1);
    }

    console.log('✅ User found!');
    console.log('Email:', sabyUser.email);
    console.log('Name:', `${sabyUser.firstname} ${sabyUser.lastname}`);
    console.log(
      '\n🔐 Setting password to PLAIN TEXT (model will hash it)...\n'
    );

    // Set PLAIN TEXT password - the pre-save hook will hash it automatically
    sabyUser.password = '@saby_Saby1';
    await sabyUser.save();

    console.log('✅ Password saved! (Model auto-hashed it)\n');

    // Verify the password works now
    const updatedUser = await User.findOne({ email: 'saby@saby.ai' });
    const isPasswordValid = await bcrypt.compare(
      '@saby_Saby1',
      updatedUser.password
    );

    console.log(
      '🔍 Password Verification:',
      isPasswordValid ? '✅ VALID' : '❌ INVALID'
    );

    if (isPasswordValid) {
      console.log('\n🎉 SUCCESS! Password is now correct!\n');
      console.log('Your Login Credentials:');
      console.log('======================');
      console.log('Email:    saby@saby.ai');
      console.log('Password: @saby_Saby1');
      console.log('\n✅ You can now login to the system!');
      console.log('🚀 Try: http://localhost:3000/auth/sign-in\n');
    } else {
      console.log('\n❌ Password still invalid. Manual investigation needed.');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

// Run the script
fixPasswordCorrectly();
