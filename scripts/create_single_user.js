const mongoose = require('mongoose');
const config = require('./src/config/config');
const User = require('./src/models/user.model');
const Role = require('./src/models/role.model');
const logger = require('./src/config/logger');

/**
 * Create a single user with specified details
 */
async function createSingleUser() {
  try {
    console.log('👤 Creating Single User\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Step 1: Find fadebowaley@gmail.com to get tenant ID and creator ID
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

    // Step 3: Define the new user
    const newUserData = {
      email: 'ooluwatominiyi@gmail.com',
      phoneNumber: '+2348163744486',
      firstname: 'Oluwatominiyi',
      lastname: 'Oluwatominiyi',
      password: 'Password123!',
      isOwner: false,
      createdBy: fadebowale._id,
      tenantId: fadebowale.tenantId,
      roles: [userRole._id],
      isEmailVerified: true,
      isPhoneVerified: true,
      status: true,
    };

    // Step 4: Check if user already exists
    console.log('\n3️⃣ Checking if user already exists...');
    const existingUser = await User.findOne({ email: newUserData.email });
    if (existingUser) {
      console.log(`   ⚠️  User ${newUserData.email} already exists!`);
      console.log(`   User ID: ${existingUser.userId}`);
      console.log(`   Halo ID: ${existingUser.haloId}`);
      console.log(`   Phone: ${existingUser.phoneNumber}`);
      console.log(`   Phone Verified: ${existingUser.isPhoneVerified}`);
      return;
    }

    // Step 5: Create the user
    console.log('\n4️⃣ Creating new user...');
    const newUser = await User.createUser(newUserData);

    console.log(`   ✅ Successfully created user!`);
    console.log(`   Name: ${newUser.firstname} ${newUser.lastname}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Phone: ${newUser.phoneNumber}`);
    console.log(`   User ID: ${newUser.userId}`);
    console.log(`   Halo ID: ${newUser.haloId}`);
    console.log(`   Phone Verified: ${newUser.isPhoneVerified}`);
    console.log(`   Tenant ID: ${newUser.tenantId}`);

    console.log('\n🎉 User creation completed successfully!');
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    console.error('Full error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

// Run the creation
createSingleUser();
