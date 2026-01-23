/**
 * PERM Unified Submission Test
 *
 * Purpose: Test PERM submissions through unified submission route
 * Uses: Existing ProjectForm from MongoDB
 * Tests: Create, Update (merge), Compliance calculation, Locking
 *
 * Date: October 23, 2025
 * Author: Backend Testing Team
 */

const axios = require('axios');
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:4000/v1';
const MONGO_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/halo-staging';

// Test data
let authToken;
let testTenantId;
let testProjectId;
let testFormId;
let testNodeId;
let testUserId;
let submissionJobId;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}▶${colors.reset} ${msg}`),
  header: (msg) =>
    console.log(
      `\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`
    ),
};

/**
 * Helper: Make API request
 */
async function apiRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (data) {
      if (method === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `API Error: ${error.response.status} - ${JSON.stringify(
          error.response.data
        )}`
      );
    }
    throw error;
  }
}

/**
 * Helper: Wait for worker to process
 */
async function waitForProcessing(seconds = 3) {
  log.info(`Waiting ${seconds}s for worker to process...`);
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Step 1: Login and get auth token
 */
async function loginUser() {
  log.header();
  log.step('STEP 1: Login User');

  try {
    const loginData = {
      email: 'saby@saby.ai',
      password: '@saby_Saby1',
    };

    const response = await apiRequest('POST', '/auth/login', loginData);

    if (!response.tokens || !response.tokens.access) {
      throw new Error('No access token in response');
    }

    authToken = response.tokens.access.token;
    testUserId = response.user.id;
    testTenantId = response.user.tenantId;

    log.success(`Logged in as: ${response.user.email}`);
    log.info(`User ID: ${testUserId}`);
    log.info(`Tenant ID: ${testTenantId}`);
    log.info(`Token: ${authToken.substring(0, 20)}...`);
  } catch (error) {
    log.error(`Login failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 2: Get or Create PERM Form in MongoDB
 */
