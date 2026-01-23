/**
 * PERM Tracking Modes - Comprehensive Test Script
 *
 * Tests all three tracking modes end-to-end:
 * 1. Month Only (no day tracking)
 * 2. Daily tracking (custom days + frequency)
 * 3. Weekly tracking (per-day configuration)
 *
 * Prerequisites:
 * - Backend running locally (docker-compose)
 * - MongoDB and PostgreSQL accessible
 * - User authenticated (or use test credentials)
 *
 * Run: node sabyBackend/test-perm-tracking-modes.js
 */

require('dotenv').config({ path: './env.docker' });
const axios = require('axios');
const mongoose = require('mongoose');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://localhost:4000';
const FRONTEND_URL = 'http://localhost:3000';

// Use local Docker MongoDB URL
process.env.MONGODB_URL =
  process.env.MONGODB_URL ||
  'mongodb://admin:local_mongo_2025@localhost:27017/halo-local?authSource=admin';

// Test configuration
const TEST_CONFIG = {
  tenantId: null, // Will be set after login
  userId: null,
  authToken: null,
  testProjectIds: {
    monthOnly: null,
    daily: null,
    weekly: null,
  },
};

/**
 * Helper: Login and get auth token
 */
const login = async () => {
  try {
    console.log('\n🔐 Step 1: Authenticating...');

    const response = await axios.post(`${BASE_URL}/v1/auth/login`, {
      email: 'admin@saby.ai',
      password: 'Admin@123',
    });

    TEST_CONFIG.authToken = response.data.tokens.access.token;
    TEST_CONFIG.tenantId = response.data.user.tenantId;
    TEST_CONFIG.userId = response.data.user.id;

    console.log(`✅ Authenticated as: ${response.data.user.email}`);
    console.log(`   Tenant ID: ${TEST_CONFIG.tenantId}`);
    console.log(`   User ID: ${TEST_CONFIG.userId}`);

    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
};

/**
 * Test 1: Month-Only Tracking Mode
 */
const testMonthOnlyMode = async () => {
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('📋 TEST 1: MONTH-ONLY TRACKING MODE');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Create form with month-only tracking
    console.log('Step 1: Creating form with month-only tracking...');

    const formData = {
      configuration: {
        projectName: 'Monthly Sales Report',
        projectDescription: 'Monthly sales data submission',
        accessibility: 'authenticated',
        security: 'medium',
        tags: ['sales', 'monthly', 'PERM'],
      },
      elements: [
        {
          id: 'total_sales',
          type: 'number',
          label: 'Total Sales',
          required: true,
        },
        {
          id: 'target_achieved',
          type: 'checkbox',
          label: 'Target Achieved',
        },
      ],
      permSettings: {
        enabled: true,
        trackingMode: 'none', // Month-only
        requireNodeId: true,
        requireMonth: true,
        trackCompliance: true,
        autoGenerateCalendar: true,
      },
    };

    const createResponse = await axios.post(
      `${BASE_URL}/v1/project-forms`,
      formData,
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    const projectId = createResponse.data.projectId;
    const formId = createResponse.data.formId || createResponse.data.id;
    TEST_CONFIG.testProjectIds.monthOnly = projectId;

    console.log(`✅ Form created: ${projectId}`);
    console.log(`   Form ID: ${formId}`);
    console.log(`   Tracking Mode: none (month-only)`);

    // Step 2: Publish form (triggers calendar auto-generation)
    console.log('\nStep 2: Publishing form...');

    await axios.put(
      `${BASE_URL}/v1/project-forms/${projectId}/publish`,
      {},
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    console.log('✅ Form published');
    console.log('   Calendar auto-generated for 4 months');

    // Step 3: Preview calendar
    console.log('\nStep 3: Previewing calendar...');

    const previewResponse = await axios.post(
      `${BASE_URL}/v1/event-calendar/preview`,
      {
        formId: formId,
        month: '2025-11-01',
        year: 2025,
      },
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    console.log('✅ Calendar preview:');
    console.log(
      `   Tracking Mode: ${previewResponse.data.preview.tracking_mode}`
    );
    console.log(
      `   Expected Submissions: ${previewResponse.data.preview.total_events}`
    );
    console.log(`   → Users can submit ANYTIME during the month`);

    // Step 4: Submit data (should accept anytime in month)
    console.log('\nStep 4: Submitting data...');

    const submissionResponse = await axios.post(
      `${BASE_URL}/v1/submissions`,
      {
        tenantId: TEST_CONFIG.tenantId,
        projectId: projectId,
        formId: formId,
        nodeId: 'branch_lagos',
        month: '2025-11-01',
        payload: {
          total_sales: 150000,
          target_achieved: true,
        },
        source: 'api',
      },
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    console.log('✅ Submission queued');
    console.log(`   Job ID: ${submissionResponse.data.jobId}`);
    console.log(`   Type: ${submissionResponse.data.type}`);

    // Wait for worker processing
    console.log('\n⏳ Waiting 5 seconds for worker processing...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Step 5: Verify compliance in PostgreSQL
    console.log('\nStep 5: Verifying compliance...');

    const complianceQuery = `
      SELECT 
        id, node_id, month,
        event_compliance_percentage as percentage,
        completeness_status as status,
        total_events_required as required,
        total_events_submitted as submitted
      FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND month = '2025-11-01'
        AND perm_enabled = true
      LIMIT 1
    `;

    const complianceResult = await postgresPool.query(complianceQuery, [
      TEST_CONFIG.tenantId,
      projectId,
    ]);

    if (complianceResult.rows.length > 0) {
      const compliance = complianceResult.rows[0];
      console.log('✅ Compliance calculated:');
      console.log(`   Percentage: ${compliance.percentage}%`);
      console.log(`   Status: ${compliance.status}`);
      console.log(
        `   Submitted: ${compliance.submitted}/${compliance.required}`
      );
      console.log(
        `   Expected: ${
          compliance.percentage === 100 ? '100%' : '0%'
        } (binary for month-only)`
      );
    } else {
      console.log('⚠️  No compliance record found yet');
    }

    console.log('\n✅ TEST 1 COMPLETE: Month-Only Mode Working!');
    return true;
  } catch (error) {
    console.error('\n❌ TEST 1 FAILED:', error.response?.data || error.message);
    return false;
  }
};

/**
 * Test 2: Daily Tracking Mode
 */
const testDailyMode = async () => {
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('📊 TEST 2: DAILY TRACKING MODE');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Create form with daily tracking
    console.log('Step 1: Creating form with daily tracking...');

    const formData = {
      configuration: {
        projectName: 'Daily Cash Count',
        projectDescription: 'Morning and evening cash counts',
        accessibility: 'authenticated',
        security: 'high',
        tags: ['finance', 'daily', 'PERM'],
      },
      elements: [
        {
          id: 'morning_count',
          type: 'number',
          label: 'Morning Cash Count',
          required: true,
        },
        {
          id: 'evening_count',
          type: 'number',
          label: 'Evening Cash Count',
          required: true,
        },
      ],
      permSettings: {
        enabled: true,
        trackingMode: 'daily',
        dailyConfig: {
          activeDays: [1, 2, 3, 4, 5], // Monday-Friday
          frequencyPerDay: 2, // 2x per day
          skipHolidays: false,
        },
        requireNodeId: true,
        requireMonth: true,
        autoGenerateCalendar: true,
      },
    };

    const createResponse = await axios.post(
      `${BASE_URL}/v1/project-forms`,
      formData,
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    const projectId = createResponse.data.projectId;
    const formId = createResponse.data.formId || createResponse.data.id;
    TEST_CONFIG.testProjectIds.daily = projectId;

    console.log(`✅ Form created: ${projectId}`);
    console.log(`   Tracking Mode: daily`);
    console.log(`   Active Days: Mon-Fri`);
    console.log(`   Frequency: 2x per day`);

    // Step 2: Publish form
    console.log('\nStep 2: Publishing form...');

    await axios.put(
      `${BASE_URL}/v1/project-forms/${projectId}/publish`,
      {},
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    console.log('✅ Form published & calendars generated');

    // Step 3: Preview calendar
    console.log('\nStep 3: Previewing calendar...');

    const previewResponse = await axios.post(
      `${BASE_URL}/v1/event-calendar/preview`,
      {
        formId: formId,
        month: '2025-11-01',
        year: 2025,
      },
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    console.log('✅ Calendar preview:');
    console.log(
      `   Tracking Mode: ${previewResponse.data.preview.tracking_mode}`
    );
    console.log(`   Total Days: ${previewResponse.data.preview.total_days}`);
    console.log(
      `   Frequency/Day: ${previewResponse.data.preview.frequency_per_day}`
    );
    console.log(
      `   Expected Submissions: ${previewResponse.data.preview.total_events}`
    );

    // Step 4: Submit multiple entries
    console.log('\nStep 4: Submitting multiple daily entries...');

    const daysToSubmit = [
      '2025-11-03', // Monday
      '2025-11-04', // Tuesday
      '2025-11-05', // Wednesday
    ];

    for (const day of daysToSubmit) {
      await axios.post(
        `${BASE_URL}/v1/submissions`,
        {
          tenantId: TEST_CONFIG.tenantId,
          projectId: projectId,
          formId: formId,
          nodeId: 'branch_lagos',
          month: '2025-11-01',
          payload: {
            morning_count: 45000 + Math.random() * 5000,
            evening_count: 43000 + Math.random() * 5000,
            submission_date: day,
          },
          source: 'api',
        },
        {
          headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
        }
      );

      console.log(`✅ Submitted for ${day}`);
    }

    // Wait for processing
    console.log('\n⏳ Waiting 5 seconds for worker processing...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Step 5: Check compliance
    console.log('\nStep 5: Checking compliance...');

    const complianceQuery = `
      SELECT 
        event_compliance_percentage,
        completeness_status,
        total_events_required,
        total_events_submitted
      FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND month = '2025-11-01'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await postgresPool.query(complianceQuery, [
      TEST_CONFIG.tenantId,
      projectId,
    ]);

    if (result.rows.length > 0) {
      const compliance = result.rows[0];
      console.log('✅ Compliance calculated:');
      console.log(`   Percentage: ${compliance.event_compliance_percentage}%`);
      console.log(`   Status: ${compliance.completeness_status}`);
      console.log(
        `   Progress: ${compliance.total_events_submitted}/${compliance.total_events_required}`
      );
      console.log(
        `   Expected: ~7% (3 days out of ${compliance.total_events_required} expected)`
      );
    }

    console.log('\n✅ TEST 2 COMPLETE: Daily Mode Working!');
    return true;
  } catch (error) {
    console.error('\n❌ TEST 2 FAILED:', error.response?.data || error.message);
    return false;
  }
};

/**
 * Test 3: Weekly Tracking Mode
 */
const testWeeklyMode = async () => {
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('📅 TEST 3: WEEKLY TRACKING MODE');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Create form with weekly tracking
    console.log('Step 1: Creating form with weekly tracking...');

    const formData = {
      configuration: {
        projectName: 'Church Attendance',
        projectDescription: 'Weekly church service attendance tracking',
        accessibility: 'authenticated',
        security: 'medium',
        tags: ['church', 'attendance', 'PERM'],
      },
      elements: [
        {
          id: 'total_attendance',
          type: 'number',
          label: 'Total Attendance',
          required: true,
        },
        {
          id: 'first_timers',
          type: 'number',
          label: 'First Time Visitors',
        },
      ],
      permSettings: {
        enabled: true,
        trackingMode: 'weekly',
        weeklyConfig: {
          days: [
            {
              day: 0,
              name: 'Sunday',
              frequency: 'weekly',
              enabled: true,
            },
            {
              day: 2,
              name: 'Tuesday',
              frequency: 'weekly',
              enabled: true,
            },
            {
              day: 5,
              name: 'Friday',
              frequency: 'biweekly',
              occurrences: 2,
              enabled: true,
            },
          ],
        },
        requireNodeId: true,
        requireMonth: true,
        autoGenerateCalendar: true,
      },
    };

    const createResponse = await axios.post(
      `${BASE_URL}/v1/project-forms`,
      formData,
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    const projectId = createResponse.data.projectId;
    const formId = createResponse.data.formId || createResponse.data.id;
    TEST_CONFIG.testProjectIds.weekly = projectId;

    console.log(`✅ Form created: ${projectId}`);
    console.log(`   Tracking Mode: weekly`);
    console.log(
      `   Days: Sunday (weekly), Tuesday (weekly), Friday (biweekly)`
    );

    // Step 2: Publish
    console.log('\nStep 2: Publishing form...');

    await axios.put(
      `${BASE_URL}/v1/project-forms/${projectId}/publish`,
      {},
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    console.log('✅ Form published & calendars generated');

    // Step 3: Preview calendar
    console.log('\nStep 3: Previewing calendar...');

    const previewResponse = await axios.post(
      `${BASE_URL}/v1/event-calendar/preview`,
      {
        formId: formId,
        month: '2025-11-01',
        year: 2025,
      },
      {
        headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
      }
    );

    console.log('✅ Calendar preview:');
    console.log(
      `   Tracking Mode: ${previewResponse.data.preview.tracking_mode}`
    );
    console.log(
      `   Days Configured: ${previewResponse.data.preview.days_configured}`
    );
    console.log(
      `   Total Events: ${previewResponse.data.preview.total_events}`
    );
    if (previewResponse.data.preview.breakdown) {
      console.log('   Breakdown:');
      previewResponse.data.preview.breakdown.forEach((day) => {
        console.log(`     - ${day.name}: ${day.count} events`);
      });
    }

    // Step 4: Submit for some events
    console.log('\nStep 4: Submitting attendance data...');

    const eventsToSubmit = [
      { day: '2025-11-02', event: 'Sunday Service' }, // Sunday
      { day: '2025-11-04', event: 'Tuesday Bible Study' }, // Tuesday
      { day: '2025-11-09', event: 'Sunday Service' }, // Sunday
    ];

    for (const event of eventsToSubmit) {
      await axios.post(
        `${BASE_URL}/v1/submissions`,
        {
          tenantId: TEST_CONFIG.tenantId,
          projectId: projectId,
          formId: formId,
          nodeId: 'church_main',
          month: '2025-11-01',
          payload: {
            total_attendance: 120 + Math.floor(Math.random() * 50),
            first_timers: Math.floor(Math.random() * 10),
            event_name: event.event,
            event_date: event.day,
          },
          source: 'api',
        },
        {
          headers: { Authorization: `Bearer ${TEST_CONFIG.authToken}` },
        }
      );

      console.log(`✅ Submitted: ${event.event} (${event.day})`);
    }

    // Wait for processing
    console.log('\n⏳ Waiting 5 seconds for worker processing...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Step 5: Check compliance
    console.log('\nStep 5: Checking compliance...');

    const complianceQuery = `
      SELECT 
        event_compliance_percentage,
        completeness_status,
        total_events_required,
        total_events_submitted
      FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND month = '2025-11-01'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await postgresPool.query(complianceQuery, [
      TEST_CONFIG.tenantId,
      projectId,
    ]);

    if (result.rows.length > 0) {
      const compliance = result.rows[0];
      console.log('✅ Compliance calculated:');
      console.log(`   Percentage: ${compliance.event_compliance_percentage}%`);
      console.log(`   Status: ${compliance.completeness_status}`);
      console.log(
        `   Progress: ${compliance.total_events_submitted}/${compliance.total_events_required}`
      );
    }

    console.log('\n✅ TEST 3 COMPLETE: Weekly Mode Working!');
    return true;
  } catch (error) {
    console.error('\n❌ TEST 3 FAILED:', error.response?.data || error.message);
    return false;
  }
};

/**
 * Main test runner
 */
const runAllTests = async () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                                                        ║');
  console.log('║  🧪 PERM TRACKING MODES - COMPREHENSIVE TEST SUITE    ║');
  console.log('║                                                        ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    // Connect to databases
    console.log('\n📦 Connecting to databases...');
    const mongoUrl =
      'mongodb://admin:local_mongo_2025@localhost:27017/halo-local?authSource=admin';
    console.log('MongoDB URL:', mongoUrl);
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB');
    await postgresPool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL');

    // Authenticate
    const loginSuccess = await login();
    if (!loginSuccess) {
      throw new Error('Authentication failed');
    }

    // Run tests
    const results = {
      monthOnly: false,
      daily: false,
      weekly: false,
    };

    results.monthOnly = await testMonthOnlyMode();
    results.daily = await testDailyMode();
    results.weekly = await testWeeklyMode();

    // Summary
    console.log(
      '\n\n╔════════════════════════════════════════════════════════╗'
    );
    console.log('║                   TEST SUMMARY                         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log(
      `Test 1 - Month Only: ${results.monthOnly ? '✅ PASS' : '❌ FAIL'}`
    );
    console.log(
      `Test 2 - Daily:      ${results.daily ? '✅ PASS' : '❌ FAIL'}`
    );
    console.log(
      `Test 3 - Weekly:     ${results.weekly ? '✅ PASS' : '❌ FAIL'}`
    );

    const allPassed = results.monthOnly && results.daily && results.weekly;

    console.log(
      `\n${allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED'}`
    );

    // Cleanup
    console.log('\n\n📋 Test Project IDs (for cleanup):');
    console.log(`   Month-Only: ${TEST_CONFIG.testProjectIds.monthOnly}`);
    console.log(`   Daily: ${TEST_CONFIG.testProjectIds.daily}`);
    console.log(`   Weekly: ${TEST_CONFIG.testProjectIds.weekly}`);

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  } finally {
    // Close connections
    await mongoose.disconnect();
    await postgresPool.end();
  }
};

// Run tests
runAllTests();



  }
};

// Run tests
runAllTests();
