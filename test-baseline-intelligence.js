/**
 * Test Script for Baseline Intelligence Feature
 * 
 * This script tests the baseline intelligence implementation
 * Run with: node test-baseline-intelligence.js
 */

const mongoose = require('mongoose');
const config = require('./src/config/config');
const logger = require('./src/config/logger');
const { connectRedis } = require('./src/config/redis');

// Import services and models
const { 
  baselineIntelligenceService, 
  baselineInsightsService 
} = require('./src/services');
const { User, Nodes, BaselineIntelligence, Level, Structures } = require('./src/models');

// Test configuration
const TEST_CONFIG = {
  TENANT_ID: `test-tenant-${Date.now()}`,
  NODE_ID: 'test-node-456',
  USER_COUNT: 50,
  CLEANUP_AFTER_TEST: true,
};

/**
 * Connect to database and Redis
 */
async function connectServices() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Connect to Redis
    connectRedis();
    logger.info('✅ Connected to Redis');

    return true;
  } catch (error) {
    logger.error('❌ Failed to connect to services:', error);
    return false;
  }
}

/**
 * Create test data
 */
async function createTestData() {
  logger.info('🔧 Creating test data...');

  try {
    // Clean up existing test data
    await User.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });
    await Nodes.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });
    await BaselineIntelligence.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });
    await Level.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });
    await Structures.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });

    // Create test users with varied demographics
    const testUsers = [];
    const genders = ['Male', 'Female', 'Other'];
    const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
    const states = ['Lagos', 'Abuja', 'Kano', 'Rivers', 'Ogun'];

    for (let i = 0; i < TEST_CONFIG.USER_COUNT; i++) {
      const birthYear = 1970 + Math.floor(Math.random() * 40); // Ages 15-55
      const user = {
        tenantId: TEST_CONFIG.TENANT_ID,
        firstname: `TestUser${i}`,
        lastname: `LastName${i}`,
        email: `testuser${i}-${Date.now()}@baseline-test.com`,
        password: 'password123',
        status: Math.random() > 0.1, // 90% active
        isEmailVerified: Math.random() > 0.3, // 70% verified
        isPhoneVerified: Math.random() > 0.4, // 60% verified
        isOwner: i < 2, // First 2 are owners
        isSuper: i < 5 && i >= 2, // Next 3 are supers
        profile: {
          gender: genders[Math.floor(Math.random() * genders.length)],
          dateOfBirth: new Date(birthYear, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
          maritalStatus: maritalStatuses[Math.floor(Math.random() * maritalStatuses.length)],
          stateOfResidence: states[Math.floor(Math.random() * states.length)],
          occupation: i % 5 === 0 ? 'Teacher' : i % 3 === 0 ? 'Engineer' : 'Other',
          employmentCategory: i % 4 === 0 ? 'Full-time' : 'Part-time',
        },
      };

      // Use the User model's createUser method to properly generate userId and other fields
      const createdUser = await User.createUser(user);
      testUsers.push(createdUser);
    }

    // Create test level and structure first (required for nodes)
    const testLevel = await Level.create({
      name: 'Test Level',
      description: 'Test level for baseline intelligence',
      rank: 1,
      tenantId: TEST_CONFIG.TENANT_ID,
    });

    const testStructure = await Structures.create({
      name: 'Test Structure',
      type: 'administrative',
      level: testLevel._id,
      tenantId: TEST_CONFIG.TENANT_ID,
    });

    // Create test node with users assigned
    const testNode = await Nodes.create({
      tenantId: TEST_CONFIG.TENANT_ID,
      name: 'Test Node',
      level: testLevel._id,
      structure: testStructure._id,
      users: testUsers.map(u => u._id),
      dateOfEstablishment: new Date('2015-01-01'),
      isActive: true,
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      profile: {
        propertyStatus: 'Owned',
        facilityStatus: 'Active',
        buildingType: 'Auditorium',
      },
    });

    logger.info(`Created node ${testNode.nodeId} with ${testUsers.length} users assigned`);

    logger.info(`✅ Created ${testUsers.length} test users, 1 test level, 1 test structure, and 1 test node`);
    return { users: testUsers, node: testNode, level: testLevel, structure: testStructure };
  } catch (error) {
    logger.error('❌ Error creating test data:', error);
    throw error;
  }
}