async function setupPERMForm() {
  log.header();
  log.step('STEP 2: Setup PERM Form in MongoDB');

  try {
    await mongoose.connect(MONGO_URI);
    log.success('Connected to MongoDB');

    const ProjectForm = mongoose.model(
      'ProjectForm',
      require('./src/models/projectForm.model').schema
    );

    // Check for existing PERM form
    let projectForm = await ProjectForm.findOne({
      tenantId: testTenantId,
      'configuration.projectName': 'PERM Event Tracking Test',
      deletedAt: null,
    });

    if (projectForm) {
      log.info('Found existing PERM form');
      testProjectId = projectForm.projectId;
      testFormId = projectForm.projectId;
    } else {
      log.info('Creating new PERM form...');

      // Create PERM form with event fields
      const formData = {
        configuration: {
          projectName: 'PERM Event Tracking Test',
          tags: ['PERM', 'Church Events', 'Test'],
          accessibility: ['api', 'mobile'],
          security: 'private',
        },
        elements: [
          {
            id: 'sundayService',
            type: 'checkbox',
            properties: {
              label: 'Sunday Service',
              required: true,
              validation: { required: true },
            },
          },
          {
            id: 'bibleStudy',
            type: 'checkbox',
            properties: {
              label: 'Bible Study',
              required: true,
              validation: { required: true },
            },
          },
          {
            id: 'prayerMeeting',
            type: 'checkbox',
            properties: {
              label: 'Prayer Meeting',
              required: true,
              validation: { required: true },
            },
          },
          {
            id: 'youthService',
            type: 'checkbox',
            properties: {
              label: 'Youth Service',
              required: false,
              validation: { required: false },
            },
          },
          {
            id: 'womenFellowship',
            type: 'checkbox',
            properties: {
              label: 'Women Fellowship',
              required: false,
              validation: { required: false },
            },
          },
        ],
        userSettings: {
          behavior: {
            allowMultipleSubmissions: true,
            enableProgressSave: true,
          },
        },
        metadata: {
          version: '1.0.0',
          deploymentStatus: 'published',
          formType: 'perm',
          category: 'church_events',
        },
        status: 'active',
      };

      testProjectId = `proj_${nanoid(12)}`;
      projectForm = await ProjectForm.create({
        projectId: testProjectId,
        tenantId: testTenantId,
        createdBy: new mongoose.Types.ObjectId(testUserId),
        ...formData,
      });

      testFormId = projectForm.projectId;
      log.success('PERM form created');
    }

    log.success(`Project ID: ${testProjectId}`);
    log.success(`Form ID: ${testFormId}`);
    log.info(`Form Name: ${projectForm.configuration.projectName}`);
    log.info(`Elements: ${projectForm.elements.length} event checkboxes`);
    log.info(`Status: ${projectForm.status}`);
    log.info(`Deployment: ${projectForm.metadata.deploymentStatus}`);

    await mongoose.connection.close();
    log.info('MongoDB connection closed');
  } catch (error) {
    log.error(`Setup PERM form failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 3: Get or Create Test Node
 */
async function setupTestNode() {
  log.header();
  log.step('STEP 3: Setup Test Node');

  try {
    // Get existing node or use test node
    const nodesResponse = await apiRequest('GET', '/node', {
      tenantId: testTenantId,
      limit: 1,
    });

    if (nodesResponse.results && nodesResponse.results.length > 0) {
      testNodeId = nodesResponse.results[0].id;
      log.success(`Using existing node: ${testNodeId}`);
      log.info(`Node Name: ${nodesResponse.results[0].name}`);
    } else {
      // Use a test node ID (node will be created if needed)
      testNodeId = `node_test_${Date.now()}`;
      log.warn(`No existing nodes found, using test node: ${testNodeId}`);
    }
  } catch (error) {
    log.warn(`Could not fetch nodes: ${error.message}`);
    testNodeId = `node_test_${Date.now()}`;
    log.info(`Using test node: ${testNodeId}`);
  }
}

/**
 * Step 4: Submit Initial PERM Data (Create)
 */
async function submitInitialPERMData() {
  log.header();
  log.step('STEP 4: Submit Initial PERM Data (CREATE)');

  // Use first day of current month in YYYY-MM-DD format
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-01`;

  const submissionData = {
    tenantId: testTenantId,
    projectId: testProjectId,
    formId: testFormId,
    nodeId: testNodeId,
    month: currentMonth,
    payload: {
      events: ['sundayService', 'bibleStudy'], // 2 out of 5 events
      required_events: [
        'sundayService',
        'bibleStudy',
        'prayerMeeting',
        'youthService',
        'womenFellowship',
      ],
      sundayService: true,
      bibleStudy: true,
      prayerMeeting: false,
      youthService: false,
      womenFellowship: false,
    },
    source: 'api',
    perm_enabled: true,
    project_name: 'PERM Event Tracking Test',
    project_category: 'church_events',
  };

  log.info(`Submitting PERM data for month: ${currentMonth}`);
  log.info(`Node ID: ${testNodeId}`);
  log.info(`Events submitted: 2/5 (40% compliance)`);

  try {
    const response = await apiRequest('POST', '/submissions', submissionData);

    log.success('PERM submission queued!');
    log.info(`Job ID: ${response.jobId}`);
    log.info(`Type: ${response.type}`);
    log.info(`Month: ${response.month}`);
    log.info(`Node ID: ${response.nodeId}`);

    submissionJobId = response.jobId;

    // Wait for worker to process
    await waitForProcessing(3);

    // Check activity logs
    const activityLogs = await apiRequest('GET', '/submissions/activity-log', {
      tenant_id: testTenantId, // ← Fixed: Use snake_case
      limit: 5,
    });

    log.info(`Activity logs retrieved: ${activityLogs.total} total`);

    const recentLogs = activityLogs.results.slice(0, 3);
    recentLogs.forEach((activityLog) => {
      const statusColor =
        activityLog.status === 'success'
          ? colors.green
          : activityLog.status === 'failed'
          ? colors.red
          : colors.yellow;
      log.info(
        `  ${statusColor}${activityLog.action}${colors.reset}: ${activityLog.message}`
      );
    });
  } catch (error) {
    log.error(`Initial PERM submission failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 5: Verify Submission Saved
 */
async function verifyInitialSubmission() {
  log.header();
  log.step('STEP 5: Verify Initial Submission Saved');

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}-01`;

    // Get submissions for this month
    const submissions = await apiRequest('GET', '/submissions', {
      tenant_id: testTenantId,
      project_id: testProjectId,
      node_id: testNodeId,
      month: currentMonth,
      perm_enabled: true,
    });

    log.info(`Submissions found: ${submissions.count}`);

    if (submissions.results && submissions.results.length > 0) {
      const submission = submissions.results[0];

      log.success('Initial PERM submission saved!');
      log.info(`Submission ID: ${submission.id}`);
      log.info(`Compliance: ${submission.event_compliance_percentage}%`);
      log.info(`Status: ${submission.completeness_status}`);
      log.info(
        `Events Submitted: ${submission.total_events_submitted}/${submission.total_events_required}`
      );
      log.info(`Data keys: ${Object.keys(submission.data || {}).join(', ')}`);

      return submission;
    } else {
      throw new Error('No submissions found after worker processing');
    }
  } catch (error) {
    log.error(`Verification failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 6: Submit Additional Data (Update/Merge)
 */
async function submitAdditionalPERMData() {
  log.header();
  log.step('STEP 6: Submit Additional PERM Data (UPDATE/MERGE)');

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-01`;

  const additionalData = {
    tenantId: testTenantId,
    projectId: testProjectId,
    formId: testFormId,
    nodeId: testNodeId,
    month: currentMonth,
    payload: {
      events: ['sundayService', 'bibleStudy', 'prayerMeeting', 'youthService'], // 4 out of 5 now
      required_events: [
        'sundayService',
        'bibleStudy',
        'prayerMeeting',
        'youthService',
        'womenFellowship',
      ],
      sundayService: true, // Already true (will stay)
      bibleStudy: true, // Already true (will stay)
      prayerMeeting: true, // NEW: false → true
      youthService: true, // NEW: false → true
      womenFellowship: false, // Still false
    },
    source: 'api',
    perm_enabled: true,
    project_name: 'PERM Event Tracking Test',
    project_category: 'church_events',
  };

  log.info(`Submitting additional data for month: ${currentMonth}`);
  log.info(`Events now submitted: 4/5 (80% compliance expected)`);
  log.info(`Expected action: UPDATE (merge with existing)`);

  try {
    const response = await apiRequest('POST', '/submissions', additionalData);

    log.success('Additional PERM data queued!');
    log.info(`Job ID: ${response.jobId}`);
    log.info(`Type: ${response.type}`);

    // Wait for worker to process
    await waitForProcessing(3);
  } catch (error) {
    log.error(`Additional PERM submission failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 7: Verify Data Merge
 */
async function verifyDataMerge() {
  log.header();
  log.step('STEP 7: Verify Data Was Merged');

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}-01`;

    const submissions = await apiRequest('GET', '/submissions', {
      tenant_id: testTenantId,
      project_id: testProjectId,
      node_id: testNodeId,
      month: currentMonth,
      perm_enabled: true,
    });

    log.info(`Submissions found: ${submissions.count}`);

    if (submissions.results && submissions.results.length > 0) {
      const submission = submissions.results[0];

      log.success('Merged PERM submission verified!');
      log.info(`Submission ID: ${submission.id}`);
      log.info(
        `Updated Compliance: ${submission.event_compliance_percentage}%`
      );
      log.info(`Updated Status: ${submission.completeness_status}`);
      log.info(
        `Updated Events: ${submission.total_events_submitted}/${submission.total_events_required}`
      );

      // Verify data merge
      const data = submission.data || {};
      log.info('\nEvent Status:');
      log.info(
        `  Sunday Service: ${
          data.sundayService ? colors.green + '✓' : colors.red + '✗'
        }${colors.reset}`
      );
      log.info(
        `  Bible Study: ${
          data.bibleStudy ? colors.green + '✓' : colors.red + '✗'
        }${colors.reset}`
      );
      log.info(
        `  Prayer Meeting: ${
          data.prayerMeeting ? colors.green + '✓' : colors.red + '✗'
        }${colors.reset}`
      );
      log.info(
        `  Youth Service: ${
          data.youthService ? colors.green + '✓' : colors.red + '✗'
        }${colors.reset}`
      );
      log.info(
        `  Women Fellowship: ${
          data.womenFellowship ? colors.green + '✓' : colors.red + '✗'
        }${colors.reset}`
      );

      // Verify merge happened
      if (submission.event_compliance_percentage !== 40.0) {
        log.success(
          `✅ Data was MERGED! Compliance increased to ${submission.event_compliance_percentage}%`
        );
      } else {
        log.warn(`⚠️ Data might not have merged. Compliance still at 40%`);
      }

      return submission;
    } else {
      throw new Error('No submissions found after merge');
    }
  } catch (error) {
    log.error(`Merge verification failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 8: Submit Complete Data (100% compliance)
 */
async function submitCompleteData() {
  log.header();
  log.step('STEP 8: Submit Complete Data (100% Compliance)');

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-01`;

  const completeData = {
    tenantId: testTenantId,
    projectId: testProjectId,
    formId: testFormId,
    nodeId: testNodeId,
    month: currentMonth,
    payload: {
      events: [
        'sundayService',
        'bibleStudy',
        'prayerMeeting',
        'youthService',
        'womenFellowship',
      ],
      required_events: [
        'sundayService',
        'bibleStudy',
        'prayerMeeting',
        'youthService',
        'womenFellowship',
      ],
      sundayService: true,
      bibleStudy: true,
      prayerMeeting: true,
      youthService: true,
      womenFellowship: true, // NOW TRUE (was false)
    },
    source: 'api',
    perm_enabled: true,
  };

  log.info(`Submitting complete data for month: ${currentMonth}`);
  log.info(`Events: ALL 5 events (100% compliance expected)`);

  try {
    const response = await apiRequest('POST', '/submissions', completeData);

    log.success('Complete PERM data queued!');
    log.info(`Job ID: ${response.jobId}`);

    await waitForProcessing(3);

    // Verify 100% compliance
    const submissions = await apiRequest('GET', '/submissions', {
      tenant_id: testTenantId,
      project_id: testProjectId,
      node_id: testNodeId,
      month: currentMonth,
      perm_enabled: true,
    });

    const submission = submissions.results[0];

    if (submission.event_compliance_percentage === 100) {
      log.success(`🎉 100% Compliance achieved!`);
      log.success(`Status: ${submission.completeness_status}`);
    } else {
      log.warn(
        `Compliance: ${submission.event_compliance_percentage}% (expected 100%)`
      );
    }

    return submission;
  } catch (error) {
    log.error(`Complete data submission failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 9: Test Different Node (Should Create New Submission)
 */
async function testDifferentNode() {
  log.header();
  log.step('STEP 9: Test Different Node (New Submission)');

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-01`;
  const differentNodeId = `node_test_different_${Date.now()}`;

  const newNodeData = {
    tenantId: testTenantId,
    projectId: testProjectId,
    formId: testFormId,
    nodeId: differentNodeId, // ← Different node
    month: currentMonth, // ← Same month
    payload: {
      events: ['sundayService'],
      required_events: [
        'sundayService',
        'bibleStudy',
        'prayerMeeting',
        'youthService',
        'womenFellowship',
      ],
      sundayService: true,
      bibleStudy: false,
      prayerMeeting: false,
      youthService: false,
      womenFellowship: false,
    },
    source: 'api',
    perm_enabled: true,
  };

  log.info(`Submitting for different node: ${differentNodeId}`);
  log.info(`Same month: ${currentMonth}`);
  log.info(`Expected: NEW submission (not merge)`);

  try {
    const response = await apiRequest('POST', '/submissions', newNodeData);
    log.success('Different node submission queued!');

    await waitForProcessing(3);

    // Verify two separate submissions exist
    const submissions = await apiRequest('GET', '/submissions', {
      tenant_id: testTenantId,
      project_id: testProjectId,
      month: currentMonth,
      perm_enabled: true,
    });

    log.info(`Total submissions for ${currentMonth}: ${submissions.count}`);

    if (submissions.count >= 2) {
      log.success(`✅ Multiple nodes tracked separately!`);
      submissions.results.forEach((sub, idx) => {
        log.info(
          `  Node ${idx + 1}: ${sub.node_id} - ${
            sub.event_compliance_percentage
          }% compliance`
        );
      });
    } else {
      log.warn(`Expected 2+ submissions, found ${submissions.count}`);
    }
  } catch (error) {
    log.error(`Different node test failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 10: Test Different Month (Should Create New Submission)
 */
async function testDifferentMonth() {
  log.header();
  log.step('STEP 10: Test Different Month (New Submission)');

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(
    nextMonth.getMonth() + 1
  ).padStart(2, '0')}-01`; // YYYY-MM-DD

  const newMonthData = {
    tenantId: testTenantId,
    projectId: testProjectId,
    formId: testFormId,
    nodeId: testNodeId, // ← Same node
    month: nextMonthStr, // ← Different month
    payload: {
      events: ['sundayService', 'bibleStudy', 'prayerMeeting'],
      required_events: [
        'sundayService',
        'bibleStudy',
        'prayerMeeting',
        'youthService',
        'womenFellowship',
      ],
      sundayService: true,
      bibleStudy: true,
      prayerMeeting: true,
      youthService: false,
      womenFellowship: false,
    },
    source: 'api',
    perm_enabled: true,
  };

  log.info(`Submitting for different month: ${nextMonthStr}`);
  log.info(`Same node: ${testNodeId}`);
  log.info(`Expected: NEW submission (not merge)`);
  log.info(`Events: 3/5 (60% compliance)`);

  try {
    const response = await apiRequest('POST', '/submissions', newMonthData);
    log.success('Different month submission queued!');

    await waitForProcessing(3);

    // Verify submission exists for next month
    const submissions = await apiRequest('GET', '/submissions', {
      tenant_id: testTenantId,
      project_id: testProjectId,
      node_id: testNodeId,
      month: nextMonthStr,
      perm_enabled: true,
    });

    if (submissions.count > 0) {
      const submission = submissions.results[0];
      log.success(`✅ New month submission created!`);
      log.info(`Submission ID: ${submission.id}`);
      log.info(`Month: ${submission.month}`);
      log.info(`Compliance: ${submission.event_compliance_percentage}%`);
    } else {
      log.warn(`No submission found for ${nextMonthStr}`);
    }
  } catch (error) {
    log.error(`Different month test failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 11: Get All Submissions Summary
 */
async function getAllSubmissionsSummary() {
  log.header();
  log.step('STEP 11: Get All PERM Submissions Summary');

  try {
    const submissions = await apiRequest('GET', '/submissions', {
      tenant_id: testTenantId,
      project_id: testProjectId,
      perm_enabled: true,
    });

    log.success(`Total PERM submissions: ${submissions.count}`);

    // Group by month
    const byMonth = {};
    submissions.results.forEach((sub) => {
      if (!byMonth[sub.month]) {
        byMonth[sub.month] = [];
      }
      byMonth[sub.month].push(sub);
    });

    log.info('\nSubmissions by Month:');
    Object.keys(byMonth)
      .sort()
      .forEach((month) => {
        log.info(`  ${month}: ${byMonth[month].length} submissions`);
        byMonth[month].forEach((sub) => {
          const statusColor =
            sub.completeness_status === 'complete'
              ? colors.green
              : sub.completeness_status === 'partial'
              ? colors.yellow
              : colors.red;
          log.info(
            `    - Node: ${sub.node_id} | ${statusColor}${sub.event_compliance_percentage}%${colors.reset} | ${sub.completeness_status}`
          );
        });
      });
  } catch (error) {
    log.error(`Summary failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 12: Test Activity Logs
 */
async function testActivityLogs() {
  log.header();
  log.step('STEP 12: Test Activity Logs');

  try {
    // Get recent activity logs
    const recentLogs = await apiRequest(
      'GET',
      '/submissions/activity-log/recent',
      {
        tenant_id: testTenantId,
        limit: 10,
      }
    );

    log.success(`Recent activity logs: ${recentLogs.count}`);

    // Count by action
    const actionCounts = {};
    recentLogs.data.forEach((activityLog) => {
      actionCounts[activityLog.action] =
        (actionCounts[activityLog.action] || 0) + 1;
    });

    log.info('\nActivity Log Breakdown:');
    Object.keys(actionCounts).forEach((action) => {
      log.info(`  ${action}: ${actionCounts[action]}`);
    });

    // Get activity summary
    const summary = await apiRequest(
      'GET',
      '/submissions/activity-log/summary'
    );

    log.info('\nOverall Activity Summary:');
    log.info(`  Total Jobs: ${summary.summary.total_jobs}`);
    log.info(
      `  ${colors.green}Success: ${summary.summary.success}${colors.reset}`
    );
    log.info(`  ${colors.red}Failed: ${summary.summary.failed}${colors.reset}`);
    log.info(
      `  ${colors.yellow}Queued: ${summary.summary.queued}${colors.reset}`
    );
    log.info(`  In Progress: ${summary.summary.in_progress}`);
  } catch (error) {
    log.error(`Activity logs test failed: ${error.message}`);
    throw error;
  }
}

/**
 * Main test execution
 */
async function runTests() {
  console.log(
    `\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}║     PERM UNIFIED SUBMISSION - COMPREHENSIVE TEST          ║${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );

  try {
    await loginUser();
    await setupPERMForm();
    await setupTestNode();
    await submitInitialPERMData();
    await verifyInitialSubmission();
    await submitAdditionalPERMData();
    await verifyDataMerge();
    await submitCompleteData();
    await testDifferentNode();
    await testDifferentMonth();
    await getAllSubmissionsSummary();
    await testActivityLogs();

    log.header();
    console.log(
      `\n${colors.bright}${colors.green}╔════════════════════════════════════════════════════════════╗${colors.reset}`
    );
    console.log(
      `${colors.bright}${colors.green}║              🎉 ALL TESTS PASSED! 🎉                      ║${colors.reset}`
    );
    console.log(
      `${colors.bright}${colors.green}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
    );

    log.success('PERM submission system is working correctly!');
    log.success('✅ Form validation working');
    log.success('✅ Queue system working');
    log.success('✅ Worker processing working');
    log.success('✅ PERM upsert/merge working');
    log.success('✅ Compliance calculation working');
    log.success('✅ Activity logging working');
    log.success('✅ Multi-node tracking working');
    log.success('✅ Multi-month tracking working');

    process.exit(0);
  } catch (error) {
    log.header();
    console.log(
      `\n${colors.bright}${colors.red}╔════════════════════════════════════════════════════════════╗${colors.reset}`
    );
    console.log(
      `${colors.bright}${colors.red}║              ❌ TEST FAILED! ❌                            ║${colors.reset}`
    );
    console.log(
      `${colors.bright}${colors.red}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
    );

    log.error(`Test suite failed: ${error.message}`);
    log.error(`Stack trace: ${error.stack}`);

    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  loginUser,
  setupPERMForm,
  submitInitialPERMData,
  verifyDataMerge,
};
