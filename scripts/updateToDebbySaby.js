const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config/config');
const User = require('../src/models/user.model');

/**
 * Direct script to update existing SabyUser with Debby's credentials
 * Email: saby@saby.ai
 * Name: Debby Adebowale
 * Password: @saby_Saby1
 */

const updateToDebbySaby = async () => {
  try {
    console.log('🔄 Updating SabyUser to Debby Adebowale\n');

    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find existing SabyUser
    const existingSabyUser = await User.findOne({ isSaby: true });

    if (!existingSabyUser) {
      console.log('❌ No SabyUser found in database');
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
    console.log();

    // Hash the new password
    const hashedPassword = await bcrypt.hash('@saby_Saby1', 8);

    // Update user
    existingSabyUser.email = 'saby@saby.ai';
    existingSabyUser.firstname = 'Debby';
    existingSabyUser.lastname = 'Adebowale';
    existingSabyUser.password = hashedPassword;

    await existingSabyUser.save();

    console.log('🎉 SabyUser updated successfully!\n');
    console.log('New Login Credentials:');
    console.log('=====================');
    console.log('Email:    saby@saby.ai');
    console.log('Password: @saby_Saby1');
    console.log('\nUser Details:');
    console.log('=============');
    console.log('User ID:  ', existingSabyUser.userId);
    console.log('Halo ID:  ', existingSabyUser.haloId);
    console.log('Tenant ID:', existingSabyUser.tenantId);
    console.log('Name:     ', 'Debby Adebowale');
    console.log('\nPrivileges:');
    console.log('===========');
    console.log('✅ isSaby:  ', existingSabyUser.isSaby);
    console.log('✅ isSuper: ', existingSabyUser.isSuper);
    console.log('✅ isOwner: ', existingSabyUser.isOwner);
    console.log('\n✅ You can now login with:');
    console.log('   Email:    saby@saby.ai');
    console.log('   Password: @saby_Saby1');
    console.log(
      '\n🚀 Next: Navigate to /apis/approvals to test SabyUser features!\n'
    );
  } catch (error) {
    console.error('❌ Error updating SabyUser:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
updateToDebbySaby();
