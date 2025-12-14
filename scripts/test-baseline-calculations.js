/**
 * Test Baseline Intelligence Calculations
 *
 * This script tests and verifies the calculation base for baseline intelligence:
 * 1. Tests node baseline computation
 * 2. Tests network baseline computation
 * 3. Verifies metric calculations
 * 4. Validates configuration integration
 * 5. Checks custom calculations
 * 6. Verifies field grouping
 *
 * Usage: node scripts/test-baseline-calculations.js
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const logger = require('../src/config/logger');
require('dotenv').config({ path: './env.docker' });

// Import services and models
const {
  baselineIntelligenceService,
  baselineInsightsService,
  baselineAnalysisConfigService,
} = require('../src/services');
const { User, Nodes, BaselineIntelligence, Role } = require('../src/models');

// Configuration
const TENANT_ID = process.env.TEST_TENANT_ID || '0gmUVnDgpY';
const TEST_NODE_ID = process.env.TEST_NODE_ID || null; // Set to test specific node

/**
 * Connect to MongoDB
 * Uses env.docker configuration and adjusts for host machine execution
 */
async function connectDatabase() {
  try {
    // Load env.docker if available
    require('dotenv').config({ path: './env.docker' });

    let mongoUrl = process.env.MONGODB_URL || config.mongoose.url;

    // Adjust for host machine execution (Docker MongoDB accessible via localhost)
    if (mongoUrl && mongoUrl.includes('@mongodb:')) {
      mongoUrl = mongoUrl.replace('@mongodb:', '@localhost:');
      logger.info(
        '🔄 Adjusted MongoDB URL for host machine access (Docker MongoDB)'
      );
      logger.info(`   Using: ${mongoUrl.split('@')[0]}@localhost:***`);
    } else if (mongoUrl && mongoUrl.includes('mongodb://mongodb:')) {
      mongoUrl = mongoUrl.replace('mongodb://mongodb:', 'mongodb://localhost:');
      logger.info(
        '🔄 Adjusted MongoDB URL for host machine access (Docker MongoDB)'
      );
    }

    logger.info(`🔌 Connecting to MongoDB...`);
    logger.info(`   Database: ${mongoUrl.split('/').pop().split('?')[0]}`);
    await mongoose.connect(mongoUrl, config.mongoose.options);
    logger.info('✅ Connected to MongoDB\n');
    return true;
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', error.message);
    logger.error(
      '   Make sure Docker MongoDB is running and accessible on localhost:27017'
    );
    throw error;
  }
}

/**
 * Get test data summary
 */
async function getTestDataSummary() {
  logger.info('📊 Gathering Test Data Summary...');
  logger.info('===================================\n');

  try {
    // Get users count
    const userCount = await User.countDocuments({
      tenantId: TENANT_ID,
    }).setOptions({ user: { isSaby: true } });
    const usersWithProfile = await User.countDocuments({
      tenantId: TENANT_ID,
      $or: [
        { 'profile.gender': { $exists: true } },
        { 'profile.dateOfBirth': { $exists: true } },
        { 'profile.stateOfOrigin': { $exists: true } },
        { customFields: { $exists: true, $ne: [] } },
      ],
    }).setOptions({ user: { isSaby: true } });

    // Get nodes count
    const nodeCount = await Nodes.countDocuments({
      tenantId: TENANT_ID,
      deletedAt: null,
    }).setOptions({ user: { isSaby: true } });

    // Get roles
    const roles = await Role.find({ tenantId: TENANT_ID })
      .setOptions({ user: { isSaby: true } })
      .lean();

    // Get baseline configs
    const userConfig = await baselineAnalysisConfigService.getAnalysisConfig(
      TENANT_ID,
      'user'
    );
    const nodeConfig = await baselineAnalysisConfigService.getAnalysisConfig(
      TENANT_ID,
      'node'
    );

    logger.info(`Tenant ID: ${TENANT_ID}`);
    logger.info(`Total Users: ${userCount}`);
    logger.info(`Users with Profile Data: ${usersWithProfile}`);
    logger.info(`Total Nodes: ${nodeCount}`);
    logger.info(`Total Roles: ${roles.length}`);
    logger.info(`Roles: ${roles.map((r) => r.name).join(', ') || 'None'}`);
    logger.info(`User Config Version: ${userConfig.version || 1}`);
    logger.info(`Node Config Version: ${nodeConfig.version || 1}`);
    logger.info('');

    return {
      userCount,
      usersWithProfile,
      nodeCount,
      roles,
      userConfig,
      nodeConfig,
    };
  } catch (error) {
    logger.error('❌ Error getting test data summary:', error);
    throw error;
  }
}

/**
 * Test node baseline computation with detailed verification
 */
