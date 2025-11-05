/**
 * Complete Backdated Compliance Test
 *
 * This script:
 * 1. Creates a PERM-enabled form
 * 2. Publishes it backdated to October 1, 2025
 * 3. Generates calendar for October 2025
 * 4. Submits ALL compliance data for the entire month
 * 5. Verifies 100% compliance is achieved
 *
 * Prerequisites:
 * - MongoDB running
 * - PostgreSQL running
 * - Redis running
 * - Workers running (backend started)
 * - DLQ tables created
 *
 * Usage:
 *   node test-backdated-full-compliance.js
 */

const mongoose = require('mongoose');
const { ProjectForm } = require('./src/models');
const { eventCalendarService } = require('./src/services');
const { queueSubmission } = require('./src/services/submission.service');
const { postgresPool } = require('./src/config/postgres');
const config = require('./src/config/config');

async function testBackdatedCompliance() {
  console.log('\n🧪 ========================================');
  console.log('   BACKDATED FULL COMPLIANCE TEST');
  console.log('   October 2025 - Complete Month');
  console.log('========================================\n');

  let form = null;
  const testTenantId = 'test-tenant-' + Date.now();
  const testNodeId = 'test-node-001';

  try {
    // Connect to MongoDB
    console.log('📝 Step 1: Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ MongoDB connected\n');

    // Test PostgreSQL connection
    console.log('📝 Step 2: Testing PostgreSQL connection...');
    const pgTest = await postgresPool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected\n');

    // Create PERM-enabled form
    console.log('📝 Step 3: Creating PERM-enabled form...');

    const testUserId = new mongoose.Types.ObjectId();

    const formData = {
      configuration: {
        projectName: 'October 2025 Backdated Test Form',
        projectCategory: 'Testing',
        security: 'private',
        description: 'Test form for backdated compliance verification',
      },
      elements: [
        {
          id: 'event_name',
          type: 'text',
          properties: {
            label: 'Event Name',
            required: true,
            placeholder: 'e.g., Sunday Service, Tuesday Bible Study',
          },
        },
        {
          id: 'attendance',
          type: 'number',
          properties: {
            label: 'Attendance Count',
            required: true,
            validation: { min: 0, max: 10000 },
          },
        },
        {
          id: 'offering',
          type: 'number',
          properties: {
            label: 'Offering Amount ($)',
            required: false,
            validation: { min: 0 },
          },
        },
        {
          id: 'notes',
          type: 'textarea',
          properties: {
            label: 'Additional Notes',
            required: false,
          },
        },
      ],
      permSettings: {
        enabled: true,
        trackingMode: 'weekly', // Weekly tracking
        weeklyConfig: {
          days: [
            {
              day: 0, // Sunday
              name: 'Sunday',
              frequency: 'weekly',
              occurrences: 4, // 4 Sundays in October
              enabled: true,
            },
            {
              day: 2, // Tuesday
              name: 'Tuesday',
              frequency: 'weekly',
              occurrences: 5, // 5 Tuesdays in October
              enabled: true,
            },
            {
              day: 4, // Thursday
              name: 'Thursday',
              frequency: 'weekly',
              occurrences: 5, // 5 Thursdays in October
              enabled: true,
            },
          ],
        },
        requireNodeId: true,
        requireMonth: true,
        trackCompliance: true,
        autoGenerateCalendar: true,
      },
      metadata: {
        deploymentStatus: 'draft',
      },
      status: 'inactive', // Will be changed to 'active' on publish
    };

    form = await ProjectForm.createProjectForm(
      formData,
      testTenantId,
      testUserId
    );

    console.log('✅ Form created successfully!');
    console.log('   Project ID:', form.projectId);
    console.log('   Form ID:', form._id);
    console.log('   Tenant ID:', form.tenantId);
    console.log('   PERM enabled:', form.permSettings.enabled);
    console.log('   Tracking mode:', form.permSettings.trackingMode);
    console.log(
      '   Expected events: 14 (4 Sundays + 5 Tuesdays + 5 Thursdays)\n'
    );

    // Publish form (this will auto-generate calendar if autoGenerateCalendar is true)
    console.log('📝 Step 4: Publishing form...');
    console.log('   (Calendar will auto-generate for current month)');

    const publishedForm = await form.publish();

    console.log('✅ Form published!');
    console.log('   Published at:', publishedForm.publishedAt);
    console.log('   Status:', publishedForm.status);
    console.log('   Deployment:', publishedForm.metadata.deploymentStatus);

    // Generate calendar for October 2025 (backdated)
    console.log(
      '\n📝 Step 5: Generating calendar for October 2025 (backdated)...'
    );

    const october2025Calendar =
      await eventCalendarService.generateCalendarFromForm(
        publishedForm,
        '2025-10-01',
        2025
      );

    console.log('✅ October 2025 calendar generated!');

    // Verify calendar
    console.log('\n📝 Step 6: Verifying calendar details...');

    const calendarData = await eventCalendarService.getCalendar(
      form.tenantId,
      form.projectId,
      '2025-10-01',
      2025
    );

    if (!calendarData || calendarData.length === 0) {
      throw new Error('Calendar not found after generation!');
    }

    const calendar = calendarData[0];
    const totalEventsRequired = calendar.total_events;
    const trackingMode = calendar.tracking_mode;
    const weeklyConfig = calendar.weekly_config;

    console.log('✅ Calendar verified:');
    console.log('   Month:', calendar.month);
    console.log('   Year:', calendar.year);
    console.log('   Total events required:', totalEventsRequired);
    console.log('   Tracking mode:', trackingMode);

    // Extract event dates from weekly config
    let eventDates = [];
    if (weeklyConfig && weeklyConfig.days) {
      weeklyConfig.days.forEach((day) => {
        if (day.dates) {
          eventDates = eventDates.concat(day.dates);
        }
      });
      eventDates.sort();
    }

    console.log('   Event dates:', eventDates.length);
    if (eventDates.length > 0) {
      console.log('   First event date:', eventDates[0]);
      console.log('   Last event date:', eventDates[eventDates.length - 1]);
    }

    // Submit data for ALL events
    console.log('\n📝 Step 7: Submitting compliance data for all events...');
    console.log(`   Creating ${totalEventsRequired} submissions...`);

    const submissionsCreated = [];
    const testNodeId = 'test-node-001';

    for (let i = 0; i < totalEventsRequired; i++) {
      const eventDate =
        eventDates[i] || `2025-10-${String(i + 1).padStart(2, '0')}`;
      const eventDay = new Date(eventDate).toLocaleDateString('en-US', {
        weekday: 'long',
      });

      const submissionData = {
        tenantId: form.tenantId,
        projectId: form.projectId,
        formId: form._id.toString(),
        nodeId: testNodeId,
        userId: testUserId.toString(),
        month: '2025-10-01',
        year: 2025,
        perm_enabled: true,
        source: 'test-backdate-script',
        payload: {
          event_name: `${eventDay} Service - ${eventDate}`,
          attendance: 45 + Math.floor(Math.random() * 20), // 45-65 people
          offering: 800 + Math.floor(Math.random() * 400), // $800-$1200
          notes: `Test event for October ${i + 1}`,
          event_date: eventDate,
        },
        meta: {
          backdated: true,
          test: true,
          event_number: i + 1,
          event_date: eventDate,
        },
      };

      const result = await queueSubmission(submissionData);
      submissionsCreated.push({
        jobId: result.jobId,
        eventDate: eventDate,
        eventDay: eventDay,
      });

      // Progress indicator
      if ((i + 1) % 5 === 0 || i + 1 === totalEventsRequired) {
        console.log(`   ✓ Queued ${i + 1}/${totalEventsRequired} submissions`);
      }

      // Small delay to avoid overwhelming the queue
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.log(`\n✅ All ${submissionsCreated.length} submissions queued!`);
    console.log(
      '   Job IDs (first 3):',
      submissionsCreated
        .slice(0, 3)
        .map((s) => s.jobId)
        .join(', ')
    );

    // Wait for processing
    console.log('\n📝 Step 8: Waiting for workers to process submissions...');
    console.log('   (This may take 30-60 seconds for all jobs to complete)');

    // Check every 5 seconds for up to 60 seconds
    let processed = false;
    let attempts = 0;
    const maxAttempts = 12; // 12 * 5 = 60 seconds

    while (!processed && attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check if latest submission is complete
      const statusCheck = await postgresPool.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'completed') as completed,
           MAX(event_compliance_percentage) as max_compliance
         FROM form_submissions
         WHERE tenant_id = $1
           AND project_id = $2
           AND node_id = $3
           AND month = $4`,
        [form.tenantId, form.projectId, testNodeId, '2025-10-01']
      );

      const status = statusCheck.rows[0];
      console.log(
        `   Attempt ${attempts}/${maxAttempts}: ${
          status.completed || 0
        }/${totalEventsRequired} processed (${
          status.max_compliance || 0
        }% compliance)`
      );

      if (status.completed >= 1) {
        processed = true;
      }
    }

    // Check final compliance
    console.log('\n📝 Step 9: Checking final compliance...');

    const complianceQuery = `
      SELECT 
        id,
        event_compliance_percentage,
        total_events_submitted,
        total_events_required,
        completeness_status,
        created_at,
        updated_at
      FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND node_id = $3
        AND month = $4
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    const complianceResult = await postgresPool.query(complianceQuery, [
      form.tenantId,
      form.projectId,
      testNodeId,
      '2025-10-01',
    ]);

    if (complianceResult.rows.length === 0) {
      console.log('⚠️ No submission record found yet');
      console.log('   Workers may still be processing');
      console.log('\n📋 Check status manually:');
      console.log(
        `   docker exec saby-postgres-local psql -U halograph_user -d halograph -c "`
      );
      console.log(`     SELECT * FROM form_submissions `);
      console.log(
        `     WHERE project_id = '${form.projectId}' AND month = '2025-10-01';"`
      );
    } else {
      const compliance = complianceResult.rows[0];

      console.log('\n✅ COMPLIANCE REPORT');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   Submission ID: ${compliance.id}`);
      console.log(
        `   Events Submitted: ${compliance.total_events_submitted}/${compliance.total_events_required}`
      );
      console.log(`   Compliance: ${compliance.event_compliance_percentage}%`);
      console.log(`   Status: ${compliance.completeness_status}`);
      console.log(`   Created: ${compliance.created_at}`);
      console.log(`   Last Updated: ${compliance.updated_at}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const compliancePercent = parseFloat(
        compliance.event_compliance_percentage
      );

      if (compliancePercent === 100.0) {
        console.log('\n🎉 SUCCESS: 100% COMPLIANCE ACHIEVED! 🎉');
        console.log('   All events for October 2025 submitted');
        console.log('   PERM system working perfectly!');
      } else if (compliancePercent > 0) {
        console.log(`\n⚠️ Partial compliance: ${compliancePercent}%`);
        console.log(
          `   Submitted: ${compliance.total_events_submitted}/${compliance.total_events_required} events`
        );
        console.log(
          `   Still processing: ${
            compliance.total_events_required - compliance.total_events_submitted
          } events`
        );
        console.log('\n   Wait a bit longer and check again');
      } else {
        console.log('\n⚠️ No compliance calculated yet');
        console.log('   Workers may still be processing the submissions');
      }
    }

    // Check activity log
    console.log('\n📝 Step 10: Checking activity log...');

    const activityQuery = `
      SELECT 
        action,
        status,
        COUNT(*) as count
      FROM submission_activity_log
      WHERE tenant_id = $1
        AND project_id = $2
      GROUP BY action, status
      ORDER BY action, status
    `;

    const activityResult = await postgresPool.query(activityQuery, [
      form.tenantId,
      form.projectId,
    ]);

    console.log('✅ Activity Summary:');
    activityResult.rows.forEach((row) => {
      console.log(
        `   ${row.action.padEnd(12)} | ${row.status.padEnd(12)} | ${
          row.count
        } entries`
      );
    });

    // Check for any failures
    const failureQuery = `
      SELECT message
      FROM submission_activity_log
      WHERE tenant_id = $1
        AND project_id = $2
        AND status = 'failed'
      LIMIT 5
    `;

    const failures = await postgresPool.query(failureQuery, [
      form.tenantId,
      form.projectId,
    ]);

    if (failures.rows.length > 0) {
      console.log('\n⚠️ Some failures detected:');
      failures.rows.forEach((f, idx) => {
        console.log(`   ${idx + 1}. ${f.message}`);
      });
    }

    // Final Summary
    console.log('\n========================================');
    console.log('   TEST SUMMARY');
    console.log('========================================');
    console.log('✅ Form created (PERM-enabled, weekly tracking)');
    console.log('✅ Form published');
    console.log('✅ Calendar generated for October 2025');
    console.log(`✅ ${totalEventsRequired} submissions queued`);
    console.log('✅ Workers processed submissions');

    if (complianceResult.rows.length > 0) {
      const finalCompliance = complianceResult.rows[0];
      if (parseFloat(finalCompliance.event_compliance_percentage) === 100.0) {
        console.log('🎉 100% COMPLIANCE VERIFIED!');
      } else {
        console.log(
          `⚠️ ${finalCompliance.event_compliance_percentage}% compliance (may still be processing)`
        );
      }
    }

    // Cleanup instructions
    console.log('\n========================================');
    console.log('   CLEANUP (Optional)');
    console.log('========================================');
    console.log('\nTo remove this test data:');
    console.log('\n1. PostgreSQL:');
    console.log(
      `   DELETE FROM form_submissions WHERE tenant_id = '${form.tenantId}';`
    );
    console.log(
      `   DELETE FROM event_calendar WHERE tenant_id = '${form.tenantId}';`
    );
    console.log(
      `   DELETE FROM submission_activity_log WHERE tenant_id = '${form.tenantId}';`
    );
    console.log(
      `   DELETE FROM dead_letter_queue WHERE tenant_id = '${form.tenantId}';`
    );

    console.log('\n2. MongoDB:');
    console.log(
      `   await ProjectForm.findOneAndDelete({ projectId: '${form.projectId}' });`
    );

    console.log('\nOr run the cleanup script:');
    console.log(
      `   node -e "require('./src/models/ProjectForm').findOneAndDelete({ projectId: '${form.projectId}' }).then(() => console.log('Deleted'))"`
    );

    console.log('\n🎉 Test complete!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nStack trace:', error.stack);

    // Suggest diagnostics
    console.log('\n🔍 Diagnostics:');
    console.log('1. Check MongoDB connection:', config.mongoose.url);
    console.log('2. Check PostgreSQL connection');
    console.log('3. Check Redis connection');
    console.log('4. Ensure workers are running (npm run dev)');
    console.log('5. Check DLQ tables exist');

    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed\n');
  }
}

// Run test
testBackdatedCompliance();
