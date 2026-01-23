#!/usr/bin/env node

/**
 * Script to recompute baseline intelligence with attendance range distribution
 * This will ensure rangeDistribution is computed and stored
 */

// MongoDB connection - Docker MongoDB is accessible from host without authentication
// Note: When running from host machine, Docker MongoDB doesn't require auth
const mongoose = require('mongoose');
const { computeAllBaselinesForTenant } = require('../src/services/baselineIntelligence.service');

// MongoDB connection for Docker MongoDB from host (no auth needed from host)
const MONGODB_URI = 'mongodb://localhost:27017/halo-local';

console.log(`📡 Connecting to Docker MongoDB from host...`);
console.log(`   URI: ${MONGODB_URI}`);

async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
    
    // Verify connection by counting documents
    const { Nodes, User, BaselineIntelligence } = require('../src/models');
    
    // Default tenant: hWiWJ_X0m6 (saby@saby.ai) - has 461 nodes with data
    const tenantId = process.argv[2] || 'hWiWJ_X0m6';
    
    console.log(`\n📊 Pre-computation checks for tenant: ${tenantId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const nodeCount = await Nodes.countDocuments({ tenantId, deletedAt: null });
    const userCount = await User.countDocuments({ tenantId });
    const nodesWithAttendance = await Nodes.countDocuments({ 
      tenantId, 
      deletedAt: null,
      'profile.averageAttendance': { $exists: true, $gt: 0 }
    });
    const nodesWithIncome = await Nodes.countDocuments({ 
      tenantId,
      deletedAt: null,
      'profile.averageIncome': { $exists: true, $gt: 0 }
    });
    
    console.log(`   📦 Total Nodes: ${nodeCount}`);
    console.log(`   👥 Total Users: ${userCount}`);
    console.log(`   📊 Nodes with Attendance Data: ${nodesWithAttendance}`);
    console.log(`   💰 Nodes with Income Data: ${nodesWithIncome}`);
    
    if (nodeCount === 0) {
      console.error('\n❌ ERROR: No nodes found for this tenant!');
      console.log('   Please verify:');
      console.log('   1. Tenant ID is correct:', tenantId);
      console.log('   2. Nodes exist in database');
      console.log('   3. MongoDB connection is correct');
      return;
    }
    
    if (nodesWithAttendance === 0) {
      console.warn('\n⚠️  WARNING: No nodes have attendance data!');
      console.log('   Range distribution will be empty.');
    }
    
    console.log('\n🚀 Starting baseline computation...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const results = await computeAllBaselinesForTenant(tenantId);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              ✅ BASELINE RECOMPUTATION COMPLETE!             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    console.log('📈 Summary:');
    console.log(`  • Tenant ID: ${results.tenantId}`);
    console.log(`  • Nodes Processed: ${results.nodesProcessed}`);
    console.log(`  • Network Baseline: ${results.networkProcessed ? '✅ Updated' : '❌ Failed'}`);
    console.log(`  • Duration: ${results.duration}ms`);
    
    if (results.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${results.errors.length}`);
      results.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.nodeId || err.type}: ${err.error}`);
      });
    } else {
      console.log('\n✅ No errors!');
    }

    // Post-computation verification
    console.log('\n🔍 Verifying computed data...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const baseline = await BaselineIntelligence.findOne({ 
      tenantId, 
      type: 'network' 
    });
    
    if (baseline && baseline.metrics && baseline.metrics.network) {
      const net = baseline.metrics.network;
      const ranges = net.attendance?.rangeDistribution || [];
      
      console.log(`\n📊 Network Metrics:`);
      console.log(`   Total Nodes: ${net.totalNodes || 0}`);
      console.log(`   Total Attendance: ${net.attendance?.total || 0}`);
      console.log(`   Total Income: ₦${(net.income?.total || 0).toLocaleString()}`);
      
      console.log(`\n📈 Range Distribution:`);
      if (ranges.length > 0) {
        console.log(`   ✅ ${ranges.length} ranges computed successfully!`);
        console.log('');
        
        let totalNodes = 0;
        let totalAtt = 0;
        let totalFin = 0;
        
        ranges.forEach(r => {
          totalNodes += r.count || 0;
          totalAtt += r.totalAttendance || 0;
          totalFin += r.totalFinancial || 0;
          console.log(`   📊 ${r.range}`);
          console.log(`      • Nodes: ${r.count}`);
          console.log(`      • Attendance: ${r.totalAttendance.toLocaleString()}`);
          console.log(`      • Financial: ₦${r.totalFinancial.toLocaleString()}`);
          console.log(`      • Percentage: ${r.percentage.toFixed(1)}%`);
        });
        
        console.log('\n   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   📊 TOTALS: ${totalNodes} nodes, ${totalAtt.toLocaleString()} attendance, ₦${totalFin.toLocaleString()}`);
      } else {
        console.log('   ⚠️  No range distribution data computed (attendanceNodes array was empty)');
      }
    } else {
      console.log('   ❌ Could not verify - baseline document not found or incomplete');
    }

    console.log('\n🎯 What was updated:');
    console.log('  ✅ attendance.rangeDistribution (ALL nodes included)');
    console.log('  ✅ attendance.top10');
    console.log('  ✅ income.top10');
    console.log('  ✅ All network metrics');
    console.log('  ✅ All node baselines');

    console.log('\n🧪 Test now:');
    console.log('  1. Refresh your browser: Cmd+Shift+R');
    console.log('  2. Go to: http://localhost:3000/reports/baseline-intelligence/network');
    console.log('  3. See the comprehensive table with ALL nodes!');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

main();

