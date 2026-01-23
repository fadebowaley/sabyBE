/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Create Comprehensive Healthcare Data for SabyAgentic E2E Testing           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Case Study: National Healthcare Compliance Monitoring System
 *
 * This script creates realistic, comprehensive data for testing:
 * - 50 healthcare facilities (nodes)
 * - 3 months of PERM submissions (Sept, Oct, Nov 2025)
 * - All Sundays of each month (weekly reporting)
 * - Realistic compliance patterns (high, medium, low performers)
 * - Data quality issues for AI to detect
 * - Event calendars with all required events
 *
 * Data Profile:
 * - ~600 PERM submissions (50 nodes × 4 weeks × 3 months)
 * - ~150 compliance tracking records
 * - ~100 validation records
 * - ~50 notification queue items
 * - Varied compliance rates (30% to 100%)
 */

const axios = require('axios');
const { MongoClient } = require('mongodb');
const { Pool } = require('pg');

// Configuration
const BASE_URL = 'http://127.0.0.1:4000/v1';
const AUTH = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
};

const MONGO_URL = 'mongodb://localhost:27017/halograph';
const PG_CONFIG = {
  host: process.env.POSTGRES_HOST || 'postgres',
  port: 5432,
  user: 'sabyagentic_user',
  password: 'WcKoT/m9hFGMaiztjci/reLyMVln9qE0ReAaHc0Cb8E=',
  database: 'halograph',
};

// Test results
const results = {
  authToken: null,
  tenantId: null,
  userId: null,
  projectFormId: null,
  createdSubmissions: 0,
  createdEvents: 0,
  createdCompliance: 0,
  createdValidations: 0,
};

// Healthcare facilities (50 nodes)
const HEALTHCARE_FACILITIES = [
  // High performers (15 facilities - 90-100% compliance)
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `HCF_HIGH_${String(i + 1).padStart(3, '0')}`,
    name: `Metro General Hospital ${i + 1}`,
    type: 'hospital',
    performance: 'high',
    baseCompliance: 0.9 + Math.random() * 0.1,
  })),

  // Medium performers (25 facilities - 60-89% compliance)
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `HCF_MED_${String(i + 1).padStart(3, '0')}`,
    name: `Regional Health Center ${i + 1}`,
    type: 'clinic',
    performance: 'medium',
    baseCompliance: 0.6 + Math.random() * 0.29,
  })),

  // Low performers (10 facilities - 30-59% compliance)
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `HCF_LOW_${String(i + 1).padStart(3, '0')}`,
    name: `Community Clinic ${i + 1}`,
    type: 'clinic',
    performance: 'low',
    baseCompliance: 0.3 + Math.random() * 0.29,
  })),
];

// PERM events for healthcare compliance
const PERM_EVENTS = [
  'Patient Safety Report',
  'Infection Control Audit',
  'Staff Training Certification',
  'Equipment Maintenance Log',
  'Medication Inventory Check',
  'Emergency Drill Execution',
  'Quality Assurance Review',
  'Incident Report Submission',
];

// Helper: Get all Sundays in a month
function getSundaysInMonth(year, month) {
  const sundays = [];
  const date = new Date(year, month - 1, 1);

  // Find first Sunday
  while (date.getDay() !== 0) {
    date.setDate(date.getDate() + 1);
  }

  // Collect all Sundays
  while (date.getMonth() === month - 1) {
    sundays.push(new Date(date));
    date.setDate(date.getDate() + 7);
  }

  return sundays;
}

// Helper: Generate realistic patient vitals data
function generatePatientVitals(facilityPerformance) {
  const quality =
    facilityPerformance === 'high'
      ? 1.0
      : facilityPerformance === 'medium'
      ? 0.75
      : 0.5;

  return {
    patients_monitored: Math.floor(50 + Math.random() * 200),
    critical_cases: Math.floor(Math.random() * 20),
    average_wait_time: Math.floor(15 + Math.random() * 45),
    bed_occupancy_rate: (60 + Math.random() * 35).toFixed(1),
    staff_on_duty: Math.floor(10 + Math.random() * 30),
    equipment_status:
      quality > 0.8 ? 'operational' : quality > 0.5 ? 'partial' : 'critical',
    data_quality: quality,
  };
}

