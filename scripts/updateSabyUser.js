const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const config = require('../src/config/config');
const User = require('../src/models/user.model');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

/**
 * Script to update existing SabyUser credentials
 * Since there can only be one SabyUser (unique constraint on isSaby field)
 */

const updateSabyUser = async () => {
  try {
    console.log('🔄 Update Existing SabyUser Credentials\n');
    console.log(
      '⚠️  Note: Only one SabyUser can exist (database constraint)\n'
    );

    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find existing SabyUser
    const existingSabyUser = await User.findOne({ isSaby: true });

    if (!existingSabyUser) {
      console.log('❌ No SabyUser found in database');
      console.log(
        '💡 Run: node scripts/createSabyUser.js (after removing unique constraint)'
      );
      process.exit(1);
    }

    console.log('📋 Current SabyUser:');
    console.log('===================');
    console.log('Email:     ', existingSabyUser.email);
    console.log(
      'Name:      ',
      `${existingSabyUser.firstname} ${existingSabyUser.lastname}`
    );
    console.log('Halo ID:   ', existingSabyUser.haloId);
    console.log('Tenant ID: ', existingSabyUser.tenantId);
    console.log();

    const action = await question(
      'What would you like to do?\n' +
        '1. Update email only\n' +
        '2. Update name only\n' +
        '3. Update password only\n' +
        '4. Update all credentials\n' +
        '5. Cancel\n' +
        'Enter choice (1-5): '
    );

    if (action === '5') {
      console.log('❌ Operation cancelled');
      process.exit(0);
    }

    let updates = {};

    if (action === '1' || action === '4') {
      const email = await question('New email address: ');
      updates.email = email;
    }

    if (action === '2' || action === '4') {
      const firstname = await question('New first name: ');
      const lastname = await question('New last name: ');
      updates.firstname = firstname;
      updates.lastname = lastname;
    }

    if (action === '3' || action === '4') {
      const password = await question(
        'New password (min 8 chars, must contain letter & number): '
      );

      // Validate password
      if (
        password.length < 8 ||
        !/\d/.test(password) ||
        !/[a-zA-Z]/.test(password)
      ) {
        console.error(
          '❌ Password must be at least 8 characters and contain at least one letter and one number'
        );
        process.exit(1);
      }

      updates.password = await bcrypt.hash(password, 8);
    }

    // Confirm update
    console.log('\n📝 Updates to be applied:');
    console.log('========================');
    if (updates.email) console.log('Email:     ', updates.email);
    if (updates.firstname)
      console.log('Name:      ', `${updates.firstname} ${updates.lastname}`);
    if (updates.password)
      console.log('Password:  ', '******** (new password set)');
    console.log();

    const confirm = await question('Apply these changes? (yes/no): ');

    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Update cancelled');
      process.exit(0);
    }

    // Apply updates
    Object.assign(existingSabyUser, updates);
    await existingSabyUser.save();

    console.log('\n🎉 SabyUser updated successfully!\n');
    console.log('New Credentials:');
    console.log('================');
    console.log('Email:    ', existingSabyUser.email);
    if (updates.password) {
      console.log('Password: ', '(updated - use the new password you entered)');
    }
    console.log('\nUser Details:');
    console.log('=============');
    console.log('User ID:  ', existingSabyUser.userId);
    console.log('Halo ID:  ', existingSabyUser.haloId);
    console.log('Tenant ID:', existingSabyUser.tenantId);
    console.log(
      'Name:     ',
      `${existingSabyUser.firstname} ${existingSabyUser.lastname}`
    );
    console.log('\n⚠️  IMPORTANT: Save these credentials securely!\n');
  } catch (error) {
    console.error('❌ Error updating SabyUser:', error);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
updateSabyUser();

