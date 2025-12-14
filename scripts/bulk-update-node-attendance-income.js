/**
 * Bulk Update Node Attendance and Income Script
 * 
 * This script populates sample attendance and income data for all nodes
 * to enable testing of the Top 10 Attendance and Financial Distribution tables.
 * 
 * Usage:
 *   node scripts/bulk-update-node-attendance-income.js <tenantId>
 * 
 * Example:
 *   node scripts/bulk-update-node-attendance-income.js 0gmUVnDgpY
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { Nodes } = require('../src/models');
const logger = require('../src/config/logger');

// Get tenantId from command line arguments
const tenantId = process.argv[2];

if (!tenantId) {
  console.error('❌ Error: Please provide a tenantId as argument');
  console.log('Usage: node scripts/bulk-update-node-attendance-income.js <tenantId>');
  process.exit(1);
}

/**
 * Generate realistic attendance based on node level
 */
const generateAttendance = (levelName) => {
  const ranges = {
    'National': { min: 5000, max: 10000 },
    'Division': { min: 1000, max: 3000 },
    'Diocese': { min: 500, max: 1500 },
    'Zone': { min: 200, max: 800 },
    'Parish': { min: 50, max: 300 },
    'default': { min: 30, max: 200 },
  };

  const range = ranges[levelName] || ranges.default;
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
};

/**
 * Generate realistic income based on attendance
 * Assuming average offering per person ranges from ₦500 to ₦2000
 */
const generateIncome = (attendance) => {
  const perPersonMin = 500;
  const perPersonMax = 2000;
  const perPerson = Math.floor(Math.random() * (perPersonMax - perPersonMin + 1)) + perPersonMin;
  
  // Monthly income (assuming 4 weeks)
  return attendance * perPerson * 4;
};

async function bulkUpdateNodesAttendanceIncome() {
  try {
    logger.info('🚀 Starting bulk update of node attendance and income data...');
    logger.info(`📋 Tenant ID: ${tenantId}`);

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Fetch all nodes for the tenant
    const nodes = await Nodes.find({ 
      tenantId, 
      deletedAt: null 
    })
    .populate('level', 'name')
    .setOptions({ user: { isSaby: true } });

    if (nodes.length === 0) {
      logger.warn('⚠️  No nodes found for this tenant');
      await mongoose.disconnect();
      return;
    }

    logger.info(`📊 Found ${nodes.length} nodes to update`);

    let updatedCount = 0;
    let skippedCount = 0;
    const updates = [];

    // Process each node
    for (const node of nodes) {
      const levelName = node.level?.name || 'default';
      
      // Generate data
      const averageAttendance = generateAttendance(levelName);
      const averageIncome = generateIncome(averageAttendance);

      // Initialize profile if it doesn't exist
      if (!node.profile) {
        node.profile = {};
      }

      // Update profile
      node.profile.averageAttendance = averageAttendance;
      node.profile.averageIncome = averageIncome;

      // Mark profile as modified for Mongoose
      node.markModified('profile');

      try {
        await node.save();
        updatedCount++;
        
        updates.push({
          name: node.name,
          level: levelName,
          attendance: averageAttendance,
          income: averageIncome,
        });

        // Log progress every 50 nodes
        if (updatedCount % 50 === 0) {
          logger.info(`   ✓ Updated ${updatedCount}/${nodes.length} nodes...`);
        }
      } catch (error) {
        logger.error(`   ✗ Failed to update node ${node.name}:`, error.message);
        skippedCount++;
      }
    }

    // Summary
    logger.info('\n📈 Update Summary:');
    logger.info(`   Total Nodes: ${nodes.length}`);
    logger.info(`   Successfully Updated: ${updatedCount}`);
    logger.info(`   Skipped/Failed: ${skippedCount}`);

    // Show top 10 by attendance
    const top10Attendance = updates
      .sort((a, b) => b.attendance - a.attendance)
      .slice(0, 10);

    logger.info('\n🏆 Top 10 Nodes by Attendance:');
    top10Attendance.forEach((node, index) => {
      logger.info(`   ${index + 1}. ${node.name} (${node.level}): ${node.attendance.toLocaleString()} attendees`);
    });

    // Show top 10 by income
    const top10Income = updates
      .sort((a, b) => b.income - a.income)
      .slice(0, 10);

    logger.info('\n💰 Top 10 Nodes by Income:');
    top10Income.forEach((node, index) => {
      logger.info(`   ${index + 1}. ${node.name} (${node.level}): ₦${node.income.toLocaleString()}/month`);
    });

    logger.info('\n✅ Bulk update completed successfully!');
    logger.info('💡 You can now view the data in the Baseline Intelligence dashboard');

    await mongoose.disconnect();
    logger.info('👋 Disconnected from MongoDB');

  } catch (error) {
    logger.error('❌ Error during bulk update:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
bulkUpdateNodesAttendanceIncome()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });

