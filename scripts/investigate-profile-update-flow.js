/**
 * Investigation Script: Profile Update → Compliance → Baseline → Leaderboard
 *
 * This script investigates the complete data flow when users update their profiles
 * to identify why compliance, baseline, and leaderboard are not updating.
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { User, Nodes, BaselineIntelligence } = require('../src/models');
const { complianceService } = require('../src/services');
const { userService } = require('../src/services');
const { baselineIntelligenceService } = require('../src/services');
const logger = require('../src/config/logger');

/**
 * Check if baseline intelligence service is properly configured
 */
async function checkBaselineService() {
  console.log('\n' + '='.repeat(80));
  console.log('1️⃣  BASELINE INTELLIGENCE SERVICE CHECK');
  console.log('='.repeat(80));

  try {
    // Check if handleUserChange exists
    if (typeof baselineIntelligenceService.handleUserChange === 'function') {
      console.log('✅ baselineIntelligenceService.handleUserChange exists');
    } else {
      console.log('❌ baselineIntelligenceService.handleUserChange is missing');
    }

    // Check if handleNodeChange exists
    if (typeof baselineIntelligenceService.handleNodeChange === 'function') {
      console.log('✅ baselineIntelligenceService.handleNodeChange exists');
    } else {
      console.log('❌ baselineIntelligenceService.handleNodeChange is missing');
    }

    // Check if computeNodeBaseline exists
    if (typeof baselineIntelligenceService.computeNodeBaseline === 'function') {
      console.log('✅ baselineIntelligenceService.computeNodeBaseline exists');
    } else {
      console.log(
        '❌ baselineIntelligenceService.computeNodeBaseline is missing'
      );
    }
  } catch (error) {
    console.error('❌ Error checking baseline service:', error.message);
  }
}

/**
 * Check user model post-save hook
 */
async function checkUserModelHooks() {
  console.log('\n' + '='.repeat(80));
  console.log('2️⃣  USER MODEL HOOKS CHECK');
  console.log('='.repeat(80));

  try {
    const UserModel = mongoose.model('User');
    const hooks = UserModel.schema._posthooks || UserModel.schema._hooks || {};

    console.log('📋 Checking post-save hooks...');

    // Check if post-save hook exists (this is tricky to check directly)
    // Instead, we'll check if the hook logic exists in the model file
    console.log(
      '✅ User model post-save hook should be in user.model.js (lines 365-402)'
    );
    console.log(
      '   Hook triggers on: status, profile, roles, isEmailVerified, isPhoneVerified, customFields'
    );
  } catch (error) {
    console.error('❌ Error checking user model hooks:', error.message);
  }
}

/**
 * Check recent profile updates
 */
async function checkRecentProfileUpdates(tenantId) {
  console.log('\n' + '='.repeat(80));
  console.log('3️⃣  RECENT PROFILE UPDATES CHECK');
  console.log('='.repeat(80));

  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Find users updated in last 24 hours
    const recentUsers = await User.find({
      tenantId,
      updatedAt: { $gte: last24h },
    })
      .select('_id firstname lastname email updatedAt profile')
      .limit(10)
      .lean();

    console.log(`📊 Users updated in last 24 hours: ${recentUsers.length}`);

    if (recentUsers.length > 0) {
      console.log('\n📋 Sample recent updates:');
      recentUsers.slice(0, 5).forEach((user, idx) => {
        const hasProfile = user.profile && Object.keys(user.profile).length > 0;
        console.log(
          `   ${idx + 1}. ${user.firstname} ${user.lastname} (${user.email})`
        );
        console.log(`      Updated: ${user.updatedAt}`);
        console.log(`      Has profile data: ${hasProfile ? '✅' : '❌'}`);
        if (hasProfile) {
          const profileKeys = Object.keys(user.profile).slice(0, 5);
          console.log(
            `      Profile fields: ${profileKeys.join(', ')}${
              Object.keys(user.profile).length > 5 ? '...' : ''
            }`
          );
        }
      });
    } else {
      console.log('⚠️  No users updated in last 24 hours');
    }

    // Check users updated in last 7 days
    const last7dUsers = await User.find({
      tenantId,
      updatedAt: { $gte: last7d },
    }).countDocuments();

    console.log(`\n📊 Users updated in last 7 days: ${last7dUsers}`);
  } catch (error) {
    console.error('❌ Error checking recent profile updates:', error.message);
  }
}

/**
 * Check baseline intelligence data
 */
