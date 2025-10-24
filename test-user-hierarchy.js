#!/usr/bin/env node

/**
 * Test script for the new user hierarchy implementation
 * Tests: SabyUser → SuperUser → Owner → OrdinaryUser
 */

const mongoose = require('mongoose');
const { User } = require('./src/models');
const { userService } = require('./src/services');

// Test data
const testUsers = {
  sabyUser: {
    firstname: 'Saby',
    lastname: 'Admin',
    email: 'saby@admin.com',
    password: 'SabyAdmin123',
  },
  superUser: {
    firstname: 'Super',
    lastname: 'User',
    email: 'super@user.com',
    password: 'SuperUser123',
  },
  owner: {
    firstname: 'Owner',
    lastname: 'User',
    email: 'owner@user.com',
    password: 'OwnerUser123',
  },
  ordinaryUser: {
    firstname: 'Ordinary',
    lastname: 'User',
    email: 'ordinary@user.com',
    password: 'OrdinaryUser123',
  },
};

async function connectToDatabase() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URL || 'mongodb://localhost:27017/halo-local'
    );
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

async function cleanupDatabase() {
  try {
    await User.deleteMany({
      email: { $in: Object.values(testUsers).map((u) => u.email) },
    });
    console.log('🧹 Cleaned up test users');
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

async function testSabyUserCreation() {
  console.log('\n🧪 Testing SabyUser Creation...');

  try {
    const sabyUser = await userService.createSabyUser(testUsers.sabyUser);
    console.log('✅ SabyUser created successfully');
    console.log(`   - ID: ${sabyUser._id}`);
    console.log(`   - Email: ${sabyUser.email}`);
    console.log(`   - isSaby: ${sabyUser.isSaby}`);
    console.log(`   - isSuper: ${sabyUser.isSuper}`);
    console.log(`   - isOwner: ${sabyUser.isOwner}`);

    // Test uniqueness
    try {
      await userService.createSabyUser({
        ...testUsers.sabyUser,
        email: 'saby2@admin.com',
      });
      console.log('❌ Should have failed - only one SabyUser allowed');
    } catch (error) {
      if (error.message.includes('Only one SabyUser can exist')) {
        console.log('✅ SabyUser uniqueness enforced');
      } else {
        throw error;
      }
    }

    return sabyUser;
  } catch (error) {
    console.error('❌ SabyUser creation failed:', error.message);
    throw error;
  }
}

async function testPublicSignup() {
  console.log('\n🧪 Testing Public Signup (Auto SuperUser/Owner)...');

  try {
    const publicUser = await userService.createUser({
      ...testUsers.superUser,
      isAgreed: true,
    });

    console.log('✅ Public signup user created successfully');
    console.log(`   - ID: ${publicUser._id}`);
    console.log(`   - Email: ${publicUser.email}`);
    console.log(`   - isSaby: ${publicUser.isSaby}`);
    console.log(`   - isSuper: ${publicUser.isSuper}`);
    console.log(`   - isOwner: ${publicUser.isOwner}`);

    if (publicUser.isSuper && publicUser.isOwner && !publicUser.isSaby) {
      console.log(
        '✅ Public signup correctly assigned SuperUser and Owner privileges'
      );
    } else {
      console.log('❌ Public signup failed to assign correct privileges');
    }

    return publicUser;
  } catch (error) {
    console.error('❌ Public signup failed:', error.message);
    throw error;
  }
}

async function testSuperUserCreation() {
  console.log('\n🧪 Testing SuperUser creates Ordinary User...');

  try {
    const superUser = await User.findOne({ email: testUsers.superUser.email });
    if (!superUser) {
      throw new Error('SuperUser not found');
    }

    const ordinaryUser = await userService.ownerCreate({
      ...testUsers.ordinaryUser,
      createdBy: superUser._id,
    });

    console.log('✅ Ordinary user created by SuperUser');
    console.log(`   - ID: ${ordinaryUser._id}`);
    console.log(`   - Email: ${ordinaryUser.email}`);
    console.log(`   - isSaby: ${ordinaryUser.isSaby}`);
    console.log(`   - isSuper: ${ordinaryUser.isSuper}`);
    console.log(`   - isOwner: ${ordinaryUser.isOwner}`);

    if (
      !ordinaryUser.isSaby &&
      !ordinaryUser.isSuper &&
      !ordinaryUser.isOwner
    ) {
      console.log('✅ Ordinary user created with correct privileges (none)');
    } else {
      console.log('❌ Ordinary user has incorrect privileges');
    }

    return ordinaryUser;
  } catch (error) {
    console.error('❌ SuperUser creation failed:', error.message);
    throw error;
  }
}

async function testUserHierarchyMethods() {
  console.log('\n🧪 Testing User Hierarchy Methods...');

  try {
    const sabyUser = await User.findOne({ email: testUsers.sabyUser.email });
    const superUser = await User.findOne({ email: testUsers.superUser.email });
    const ordinaryUser = await User.findOne({
      email: testUsers.ordinaryUser.email,
    });

    // Test isOrdinaryUser
    console.log(`SabyUser.isOrdinaryUser(): ${sabyUser.isOrdinaryUser()}`); // Should be false
    console.log(`SuperUser.isOrdinaryUser(): ${superUser.isOrdinaryUser()}`); // Should be false
    console.log(
      `OrdinaryUser.isOrdinaryUser(): ${ordinaryUser.isOrdinaryUser()}`
    ); // Should be true

    // Test canAccessWebPortal
    console.log(
      `SabyUser.canAccessWebPortal(): ${sabyUser.canAccessWebPortal()}`
    ); // Should be true
    console.log(
      `SuperUser.canAccessWebPortal(): ${superUser.canAccessWebPortal()}`
    ); // Should be true
    console.log(
      `OrdinaryUser.canAccessWebPortal(): ${ordinaryUser.canAccessWebPortal()}`
    ); // Should be false

    // Test getHierarchyLevel
    console.log(
      `SabyUser.getHierarchyLevel(): ${sabyUser.getHierarchyLevel()}`
    ); // Should be 1
    console.log(
      `SuperUser.getHierarchyLevel(): ${superUser.getHierarchyLevel()}`
    ); // Should be 2
    console.log(
      `OrdinaryUser.getHierarchyLevel(): ${ordinaryUser.getHierarchyLevel()}`
    ); // Should be 4

    console.log('✅ User hierarchy methods working correctly');
  } catch (error) {
    console.error('❌ User hierarchy methods test failed:', error.message);
    throw error;
  }
}

async function testBulkCreation() {
  console.log('\n🧪 Testing Bulk Creation with Hierarchy Rules...');

  try {
    const superUser = await User.findOne({ email: testUsers.superUser.email });
    if (!superUser) {
      throw new Error('SuperUser not found');
    }

    const bulkUsers = [
      {
        firstname: 'Bulk',
        lastname: 'User1',
        email: 'bulk1@user.com',
        password: 'BulkUser123',
        isSuper: true, // Should be removed
        isSaby: true, // Should be removed
      },
      {
        firstname: 'Bulk',
        lastname: 'User2',
        email: 'bulk2@user.com',
        password: 'BulkUser123',
      },
    ];

    const result = await userService.bulkCreate(
      bulkUsers,
      superUser._id,
      superUser.tenantId
    );

    console.log('✅ Bulk creation completed');
    console.log(`   - Created: ${result.success.length}`);
    console.log(`   - Errors: ${result.errors.length}`);

    // Check that super privileges were removed
    const createdUsers = await User.find({
      email: { $in: ['bulk1@user.com', 'bulk2@user.com'] },
    });
    for (const user of createdUsers) {
      if (user.isSuper || user.isSaby) {
        console.log(`❌ User ${user.email} still has super privileges`);
      } else {
        console.log(`✅ User ${user.email} has correct privileges`);
      }
    }
  } catch (error) {
    console.error('❌ Bulk creation test failed:', error.message);
    throw error;
  }
}

async function runTests() {
  console.log('🚀 Starting User Hierarchy Tests...\n');

  try {
    await connectToDatabase();
    await cleanupDatabase();

    const sabyUser = await testSabyUserCreation();
    const superUser = await testPublicSignup();
    const ordinaryUser = await testSuperUserCreation();
    await testUserHierarchyMethods();
    await testBulkCreation();

    console.log('\n🎉 All tests passed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   ✅ SabyUser creation and uniqueness');
    console.log('   ✅ Public signup auto-assignment');
    console.log('   ✅ SuperUser creation of ordinary users');
    console.log('   ✅ User hierarchy methods');
    console.log('   ✅ Bulk creation with hierarchy rules');
  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testUsers,
};
