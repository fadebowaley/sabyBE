/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  🏥 COMPREHENSIVE HEALTHCARE PERM DATA GENERATOR                            ║
 * ║  For SabyAgentic E2E Testing                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 * 
 * This script creates realistic healthcare compliance data with:
 * - 50 healthcare facilities (nodes)
 * - 3 months of PERM submissions (Sept-Nov 2025)
 * - Weekly submissions (Sundays) with varying compliance levels
 * - Realistic data quality issues
 * - Event calendar setup
 * - Compliance tracking
 * - Validation records
 * - Activity logs
 * 
 * Scenario: National Healthcare Compliance Monitoring System
 * Use Case: AI agent analysis and prediction
 */

const axios = require('axios');
const { Pool } = require('pg');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const BASE_URL = 'http://127.0.0.1:4000/v1';
const AUTH_EMAIL = 'saby@saby.ai';
const AUTH_PASSWORD = '@saby_Saby1';

// PostgreSQL connection
const pgPool = new Pool({
  host: '20.169.129.160',
  port: 5432,
  user: 'sabyagentic_user',
  password: 'WcKoT/m9hFGMaiztjci/reLyMVln9qE0ReAaHc0Cb8E=',
  database: 'halograph',
});

// Test data tracking
let stats = {
  nodes_created: 0,
  submissions_created: 0,
  compliance_records_created: 0,
  validations_created: 0,
  activity_logs_created: 0,
  errors: []
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function apiRequest(method, endpoint, data = null, token = null) {
  const config = {
    method,
    url: `${BASE_URL}${endpoint}`,
    headers: { 'Content-Type': 'application/json' },
  };
  
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (data) {
    config.data = data;
  }
  
  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`❌ API Error: ${method} ${endpoint}`, error.response?.data || error.message);
    throw error;
  }
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function getSundaysInMonth(year, month) {
  const sundays = [];
  const date = new Date(year, month - 1, 1);
  
  // Find first Sunday
  while (date.getDay() !== 0) {
    date.setDate(date.getDate() + 1);
  }
  
  // Get all Sundays in month
  while (date.getMonth() === month - 1) {
    sundays.push(new Date(date));
    date.setDate(date.getDate() + 7);
  }
  
  return sundays;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: AUTHENTICATE
// ═══════════════════════════════════════════════════════════════════════════

async function authenticate() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 1: Authentication                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  const result = await apiRequest('POST', '/auth/login', {
    email: AUTH_EMAIL,
    password: AUTH_PASSWORD
  });
  
  console.log('✅ Authenticated as:', result.user.email);
  console.log('   Tenant ID:', result.user.tenantId);
  console.log('   User ID:', result.user.id);
  
  return {
    token: result.tokens.access.token,
    tenantId: result.user.tenantId,
    userId: result.user.id
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: CREATE PROJECT FORM
// ═══════════════════════════════════════════════════════════════════════════

async function createProjectForm(auth) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 2: Create Healthcare Compliance Project Form                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  const formData = {
    category: 'Healthcare',
    title: 'Healthcare Facility Monthly Compliance Report',
    description: 'Monthly compliance reporting for healthcare facilities',
    elements: [
      {
        id: 'facility_name',
        type: 'text',
        label: 'Facility Name',
        required: true
      },
      {
        id: 'patient_visits',
        type: 'number',
        label: 'Total Patient Visits',
        required: true
      },
      {
        id: 'emergency_cases',
        type: 'number',
        label: 'Emergency Cases',
        required: true
      },
      {
        id: 'staff_count',
        type: 'number',
        label: 'Staff Count',
        required: true
      },
      {
        id: 'compliance_score',
        type: 'number',
        label: 'Compliance Score (%)',
        required: true
      },
      {
        id: 'incidents_reported',
        type: 'number',
        label: 'Incidents Reported',
        required: true
      }
    ],
    settings: {
      allowMultipleSubmissions: true,
      requireApproval: false
    },
    permConfig: {
      enabled: true,
      reportingFrequency: 'monthly',
      requiredEvents: [
        { name: 'Week 1 Report', required: true },
        { name: 'Week 2 Report', required: true },
        { name: 'Week 3 Report', required: true },
        { name: 'Week 4 Report', required: true }
      ],
      monthEndLocking: true,
      gracePeriodDays: 5
    }
  };
  
  const projectForm = await apiRequest('POST', '/project-forms', formData, auth.token);
  
  console.log('✅ Project Form Created:');
  console.log('   Form ID:', projectForm._id);
  console.log('   Category:', projectForm.category);
  console.log('   PERM Enabled:', projectForm.permConfig?.enabled);
  console.log('   Required Events:', projectForm.permConfig?.requiredEvents?.length);
  
  return projectForm;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: CREATE EVENT CALENDAR
// ═══════════════════════════════════════════════════════════════════════════

async function createEventCalendar(auth, projectForm) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 3: Create Event Calendar (Sept-Nov 2025)                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  const months = [
    { year: 2025, month: 9, name: 'September' },
    { year: 2025, month: 10, name: 'October' },
    { year: 2025, month: 11, name: 'November' }
  ];
  
  let totalEvents = 0;
  
  for (const { year, month, name } of months) {
    const sundays = getSundaysInMonth(year, month);
    console.log(`   ${name} ${year}: ${sundays.length} Sundays`);
    
    for (let i = 0; i < sundays.length; i++) {
      const eventDate = sundays[i];
      const eventName = `Week ${i + 1} Report`;
      
      await pgPool.query(`
        INSERT INTO event_calendar (
          tenant_id, project_id, form_id, event_name, event_date, 
          month, year, is_required, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, project_id, form_id, month, year, event_name) 
        DO NOTHING
      `, [
        auth.tenantId,
        projectForm.projectId || 'HEALTHCARE_PROJ_001',
        projectForm._id,
        eventName,
        eventDate,
        month,
        year,
        true,
        auth.userId
      ]);
      
      totalEvents++;
    }
  }
  
  console.log(`\n✅ Created ${totalEvents} calendar events`);
  return totalEvents;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: GENERATE HEALTHCARE FACILITIES (NODES)
// ═══════════════════════════════════════════════════════════════════════════

async function generateNodes(auth, projectForm) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 4: Generate 50 Healthcare Facilities (Nodes)                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  const facilityTypes = ['Hospital', 'Clinic', 'Health Center', 'Medical Center', 'Care Facility'];
  const regions = ['North', 'South', 'East', 'West', 'Central'];
  const cities = ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt', 'Enugu', 'Kaduna', 'Jos'];
  
  const nodes = [];
  
  for (let i = 1; i <= 50; i++) {
    const facilityType = facilityTypes[i % facilityTypes.length];
    const region = regions[i % regions.length];
    const city = cities[i % cities.length];
    
    nodes.push({
      node_id: `HCF_${String(i).padStart(3, '0')}`,
      name: `${region} ${facilityType} - ${city}`,
      type: facilityType,
      region: region,
      city: city,
      capacity: getRandomInt(50, 500),
      staff_size: getRandomInt(10, 100),
      // Performance tiers for realistic testing
      performance_tier: i <= 10 ? 'high' : i <= 30 ? 'medium' : 'low'
    });
  }
  
  console.log('✅ Generated 50 healthcare facilities');
  console.log('   High performers: 10 (20%)');
  console.log('   Medium performers: 20 (40%)');
  console.log('   Low performers: 20 (40%)');
  
  stats.nodes_created = nodes.length;
  return nodes;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: CREATE PERM SUBMISSIONS
// ═══════════════════════════════════════════════════════════════════════════

async function createPermSubmissions(auth, projectForm, nodes) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 5: Create PERM Submissions (50 nodes × 3 months × 4 weeks)             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  const months = [
    { year: 2025, month: 9, name: 'September' },
    { year: 2025, month: 10, name: 'October' },
    { year: 2025, month: 11, name: 'November' }
  ];
  
  let submissionCount = 0;
  
  for (const { year, month, name } of months) {
    console.log(`\n📅 ${name} ${year}:`);
    const sundays = getSundaysInMonth(year, month);
    
    for (const node of nodes) {
      // Determine how many weeks this node will submit (based on performance tier)
      let weeksToSubmit;
      if (node.performance_tier === 'high') {
        weeksToSubmit = sundays.length; // All weeks
      } else if (node.performance_tier === 'medium') {
        weeksToSubmit = Math.floor(sundays.length * 0.75); // 75% of weeks
      } else {
        weeksToSubmit = Math.floor(sundays.length * 0.5); // 50% of weeks
      }
      
      // Submit for random weeks
      const weekIndices = [];
      while (weekIndices.length < weeksToSubmit) {
        const weekIdx = getRandomInt(0, sundays.length - 1);
        if (!weekIndices.includes(weekIdx)) {
          weekIndices.push(weekIdx);
        }
      }
      
      for (const weekIdx of weekIndices) {
        const sunday = sundays[weekIdx];
        
        // Generate realistic healthcare data
        const basePatients = node.capacity * getRandomFloat(0.6, 0.95);
        const complianceScore = node.performance_tier === 'high' 
          ? getRandomInt(85, 100) 
          : node.performance_tier === 'medium' 
            ? getRandomInt(70, 84) 
            : getRandomInt(50, 69);
        
        const submissionPayload = {
          tenantId: auth.tenantId,
          projectId: projectForm.projectId || 'HEALTHCARE_PROJ_001',
          formId: projectForm._id,
          nodeId: node.node_id,
          userId: auth.userId,
          payload: {
            facility_name: node.name,
            patient_visits: Math.floor(basePatients),
            emergency_cases: Math.floor(basePatients * getRandomFloat(0.05, 0.15)),
            staff_count: node.staff_size + getRandomInt(-5, 5),
            compliance_score: complianceScore,
            incidents_reported: complianceScore > 80 ? getRandomInt(0, 2) : getRandomInt(2, 8),
            week: weekIdx + 1,
            submission_date: sunday.toISOString()
          },
          source: 'api',
          meta: {
            node_type: node.type,
            region: node.region,
            city: node.city,
            performance_tier: node.performance_tier
          },
          status: 'submitted',
          project_name: 'Healthcare Compliance Monitoring',
          project_category: 'Healthcare',
          month: month,
          year: year,
          perm_enabled: true
        };
        
        try {
          await apiRequest('POST', '/submissions', submissionPayload, auth.token);
          submissionCount++;
          
          if (submissionCount % 50 === 0) {
            console.log(`   ✅ Created ${submissionCount} submissions...`);
          }
        } catch (error) {
          stats.errors.push(`Submission failed for ${node.node_id} - ${name} Week ${weekIdx + 1}`);
        }
      }
    }
    
    console.log(`   ✅ Completed ${name}: ${submissionCount} total submissions`);
  }
  
  stats.submissions_created = submissionCount;
  console.log(`\n✅ Total PERM Submissions Created: ${submissionCount}`);
  return submissionCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: WAIT FOR PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

async function waitForProcessing() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 6: Wait for Queue Processing                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('⏳ Waiting 15 seconds for BullMQ workers to process submissions...');
  
  for (let i = 15; i > 0; i--) {
    process.stdout.write(`\r   ${i} seconds remaining...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\r   ✅ Processing time complete                                ');
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 7: VERIFY DATA IN ALL TABLES
// ═══════════════════════════════════════════════════════════════════════════

async function verifyAllTables(auth) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 7: Verify Data in All PostgreSQL Tables                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  // Table 1: form_submissions
  const submissions = await pgPool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE perm_enabled = true) as perm_count,
      COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      AVG(CAST(payload->>'compliance_score' AS INTEGER)) as avg_compliance,
      COUNT(DISTINCT node_id) as unique_nodes,
      COUNT(DISTINCT month) as unique_months
    FROM form_submissions
    WHERE tenant_id = $1
      AND project_category = 'Healthcare'
      AND created_at >= NOW() - INTERVAL '10 minutes'
  `, [auth.tenantId]);
  
  console.log('📊 TABLE: form_submissions');
  console.log('   Total submissions:', submissions.rows[0].total);
  console.log('   PERM submissions:', submissions.rows[0].perm_count);
  console.log('   Status - Submitted:', submissions.rows[0].submitted);
  console.log('   Status - Approved:', submissions.rows[0].approved);
  console.log('   Avg Compliance Score:', parseFloat(submissions.rows[0].avg_compliance || 0).toFixed(2) + '%');
  console.log('   Unique Nodes:', submissions.rows[0].unique_nodes);
  console.log('   Unique Months:', submissions.rows[0].unique_months);
  
  // Sample submission data
  const sampleSubmission = await pgPool.query(`
    SELECT id, node_id, month, year, payload, meta, event_compliance_percentage
    FROM form_submissions
    WHERE tenant_id = $1
      AND project_category = 'Healthcare'
      AND perm_enabled = true
    ORDER BY created_at DESC
    LIMIT 1
  `, [auth.tenantId]);
  
  if (sampleSubmission.rows.length > 0) {
    console.log('\n   📄 Sample Submission:');
    console.log('      ID:', sampleSubmission.rows[0].id);
    console.log('      Node:', sampleSubmission.rows[0].node_id);
    console.log('      Month/Year:', `${sampleSubmission.rows[0].month}/${sampleSubmission.rows[0].year}`);
    console.log('      Payload:', JSON.stringify(sampleSubmission.rows[0].payload).substring(0, 100) + '...');
    console.log('      Meta:', JSON.stringify(sampleSubmission.rows[0].meta).substring(0, 100) + '...');
    console.log('      Event Compliance:', sampleSubmission.rows[0].event_compliance_percentage + '%');
  }
  
  // Table 2: event_calendar
  const events = await pgPool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT month) as unique_months,
      COUNT(DISTINCT event_name) as unique_events
    FROM event_calendar
    WHERE tenant_id = $1
      AND project_id = $2
  `, [auth.tenantId, projectForm.projectId || 'HEALTHCARE_PROJ_001']);
  
  console.log('\n📊 TABLE: event_calendar');
  console.log('   Total events:', events.rows[0].total);
  console.log('   Unique months:', events.rows[0].unique_months);
  console.log('   Unique event types:', events.rows[0].unique_events);
  
  // Table 3: event_compliance_tracking
  const compliance = await pgPool.query(`
    SELECT 
      COUNT(*) as total,
      AVG(completeness_percentage) as avg_completeness,
      COUNT(*) FILTER (WHERE compliance_status = 'complete') as complete,
      COUNT(*) FILTER (WHERE compliance_status = 'partial') as partial,
      COUNT(*) FILTER (WHERE compliance_status = 'incomplete') as incomplete
    FROM event_compliance_tracking
    WHERE tenant_id = $1
  `, [auth.tenantId]);
  
  console.log('\n📊 TABLE: event_compliance_tracking');
  console.log('   Total records:', compliance.rows[0].total);
  console.log('   Avg Completeness:', parseFloat(compliance.rows[0].avg_completeness || 0).toFixed(2) + '%');
  console.log('   Complete:', compliance.rows[0].complete);
  console.log('   Partial:', compliance.rows[0].partial);
  console.log('   Incomplete:', compliance.rows[0].incomplete);
  
  // Table 4: submission_validations
  const validations = await pgPool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_valid = true) as valid,
      COUNT(*) FILTER (WHERE is_valid = false) as invalid,
      COUNT(*) FILTER (WHERE severity = 'error') as errors,
      COUNT(*) FILTER (WHERE severity = 'warning') as warnings
    FROM submission_validations
    WHERE submission_id IN (
      SELECT id FROM form_submissions 
      WHERE tenant_id = $1 
        AND project_category = 'Healthcare'
        AND created_at >= NOW() - INTERVAL '10 minutes'
    )
  `, [auth.tenantId]);
  
  console.log('\n📊 TABLE: submission_validations');
  console.log('   Total validations:', validations.rows[0].total);
  console.log('   Valid:', validations.rows[0].valid);
  console.log('   Invalid:', validations.rows[0].invalid);
  console.log('   Errors:', validations.rows[0].errors);
  console.log('   Warnings:', validations.rows[0].warnings);
  
  // Table 5: submission_activity_log
  const activity = await pgPool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as success,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE action = 'queued') as queued,
      COUNT(*) FILTER (WHERE action = 'processed') as processed
    FROM submission_activity_log
    WHERE tenant_id = $1
      AND created_at >= NOW() - INTERVAL '10 minutes'
  `, [auth.tenantId]);
  
  console.log('\n📊 TABLE: submission_activity_log');
  console.log('   Total activities:', activity.rows[0].total);
  console.log('   Success:', activity.rows[0].success);
  console.log('   Failed:', activity.rows[0].failed);
  console.log('   Queued:', activity.rows[0].queued);
  console.log('   Processed:', activity.rows[0].processed);
  
  stats.compliance_records_created = compliance.rows[0].total;
  stats.validations_created = validations.rows[0].total;
  stats.activity_logs_created = activity.rows[0].total;
  
  return {
    submissions: submissions.rows[0],
    events: events.rows[0],
    compliance: compliance.rows[0],
    validations: validations.rows[0],
    activity: activity.rows[0]
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 8: DISPLAY SAMPLE DATA FOR TRANSPARENCY
// ═══════════════════════════════════════════════════════════════════════════

async function displaySampleData(auth) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 8: Display Sample Data for Transparency                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  // Get sample high performer
  const highPerformer = await pgPool.query(`
    SELECT 
      node_id,
      month,
      year,
      payload,
      meta,
      event_compliance_percentage,
      validation_status
    FROM form_submissions
    WHERE tenant_id = $1
      AND project_category = 'Healthcare'
      AND CAST(payload->>'compliance_score' AS INTEGER) >= 85
    ORDER BY created_at DESC
    LIMIT 1
  `, [auth.tenantId]);
  
  if (highPerformer.rows.length > 0) {
    const hp = highPerformer.rows[0];
    console.log('✅ HIGH PERFORMER SAMPLE:');
    console.log('   Node ID:', hp.node_id);
    console.log('   Month/Year:', `${hp.month}/${hp.year}`);
    console.log('   Compliance Score:', hp.payload.compliance_score + '%');
    console.log('   Patient Visits:', hp.payload.patient_visits);
    console.log('   Emergency Cases:', hp.payload.emergency_cases);
    console.log('   Event Compliance:', hp.event_compliance_percentage + '%');
    console.log('   Performance Tier:', hp.meta.performance_tier);
  }
  
  // Get sample low performer
  const lowPerformer = await pgPool.query(`
    SELECT 
      node_id,
      month,
      year,
      payload,
      meta,
      event_compliance_percentage
    FROM form_submissions
    WHERE tenant_id = $1
      AND project_category = 'Healthcare'
      AND CAST(payload->>'compliance_score' AS INTEGER) < 70
    ORDER BY created_at DESC
    LIMIT 1
  `, [auth.tenantId]);
  
  if (lowPerformer.rows.length > 0) {
    const lp = lowPerformer.rows[0];
    console.log('\n❌ LOW PERFORMER SAMPLE:');
    console.log('   Node ID:', lp.node_id);
    console.log('   Month/Year:', `${lp.month}/${lp.year}`);
    console.log('   Compliance Score:', lp.payload.compliance_score + '%');
    console.log('   Patient Visits:', lp.payload.patient_visits);
    console.log('   Incidents Reported:', lp.payload.incidents_reported);
    console.log('   Event Compliance:', lp.event_compliance_percentage + '%');
    console.log('   Performance Tier:', lp.meta.performance_tier);
  }
  
  // Get compliance breakdown
  const complianceBreakdown = await pgPool.query(`
    SELECT 
      node_id,
      month,
      year,
      completeness_percentage,
      compliance_status,
      total_events_required,
      total_events_submitted,
      events_breakdown
    FROM event_compliance_tracking
    WHERE tenant_id = $1
    ORDER BY completeness_percentage DESC
    LIMIT 5
  `, [auth.tenantId]);
  
  console.log('\n📊 TOP 5 COMPLIANCE RECORDS:');
  complianceBreakdown.rows.forEach((record, idx) => {
    console.log(`   ${idx + 1}. ${record.node_id} (${record.month}/${record.year})`);
    console.log(`      Completeness: ${record.completeness_percentage}%`);
    console.log(`      Status: ${record.compliance_status}`);
    console.log(`      Events: ${record.total_events_submitted}/${record.total_events_required}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║  🏥 COMPREHENSIVE HEALTHCARE PERM DATA GENERATOR                            ║