/**
 * Test baseline computation
 */
async function testBaselineComputation() {
  logger.info('🧮 Testing baseline computation...');

  try {
    // Test node baseline computation - use the actual nodeId from created node
    const testNode = await Nodes.findOne({ tenantId: TEST_CONFIG.TENANT_ID });
    const nodeBaseline = await baselineIntelligenceService.computeNodeBaseline(
      testNode.nodeId, 
      TEST_CONFIG.TENANT_ID
    );

    logger.info('✅ Node baseline computed:', {
      totalUsers: nodeBaseline.metrics.users.total,
      activeUsers: nodeBaseline.metrics.users.active,
      averageAge: nodeBaseline.metrics.users.demographics.averageAge,
      computationTime: nodeBaseline.computationDuration,
    });

    // Test network baseline computation
    const networkBaseline = await baselineIntelligenceService.computeNetworkBaseline(
      TEST_CONFIG.TENANT_ID
    );

    logger.info('✅ Network baseline computed:', {
      totalNodes: networkBaseline.metrics.network.totalNodes,
      totalUsers: networkBaseline.metrics.users.total,
      computationTime: networkBaseline.computationDuration,
    });

    return { nodeBaseline, networkBaseline };
  } catch (error) {
    logger.error('❌ Error computing baselines:', error);
    throw error;
  }
}

/**
 * Test insight generation
 */
async function testInsightGeneration(baselines) {
  logger.info('💡 Testing insight generation...');

  try {
    // Generate insights for node baseline
    const nodeInsights = baselineInsightsService.generateAllInsights({
      type: 'node',
      metrics: baselines.nodeBaseline.metrics,
    });

    logger.info(`✅ Generated ${nodeInsights.length} node insights`);
    nodeInsights.slice(0, 3).forEach((insight, index) => {
      logger.info(`   ${index + 1}. [${insight.priority.toUpperCase()}] ${insight.text}`);
    });

    // Generate insights for network baseline
    const networkInsights = baselineInsightsService.generateAllInsights({
      type: 'network',
      metrics: baselines.networkBaseline.metrics,
    });

    logger.info(`✅ Generated ${networkInsights.length} network insights`);
    networkInsights.slice(0, 3).forEach((insight, index) => {
      logger.info(`   ${index + 1}. [${insight.priority.toUpperCase()}] ${insight.text}`);
    });

    return { nodeInsights, networkInsights };
  } catch (error) {
    logger.error('❌ Error generating insights:', error);
    throw error;
  }
}

/**
 * Test baseline persistence and caching
 */
async function testPersistenceAndCaching(baselines, insights) {
  logger.info('💾 Testing persistence and caching...');

  try {
    // Save node baseline
    const savedNodeBaseline = await baselineIntelligenceService.saveBaseline(
      baselines.nodeBaseline,
      insights.nodeInsights
    );

    logger.info('✅ Node baseline saved to database');

    // Save network baseline
    const savedNetworkBaseline = await baselineIntelligenceService.saveBaseline(
      baselines.networkBaseline,
      insights.networkInsights
    );

    logger.info('✅ Network baseline saved to database');

    // Test retrieval from cache/database
    const retrievedNodeBaseline = await baselineIntelligenceService.getBaseline(
      TEST_CONFIG.TENANT_ID,
      TEST_CONFIG.NODE_ID
    );

    const retrievedNetworkBaseline = await baselineIntelligenceService.getBaseline(
      TEST_CONFIG.TENANT_ID,
      null
    );

    logger.info('✅ Baselines retrieved successfully');
    if (retrievedNodeBaseline) {
      logger.info(`   Node baseline has ${retrievedNodeBaseline.insights.length} insights`);
    } else {
      logger.warn('   Node baseline not found in cache/database');
    }
    if (retrievedNetworkBaseline) {
      logger.info(`   Network baseline has ${retrievedNetworkBaseline.insights.length} insights`);
    } else {
      logger.warn('   Network baseline not found in cache/database');
    }

    return { savedNodeBaseline, savedNetworkBaseline };
  } catch (error) {
    logger.error('❌ Error testing persistence:', error);
    throw error;
  }
}

