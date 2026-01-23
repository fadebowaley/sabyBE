/**
 * Generate Backdated Calendar - Manual Script
 * 
 * Purpose: Generate event calendar for a past month
 * Use Case: Testing, compliance verification, data migration
 * 
 * Prerequisites:
 * - MongoDB connected
 * - PostgreSQL connected
 * - Form exists and has PERM enabled
 * 
 * Usage:
 *   1. Edit CONFIGURATION section below
 *   2. Run: node generate-backdated-calendar.js
 */

const mongoose = require('mongoose');
const { ProjectForm } = require('./src/models');
const { eventCalendarService } = require('./src/services');
const config = require('./src/config/config');
const logger = require('./src/config/logger');

// ============================================================================
// CONFIGURATION - EDIT THESE VALUES
// ============================================================================

const CONFIGURATION = {
  // Your project ID (get from MongoDB or frontend)
  projectId: 'proj_YOUR_PROJECT_ID',  // ← REPLACE THIS
  
  // Month to generate calendar for (YYYY-MM-DD format, use 1st of month)
  targetMonth: '2025-10-01',
  
  // Year
  targetYear: 2025,
  
  // Optionally specify tenant if you have multiple
  tenantId: null,  // Set to specific tenant or leave null to use form's tenant
};

// ============================================================================

async function generateBackdatedCalendar() {
  console.log('\n🎯 ========================================');
  console.log('   BACKDATED CALENDAR GENERATOR');
  console.log('========================================\n');

  try {
    // Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Get form
    console.log(`\n📝 Fetching form: ${CONFIGURATION.projectId}...`);
    
    const form = await ProjectForm.findOne({ 
      projectId: CONFIGURATION.projectId,
      deletedAt: null,
    });
    
    if (!form) {
      throw new Error(`❌ Form not found: ${CONFIGURATION.projectId}`);
    }

    console.log('✅ Form found:');
    console.log('   Name:', form.configuration?.projectName || 'Unnamed');
    console.log('   Project ID:', form.projectId);
    console.log('   Tenant ID:', form.tenantId);
    console.log('   PERM enabled:', form.permSettings?.enabled || false);
    console.log('   Tracking mode:', form.permSettings?.trackingMode || 'none');

    // Validate PERM is enabled
    if (!form.permSettings?.enabled) {
      throw new Error('❌ PERM is not enabled for this form! Enable PERM first.');
    }

    // Use specified tenant or form's tenant
    const tenantId = CONFIGURATION.tenantId || form.tenantId;

    // Check if calendar already exists
    console.log(`\n📅 Checking if calendar exists for ${CONFIGURATION.targetMonth}...`);
    
    const existingCalendar = await eventCalendarService.getCalendar(
      tenantId,
      CONFIGURATION.projectId,
      CONFIGURATION.targetMonth,
      CONFIGURATION.targetYear
    );

    if (existingCalendar && existingCalendar.length > 0) {
      console.log('⚠️ Calendar already exists!');
      console.log('   Total events required:', existingCalendar[0].total_events_required);
      console.log('   Do you want to regenerate? (will update existing)');
      console.log('   Proceeding with regeneration...\n');
    }

    // Generate calendar
    console.log(`📝 Generating calendar for ${CONFIGURATION.targetMonth}...`);
    
    const calendar = await eventCalendarService.generateCalendarFromForm(
      form,
      CONFIGURATION.targetMonth,
      CONFIGURATION.targetYear
    );

    console.log('\n✅ Calendar generated successfully!');
    
    if (Array.isArray(calendar) && calendar.length > 0) {
      const cal = calendar[0];
      console.log('\n📊 Calendar Details:');
      console.log('   Month:', cal.month);
      console.log('   Year:', cal.year);
      console.log('   Total events required:', cal.total_events_required);
      console.log('   Tracking mode:', cal.tracking_config?.tracking_mode || 'unknown');
      
      if (cal.tracking_config?.event_dates) {
        console.log('   Event dates:', cal.tracking_config.event_dates.length);
        console.log('   First event:', cal.tracking_config.event_dates[0]);
        console.log('   Last event:', cal.tracking_config.event_dates[cal.tracking_config.event_dates.length - 1]);
      }
    }

    // Provide next steps
    console.log('\n📋 Next Steps:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n1. Calendar is now ready for submissions');
    console.log('2. Submit PERM data for this month using:');
    console.log('\n   POST /v1/submissions');
    console.log('   {');
    console.log('     "tenantId": "' + tenantId + '",');
    console.log('     "projectId": "' + CONFIGURATION.projectId + '",');
    console.log('     "formId": "' + form._id + '",');
    console.log('     "nodeId": "your-node-id",');
    console.log('     "month": "' + CONFIGURATION.targetMonth + '",');
    console.log('     "year": ' + CONFIGURATION.targetYear + ',');
    console.log('     "payload": { ... your data ... }');
    console.log('   }');
    console.log('\n3. Check compliance after submissions complete\n');

    console.log('✅ Backdated calendar generation complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed\n');
    process.exit(0);
  }
}

// Run
generateBackdatedCalendar();