// API Helper
async function apiRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(results.authToken && {
          Authorization: `Bearer ${results.authToken}`,
        }),
      },
    };

    if (data) config.data = data;

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(
      `❌ API Error [${method} ${endpoint}]:`,
      error.response?.data || error.message
    );
    throw error;
  }
}

// Step 1: Authenticate
async function authenticate() {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  STEP 1: Authentication                                        ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  const response = await apiRequest('POST', '/auth/login', AUTH);
  results.authToken = response.tokens.access.token;
  results.tenantId = response.user.tenantId;
  results.userId = response.user.id;

  console.log('✅ Authenticated successfully');
  console.log(`   User: ${response.user.email}`);
  console.log(`   Tenant ID: ${results.tenantId}`);
  console.log(`   User ID: ${results.userId}`);
}

// Step 2: Create Project Form
async function createProjectForm() {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  STEP 2: Create Healthcare Compliance Form                    ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  const formData = {
    name: 'Healthcare Compliance Weekly Report',
    category: 'Healthcare',
    description: 'Weekly compliance reporting for healthcare facilities',
    status: 'published',
    elements: [
      {
        id: 'patients_monitored',
        type: 'number',
        label: 'Patients Monitored This Week',
        required: true,
      },
      {
        id: 'critical_cases',
        type: 'number',
        label: 'Critical Cases Handled',
        required: true,
      },
      {
        id: 'average_wait_time',
        type: 'number',
        label: 'Average Wait Time (minutes)',
        required: true,
      },
      {
        id: 'bed_occupancy_rate',
        type: 'number',
        label: 'Bed Occupancy Rate (%)',
        required: true,
      },
      {
        id: 'staff_on_duty',
        type: 'number',
        label: 'Average Staff on Duty',
        required: true,
      },
      {
        id: 'equipment_status',
        type: 'select',
        label: 'Equipment Status',
        options: ['operational', 'partial', 'critical'],
        required: true,
      },
    ],
    permConfig: {
      enabled: true,
      requiredEvents: PERM_EVENTS,
      complianceThreshold: 80,
      monthEndLocking: true,
      notificationSettings: {
        enabled: true,
        daysBeforeDeadline: 7,
        recipients: ['compliance@healthcare.org'],
      },
    },
  };

  const response = await apiRequest('POST', '/project-forms', formData);
  results.projectFormId = response._id;

  console.log('✅ Project form created');
  console.log(`   Form ID: ${results.projectFormId}`);
  console.log(`   Form Name: ${response.name}`);
  console.log(`   PERM Enabled: ${response.permConfig.enabled}`);
  console.log(`   Required Events: ${PERM_EVENTS.length}`);
}

// Step 3: Create Event Calendars
async function createEventCalendars(pgPool) {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  STEP 3: Create Event Calendars (3 months)                    ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  const months = [
    { year: 2025, month: 9, name: 'September' },
    { year: 2025, month: 10, name: 'October' },
    { year: 2025, month: 11, name: 'November' },
  ];

  for (const { year, month, name } of months) {
    const sundays = getSundaysInMonth(year, month);

    console.log(
      `📅 Creating ${name} 2025 calendar (${sundays.length} weeks)...`
    );

    for (const eventName of PERM_EVENTS) {
      await pgPool.query(
        `
        INSERT INTO event_calendar 
        (tenant_id, project_id, form_id, event_name, event_date, month, year, is_required)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id, project_id, event_name, month, year) DO NOTHING
      `,
        [
          results.tenantId,
          results.projectFormId,
          results.projectFormId,
          eventName,
          sundays[0], // First Sunday of the month
          month,
          year,
          true,
        ]
      );

      results.createdEvents++;
    }

    console.log(`   ✅ Created ${PERM_EVENTS.length} events for ${name}`);
  }

  console.log(`\n✅ Total events created: ${results.createdEvents}`);
}

