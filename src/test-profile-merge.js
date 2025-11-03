/**
 * Test Script: User & Node Profile Merge CRUD Operations
 *
 * This script tests all CRUD operations for User and Node models
 * with their merged profile fields to ensure the migration was successful.
 *
 * Run: node src/test-profile-merge.js
 */

const mongoose = require('mongoose');
const User = require('./models/user.model');
const Node = require('./models/node.model');
const Level = require('./models/level.model');
const Structure = require('./models/structure.model');
const config = require('./config/config');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  test: (msg) => console.log(`${colors.magenta}🧪 ${msg}${colors.reset}`),
  section: (msg) =>
    console.log(
      `\n${colors.yellow}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${
        colors.reset
      }`
    ),
};

// Test data
let testUser = null;
let testNode = null;
let testTenantId = null;

// Statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
};

/**
 * Run a test and track results
 */
async function runTest(testName, testFn) {
  stats.total++;
  log.test(`Running: ${testName}`);

  try {
    await testFn();
    stats.passed++;
    log.success(`PASSED: ${testName}`);
    return true;
  } catch (error) {
    stats.failed++;
    stats.errors.push({ test: testName, error: error.message });
    log.error(`FAILED: ${testName}`);
    log.error(`Error: ${error.message}`);
    return false;
  }
}

/**
 * Assert helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    log.success('Connected to MongoDB');
  } catch (error) {
    log.error('Failed to connect to MongoDB');
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDB() {
  try {
    await mongoose.disconnect();
    log.success('Disconnected from MongoDB');
  } catch (error) {
    log.error('Failed to disconnect from MongoDB');
    throw error;
  }
}

/**
 * USER CRUD TESTS
 */

async function testUserCreate() {
  // Find an existing tenant with level and structure for Node tests
  const level = await Level.findOne({});
  if (level) {
    testTenantId = level.tenantId;
    log.info(
      `Using existing tenant: ${testTenantId} (for Node tests compatibility)`
    );
  }

  const userData = {
    firstname: 'Test',
    lastname: 'User',
    email: `test.user.${Date.now()}@example.com`,
    password: 'Password123',
    phoneNumber: '+2348012345678',
    isOwner: false, // Not an owner, created under existing tenant
    createdBy: testTenantId
      ? await User.findOne({ tenantId: testTenantId }).then((u) => u?._id)
      : null,
  };

  // If we have a tenantId, create user under that tenant
  if (testTenantId && userData.createdBy) {
    userData.tenantId = testTenantId;
    testUser = await User.create(userData);
  } else {
    // Otherwise create as owner (new tenant)
    userData.isOwner = true;
    userData.isSuper = true;
    delete userData.createdBy;
    testUser = await User.createUser(userData);
    testTenantId = testUser.tenantId;
  }

  assert(testUser, 'User should be created');
  assert(testUser.firstname === 'Test', 'Firstname should match');
  assert(testUser.lastname === 'User', 'Lastname should match');
  assert(testUser.tenantId, 'User should have tenantId');

  log.info(
    `Created user: ${testUser.email} (ID: ${testUser._id}, Tenant: ${testTenantId})`
  );
}

async function testUserRead() {
  const user = await User.findById(testUser._id);

  assert(user, 'User should be found');
  assert(
    user._id.toString() === testUser._id.toString(),
    'User ID should match'
  );
  assert(user.email === testUser.email, 'Email should match');

  log.info(`Read user: ${user.email}`);
}

async function testUserUpdateBasicFields() {
  const updatedUser = await User.findByIdAndUpdate(
    testUser._id,
    {
      firstname: 'Updated',
      lastname: 'Name',
    },
    { new: true }
  );

  assert(updatedUser.firstname === 'Updated', 'Firstname should be updated');
  assert(updatedUser.lastname === 'Name', 'Lastname should be updated');

  log.info(
    `Updated user basic fields: ${updatedUser.firstname} ${updatedUser.lastname}`
  );
}

