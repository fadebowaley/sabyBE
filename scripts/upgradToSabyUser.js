const mongoose = require('mongoose');
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
 * Script to upgrade an existing user to SabyUser
 */

const upgradeToSabyUser = async () => {
  try {
    console.log('🎯 Upgrade Existing User to SabyUser\n');

    // Get user email
    const email = await question('Enter user email to upgrade: ');

    // Connect to MongoDB
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      console.error(`❌ User with email "${email}" not found`);
      process.exit(1);
    }

    console.log('Found user:');
    console.log('===========');
    console.log('Email:     ', user.email);
    console.log('Name:      ', `${user.firstname} ${user.lastname}`);
    console.log('Halo ID:   ', user.haloId);
    console.log('Current privileges:');
    console.log('  isSaby:  ', user.isSaby);
    console.log('  isSuper: ', user.isSuper);
    console.log('  isOwner: ', user.isOwner);
    console.log();

    if (user.isSaby) {
      console.log('✅ This user already has SabyUser privileges');
      process.exit(0);
    }

    const confirm = await question('Upgrade this user to SabyUser? (yes/no): ');

    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Upgrade cancelled');
      process.exit(0);
    }

    // Upgrade user
    user.isSaby = true;
    user.isSuper = true;
    user.isOwner = true;
    await user.save();

    console.log('\n🎉 User upgraded successfully!\n');
    console.log('New Privileges:');
    console.log('===============');
    console.log('✅ isSaby:  ', user.isSaby);
    console.log('✅ isSuper: ', user.isSuper);
    console.log('✅ isOwner: ', user.isOwner);
    console.log('\nFeature Access:');
    console.log('===============');
    console.log('✅ Can approve API keys (/apis/approvals)');
    console.log('✅ Can create internal/external/partner/system API keys');
    console.log("✅ Can view all tenants' API keys");
    console.log('✅ Can access Go Live dashboard (/apis/go-live)');
    console.log('✅ Full access to all protected routes\n');
  } catch (error) {
    console.error('❌ Error upgrading user:', error);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
upgradeToSabyUser();