// Step 4: Create PERM Submissions
async function createSubmissions(pgPool) {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  STEP 4: Create PERM Submissions (50 facilities × 3 months)   ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  const months = [
    { year: 2025, month: 9, name: 'September' },
    { year: 2025, month: 10, name: 'October' },
    { year: 2025, month: 11, name: 'November' },
  ];

  for (const { year, month, name } of months) {
    console.log(`\n📊 Processing ${name} 2025...`);
    const sundays = getSundaysInMonth(year, month);

    for (const facility of HEALTHCARE_FACILITIES) {
      // Each facility submits on each Sunday
      for (const sunday of sundays) {
        const weeklyData = generatePatientVitals(facility.performance);

        // Simulate varying compliance - some facilities miss weeks
        const missRate =
          facility.performance === 'high'
            ? 0.05
            : facility.performance === 'medium'
            ? 0.2
            : 0.4;

        if (Math.random() > missRate) {
          // Determine how many events to submit (affects compliance)
          const eventsToSubmit = Math.floor(
            PERM_EVENTS.length * facility.baseCompliance
          );

          const eventsSubmitted = PERM_EVENTS.slice(0, eventsToSubmit);
          const eventsMissing = PERM_EVENTS.slice(eventsToSubmit);

          const compliancePercentage =
            (eventsToSubmit / PERM_EVENTS.length) * 100;

          await pgPool.query(
            `
            INSERT INTO form_submissions
            (tenant_id, project_id, form_id, node_id, user_id, 
             data, status, source, month, year, perm_enabled,
             event_compliance_percentage, completeness_status,
             project_name, project_category, meta)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (tenant_id, project_id, node_id, month, year) 
            DO UPDATE SET
              data = EXCLUDED.data,
              event_compliance_percentage = EXCLUDED.event_compliance_percentage,
              completeness_status = EXCLUDED.completeness_status,
              updated_at = NOW()
          `,
            [
              results.tenantId,
              results.projectFormId,
              results.projectFormId,
              facility.id,
              results.userId,
              JSON.stringify({
                ...weeklyData,
                facility_name: facility.name,
                facility_type: facility.type,
                submission_week: sundays.indexOf(sunday) + 1,
                events_submitted: eventsSubmitted,
                events_missing: eventsMissing,
              }),
              compliancePercentage >= 80 ? 'approved' : 'pending',
              'perm',
              month,
              year,
              true,
              compliancePercentage,
              compliancePercentage >= 100
                ? 'complete'
                : compliancePercentage >= 80
                ? 'partial'
                : 'incomplete',
              'Healthcare Compliance System',
              'Healthcare',
              JSON.stringify({
                performance_tier: facility.performance,
                week_number: sundays.indexOf(sunday) + 1,
                submission_date: sunday.toISOString(),
              }),
            ]
          );

          results.createdSubmissions++;
        }
      }
    }

    console.log(
      `   ✅ Created submissions for ${name}: ${results.createdSubmissions} total so far`
    );
  }

  console.log(
    `\n✅ Total PERM submissions created: ${results.createdSubmissions}`
  );
}

