/**
 * Regenerate calendars for published PERM forms
 * Run this after fixing the event_type NOT NULL constraint
 */

require('dotenv').config({ path: './env.docker' });
const mongoose = require('mongoose');
const { ProjectForm } = require('./src/models');
const { eventCalendarService } = require('./src/services');

const MONGODB_URL =
  process.env.MONGODB_URL ||
  'mongodb://admin:local_mongo_2025@localhost:27017/halo-local?authSource=admin';

async function regenerateCalendars() {
  console.log('🔧 Regenerating calendars for published PERM forms...\n');

  try {
    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // Find all published forms with PERM enabled
    const forms = await ProjectForm.find({
      'permSettings.enabled': true,
      'metadata.deploymentStatus': 'published',
    });

    if (forms.length === 0) {
      console.log('ℹ️  No published PERM forms found');
      process.exit(0);
    }

    console.log(`📋 Found ${forms.length} published PERM forms\n`);

    // Generate calendars for each form
    for (const form of forms) {
      console.log('─'.repeat(60));
      console.log(`📅 Form: ${form.configuration.projectName}`);
      console.log(`   Form ID: ${form.formId}`);
      console.log(`   Project ID: ${form.projectId}`);
      console.log(`   Tracking Mode: ${form.permSettings.trackingMode}`);

      try {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Generate calendar for current month and next 3 months
        let generatedCount = 0;
        for (let i = 0; i < 4; i++) {
          const monthDate = new Date(currentYear, currentMonth + i, 1);
          const year = monthDate.getFullYear();
          const month = `${year}-${String(monthDate.getMonth() + 1).padStart(
            2,
            '0'
          )}-01`;
          const monthName = monthDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          });

          console.log(`   Generating for ${monthName}...`);

          try {
            const result = await eventCalendarService.generateCalendarFromForm(
              form,
              month,
              year
            );
            console.log(`   ✅ ${monthName}: ${result.total_events} events`);
            generatedCount++;
          } catch (error) {
            if (error.message && error.message.includes('already exists')) {
              console.log(`   ℹ️  ${monthName}: Already exists (skipped)`);
            } else {
              console.error(`   ❌ ${monthName}: ${error.message}`);
            }
          }
        }

        console.log(
          `   ✅ Generated ${generatedCount} calendar(s) for this form\n`
        );
      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}\n`);
      }
    }

    console.log('─'.repeat(60));
    console.log('\n🎉 Calendar regeneration complete!\n');

    // Show summary
    console.log('📊 Summary:');
    const { postgresPool } = require('./src/config/postgres');
    const result = await postgresPool.query(`
      SELECT 
        tracking_mode,
        COUNT(*) as calendar_count,
        SUM(total_events) as total_events
      FROM event_calendar
      GROUP BY tracking_mode
      ORDER BY tracking_mode;
    `);

    if (result.rows.length === 0) {
      console.log('   No calendars found in database');
    } else {
      result.rows.forEach((row) => {
        console.log(
          `   ${row.tracking_mode}: ${row.calendar_count} calendar(s), ${row.total_events} events`
        );
      });
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

regenerateCalendars();


 * Regenerate calendars for published PERM forms
 * Run this after fixing the event_type NOT NULL constraint
 */

require('dotenv').config({ path: './env.docker' });
const mongoose = require('mongoose');
const { ProjectForm } = require('./src/models');
const { eventCalendarService } = require('./src/services');

const MONGODB_URL =
  process.env.MONGODB_URL ||
  'mongodb://admin:local_mongo_2025@localhost:27017/halo-local?authSource=admin';

async function regenerateCalendars() {
  console.log('🔧 Regenerating calendars for published PERM forms...\n');

  try {
    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // Find all published forms with PERM enabled
    const forms = await ProjectForm.find({
      'permSettings.enabled': true,
      'metadata.deploymentStatus': 'published',
    });

    if (forms.length === 0) {
      console.log('ℹ️  No published PERM forms found');
      process.exit(0);
    }

    console.log(`📋 Found ${forms.length} published PERM forms\n`);

    // Generate calendars for each form
    for (const form of forms) {
      console.log('─'.repeat(60));
      console.log(`📅 Form: ${form.configuration.projectName}`);
      console.log(`   Form ID: ${form.formId}`);
      console.log(`   Project ID: ${form.projectId}`);
      console.log(`   Tracking Mode: ${form.permSettings.trackingMode}`);

      try {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Generate calendar for current month and next 3 months
        let generatedCount = 0;
        for (let i = 0; i < 4; i++) {
          const monthDate = new Date(currentYear, currentMonth + i, 1);
          const year = monthDate.getFullYear();
          const month = `${year}-${String(monthDate.getMonth() + 1).padStart(
            2,
            '0'
          )}-01`;
          const monthName = monthDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          });

          console.log(`   Generating for ${monthName}...`);

          try {
            const result = await eventCalendarService.generateCalendarFromForm(
              form,
              month,
              year
            );
            console.log(`   ✅ ${monthName}: ${result.total_events} events`);
            generatedCount++;
          } catch (error) {
            if (error.message && error.message.includes('already exists')) {
              console.log(`   ℹ️  ${monthName}: Already exists (skipped)`);
            } else {
              console.error(`   ❌ ${monthName}: ${error.message}`);
            }
          }
        }

        console.log(
          `   ✅ Generated ${generatedCount} calendar(s) for this form\n`
        );
      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}\n`);
      }
    }

    console.log('─'.repeat(60));
    console.log('\n🎉 Calendar regeneration complete!\n');

    // Show summary
    console.log('📊 Summary:');
    const { postgresPool } = require('./src/config/postgres');
    const result = await postgresPool.query(`
      SELECT 
        tracking_mode,
        COUNT(*) as calendar_count,
        SUM(total_events) as total_events
      FROM event_calendar
      GROUP BY tracking_mode
      ORDER BY tracking_mode;
    `);

    if (result.rows.length === 0) {
      console.log('   No calendars found in database');
    } else {
      result.rows.forEach((row) => {
        console.log(
          `   ${row.tracking_mode}: ${row.calendar_count} calendar(s), ${row.total_events} events`
        );
      });
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

regenerateCalendars();