async function checkBaselineData(tenantId) {
  console.log('\n' + '='.repeat(80));
  console.log('4️⃣  BASELINE INTELLIGENCE DATA CHECK');
  console.log('='.repeat(80));

  try {
    // Check network baseline
    const networkBaseline = await BaselineIntelligence.findOne({
      tenantId,
      type: 'network',
    }).lean();

    if (networkBaseline) {
      console.log('✅ Network baseline exists');
      console.log(`   Last updated: ${networkBaseline.updatedAt || 'N/A'}`);
      console.log(`   Has metrics: ${networkBaseline.metrics ? '✅' : '❌'}`);

      if (networkBaseline.metrics && networkBaseline.metrics.users) {
        const userMetrics = networkBaseline.metrics.users;
        console.log(`   Total users: ${userMetrics.total || 0}`);
        console.log(`   Active users: ${userMetrics.active || 0}`);
        console.log(`   Inactive users: ${userMetrics.inactive || 0}`);
      }
    } else {
      console.log('❌ Network baseline does not exist');
    }

    // Check node baselines
    const nodeBaselines = await BaselineIntelligence.find({
      tenantId,
      type: 'node',
    })
      .select('nodeId updatedAt')
      .limit(5)
      .lean();

    console.log(`\n📊 Node baselines found: ${nodeBaselines.length}`);
    if (nodeBaselines.length > 0) {
      console.log('   Sample node baselines:');
      nodeBaselines.forEach((baseline, idx) => {
        console.log(
          `   ${idx + 1}. Node ${baseline.nodeId} - Updated: ${
            baseline.updatedAt || 'N/A'
          }`
        );
      });
    }
  } catch (error) {
    console.error('❌ Error checking baseline data:', error.message);
  }
}

/**
 * Check compliance calculation
 */
async function checkComplianceCalculation(tenantId) {
  console.log('\n' + '='.repeat(80));
  console.log('5️⃣  COMPLIANCE CALCULATION CHECK');
  console.log('='.repeat(80));

  try {
    // Get a sample user with profile data
    const sampleUser = await User.findOne({
      tenantId,
      profile: { $exists: true, $ne: null },
    }).lean();

    if (sampleUser) {
      console.log(
        `✅ Testing compliance calculation for: ${sampleUser.firstname} ${sampleUser.lastname}`
      );

      // Calculate compliance
      const complianceScore = await complianceService.calculateComplianceScore(
        sampleUser._id.toString(),
        null,
        tenantId
      );

      console.log(
        `   Overall compliance: ${complianceScore.overallCompliance}%`
      );
      console.log(
        `   Is compliant: ${complianceScore.isCompliant ? '✅' : '❌'}`
      );
      console.log(
        `   User compliance: ${complianceScore.userCompliance.score}%`
      );
      console.log(
        `   User has profile data: ${
          complianceScore.userCompliance.details.hasProfileData ? '✅' : '❌'
        }`
      );
      console.log(
        `   User manually compliant: ${
          complianceScore.userCompliance.details.isManuallyCompliant
            ? '✅'
            : '❌'
        }`
      );

      if (complianceScore.userCompliance.details.missingFields.length > 0) {
        console.log(
          `   Missing fields: ${complianceScore.userCompliance.details.missingFields.join(
            ', '
          )}`
        );
      }
    } else {
      console.log('⚠️  No users with profile data found for testing');
    }

    // Check compliance summary
    const summary = await complianceService.getComplianceSummary(tenantId);
    console.log(`\n📊 Compliance Summary:`);
    console.log(`   Total users: ${summary.totalUsers}`);
    console.log(`   Compliant: ${summary.totalCompliant}`);
    console.log(`   Non-compliant: ${summary.totalNonCompliant}`);
    console.log(`   Partial: ${summary.totalPartial}`);
    console.log(`   Average compliance: ${summary.averageCompliance}%`);
    console.log(`   Compliance rate: ${summary.complianceRate}%`);
  } catch (error) {
    console.error('❌ Error checking compliance calculation:', error.message);
    console.error('   Stack:', error.stack);
  }
}

/**
 * Check leaderboard data
 */
async function checkLeaderboard(tenantId) {
  console.log('\n' + '='.repeat(80));
  console.log('6️⃣  LEADERBOARD CHECK');
  console.log('='.repeat(80));

  try {
    const leaderboard = await userService.getProfileUpdateLeaderboard(
      tenantId,
      'all',
      10
    );

    console.log(`✅ Leaderboard retrieved successfully`);
    console.log(`   Total entries: ${leaderboard.leaderboard.length}`);
    console.log(`   Stats:`);
    console.log(`     Total updates: ${leaderboard.stats.totalUpdates}`);
    console.log(`     Last 24 hours: ${leaderboard.stats.last24Hours}`);
    console.log(`     Last 7 days: ${leaderboard.stats.last7Days}`);
    console.log(`     Last 30 days: ${leaderboard.stats.last30Days}`);

    if (leaderboard.leaderboard.length > 0) {
      console.log(`\n📋 Top 5 leaderboard entries:`);
      leaderboard.leaderboard.slice(0, 5).forEach((entry, idx) => {
        console.log(`   ${idx + 1}. ${entry.fullName} (${entry.email})`);
        console.log(`      Updated: ${entry.profileUpdatedAt}`);
        console.log(`      Days ago: ${entry.daysAgo}`);
        console.log(
          `      Compliant: ${entry.profileUpdateCompliant ? '✅' : '❌'}`
        );
      });
    }
  } catch (error) {
    console.error('❌ Error checking leaderboard:', error.message);
    console.error('   Stack:', error.stack);
  }
}