║  For SabyAgentic E2E Testing                                                 ║
║                                                                              ║
║  Scenario: National Healthcare Compliance Monitoring System                  ║
║  - 50 healthcare facilities across the country                               ║
║  - 3 months of PERM compliance data (Sept-Nov 2025)                          ║
║  - Realistic performance tiers (high/medium/low)                             ║
║  - Complete event calendar and compliance tracking                           ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);
  
  const startTime = Date.now();
  
  try {
    // Step 1: Authenticate
    const auth = await authenticate();
    
    // Step 2: Create project form
    const projectForm = await createProjectForm(auth);
    
    // Step 3: Create event calendar
    await createEventCalendar(auth, projectForm);
    
    // Step 4: Generate nodes
    const nodes = await generateNodes(auth, projectForm);
    
    // Step 5: Create PERM submissions
    await createPermSubmissions(auth, projectForm, nodes);
    
    // Step 6: Wait for processing
    await waitForProcessing();
    
    // Step 7: Verify data
    const verification = await verifyAllTables(auth);
    
    // Step 8: Display samples
    await displaySampleData(auth);
    
    // Final Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ DATA GENERATION COMPLETE                                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    console.log('📊 FINAL STATISTICS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Healthcare Facilities:', stats.nodes_created);
    console.log('   PERM Submissions:', stats.submissions_created);
    console.log('   Compliance Records:', stats.compliance_records_created);
    console.log('   Validation Records:', stats.validations_created);
    console.log('   Activity Logs:', stats.activity_logs_created);
    console.log('   Errors:', stats.errors.length);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   ⏱️  Duration:', duration + 's');
    console.log('   📅 Completed:', new Date().toISOString());
    console.log('');
    
    if (stats.errors.length > 0) {
      console.log('⚠️  ERRORS ENCOUNTERED:');
      stats.errors.forEach(err => console.log('   •', err));
      console.log('');
    }
    
    console.log('✅ Ready for sabyAgentic E2E testing!');
    console.log('   Run: cd ../sabyAgentic && python3 test_e2e_real_data.py');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

// Run the script
main();

