const mongoose = require('mongoose');
const config = require('../src/config/config');
const Role = require('../src/models/role.model');
const User = require('../src/models/user.model');

/**
 * Create Support Agent role for the tenant
 */
async function createSupportAgentRole() {
  try {
    console.log('🔧 Creating Support Agent Role\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Step 1: Find fadebowaley@gmail.com to get tenant ID and user ID
    console.log('\n1️⃣ Finding fadebowaley@gmail.com to get tenant ID...');
    const fadebowale = await User.findOne({ email: 'fadebowaley@gmail.com' });

    if (!fadebowale) {
      throw new Error('fadebowaley@gmail.com not found in database');
    }

    console.log(`   ✅ Found fadebowaley@gmail.com`);
    console.log(`   Tenant ID: ${fadebowale.tenantId}`);
    console.log(`   User ID: ${fadebowale._id}`);

    // Step 2: Check if Support Agent role already exists
    console.log('\n2️⃣ Checking if Support Agent role already exists...');
    const existingRole = await Role.findOne({
      name: 'Support Agent',
      tenantId: fadebowale.tenantId,
    });

    if (existingRole) {
      console.log(`   ⚠️  Role "Support Agent" already exists!`);
      console.log(`   Role ID: ${existingRole._id}`);
      console.log(
        `   Description: ${existingRole.description || 'No description'}`
      );
      return existingRole;
    }

    // Step 3: Create the Support Agent role
    console.log('\n3️⃣ Creating Support Agent role...');
    const roleData = {
      roleName: 'Support Agent',
      roleDescription: 'Provides customer support and assistance to users',
    };

    const newRole = await Role.createRole(roleData, {
      tenantId: fadebowale.tenantId,
      userId: fadebowale.userId,
    });

    console.log(`   ✅ Successfully created Support Agent role!`);
    console.log(`   Role ID: ${newRole._id}`);
    console.log(`   Name: ${newRole.name}`);
    console.log(`   Description: ${newRole.description}`);
    console.log(`   Tenant ID: ${newRole.tenantId}`);

    console.log('\n🎉 Support Agent role creation completed successfully!');
    return newRole;
  } catch (error) {
    console.error('❌ Error creating Support Agent role:', error.message);
    console.error('Full error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

// Run the creation
createSupportAgentRole();