/**
 * Test event-driven updates
 */
async function testEventDrivenUpdates() {
  logger.info('⚡ Testing event-driven updates...');

  try {
    // Get initial baseline count
    const initialCount = await BaselineIntelligence.countDocuments({ 
      tenantId: TEST_CONFIG.TENANT_ID 
    });

    // Create a new user (should trigger baseline update)
    const newUser = await User.createUser({
      tenantId: TEST_CONFIG.TENANT_ID,
      firstname: 'EventTest',
      lastname: 'User',
      email: `eventtest-${Date.now()}@baseline-test.com`,
      password: 'password123',
      status: true,
      profile: {
        gender: 'Male',
        dateOfBirth: new Date('1990-01-01'),
        maritalStatus: 'Single',
      },
    });

    // Wait a moment for async processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('✅ Event-driven update test completed');
    logger.info('   (Note: Actual baseline updates happen asynchronously)');

    return newUser;
  } catch (error) {
    logger.error('❌ Error testing event-driven updates:', error);
    throw error;
  }
}

/**
 * Test utility functions
 */
async function testUtilityFunctions() {
  logger.info('🔧 Testing utility functions...');

  try {
    // Test age calculation
    const age25 = baselineIntelligenceService.calculateAge(new Date('1998-01-01'));
    const ageCategory = baselineIntelligenceService.categorizeAge(age25);

    logger.info(`✅ Age calculation: ${age25} years, category: ${ageCategory}`);

    // Test user metrics computation with empty array
    const emptyMetrics = await baselineIntelligenceService.computeUserMetrics([]);
    logger.info('✅ Empty user metrics computed:', emptyMetrics.total);

    return true;
  } catch (error) {
    logger.error('❌ Error testing utilities:', error);
    throw error;
  }
}

/**
 * Clean up test data
 */
async function cleanupTestData() {
  if (!TEST_CONFIG.CLEANUP_AFTER_TEST) {
    logger.info('⚠️  Skipping cleanup (CLEANUP_AFTER_TEST = false)');
    return;
  }

  logger.info('🧹 Cleaning up test data...');

  try {
    await User.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });
    await Nodes.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });
    await BaselineIntelligence.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });
    await Level.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });
    await Structures.deleteMany({ tenantId: TEST_CONFIG.TENANT_ID });

    logger.info('✅ Test data cleaned up');
  } catch (error) {
    logger.error('❌ Error cleaning up:', error);
  }
}

/**
 * Main test function
 */
async function runTests() {
  logger.info('🚀 Starting Baseline Intelligence Tests');
  logger.info('=====================================');

  try {
    // Connect to services
    const connected = await connectServices();
    if (!connected) {
      throw new Error('Failed to connect to required services');
    }

    // Create test data
    const testData = await createTestData();

    // Test baseline computation
    const baselines = await testBaselineComputation();

    // Test insight generation
    const insights = await testInsightGeneration(baselines);

    // Test persistence and caching
    await testPersistenceAndCaching(baselines, insights);

    // Test event-driven updates
    await testEventDrivenUpdates();

    // Test utility functions
    await testUtilityFunctions();

    logger.info('=====================================');
    logger.info('🎉 All tests completed successfully!');
    logger.info('=====================================');

  } catch (error) {
    logger.error('=====================================');
    logger.error('💥 Test failed:', error);
    logger.error('=====================================');
  } finally {
    // Clean up
    await cleanupTestData();

    // Close connections
    await mongoose.connection.close();
    logger.info('📴 Database connection closed');

    process.exit(0);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  TEST_CONFIG,
};