async function testUserUpdateProfileNested() {
  const updatedUser = await User.findByIdAndUpdate(
    testUser._id,
    {
      profile: {
        title: 'Dr.',
        gender: 'Male',
        dateOfBirth: new Date('1990-01-01'),
        maritalStatus: 'Single',
        stateOfOrigin: 'Lagos',
        lgaOfOrigin: 'Ikeja',
        homeTown: 'Lagos',
        residentialAddress: '123 Test Street',
        stateOfResidence: 'Lagos',
        lgaOfResidence: 'Ikeja',
        occupation: 'Software Engineer',
        employmentCategory: 'Full-time',
        highestQualification: 'BSc Computer Science',
        professional: 'Engineer',
        nextOfKin: {
          name: 'Jane Doe',
          phoneNumber: '+2348087654321',
          relationship: 'Sister',
        },
      },
    },
    { new: true }
  );

  assert(updatedUser.profile, 'Profile should exist');
  assert(updatedUser.profile.title === 'Dr.', 'Title should be set');
  assert(updatedUser.profile.gender === 'Male', 'Gender should be set');
  assert(
    updatedUser.profile.stateOfOrigin === 'Lagos',
    'State of origin should be set'
  );
  assert(
    updatedUser.profile.occupation === 'Software Engineer',
    'Occupation should be set'
  );
  assert(updatedUser.profile.nextOfKin, 'Next of kin should exist');
  assert(
    updatedUser.profile.nextOfKin.name === 'Jane Doe',
    'Next of kin name should be set'
  );

  log.info(
    `Updated user profile (nested): ${JSON.stringify(
      updatedUser.profile,
      null,
      2
    )}`
  );
}

async function testUserUpdateProfileFlat() {
  const updatedUser = await User.findByIdAndUpdate(
    testUser._id,
    {
      'profile.title': 'Prof.',
      'profile.occupation': 'Professor',
    },
    { new: true }
  );

  assert(
    updatedUser.profile.title === 'Prof.',
    'Title should be updated (flat)'
  );
  assert(
    updatedUser.profile.occupation === 'Professor',
    'Occupation should be updated (flat)'
  );

  log.info(
    `Updated user profile (flat): Title=${updatedUser.profile.title}, Occupation=${updatedUser.profile.occupation}`
  );
}

async function testUserReadWithProfile() {
  const user = await User.findById(testUser._id);

  assert(user, 'User should be found');
  assert(user.profile, 'Profile should exist');
  assert(user.profile.title === 'Prof.', 'Profile title should persist');
  assert(user.profile.gender === 'Male', 'Profile gender should persist');
  assert(
    user.profile.occupation === 'Professor',
    'Profile occupation should persist'
  );

  log.info(`User with profile: ${user.email}, Title: ${user.profile.title}`);
}

async function testUserDelete() {
  await User.findByIdAndDelete(testUser._id);
  const deletedUser = await User.findById(testUser._id);

  assert(!deletedUser, 'User should be deleted');

  log.info('User deleted successfully');
}

/**
 * NODE CRUD TESTS
 */

async function testNodeCreate() {
  // Fetch existing level and structure from the database
  const level = await Level.findOne({ tenantId: testTenantId });
  const structure = await Structure.findOne({ tenantId: testTenantId });

  if (!level || !structure) {
    throw new Error(
      'No existing Level or Structure found. Node tests require pre-existing Level and Structure in the database. ' +
        'Please create a Level and Structure through the UI first, or use an existing tenant with data.'
    );
  }

  log.info(`Using existing level: ${level.name} (ID: ${level._id})`);
  log.info(
    `Using existing structure: ${structure.name} (ID: ${structure._id})`
  );

  const nodeData = {
    name: 'Test Church Profile Merge',
    tenantId: testTenantId,
    level: level._id,
    structure: structure._id,
    address: '456 Church Street',
    city: 'Lagos',
    state: 'Lagos',
    country: 'NG',
    postalCode: '100001',
  };

  testNode = await Node.create(nodeData);

  assert(testNode, 'Node should be created');
  assert(
    testNode.name === 'Test Church Profile Merge',
    'Node name should match'
  );
  assert(testNode.tenantId === testTenantId, 'TenantId should match');
  assert(testNode.nodeId, 'Node should have nodeId');

  log.info(`Created node: ${testNode.name} (ID: ${testNode._id})`);
}

async function testNodeRead() {
  const node = await Node.findById(testNode._id);

  assert(node, 'Node should be found');
  assert(
    node._id.toString() === testNode._id.toString(),
    'Node ID should match'
  );
  assert(node.name === testNode.name, 'Node name should match');

  log.info(`Read node: ${node.name}`);
}

async function testNodeUpdateBasicFields() {
  const updatedNode = await Node.findByIdAndUpdate(
    testNode._id,
    {
      name: 'Updated Church Name',
      city: 'Abuja',
    },
    { new: true }
  );

  assert(
    updatedNode.name === 'Updated Church Name',
    'Node name should be updated'
  );
  assert(updatedNode.city === 'Abuja', 'City should be updated');

  log.info(
    `Updated node basic fields: ${updatedNode.name}, ${updatedNode.city}`
  );
}

