/**
 * Script to create Saby super user with all privileges
 * Email: saby@saby.ai
 * Password: @saby_Saby1
 * Privileges: isSaby, isSuper, isOwner
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config/config');
const User = require('../src/models/user.model');

async function createSabySuperUser() {
  try {
    console.log('🚀 Starting Saby Super User Creation...\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Check if user already exists
    console.log('🔍 Checking if saby@saby.ai already exists...');
    const existingUser = await User.findOne({ email: 'saby@saby.ai' });
    
    if (existingUser) {
      console.log('\n⚠️  User saby@saby.ai already exists!');
      console.log('📧 Email:', existingUser.email);
      console.log('🆔 User ID:', existingUser._id);
      console.log('🔑 Privileges:', {
        isSaby: existingUser.isSaby,
        isSuper: existingUser.isSuper,
        isOwner: existingUser.isOwner,
      });
      console.log('\n✅ Saby super user already configured.');
      
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log('✅ Email available\n');

    // Hash password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash('@saby_Saby1', 8);
    console.log('✅ Password hashed\n');

    // Create user data
    const userData = {
      email: 'saby@saby.ai',
      password: hashedPassword,
      firstname: 'Saby',
      lastname: 'Admin',
      isSaby: true,
      isSuper: true,
      isOwner: true,
      isActive: true,
      isEmailVerified: true,
      tenantId: 'saby-tenant-001', // Special tenant for Saby
      userId: 'SABY0001', // Special user ID
    };

    console.log('👤 Creating user with the following details:');
    console.log('   Email: saby@saby.ai');
    console.log('   Name: Saby Admin');
    console.log('   Tenant ID: saby-tenant-001');
    console.log('   User ID: SABY0001');
    console.log('   Privileges: isSaby, isSuper, isOwner\n');

    // Create user
    console.log('💾 Saving user to database...');
    const user = await User.create(userData);
    console.log('✅ User created successfully!\n');

    // Display results
    console.log('========================================');
    console.log('✅ SABY SUPER USER CREATED SUCCESSFULLY');
    console.log('========================================');
    console.log('\n📧 Login Credentials:');
    console.log('   Email:    saby@saby.ai');
    console.log('   Password: @saby_Saby1');
    console.log('\n🆔 User Details:');
    console.log('   User ID:   ', user._id);
    console.log('   Tenant ID: ', user.tenantId);
    console.log('   User Code: ', user.userId);
    console.log('\n🔑 Privileges:');
    console.log('   isSaby:  ', user.isSaby ? '✅' : '❌');
    console.log('   isSuper: ', user.isSuper ? '✅' : '❌');
    console.log('   isOwner: ', user.isOwner ? '✅' : '❌');
    console.log('\n========================================');
    console.log('\n🎉 You can now login with these credentials!');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating super user:', error);
    console.error('\n📋 Error Details:');
    console.error('   Message:', error.message);
    if (error.code) {
      console.error('   Code:', error.code);
    }
    if (error.keyPattern) {
      console.error('   Duplicate Key:', error.keyPattern);
    }
    
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
createSabySuperUser();