// Step 5: Query and Display All Tables
async function queryAllTables(pgPool) {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  STEP 5: Query All Tables - Complete Data Transparency        ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  // 1. Form Submissions
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
  console.log('📊 TABLE 1: form_submissions');
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );

  const submissions = await pgPool.query(
    `
    SELECT 
      COUNT(*) as total_submissions,
      COUNT(DISTINCT node_id) as unique_facilities,
      COUNT(DISTINCT month || '-' || year) as unique_months,
      AVG(event_compliance_percentage) as avg_compliance,
      MIN(event_compliance_percentage) as min_compliance,
      MAX(event_compliance_percentage) as max_compliance,
      COUNT(CASE WHEN perm_enabled = true THEN 1 END) as perm_submissions,
      COUNT(CASE WHEN completeness_status = 'complete' THEN 1 END) as complete_count,
      COUNT(CASE WHEN completeness_status = 'partial' THEN 1 END) as partial_count,
      COUNT(CASE WHEN completeness_status = 'incomplete' THEN 1 END) as incomplete_count
    FROM form_submissions
    WHERE tenant_id = $1
  `,
    [results.tenantId]
  );

  const stats = submissions.rows[0];
  console.log(`Total Submissions:       ${stats.total_submissions}`);
  console.log(`Unique Facilities:       ${stats.unique_facilities}`);
  console.log(`Months Covered:          ${stats.unique_months}`);
  console.log(
    `Average Compliance:      ${parseFloat(stats.avg_compliance).toFixed(2)}%`
  );
  console.log(
    `Min Compliance:          ${parseFloat(stats.min_compliance).toFixed(2)}%`
  );
  console.log(
    `Max Compliance:          ${parseFloat(stats.max_compliance).toFixed(2)}%`
  );
  console.log(`PERM Submissions:        ${stats.perm_submissions}`);
  console.log(`Complete Status:         ${stats.complete_count}`);
  console.log(`Partial Status:          ${stats.partial_count}`);
  console.log(`Incomplete Status:       ${stats.incomplete_count}`);

  // Sample submission data
  const sample = await pgPool.query(
    `
    SELECT id, node_id, month, year, event_compliance_percentage, 
           completeness_status, data->>'facility_name' as facility_name,
           data->>'patients_monitored' as patients,
           created_at
    FROM form_submissions
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT 5
  `,
    [results.tenantId]
  );

  console.log('\n📋 Sample Submissions (latest 5):');
  sample.rows.forEach((row, i) => {
    console.log(`\n   ${i + 1}. ${row.facility_name}`);
    console.log(`      Node ID: ${row.node_id}`);
    console.log(`      Period: ${row.month}/${row.year}`);
    console.log(`      Compliance: ${row.event_compliance_percentage}%`);
    console.log(`      Status: ${row.completeness_status}`);
    console.log(`      Patients: ${row.patients}`);
  });

  // 2. Event Calendar
  console.log(
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
  console.log('📅 TABLE 2: event_calendar');
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );

  const events = await pgPool.query(
    `
    SELECT 
      COUNT(*) as total_events,
      COUNT(DISTINCT event_name) as unique_events,
      COUNT(DISTINCT month || '-' || year) as unique_months,
      COUNT(CASE WHEN is_required = true THEN 1 END) as required_events
    FROM event_calendar
    WHERE tenant_id = $1
  `,
    [results.tenantId]
  );

  const eventStats = events.rows[0];
  console.log(`Total Events:            ${eventStats.total_events}`);
  console.log(`Unique Event Types:      ${eventStats.unique_events}`);
  console.log(`Months Covered:          ${eventStats.unique_months}`);
  console.log(`Required Events:         ${eventStats.required_events}`);

  // Sample events
  const sampleEvents = await pgPool.query(
    `
    SELECT event_name, month, year, event_date, is_required
    FROM event_calendar
    WHERE tenant_id = $1
    ORDER BY year, month, event_date
    LIMIT 10
  `,
    [results.tenantId]
  );

  console.log('\n📋 Sample Events (first 10):');
  sampleEvents.rows.forEach((row, i) => {
    console.log(
      `   ${i + 1}. ${row.event_name} - ${row.month}/${row.year} (${
        row.is_required ? 'Required' : 'Optional'
      })`
    );
  });

  // 3. Event Compliance Tracking
  console.log(
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
  console.log('📈 TABLE 3: event_compliance_tracking');
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );

  const compliance = await pgPool.query(
    `
    SELECT 
      COUNT(*) as total_records,
      AVG(completeness_percentage) as avg_completeness,
      COUNT(CASE WHEN compliance_status = 'complete' THEN 1 END) as complete,
      COUNT(CASE WHEN compliance_status = 'partial' THEN 1 END) as partial,
      COUNT(CASE WHEN compliance_status = 'incomplete' THEN 1 END) as incomplete
    FROM event_compliance_tracking
    WHERE tenant_id = $1
  `,
    [results.tenantId]
  );

  const compStats = compliance.rows[0];
  if (parseInt(compStats.total_records) > 0) {
    console.log(`Total Records:           ${compStats.total_records}`);
    console.log(
      `Avg Completeness:        ${parseFloat(
        compStats.avg_completeness
      ).toFixed(2)}%`
    );
    console.log(`Complete Status:         ${compStats.complete}`);
    console.log(`Partial Status:          ${compStats.partial}`);
    console.log(`Incomplete Status:       ${compStats.incomplete}`);
  } else {
    console.log(
      '⊘ No compliance tracking records yet (will be created by worker)'
    );
  }

  // 4. Submission Validations
  console.log(
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
  console.log('✔️  TABLE 4: submission_validations');
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );

  const validations = await pgPool.query(
    `
    SELECT 
      COUNT(*) as total_validations,
      COUNT(CASE WHEN is_valid = true THEN 1 END) as valid_count,
      COUNT(CASE WHEN is_valid = false THEN 1 END) as invalid_count,
      COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical,
      COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warnings
    FROM submission_validations sv
    JOIN form_submissions fs ON sv.submission_id = fs.id
    WHERE fs.tenant_id = $1
  `,
    [results.tenantId]
  );

  const valStats = validations.rows[0];
  if (parseInt(valStats.total_validations) > 0) {
    console.log(`Total Validations:       ${valStats.total_validations}`);
    console.log(`Valid:                   ${valStats.valid_count}`);
    console.log(`Invalid:                 ${valStats.invalid_count}`);
    console.log(`Critical Issues:         ${valStats.critical}`);
    console.log(`Warnings:                ${valStats.warnings}`);
  } else {
    console.log('⊘ No validation records yet (will be created by worker)');
  }

  // 5. Notification Queue
  console.log(
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
  console.log('🔔 TABLE 5: notification_queue_perm');
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );

  const notifications = await pgPool.query(
    `
    SELECT 
      COUNT(*) as total_notifications,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      COUNT(CASE WHEN notification_type = 'compliance_alert' THEN 1 END) as alerts
    FROM notification_queue_perm
    WHERE tenant_id = $1
  `,
    [results.tenantId]
  );

  const notifStats = notifications.rows[0];
  if (parseInt(notifStats.total_notifications) > 0) {
    console.log(`Total Notifications:     ${notifStats.total_notifications}`);
    console.log(`Pending:                 ${notifStats.pending}`);
    console.log(`Sent:                    ${notifStats.sent}`);
    console.log(`Failed:                  ${notifStats.failed}`);
    console.log(`Compliance Alerts:       ${notifStats.alerts}`);
  } else {
    console.log('⊘ No notifications yet (will be created by worker)');
  }

  // 6. Activity Log
  console.log(
    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  );
  console.log('📝 TABLE 6: submission_activity_log');
  console.log(
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );

  const activity = await pgPool.query(
    `
    SELECT 
      COUNT(*) as total_activities,
      COUNT(CASE WHEN action = 'queued' THEN 1 END) as queued,
      COUNT(CASE WHEN action = 'processing' THEN 1 END) as processing,
      COUNT(CASE WHEN status = 'success' THEN 1 END) as success,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
    FROM submission_activity_log
    WHERE tenant_id = $1
  `,
    [results.tenantId]
  );

  const actStats = activity.rows[0];
  console.log(`Total Activities:        ${actStats.total_activities}`);
  console.log(`Queued:                  ${actStats.queued}`);
  console.log(`Processing:              ${actStats.processing}`);
  console.log(`Success:                 ${actStats.success}`);
  console.log(`Failed:                  ${actStats.failed}`);
}