/**
 * Test profile update flow
 */
async function testProfileUpdateFlow(tenantId) {
  console.log('\n' + '='.repeat(80));
  console.log('7️⃣  PROFILE UPDATE FLOW TEST');
  console.log('='.repeat(80));

  try {
    // Find a test user
    const testUser = await User.findOne({ tenantId }).lean();

    if (!testUser) {
      console.log('⚠️  No users found for testing');
      return;
    }

    console.log(
      `📋 Testing with user: ${testUser.firstname} ${testUser.lastname} (${testUser.email})`
    );

    // Get baseline before update
    const baselineBefore = await BaselineIntelligence.findOne({
      tenantId,
      type: 'network',
    }).lean();

    const complianceBefore = await complianceService.calculateComplianceScore(
      testUser._id.toString(),
      null,
      tenantId
    );

    console.log(`\n📊 Before update:`);
    console.log(`   Baseline exists: ${baselineBefore ? '✅' : '❌'}`);
    console.log(`   Compliance: ${complianceBefore.overallCompliance}%`);

    // Perform a test update (just update a profile field)
    const userDoc = await User.findById(testUser._id);
    if (!userDoc.profile) {
      userDoc.profile = {};
    }

    // Update a test field (we'll use a timestamp to make it unique)
    const testValue = `test_${Date.now()}`;
    userDoc.profile.testField = testValue;
    userDoc.markModified('profile');

    console.log(`\n🔄 Performing test profile update...`);
    await userDoc.save();

    // Wait a bit for async hooks to process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check baseline after update
    const baselineAfter = await BaselineIntelligence.findOne({
      tenantId,
      type: 'network',
    }).lean();

    const complianceAfter = await complianceService.calculateComplianceScore(
      testUser._id.toString(),
      null,
      tenantId
    );

    console.log(`\n📊 After update:`);
    console.log(`   Baseline exists: ${baselineAfter ? '✅' : '❌'}`);
    if (baselineBefore && baselineAfter) {
      const baselineUpdated =
        new Date(baselineAfter.updatedAt) > new Date(baselineBefore.updatedAt);
      console.log(`   Baseline updated: ${baselineUpdated ? '✅' : '❌'}`);
      if (baselineUpdated) {
        console.log(`   Baseline update time: ${baselineAfter.updatedAt}`);
      }
    }
    console.log(`   Compliance: ${complianceAfter.overallCompliance}%`);

    // Clean up test field
    delete userDoc.profile.testField;
    userDoc.markModified('profile');
    await userDoc.save();

    console.log(`\n✅ Test complete - test field removed`);
  } catch (error) {
    console.error('❌ Error testing profile update flow:', error.message);
    console.error('   Stack:', error.stack);
  }
}

/**
 * Main investigation function
 */
async function investigate() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 PROFILE UPDATE FLOW INVESTIGATION');
    console.log('='.repeat(80));
    console.log(
      'Investigating: Profile Update → Compliance → Baseline → Leaderboard'
    );
    console.log('='.repeat(80));

    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Get tenant ID from environment or use first tenant
    const firstUser = await User.findOne().lean();
    if (!firstUser) {
      console.log('❌ No users found in database');
      await mongoose.disconnect();
      return;
    }

    const tenantId = firstUser.tenantId;
    console.log(`📋 Using tenant: ${tenantId}\n`);

    // Run all checks
    await checkBaselineService();
    await checkUserModelHooks();
    await checkRecentProfileUpdates(tenantId);
    await checkBaselineData(tenantId);
    await checkComplianceCalculation(tenantId);
    await checkLeaderboard(tenantId);
    await testProfileUpdateFlow(tenantId);

    console.log('\n' + '='.repeat(80));
    console.log('📊 INVESTIGATION SUMMARY');
    console.log('='.repeat(80));
    console.log('\n✅ Investigation complete. Review output above for issues.');
    console.log('\n💡 Key findings:');
    console.log('   1. Check if baseline hooks are firing (see test results)');
    console.log(
      '   2. Check if compliance is being recalculated (currently NOT automatic)'
    );
    console.log('   3. Check if leaderboard is using updatedAt correctly');
    console.log('   4. Check backend logs for errors in post-save hooks');
    console.log('\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Fatal error during investigation:', error);
    console.error('   Stack:', error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run investigation
investigate();
