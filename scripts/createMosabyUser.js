/**
 * Script to create elevated user: mosaby@saby.ai
 * Email: mosaby@saby.ai
 * Password: mo_Saby1
 * Privileges: isSaby=true, isOwner=true, isSuper=true
 * Tenant: New account (will generate new tenantId)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const config = require('../src/config/config');
const User = require('../src/models/user.model');
const { HaloCounter } = require('../src/models/haloCounter.model');

async function createMosabyUser() {
  try {
    console.log('🚀 Creating Elevated User: mosaby@saby.ai\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    const email = 'mosaby@saby.ai';
    const password = 'mo_Saby1';
    const firstname = 'Mo';
    const lastname = 'Saby';

    // Check if user already exists
    console.log(`🔍 Checking if ${email} already exists...`);
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      console.log(`\n⚠️  User ${email} already exists!`);
      console.log('📧 Email:', existingUser.email);
      console.log('🆔 User ID:', existingUser._id);
      console.log('🔑 Current Privileges:', {
        isSaby: existingUser.isSaby,
        isSuper: existingUser.isSuper,
        isOwner: existingUser.isOwner,
      });
      
      // Check if it's already configured correctly
      if (existingUser.isSaby && existingUser.isSuper && existingUser.isOwner) {
        console.log('\n✅ User already has all elevated privileges.');
        console.log('💡 To update password, use: node scripts/updateUserPassword.js');
      } else {
        console.log('\n⚠️  User exists but does not have all privileges.');
        console.log('💡 Updating privileges...');
        existingUser.isSaby = true;
        existingUser.isSuper = true;
        existingUser.isOwner = true;
        await existingUser.save();
        console.log('✅ Privileges updated successfully!');
      }
      
      await mongoose.connection.close();
      process.exit(0);
    }

    // Check for existing SabyUser
    console.log('🔍 Checking for existing SabyUser...');
    const existingSabyUser = await User.findOne({ isSaby: true });
    
    if (existingSabyUser) {
      console.log(`\n⚠️  A SabyUser already exists: ${existingSabyUser.email}`);
      console.log('📋 System only allows one SabyUser at a time.');
      console.log('\n💡 Options:');
      console.log('   1. Demote existing SabyUser to allow this one');
      console.log('   2. Remove unique constraint (run: node scripts/removeUniqueSabyConstraint.js)');
      console.log('\n⚠️  Proceeding will demote the existing SabyUser...\n');
      
      // Demote existing SabyUser (keep as Super and Owner)
      existingSabyUser.isSaby = false;
      await existingSabyUser.save();
      console.log(`✅ Demoted existing SabyUser: ${existingSabyUser.email}`);
      console.log('   (Still has isSuper=true and isOwner=true)\n');
    } else {
      console.log('✅ No existing SabyUser found\n');
    }

    // Generate haloId
    let haloCounter = await HaloCounter.findOneAndUpdate(
      { name: 'halo' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const base36 = haloCounter.seq.toString(36).toUpperCase().padStart(5, '0');
    const haloId = `HL-${base36}`;

    // Generate userId
    const userId = nanoid(10);

    // Generate new tenantId (since user is owner, will create new tenant)
    const tenantId = nanoid(10);

    // Note: Password will be hashed by the pre-save hook in user model
    console.log('✅ Password ready (will be hashed automatically)\n');

    // Create user data
    const userData = {
      userId,
      haloId,
      tenantId,
      email,
      password: password, // Plain password - will be hashed by pre-save hook
      firstname,
      lastname,
      isSaby: true,
      isSuper: true,
      isOwner: true,
      isAgreed: true,
      otpVerified: true,
      isEmailVerified: true,
      status: true,
      isActive: true,
      roles: [],
    };

    console.log('👤 Creating user with the following details:');
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${firstname} ${lastname}`);
    console.log(`   Tenant ID: ${tenantId} (new account)`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Halo ID: ${haloId}`);
    console.log('   Privileges: isSaby, isSuper, isOwner\n');

    // Create user using User.create to leverage pre-save hooks
    console.log('💾 Saving user to database...');
    const user = await User.create(userData);
    console.log('✅ User created successfully!\n');

    // Display results
    console.log('========================================');
    console.log('✅ ELEVATED USER CREATED SUCCESSFULLY');
    console.log('========================================');
    console.log('\n📧 Login Credentials:');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log('\n🆔 User Details:');
    console.log('   User ID:   ', user._id);
    console.log('   User Code: ', user.userId);
    console.log('   Halo ID:   ', user.haloId);
    console.log('   Tenant ID: ', user.tenantId);
    console.log('   Name:      ', `${user.firstname} ${user.lastname}`);
    console.log('\n🔑 Privileges:');
    console.log('   isSaby:  ', user.isSaby ? '✅' : '❌');
    console.log('   isSuper: ', user.isSuper ? '✅' : '❌');
    console.log('   isOwner: ', user.isOwner ? '✅' : '❌');
    console.log('\n🎯 Account Status:');
    console.log('   Status:          ', user.status ? '✅ Active' : '❌ Inactive');
    console.log('   Email Verified:  ', user.isEmailVerified ? '✅' : '❌');
    console.log('   OTP Verified:    ', user.otpVerified ? '✅' : '❌');
    console.log('\n========================================');
    console.log('\n🎉 User created in new account!');
    console.log('🚀 You can now login with these credentials!');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating user:', error);
    console.error('\n📋 Error Details:');
    console.error('   Message:', error.message);
    if (error.code) {
      console.error('   Code:', error.code);
    }
    if (error.keyPattern) {
      console.error('   Duplicate Key:', error.keyPattern);
    }
    
    // If unique constraint error, suggest solution
    if (error.code === 11000 || error.message.includes('unique')) {
      console.error('\n💡 This error is likely due to the unique SabyUser constraint.');
      console.error('   To allow multiple SabyUsers, run:');
      console.error('   node scripts/removeUniqueSabyConstraint.js');
    }
    
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
createMosabyUser();