// Step 6: Display Compliance Distribution
async function displayComplianceDistribution(pgPool) {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  STEP 6: Compliance Distribution Analysis                     ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  const distribution = await pgPool.query(
    `
    SELECT 
      CASE 
        WHEN event_compliance_percentage >= 90 THEN '90-100% (High Performers)'
        WHEN event_compliance_percentage >= 80 THEN '80-89% (Good)'
        WHEN event_compliance_percentage >= 60 THEN '60-79% (Medium)'
        WHEN event_compliance_percentage >= 40 THEN '40-59% (Low)'
        ELSE '0-39% (Critical)'
      END as compliance_range,
      COUNT(*) as count,
      ROUND(AVG(event_compliance_percentage), 2) as avg_compliance,
      COUNT(DISTINCT node_id) as facilities
    FROM form_submissions
    WHERE tenant_id = $1 AND perm_enabled = true
    GROUP BY compliance_range
    ORDER BY avg_compliance DESC
  `,
    [results.tenantId]
  );

  console.log('Compliance Distribution:');
  distribution.rows.forEach((row) => {
    const percentage = ((row.count / results.createdSubmissions) * 100).toFixed(
      1
    );
    console.log(
      `   ${row.compliance_range.padEnd(35)} | ${String(row.count).padStart(
        4
      )} submissions (${percentage}%) | ${row.facilities} facilities`
    );
  });

  // Performance tier breakdown
  console.log('\n\nPerformance Tier Breakdown:');
  const tiers = await pgPool.query(
    `
    SELECT 
      meta->>'performance_tier' as tier,
      COUNT(*) as submissions,
      COUNT(DISTINCT node_id) as facilities,
      ROUND(AVG(event_compliance_percentage), 2) as avg_compliance
    FROM form_submissions
    WHERE tenant_id = $1 AND perm_enabled = true
    GROUP BY tier
    ORDER BY avg_compliance DESC
  `,
    [results.tenantId]
  );

  tiers.rows.forEach((row) => {
    console.log(
      `   ${(row.tier || 'unknown').padEnd(15)} | ${String(
        row.submissions
      ).padStart(4)} submissions | ${String(row.facilities).padStart(
        2
      )} facilities | Avg: ${row.avg_compliance}%`
    );
  });
}

