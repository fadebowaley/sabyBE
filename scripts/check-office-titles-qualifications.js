/**
 * Diagnostic Script: Check Office Titles and Qualifications Data
 * 
 * This script checks if users have officeTitle and highestQualification fields populated
 * and provides statistics on the data availability.
 * 
 * Usage:
 *   node scripts/check-office-titles-qualifications.js [tenantId]
 */

const mongoose = require('mongoose');
const { User } = require('../src/models');
const logger = require('../src/config/logger');
require('dotenv').config({ path: '.env.local' });

// Get tenant ID from command line or use default
const tenantId = process.argv[2] || process.env.DEFAULT_TENANT_ID;

async function checkData() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/saby';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    if (!tenantId) {
      logger.error('Please provide a tenantId as argument or set DEFAULT_TENANT_ID in .env.local');
      process.exit(1);
    }

    logger.info(`Checking data for tenant: ${tenantId}`);

    // Get all users for the tenant
    const users = await User.find({ tenantId })
      .select('_id firstname lastname email profile.officeTitle profile.highestQualification')
      .lean();

    logger.info(`\nTotal users found: ${users.length}`);

    // Check office titles
    const usersWithOfficeTitle = users.filter(u => 
      u.profile?.officeTitle && 
      typeof u.profile.officeTitle === 'string' && 
      u.profile.officeTitle.trim() !== ''
    );

    // Check qualifications
    const usersWithQualification = users.filter(u => 
      u.profile?.highestQualification && 
      typeof u.profile.highestQualification === 'string' && 
      u.profile.highestQualification.trim() !== ''
    );

    // Count unique values
    const officeTitleMap = new Map();
    const qualificationMap = new Map();

    usersWithOfficeTitle.forEach(u => {
      const title = u.profile.officeTitle.trim();
      officeTitleMap.set(title, (officeTitleMap.get(title) || 0) + 1);
    });

    usersWithQualification.forEach(u => {
      const qual = u.profile.highestQualification.trim();
      qualificationMap.set(qual, (qualificationMap.get(qual) || 0) + 1);
    });

    // Print statistics
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('OFFICE TITLES STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Users with officeTitle: ${usersWithOfficeTitle.length} / ${users.length} (${((usersWithOfficeTitle.length / users.length) * 100).toFixed(1)}%)`);
    console.log(`Unique office titles: ${officeTitleMap.size}`);
    
    if (officeTitleMap.size > 0) {
      console.log('\nOffice Title Distribution:');
      const sortedTitles = Array.from(officeTitleMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedTitles.forEach(([title, count]) => {
        console.log(`  - ${title}: ${count} users`);
      });
    } else {
      console.log('\n⚠️  No office titles found in database!');
      console.log('   Users need to have profile.officeTitle field populated.');
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('ACADEMIC QUALIFICATIONS STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Users with highestQualification: ${usersWithQualification.length} / ${users.length} (${((usersWithQualification.length / users.length) * 100).toFixed(1)}%)`);
    console.log(`Unique qualifications: ${qualificationMap.size}`);
    
    if (qualificationMap.size > 0) {
      console.log('\nQualification Distribution:');
      const sortedQuals = Array.from(qualificationMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedQuals.forEach(([qual, count]) => {
        console.log(`  - ${qual}: ${count} users`);
      });
    } else {
      console.log('\n⚠️  No qualifications found in database!');
      console.log('   Users need to have profile.highestQualification field populated.');
    }

    // Sample users without data
    const usersWithoutOfficeTitle = users.filter(u => 
      !u.profile?.officeTitle || 
      typeof u.profile.officeTitle !== 'string' || 
      u.profile.officeTitle.trim() === ''
    ).slice(0, 5);

    const usersWithoutQualification = users.filter(u => 
      !u.profile?.highestQualification || 
      typeof u.profile.highestQualification !== 'string' || 
      u.profile.highestQualification.trim() === ''
    ).slice(0, 5);

    if (usersWithoutOfficeTitle.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('SAMPLE USERS WITHOUT OFFICE TITLE (first 5):');
      usersWithoutOfficeTitle.forEach(u => {
        console.log(`  - ${u.firstname} ${u.lastname} (${u.email})`);
        console.log(`    profile.officeTitle: ${u.profile?.officeTitle || 'undefined/null'}`);
      });
    }

    if (usersWithoutQualification.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('SAMPLE USERS WITHOUT QUALIFICATION (first 5):');
      usersWithoutQualification.forEach(u => {
        console.log(`  - ${u.firstname} ${u.lastname} (${u.email})`);
        console.log(`    profile.highestQualification: ${u.profile?.highestQualification || 'undefined/null'}`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════════');
    
    if (usersWithOfficeTitle.length === 0) {
      console.log('❌ No office titles found. Run the update script to populate data:');
      console.log('   node scripts/update-profiles-via-api.js');
    } else {
      console.log('✅ Office titles data exists. If dashboard shows no data, recompute baseline:');
      console.log('   node scripts/recompute-baseline-via-api.js');
    }

    if (usersWithQualification.length === 0) {
      console.log('❌ No qualifications found. Run the update script to populate data:');
      console.log('   node scripts/update-profiles-via-api.js');
    } else {
      console.log('✅ Qualifications data exists. If dashboard shows no data, recompute baseline:');
      console.log('   node scripts/recompute-baseline-via-api.js');
    }

    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error('Error checking data:', error);
    process.exit(1);
  }
}

checkData();


