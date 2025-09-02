const mongoose = require('mongoose');
const config = require('./src/config/config');
const User = require('./src/models/user.model');
const Role = require('./src/models/role.model');
const logger = require('./src/config/logger');

/**
 * Create team users under the same tenant as fadebowaley@gmail.com
 */
async function createTeamUsers() {
  try {
    console.log('👥 Creating Team Users\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Step 1: Find fadebowaley@gmail.com to get tenant ID
    console.log('\n1️⃣ Finding fadebowaley@gmail.com to get tenant ID...');
    const fadebowale = await User.findOne({ email: 'fadebowaley@gmail.com' });

    if (!fadebowale) {
      throw new Error('fadebowaley@gmail.com not found in database');
    }

    console.log(`   ✅ Found fadebowaley@gmail.com`);
    console.log(`   Tenant ID: ${fadebowale.tenantId}`);
    console.log(`   User ID: ${fadebowale._id}`);

        // Step 2: Find the "Support Agent" role
    console.log('\n2️⃣ Finding "Support Agent" role...');
    const userRole = await Role.findOne({ name: 'Support Agent' });

    if (!userRole) {
      throw new Error('Role "Support Agent" not found in database');
    }

    console.log(`   ✅ Found "Support Agent" role with ID: ${userRole._id}`);

    // Step 3: Define team users
    const teamUsers = [
      {
        email: 'ochibafrederick@gmail.com',
        phoneNumber: '+2348052116691',
        firstname: 'Frederick',
        lastname: 'Ochiba',
        password: 'Password123!',
        isOwner: false,
        createdBy: fadebowale._id,
        tenantId: fadebowale.tenantId,
        roles: [userRole._id],
        isEmailVerified: true,
        isPhoneVerified: true,
        status: true,
      },
      {
        email: 'pelekadeba@gmail.com',
        phoneNumber: '+2348088186853',
        firstname: 'Deba',
        lastname: 'Peleka',
        password: 'Password123!',
        isOwner: false,
        createdBy: fadebowale._id,
        tenantId: fadebowale.tenantId,
        roles: [userRole._id],
        isEmailVerified: true,
        isPhoneVerified: true,
        status: true,
      },
      {
        email: 'olorijoseph2002@gmail.com',
        phoneNumber: '+2347038640142',
        firstname: 'Joseph',
        lastname: 'Olori',
        password: 'Password123!',
        isOwner: false,
        createdBy: fadebowale._id,
        tenantId: fadebowale.tenantId,
        roles: [userRole._id],
        isEmailVerified: true,
        isPhoneVerified: true,
        status: true,
      },
      {
        email: 'olatunjit593@gmail.com',
        phoneNumber: '+2348117288957',
        firstname: 'Tunji',
        lastname: 'Olatunji',
        password: 'Password123!',
        isOwner: false,
        createdBy: fadebowale._id,
        tenantId: fadebowale.tenantId,
        roles: [userRole._id],
        isEmailVerified: true,
        isPhoneVerified: true,
        status: true,
      },
    ];

    // Step 4: Create users
    console.log('\n3️⃣ Creating team users...');
    const createdUsers = [];
    const errors = [];

    for (const userData of teamUsers) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
          console.log(`   ⚠️  User ${userData.email} already exists, skipping...`);
          continue;
        }

        // Create user using the static method
        const newUser = await User.createUser(userData);
        createdUsers.push(newUser);
        console.log(`   ✅ Created user: ${newUser.email} (${newUser.firstname} ${newUser.lastname})`);
        console.log(`      Phone: ${newUser.phoneNumber} (Verified: ${newUser.isPhoneVerified})`);
        console.log(`      User ID: ${newUser.userId}, Halo ID: ${newUser.haloId}`);
      } catch (error) {
        console.log(`   ❌ Failed to create user ${userData.email}: ${error.message}`);
        errors.push({ email: userData.email, error: error.message });
      }
    }

    // Step 5: Show summary
    console.log('\n4️⃣ Summary:');
    console.log(`   Total users to create: ${teamUsers.length}`);
    console.log(`   Successfully created: ${createdUsers.length}`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`   Tenant ID: ${fadebowale.tenantId}`);

    if (createdUsers.length > 0) {
      console.log('\n5️⃣ Created users details:');
      createdUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.firstname} ${user.lastname}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      Phone: ${user.phoneNumber}`);
        console.log(`      User ID: ${user.userId}`);
        console.log(`      Halo ID: ${user.haloId}`);
        console.log(`      Phone Verified: ${user.isPhoneVerified}`);
        console.log('');
      });
    }

    if (errors.length > 0) {
      console.log('\n6️⃣ Errors:');
      errors.forEach((error) => {
        console.log(`   ❌ ${error.email}: ${error.error}`);
      });
    }

    console.log('\n🎉 Team user creation completed!');
  } catch (error) {
    console.error('❌ Error creating team users:', error.message);
    console.error('Full error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

// Run the creation
createTeamUsers();
