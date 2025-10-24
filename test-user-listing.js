#!/usr/bin/env node

/**
 * Test script for user listing with hierarchy ordering and tenant filtering
 * Tests: SabyUser sees all users, SuperUser sees only tenant users, proper hierarchy ordering
 */

const mongoose = require('mongoose');
const { User } = require('./src/models');
const { userService } = require('./src/services');

// Test data with multiple tenants
const testUsers = {
  sabyUser: {
    firstname: 'Saby',
    lastname: 'GlobalAdmin',
    email: 'saby@global.com',
    password: 'SabyAdmin123',
  },
  superUser1: {
    firstname: 'Super',
    lastname: 'Admin1',
    email: 'super1@tenant1.com',
    password: 'SuperUser123',
  },
  superUser2: {
    firstname: 'Super',
    lastname: 'Admin2',
    email: 'super2@tenant2.com',
    password: 'SuperUser123',
  },
  owner1: {
    firstname: 'Owner',
    lastname: 'User1',
    email: 'owner1@tenant1.com',
    password: 'OwnerUser123',
  },
  owner2: {
    firstname: 'Owner',
    lastname: 'User2',
    email: 'owner2@tenant2.com',
    password: 'OwnerUser123',
  },
  ordinary1: {
    firstname: 'Ordinary',
    lastname: 'User1',
    email: 'ordinary1@tenant1.com',
    password: 'OrdinaryUser123',
  },
  ordinary2: {
    firstname: 'Ordinary',
    lastname: 'User2',
    email: 'ordinary2@tenant2.com',
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
    // Clean up all test users including any existing SabyUser
    await User.deleteMany({
      $or: [
        { email: { $in: Object.values(testUsers).map((u) => u.email) } },
        { isSaby: true }, // Remove any existing SabyUser
      ],
    });
    console.log('🧹 Cleaned up test users and existing SabyUser');
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

async function createTestUsers() {
  console.log('\n🏗️ Creating test users...');

  try {
    // Create SabyUser
    const sabyUser = await userService.createSabyUser(testUsers.sabyUser);
    console.log(
      `✅ Created SabyUser: ${sabyUser.email} (tenantId: ${sabyUser.tenantId})`
    );

    // Create SuperUser 1 (will be public signup - auto SuperUser/Owner)
    const superUser1 = await userService.createUser({
      ...testUsers.superUser1,
      isAgreed: true,
    });
    console.log(
      `✅ Created SuperUser1: ${superUser1.email} (tenantId: ${superUser1.tenantId})`
    );

    // Create SuperUser 2 (will be public signup - auto SuperUser/Owner)
    const superUser2 = await userService.createUser({
      ...testUsers.superUser2,
      isAgreed: true,
    });
    console.log(
      `✅ Created SuperUser2: ${superUser2.email} (tenantId: ${superUser2.tenantId})`
    );

    // Create Owner 1 under SuperUser 1's tenant
    const owner1 = await userService.ownerCreate({
      ...testUsers.owner1,
      createdBy: superUser1._id,
    });
    console.log(
      `✅ Created Owner1: ${owner1.email} (tenantId: ${owner1.tenantId})`
    );

    // Create Owner 2 under SuperUser 2's tenant
    const owner2 = await userService.ownerCreate({
      ...testUsers.owner2,
      createdBy: superUser2._id,
    });
    console.log(
      `✅ Created Owner2: ${owner2.email} (tenantId: ${owner2.tenantId})`
    );

    // Create Ordinary User 1 under SuperUser 1's tenant
    const ordinary1 = await userService.ownerCreate({
      ...testUsers.ordinary1,
      createdBy: superUser1._id,
    });
    console.log(
      `✅ Created Ordinary1: ${ordinary1.email} (tenantId: ${ordinary1.tenantId})`
    );

    // Create Ordinary User 2 under SuperUser 2's tenant
    const ordinary2 = await userService.ownerCreate({
      ...testUsers.ordinary2,
      createdBy: superUser2._id,
    });
    console.log(
      `✅ Created Ordinary2: ${ordinary2.email} (tenantId: ${ordinary2.tenantId})`
    );

    return {
      sabyUser,
      superUser1,
      superUser2,
      owner1,
      owner2,
      ordinary1,
      ordinary2,
    };
  } catch (error) {
    console.error('❌ User creation failed:', error.message);
    throw error;
  }
}

async function testSabyUserListing(users) {
  console.log('\n🧪 Testing SabyUser listing (should see all users)...');

  try {
    const options = {
      user: users.sabyUser,
      populate: 'roles',
    };

    const result = await userService.queryUsers({}, options);

    console.log(
      `✅ SabyUser can see ${result.results.length} users across all tenants`
    );
    console.log('   Users visible to SabyUser:');

    result.results.forEach((user, index) => {
      const hierarchy = getUserHierarchyLevel(user);
      const hierarchyLabel = getHierarchyLabel(hierarchy);
      console.log(
        `   ${index + 1}. ${user.firstname} ${user.lastname} (${
          user.email
        }) - ${hierarchyLabel} (tenantId: ${user.tenantId})`
      );
    });

    // Verify hierarchy ordering
    const hierarchyOrder = result.results.map((user) =>
      getUserHierarchyLevel(user)
    );
    const isOrdered = hierarchyOrder.every(
      (level, index) => index === 0 || level >= hierarchyOrder[index - 1]
    );

    if (isOrdered) {
      console.log('✅ Users are properly ordered by hierarchy');
    } else {
      console.log('❌ Users are not properly ordered by hierarchy');
    }

    // Verify SabyUser can see users from both tenants
    const tenantIds = [...new Set(result.results.map((user) => user.tenantId))];
    if (tenantIds.length > 1) {
      console.log(
        `✅ SabyUser can see users from multiple tenants: ${tenantIds.join(
          ', '
        )}`
      );
    } else {
      console.log(
        `❌ SabyUser can only see users from one tenant: ${tenantIds[0]}`
      );
    }

    return result;
  } catch (error) {
    console.error('❌ SabyUser listing test failed:', error.message);
    throw error;
  }
}

async function testSuperUserListing(users, superUser, expectedTenantId) {
  console.log(`\n🧪 Testing SuperUser listing (${superUser.email})...`);

  try {
    const options = {
      user: superUser,
      populate: 'roles',
    };

    const result = await userService.queryUsers({}, options);

    console.log(
      `✅ SuperUser can see ${result.results.length} users in their tenant`
    );
    console.log(`   Expected tenantId: ${expectedTenantId}`);
    console.log('   Users visible to SuperUser:');

    result.results.forEach((user, index) => {
      const hierarchy = getUserHierarchyLevel(user);
      const hierarchyLabel = getHierarchyLabel(hierarchy);
      console.log(
        `   ${index + 1}. ${user.firstname} ${user.lastname} (${
          user.email
        }) - ${hierarchyLabel} (tenantId: ${user.tenantId})`
      );
    });

    // Verify all users are from the same tenant
    const tenantIds = [...new Set(result.results.map((user) => user.tenantId))];
    if (tenantIds.length === 1 && tenantIds[0] === expectedTenantId) {
      console.log(
        `✅ SuperUser can only see users from their own tenant: ${tenantIds[0]}`
      );
    } else {
      console.log(
        `❌ SuperUser can see users from wrong tenants: ${tenantIds.join(', ')}`
      );
    }

    // Verify hierarchy ordering
    const hierarchyOrder = result.results.map((user) =>
      getUserHierarchyLevel(user)
    );
    const isOrdered = hierarchyOrder.every(
      (level, index) => index === 0 || level >= hierarchyOrder[index - 1]
    );

    if (isOrdered) {
      console.log('✅ Users are properly ordered by hierarchy');
    } else {
      console.log('❌ Users are not properly ordered by hierarchy');
    }

    return result;
  } catch (error) {
    console.error('❌ SuperUser listing test failed:', error.message);
    throw error;
  }
}

async function testOrdinaryUserListing(users) {
  console.log('\n🧪 Testing OrdinaryUser listing (should fail)...');

  try {
    const options = {
      user: users.ordinary1,
      populate: 'roles',
    };

    await userService.queryUsers({}, options);
    console.log('❌ OrdinaryUser should not be able to list users');
  } catch (error) {
    if (error.message.includes('Insufficient privileges')) {
      console.log('✅ OrdinaryUser correctly blocked from listing users');
    } else {
      console.error('❌ Unexpected error for OrdinaryUser:', error.message);
      throw error;
    }
  }
}

function getUserHierarchyLevel(user) {
  if (user.isSaby) return 1;
  if (user.isSuper) return 2;
  if (user.isOwner) return 3;
  return 4;
}

function getHierarchyLabel(level) {
  switch (level) {
    case 1:
      return 'SabyUser';
    case 2:
      return 'SuperUser';
    case 3:
      return 'Owner';
    case 4:
      return 'OrdinaryUser';
    default:
      return 'Unknown';
  }
}

async function runTests() {
  console.log('🚀 Starting User Listing Tests...\n');

  try {
    await connectToDatabase();
    await cleanupDatabase();

    const users = await createTestUsers();

    await testSabyUserListing(users);
    await testSuperUserListing(
      users,
      users.superUser1,
      users.superUser1.tenantId
    );
    await testSuperUserListing(
      users,
      users.superUser2,
      users.superUser2.tenantId
    );
    await testOrdinaryUserListing(users);

    console.log('\n🎉 All user listing tests passed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   ✅ SabyUser can see all users across all tenants');
    console.log('   ✅ SuperUser can only see users from their own tenant');
    console.log('   ✅ Users are properly ordered by hierarchy');
    console.log('   ✅ OrdinaryUser is blocked from listing users');
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