async function testNodeUpdateProfileNested() {
  const updatedNode = await Node.findByIdAndUpdate(
    testNode._id,
    {
      profile: {
        propertyStatus: 'Owned',
        estimatedValue: 500000000,
        buildingType: 'Auditorium',
        facilityStatus: 'Active',
      },
    },
    { new: true }
  );

  assert(updatedNode.profile, 'Profile should exist');
  assert(
    updatedNode.profile.propertyStatus === 'Owned',
    'Property status should be set'
  );
  assert(
    updatedNode.profile.estimatedValue.toString() === '500000000',
    'Estimated value should be set'
  );
  assert(
    updatedNode.profile.buildingType === 'Auditorium',
    'Building type should be set'
  );
  assert(
    updatedNode.profile.facilityStatus === 'Active',
    'Facility status should be set'
  );

  log.info(
    `Updated node profile (nested): ${JSON.stringify(
      updatedNode.profile,
      null,
      2
    )}`
  );
}

async function testNodeUpdateProfileFlat() {
  const updatedNode = await Node.findByIdAndUpdate(
    testNode._id,
    {
      'profile.propertyStatus': 'Rented',
      'profile.buildingType': 'Hall',
    },
    { new: true }
  );

  assert(
    updatedNode.profile.propertyStatus === 'Rented',
    'Property status should be updated (flat)'
  );
  assert(
    updatedNode.profile.buildingType === 'Hall',
    'Building type should be updated (flat)'
  );

  log.info(
    `Updated node profile (flat): PropertyStatus=${updatedNode.profile.propertyStatus}, BuildingType=${updatedNode.profile.buildingType}`
  );
}

async function testNodeReadWithProfile() {
  const node = await Node.findById(testNode._id);

  assert(node, 'Node should be found');
  assert(node.profile, 'Profile should exist');
  assert(
    node.profile.propertyStatus === 'Rented',
    'Profile property status should persist'
  );
  assert(
    node.profile.buildingType === 'Hall',
    'Profile building type should persist'
  );
  assert(
    node.profile.facilityStatus === 'Active',
    'Profile facility status should persist'
  );

  log.info(
    `Node with profile: ${node.name}, Property: ${node.profile.propertyStatus}`
  );
}

async function testNodeDelete() {
  await Node.findByIdAndDelete(testNode._id);
  const deletedNode = await Node.findById(testNode._id);

  assert(!deletedNode, 'Node should be deleted');

  log.info('Node deleted successfully');
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n');
  log.section('🚀 STARTING PROFILE MERGE CRUD TESTS');

  try {
    await connectDB();

    // USER TESTS
    log.section('👤 USER CRUD TESTS');
    await runTest('User Create', testUserCreate);
    await runTest('User Read', testUserRead);
    await runTest('User Update - Basic Fields', testUserUpdateBasicFields);
    await runTest(
      'User Update - Profile (Nested)',
      testUserUpdateProfileNested
    );
    await runTest('User Update - Profile (Flat)', testUserUpdateProfileFlat);
    await runTest('User Read - With Profile', testUserReadWithProfile);
    await runTest('User Delete', testUserDelete);

    // NODE TESTS
    log.section('🏛️  NODE CRUD TESTS');
    await runTest('Node Create', testNodeCreate);
    await runTest('Node Read', testNodeRead);
    await runTest('Node Update - Basic Fields', testNodeUpdateBasicFields);
    await runTest(
      'Node Update - Profile (Nested)',
      testNodeUpdateProfileNested
    );
    await runTest('Node Update - Profile (Flat)', testNodeUpdateProfileFlat);
    await runTest('Node Read - With Profile', testNodeReadWithProfile);
    await runTest('Node Delete', testNodeDelete);
  } catch (error) {
    log.error('Test suite failed with error:');
    console.error(error);
  } finally {
    await disconnectDB();
  }

  // Print summary
  log.section('📊 TEST SUMMARY');
  console.log(`Total Tests: ${stats.total}`);
  console.log(`${colors.green}Passed: ${stats.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${stats.failed}${colors.reset}`);
  console.log(
    `Success Rate: ${((stats.passed / stats.total) * 100).toFixed(2)}%`
  );

  if (stats.errors.length > 0) {
    log.section('❌ FAILED TESTS');
    stats.errors.forEach(({ test, error }, index) => {
      console.log(`${index + 1}. ${test}`);
      console.log(`   ${colors.red}${error}${colors.reset}`);
    });
  }

  // Exit with appropriate code
  process.exit(stats.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((error) => {
  log.error('Fatal error running tests:');
  console.error(error);
  process.exit(1);
});