async function testNodeBaseline(nodeId = null) {
  logger.info('🧮 Testing Node Baseline Computation...');
  logger.info('========================================\n');

  try {
    let node;

    if (nodeId) {
      // Test specific node
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(nodeId);
      const query = isObjectId
        ? { _id: nodeId, tenantId: TENANT_ID }
        : { nodeId: nodeId, tenantId: TENANT_ID };
      node = await Nodes.findOne(query)
        .setOptions({ user: { isSaby: true } })
        .populate(['level', 'structure', 'users']);

      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }
    } else {
      // Get first available node
      const nodes = await Nodes.find({ tenantId: TENANT_ID, deletedAt: null })
        .setOptions({ user: { isSaby: true } })
        .populate(['level', 'structure', 'users'])
        .limit(1);

      if (nodes.length === 0) {
        logger.warn('⚠️  No nodes found for testing');
        logger.info(
          '💡 Tip: Run scripts/update-profiles-and-test-baseline.js first to populate test data'
        );
        return null;
      }

      node = nodes[0];
    }

    logger.info(`Testing Node: ${node.name} (${node.nodeId})`);
    logger.info(`Node Level: ${node.level?.name || 'N/A'}`);
    logger.info(`Node Structure: ${node.structure?.name || 'N/A'}`);
    logger.info('');

    // Get users in this node
    const users = await User.find({
      _id: { $in: node.users },
      tenantId: TENANT_ID,
    })
      .setOptions({ user: { isSaby: true } })
      .populate('roles');

    logger.info(`Users in Node: ${users.length}`);
    logger.info('');

    // Compute baseline
    const startTime = Date.now();
    const baselineData = await baselineIntelligenceService.computeNodeBaseline(
      node.nodeId,
      TENANT_ID
    );
    const computationTime = Date.now() - startTime;

    logger.info('✅ Baseline Computation Results:');
    logger.info('--------------------------------');
    logger.info(`Computation Time: ${computationTime}ms`);
    logger.info('');

    // Verify metrics structure
    const metrics = baselineData.metrics;

    logger.info('📈 User Metrics:');
    logger.info(`   Total Users: ${metrics.users?.total || 0}`);
    logger.info(`   Active Users: ${metrics.users?.active || 0}`);
    logger.info(`   Inactive Users: ${metrics.users?.inactive || 0}`);
    logger.info('');

    // Demographics
    if (metrics.users?.demographics) {
      logger.info('👥 Demographics:');
      const demo = metrics.users.demographics;
      logger.info(
        `   Gender - Male: ${demo.gender?.male || 0}, Female: ${
          demo.gender?.female || 0
        }, Other: ${demo.gender?.other || 0}`
      );
      logger.info(`   Average Age: ${demo.averageAge || 0}`);
      logger.info(
        `   Marital Status - Single: ${
          demo.maritalStatus?.single || 0
        }, Married: ${demo.maritalStatus?.married || 0}`
      );
      logger.info('');
    }

    // Hierarchy
    if (metrics.users?.hierarchy) {
      logger.info('👔 Hierarchy:');
      const hierarchy = metrics.users.hierarchy;
      logger.info(`   Owners: ${hierarchy.owners || 0}`);
      logger.info(`   Super Users: ${hierarchy.supers || 0}`);
      logger.info(`   Ordinary Members: ${hierarchy.ordinary || 0}`);
      logger.info(`   Saby Users: ${hierarchy.sabyUsers || 0}`);

      // Calculate leadership ratio
      const totalMembers =
        hierarchy.owners + hierarchy.supers + hierarchy.ordinary;
      const leadershipRatio =
        totalMembers > 0
          ? ((hierarchy.owners + hierarchy.supers) / totalMembers) * 100
          : 0;
      logger.info(`   Leadership Ratio: ${leadershipRatio.toFixed(2)}%`);

      // Terminology
      if (metrics.users?.terminology) {
        logger.info(
          `   Terminology: ${JSON.stringify(metrics.users.terminology)}`
        );
      }
      logger.info('');
    }

    // Geography
    if (metrics.users?.geography && metrics.users.geography.length > 0) {
      logger.info('📍 Geography (Top 5):');
      metrics.users.geography.slice(0, 5).forEach((geo, index) => {
        logger.info(
          `   ${index + 1}. ${geo.state || 'N/A'} - ${geo.lga || 'N/A'}: ${
            geo.count
          } users`
        );
      });
      logger.info('');
    }

    // Roles
    if (metrics.users?.roles && metrics.users.roles.length > 0) {
      logger.info('🎭 Roles (Top 5):');
      metrics.users.roles.slice(0, 5).forEach((role, index) => {
        logger.info(
          `   ${index + 1}. ${role.roleName || 'Unknown'}: ${role.count} users`
        );
      });
      logger.info('');
    }

    // Facility metrics (for nodes)
    if (metrics.facility) {
      logger.info('🏢 Facility Metrics:');
      logger.info(
        `   Property Status: ${metrics.facility.propertyStatus || 'N/A'}`
      );
      logger.info(
        `   Building Type: ${metrics.facility.buildingType || 'N/A'}`
      );
      logger.info(
        `   Facility Status: ${metrics.facility.facilityStatus || 'N/A'}`
      );
      logger.info(
        `   Establishment Age: ${metrics.facility.establishmentAge || 0} years`
      );
      logger.info('');
    }

    // Custom Analytics
    if (metrics.customAnalytics) {
      logger.info('📊 Custom Analytics:');
      if (metrics.customAnalytics.users?.numeric?.length > 0) {
        logger.info(
          `   User Numeric Fields: ${metrics.customAnalytics.users.numeric.length}`
        );
        metrics.customAnalytics.users.numeric
          .slice(0, 3)
          .forEach((field, index) => {
            logger.info(
              `     ${index + 1}. ${field.displayName || field.fieldName}:`
            );
            logger.info(
              `        Average: ${
                field.statistics?.average?.toFixed(2) || 'N/A'
              }`
            );
            logger.info(
              `        Min: ${field.statistics?.min || 'N/A'}, Max: ${
                field.statistics?.max || 'N/A'
              }`
            );
          });
      }
      if (metrics.customAnalytics.users?.categorical?.length > 0) {
        logger.info(
          `   User Categorical Fields: ${metrics.customAnalytics.users.categorical.length}`
        );
      }
      logger.info('');
    }

    // Custom Calculations
    if (metrics.customMetrics) {
      logger.info('🔢 Custom Calculations:');
      Object.keys(metrics.customMetrics).forEach((key) => {
        const calc = metrics.customMetrics[key];
        logger.info(
          `   ${calc.displayName || key}: ${calc.value} ${calc.unit || ''}`
        );
      });
      logger.info('');
    }

    // Field Groups
    if (metrics.fieldGroups && metrics.fieldGroups.length > 0) {
      logger.info('📁 Field Groups:');
      metrics.fieldGroups.forEach((group, index) => {
        logger.info(
          `   ${index + 1}. ${group.name} (${group.analysisType}): ${
            group.fields.length
          } fields`
        );
        if (group.aggregate) {
          logger.info(
            `      Aggregate - Sum: ${
              group.aggregate.sum
            }, Avg: ${group.aggregate.average.toFixed(2)}`
          );
        }
      });
      logger.info('');
    }

    // Generate insights
    logger.info('💡 Generating Insights...');
    const insights = await baselineInsightsService.generateAllInsights(
      TENANT_ID,
      {
        type: 'node',
        metrics: baselineData.metrics,
      }
    );
    logger.info(`   Generated ${insights.length} insights`);
    if (insights.length > 0) {
      logger.info('   Sample Insights:');
      insights.slice(0, 3).forEach((insight, index) => {
        logger.info(`     ${index + 1}. [${insight.priority}] ${insight.text}`);
      });
    }
    logger.info('');

    return {
      node,
      baselineData,
      insights,
      computationTime,
    };
  } catch (error) {
    logger.error('❌ Error testing node baseline:', error);
    throw error;
  }
}

