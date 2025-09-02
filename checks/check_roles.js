const mongoose = require('mongoose');
const config = require('./src/config/config');
const Role = require('./src/models/role.model');

async function checkRoles() {
  try {
    console.log('🔍 Checking Available Roles\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Find all roles
    const roles = await Role.find({});

    console.log(`\n📋 Found ${roles.length} roles in database:`);

    if (roles.length === 0) {
      console.log('   No roles found in database');
    } else {
      roles.forEach((role, index) => {
        console.log(`   ${index + 1}. ${role.name} (ID: ${role._id})`);
        console.log(`      Description: ${role.description || 'No description'}`);
        console.log(`      Permissions: ${role.permissions ? role.permissions.length : 0} permissions`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('❌ Error checking roles:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

// Run the check
checkRoles();