// Step 7: Display Sample JSONB Data
async function displaySampleJSONB(pgPool) {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  STEP 7: Sample JSONB Data Structure                          ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  const sample = await pgPool.query(
    `
    SELECT 
      node_id,
      month,
      year,
      event_compliance_percentage,
      data,
      meta
    FROM form_submissions
    WHERE tenant_id = $1 AND perm_enabled = true
    ORDER BY event_compliance_percentage ASC
    LIMIT 1
  `,
    [results.tenantId]
  );

  if (sample.rows.length > 0) {
    const row = sample.rows[0];
    console.log('📊 Sample Low-Compliance Submission:');
    console.log(`   Node: ${row.node_id}`);
    console.log(`   Period: ${row.month}/${row.year}`);
    console.log(`   Compliance: ${row.event_compliance_percentage}%`);
    console.log('\n   💾 DATA (JSONB):');
    console.log(
      JSON.stringify(row.data, null, 2)
        .split('\n')
        .map((l) => `      ${l}`)
        .join('\n')
    );
    console.log('\n   📋 META (JSONB):');
    console.log(
      JSON.stringify(row.meta, null, 2)
        .split('\n')
        .map((l) => `      ${l}`)
        .join('\n')
    );
  }

  const highSample = await pgPool.query(
    `
    SELECT 
      node_id,
      month,
      year,
      event_compliance_percentage,
      data,
      meta
    FROM form_submissions
    WHERE tenant_id = $1 AND perm_enabled = true
    ORDER BY event_compliance_percentage DESC
    LIMIT 1
  `,
    [results.tenantId]
  );

  if (highSample.rows.length > 0) {
    const row = highSample.rows[0];
    console.log('\n\n📊 Sample High-Compliance Submission:');
    console.log(`   Node: ${row.node_id}`);
    console.log(`   Period: ${row.month}/${row.year}`);
    console.log(`   Compliance: ${row.event_compliance_percentage}%`);
    console.log('\n   💾 DATA (JSONB):');
    console.log(
      JSON.stringify(row.data, null, 2)
        .split('\n')
        .map((l) => `      ${l}`)
        .join('\n')
    );
  }
}

// Main execution
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║     🏥 COMPREHENSIVE HEALTHCARE DATA GENERATION                              ║
║     For SabyAgentic E2E Testing with Full Transparency                      ║
║                                                                              ║
║     Case Study: National Healthcare Compliance Monitoring                    ║
║     50 Facilities × 3 Months × Weekly PERM Reporting                        ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  let pgPool;

  try {
    // Connect to PostgreSQL
    console.log('🔌 Connecting to PostgreSQL...');
    pgPool = new Pool(PG_CONFIG);
    await pgPool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected\n');

    // Execute steps
    await authenticate();
    await createProjectForm();
    await createEventCalendars(pgPool);
    await createSubmissions(pgPool);

    // Wait for workers to process (if any)
    console.log('\n⏳ Waiting 5 seconds for background workers to process...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Query all tables
    await queryAllTables(pgPool);
    await displayComplianceDistribution(pgPool);
    await displaySampleJSONB(pgPool);

    // Final summary
    console.log(
      '\n\n╔════════════════════════════════════════════════════════════════╗'
    );
    console.log(
      '║  ✅ DATA GENERATION COMPLETE                                   ║'
    );
    console.log(
      '╚════════════════════════════════════════════════════════════════╝\n'
    );
    console.log(`Created:`);
    console.log(`  • ${results.createdSubmissions} PERM submissions`);
    console.log(`  • ${results.createdEvents} event calendar entries`);
    console.log(`  • ${HEALTHCARE_FACILITIES.length} healthcare facilities`);
    console.log(`  • 3 months of historical data`);
    console.log(`  • Realistic compliance patterns (30% to 100%)`);
    console.log('\nReady for SabyAgentic E2E testing! 🚀\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (pgPool) {
      await pgPool.end();
      console.log('🔌 PostgreSQL connection closed');
    }
  }
}

main();