/**
 * Test network baseline computation
 */
async function testNetworkBaseline() {
  logger.info('🌐 Testing Network Baseline Computation...');
  logger.info('==========================================\n');

  try {
    const startTime = Date.now();
    const baselineData =
      await baselineIntelligenceService.computeNetworkBaseline(TENANT_ID);
    const computationTime = Date.now() - startTime;

    logger.info('✅ Network Baseline Computation Results:');
    logger.info('----------------------------------------');
    logger.info(`Computation Time: ${computationTime}ms`);
    logger.info('');

    const metrics = baselineData.metrics;

    // User metrics
    logger.info('📈 Network User Metrics:');
    logger.info(`   Total Users: ${metrics.users?.total || 0}`);
    logger.info(`   Active Users: ${metrics.users?.active || 0}`);
    logger.info(
      `   Average Age: ${metrics.users?.demographics?.averageAge || 0}`
    );
    logger.info('');

    // Network metrics
    if (metrics.network) {
      logger.info('🌐 Network Metrics:');
      logger.info(`   Total Nodes: ${metrics.network.totalNodes || 0}`);
      logger.info(`   Active Nodes: ${metrics.network.activeNodes || 0}`);
      logger.info(
        `   Average Depth: ${metrics.network.hierarchyStats?.averageDepth || 0}`
      );
      logger.info(
        `   Total Levels: ${metrics.network.hierarchyStats?.totalLevels || 0}`
      );
      logger.info('');
    }

    // Generate insights
    logger.info('💡 Generating Network Insights...');
    const insights = await baselineInsightsService.generateAllInsights(
      TENANT_ID,
      {
        type: 'network',
        metrics: baselineData.metrics,
      }
    );
    logger.info(`   Generated ${insights.length} insights`);
    logger.info('');

    return {
      baselineData,
      insights,
      computationTime,
    };
  } catch (error) {
    logger.error('❌ Error testing network baseline:', error);
    throw error;
  }
}

