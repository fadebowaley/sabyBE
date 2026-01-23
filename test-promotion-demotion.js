#!/usr/bin/env node

/**
 * Test script for bidirectional user privilege promotion/demotion
 * Tests: Promotion and Demotion of SabyUser and Owner privileges
 */

const mongoose = require('mongoose');
const { User } = require('./src/models');
const { userService } = require('./src/services');

const testUsers = {
  sabyUser: {
    firstname: 'Test',
    lastname: 'SabyUser',
    email: 'test.saby@example.com',
    password: 'TestSaby123',
  },
  superUser: {
    firstname: 'Test',
    lastname: 'SuperUser',
    email: 'test.super@example.com',
    password: 'TestSuper123',
  },
  owner: {
    firstname: 'Test',
    lastname: 'Owner',
    email: 'test.owner@example.com',
    password: 'TestOwner123',
  },
  ordinaryUser: {
    firstname: 'Test',
    lastname: 'Ordinary',
    email: 'test.ordinary@example.com',
    password: 'TestOrdinary123',
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
    // Clean up test users and any existing SabyUser
    await User.deleteMany({
      $or: [
        { email: { $in: Object.values(testUsers).map((u) => u.email) } },
        { isSaby: true },
      ],
    });
    console.log('🧹 Cleaned up test users and existing SabyUser');
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

async function createTestUsers() {
  console.log('\n🏗️  Creating test users...');

  try {
    // Create SabyUser
    const sabyUser = await userService.createSabyUser(testUsers.sabyUser);
    console.log(`✅ Created SabyUser: ${sabyUser.email}`);

    // Create SuperUser (public signup)
    const superUser = await userService.createUser({
      ...testUsers.superUser,
      isAgreed: true,
    });
    console.log(`✅ Created SuperUser: ${superUser.email}`);

    // Create Owner under SuperUser
    const owner = await userService.ownerCreate({
      ...testUsers.owner,
      createdBy: superUser._id,
      isOwner: true,
    });
    console.log(`✅ Created Owner: ${owner.email}`);

    // Create OrdinaryUser under SuperUser
    const ordinaryUser = await userService.ownerCreate({
      ...testUsers.ordinaryUser,
      createdBy: superUser._id,
    });
    console.log(`✅ Created OrdinaryUser: ${ordinaryUser.email}`);

    return {
      sabyUser,
      superUser,
      owner,
      ordinaryUser,
    };
  } catch (error) {
    console.error('❌ User creation failed:', error.message);
    throw error;
  }
}

async function testPromoteOrdinaryToOwner(users) {
  console.log('\n🧪 Test 1: Promote OrdinaryUser → Owner');

  try {
    const ordinaryUser = await User.findOne({
      email: testUsers.ordinaryUser.email,
    });

    console.log(
      `Before: isOwner=${ordinaryUser.isOwner}, isSuper=${ordinaryUser.isSuper}, isSaby=${ordinaryUser.isSaby}`
    );

    // SuperUser promotes OrdinaryUser to Owner
    const updated = await userService.updateUserById(
      ordinaryUser._id,
      { isOwner: true },
      users.superUser
    );

    console.log(
      `After: isOwner=${updated.isOwner}, isSuper=${updated.isSuper}, isSaby=${updated.isSaby}`
    );

    if (updated.isOwner && !updated.isSuper && !updated.isSaby) {
      console.log('✅ Promotion to Owner successful');
      return true;
    }
    console.log('❌ Promotion failed - incorrect privileges');
    return false;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testDemoteOwnerToOrdinary(users) {
  console.log('\n🧪 Test 2: Demote Owner → OrdinaryUser');

  try {
    const owner = await User.findOne({ email: testUsers.ordinaryUser.email }); // Now an Owner from previous test

    console.log(
      `Before: isOwner=${owner.isOwner}, isSuper=${owner.isSuper}, isSaby=${owner.isSaby}`
    );

    // SuperUser demotes Owner to OrdinaryUser
    const updated = await userService.updateUserById(
      owner._id,
      { isOwner: false },
      users.superUser
    );

    console.log(
      `After: isOwner=${updated.isOwner}, isSuper=${updated.isSuper}, isSaby=${updated.isSaby}`
    );

    if (!updated.isOwner && !updated.isSuper && !updated.isSaby) {
      console.log('✅ Demotion to OrdinaryUser successful');
      return true;
    }
    console.log('❌ Demotion failed - user still has privileges');
    return false;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testPromoteSuperUserToSabyUser(users) {
  console.log('\n🧪 Test 3: Promote SuperUser → SabyUser');

  try {
    const superUser = await User.findOne({ email: testUsers.superUser.email });

    console.log(
      `Before: isOwner=${superUser.isOwner}, isSuper=${superUser.isSuper}, isSaby=${superUser.isSaby}`
    );

    // SabyUser promotes SuperUser to SabyUser
    const updated = await userService.updateUserById(
      superUser._id,
      { isSaby: true },
      users.sabyUser
    );

    console.log(
      `After: isOwner=${updated.isOwner}, isSuper=${updated.isSuper}, isSaby=${updated.isSaby}`
    );

    if (updated.isSaby && updated.isSuper && updated.isOwner) {
      console.log('✅ Promotion to SabyUser successful');
      return true;
    }
    console.log('❌ Promotion failed - missing required privileges');
    return false;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testDemoteSabyUserToSuperUser(users) {
  console.log('\n🧪 Test 4: Demote SabyUser → SuperUser');

  try {
    const newSabyUser = await User.findOne({
      email: testUsers.superUser.email,
    }); // Now SabyUser from previous test

    console.log(
      `Before: isOwner=${newSabyUser.isOwner}, isSuper=${newSabyUser.isSuper}, isSaby=${newSabyUser.isSaby}`
    );

    // Original SabyUser demotes new SabyUser back to SuperUser
    const updated = await userService.updateUserById(
      newSabyUser._id,
      { isSaby: false },
      users.sabyUser
    );

    console.log(
      `After: isOwner=${updated.isOwner}, isSuper=${updated.isSuper}, isSaby=${updated.isSaby}`
    );

    if (!updated.isSaby && updated.isSuper && updated.isOwner) {
      console.log(
        '✅ Demotion to SuperUser successful (kept isSuper and isOwner)'
      );
      return true;
    }
    console.log('❌ Demotion failed - incorrect privilege state');
    return false;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testSelfModificationPrevention(users) {
  console.log('\n🧪 Test 5: Prevent Self-Modification');

  try {
    // Try to demote self
    await userService.updateUserById(
      users.sabyUser._id,
      { isSaby: false },
      users.sabyUser
    );

    console.log('❌ Should have prevented self-modification');
    return false;
  } catch (error) {
    if (error.message.includes('Cannot modify your own privileges')) {
      console.log('✅ Self-modification correctly prevented');
      return true;
    }
    console.log('❌ Wrong error:', error.message);
    return false;
  }
}

async function testUnauthorizedPromotion(users) {
  console.log('\n🧪 Test 6: Prevent Unauthorized Promotion');

  try {
    const ordinaryUser = await User.findOne({
      email: testUsers.ordinaryUser.email,
    });
    const owner = await User.findOne({ email: testUsers.owner.email });

    // OrdinaryUser tries to promote another user (Owner) - should fail
    await userService.updateUserById(
      owner._id,
      { isOwner: true },
      ordinaryUser // OrdinaryUser trying to modify someone else
    );

    console.log('❌ Should have prevented unauthorized promotion');
    return false;
  } catch (error) {
    if (
      error.message.includes(
        'Only SuperUser or SabyUser can manage Owner privileges'
      )
    ) {
      console.log('✅ Unauthorized promotion correctly prevented');
      return true;
    }
    console.log('❌ Wrong error:', error.message);
    return false;
  }
}

async function testDuplicateSabyUserPrevention(users) {
  console.log('\n🧪 Test 7: Prevent Duplicate SabyUser');

  try {
    const owner = await User.findOne({ email: testUsers.owner.email });

    // Try to create second SabyUser
    await userService.updateUserById(
      owner._id,
      { isSaby: true },
      users.sabyUser
    );

    console.log('❌ Should have prevented duplicate SabyUser');
    return false;
  } catch (error) {
    if (error.message.includes('Only one SabyUser can exist')) {
      console.log('✅ Duplicate SabyUser correctly prevented');
      return true;
    }
    console.log('❌ Wrong error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Promotion/Demotion Tests...\n');

  try {
    await connectToDatabase();
    await cleanupDatabase();

    const users = await createTestUsers();

    const results = [];

    // Run all tests in logical order
    results.push(await testPromoteOrdinaryToOwner(users)); // Test 1
    results.push(await testDemoteOwnerToOrdinary(users)); // Test 2
    results.push(await testSelfModificationPrevention(users)); // Test 5
    results.push(await testUnauthorizedPromotion(users)); // Test 6
    results.push(await testDuplicateSabyUserPrevention(users)); // Test 7

    // Tests 3 and 4 require testing with different approach
    // We'll use Test 3 to promote SuperUser (should fail due to existing SabyUser)
    // Then manually promote after removing original SabyUser

    console.log('\n🔄 Setting up for SabyUser promotion test...');
    // First, remove the original SabyUser to allow new one
    await User.deleteOne({ email: testUsers.sabyUser.email });
    console.log('   Removed original SabyUser for testing promotion');

    // Now run Test 3 (promote SuperUser to SabyUser - should succeed)
    results.push(
      await testPromoteSuperUserToSabyUser({
        ...users,
        sabyUser: users.superUser,
      })
    ); // Test 3

    // Reload the newly promoted SabyUser
    const newSabyUser = await User.findOne({
      email: testUsers.superUser.email,
    });

    // Now run Test 4 (demote the new SabyUser back to SuperUser)
    // For demotion, we need another SabyUser to perform it, so create temp one
    const tempSaby = await userService.createSabyUser({
      firstname: 'Temp',
      lastname: 'Saby',
      email: 'temp.saby@example.com',
      password: 'TempSaby123',
    });
    console.log('   Created temporary SabyUser to perform demotion');

    // First demote the test SabyUser
    await User.deleteOne({ email: testUsers.sabyUser.email }); // Remove if exists
    const reloadedNewSaby = await User.findOne({
      email: testUsers.superUser.email,
    });
    await userService.updateUserById(
      reloadedNewSaby._id,
      { isSaby: false },
      tempSaby
    );

    results.push(
      await testDemoteSabyUserToSuperUser({ ...users, sabyUser: tempSaby })
    ); // Test 4

    const passed = results.filter((r) => r === true).length;
    const failed = results.filter((r) => r === false).length;

    console.log(`\n${'='.repeat(50)}`);
    console.log('📊 Test Results');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${passed}/7`);
    console.log(`❌ Failed: ${failed}/7`);

    if (failed === 0) {
      console.log('\n🎉 All tests passed successfully!');
      console.log('\n✅ Bidirectional Promotion/Demotion System Working');
      console.log('   - OrdinaryUser ↔ Owner');
      console.log('   - SuperUser ↔ SabyUser');
      console.log('   - Authorization enforced');
      console.log('   - Self-modification prevented');
      console.log('   - Duplicate SabyUser prevented');
    } else {
      console.log('\n❌ Some tests failed. Please review the errors above.');
      process.exit(1);
    }
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
};