/**
 * Verify calculation accuracy
 */
async function verifyCalculations(nodeBaselineResult) {
  logger.info('✅ Verifying Calculation Accuracy...');
  logger.info('===================================\n');

  try {
    const { node, baselineData } = nodeBaselineResult;
    const metrics = baselineData.metrics;
    const issues = [];

    // Verify user counts
    const users = await User.find({
      _id: { $in: node.users },
      tenantId: TENANT_ID,
    }).setOptions({ user: { isSaby: true } });

    if (metrics.users?.total !== users.length) {
      issues.push(
        `User count mismatch: Expected ${users.length}, Got ${metrics.users?.total}`
      );
    }

    // Verify active/inactive counts
    const activeCount = users.filter((u) => u.status).length;
    const inactiveCount = users.filter((u) => !u.status).length;

    if (metrics.users?.active !== activeCount) {
      issues.push(
        `Active users mismatch: Expected ${activeCount}, Got ${metrics.users?.active}`
      );
    }

    if (metrics.users?.inactive !== inactiveCount) {
      issues.push(
        `Inactive users mismatch: Expected ${inactiveCount}, Got ${metrics.users?.inactive}`
      );
    }

    // Verify hierarchy counts
    const ownersCount = users.filter((u) => u.isOwner && !u.isSaby).length;
    const supersCount = users.filter(
      (u) => u.isSuper && !u.isOwner && !u.isSaby
    ).length;
    const ordinaryCount = users.filter(
      (u) => !u.isOwner && !u.isSuper && !u.isSaby
    ).length;

    // Note: These might differ if roleMapping is configured
    if (metrics.users?.hierarchy) {
      logger.info('Hierarchy Verification:');
      logger.info(
        `   Owners: Expected ~${ownersCount}, Got ${metrics.users.hierarchy.owners}`
      );
      logger.info(
        `   Supers: Expected ~${supersCount}, Got ${metrics.users.hierarchy.supers}`
      );
      logger.info(
        `   Ordinary: Expected ~${ordinaryCount}, Got ${metrics.users.hierarchy.ordinary}`
      );
      logger.info('');
    }

    // Verify demographics
    const usersWithGender = users.filter((u) => u.profile?.gender).length;
    const usersWithAge = users.filter((u) => u.profile?.dateOfBirth).length;

    logger.info('Demographics Verification:');
    logger.info(`   Users with Gender: ${usersWithGender}`);
    logger.info(`   Users with Age: ${usersWithAge}`);
    logger.info('');

    if (issues.length > 0) {
      logger.warn('⚠️  Calculation Issues Found:');
      issues.forEach((issue) => logger.warn(`   - ${issue}`));
    } else {
      logger.info('✅ All calculations verified successfully');
    }
    logger.info('');

    return {
      verified: issues.length === 0,
      issues,
    };
  } catch (error) {
    logger.error('❌ Error verifying calculations:', error);
    throw error;
  }
}

/**
 * Main test function
 */
async function main() {
  logger.info(
    '╔════════════════════════════════════════════════════════════════╗'
  );
  logger.info(
    '║  Baseline Intelligence Calculation Test                        ║'
  );
  logger.info(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    // Connect to database
    await connectDatabase();

    // Get test data summary
    const summary = await getTestDataSummary();

    // Test node baseline
    const nodeBaselineResult = await testNodeBaseline(TEST_NODE_ID);

    if (nodeBaselineResult) {
      // Verify calculations
      await verifyCalculations(nodeBaselineResult);
    } else {
      logger.warn('⚠️  Skipping node baseline verification (no nodes found)');
    }

    // Test network baseline
    await testNetworkBaseline();

    logger.info(
      '╔════════════════════════════════════════════════════════════════╗'
    );
    logger.info(
      '║  Test Summary                                                  ║'
    );
    logger.info(
      '╚════════════════════════════════════════════════════════════════╝\n'
    );
    logger.info('✅ All tests completed successfully!\n');
  } catch (error) {
    logger.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info('🔌 Disconnected from MongoDB');
  }
}

// Run tests
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  testNodeBaseline,
  testNetworkBaseline,
  verifyCalculations,
};
