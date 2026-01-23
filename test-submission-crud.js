#!/usr/bin/env node

/**
 * SUBMISSION CRUD TEST
 * Tests all CRUD operations: Create, Read, Update, Delete
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4000/v1';
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let authToken = '';
let tenantId = '';
let projectId = '';
let formId = '';
let testSubmissionId = '';

// Helper functions
const log = {
  section: (text) =>
    console.log(
      `\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`
    ),
  step: (text) => console.log(`${colors.blue}▶${colors.reset} ${text}`),
  success: (text) => console.log(`${colors.green}✅${colors.reset} ${text}`),
  error: (text) => console.log(`${colors.red}❌${colors.reset} ${text}`),
  info: (text) => console.log(`${colors.cyan}ℹ${colors.reset} ${text}`),
  warning: (text) => console.log(`${colors.yellow}⚠️${colors.reset} ${text}`),
};

// Login
async function login() {
  log.section();
  log.step('STEP 1: Login User');

  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'saby@saby.ai',
      password: '@saby_Saby1',
    });

    authToken = response.data.tokens.access.token;
    tenantId = response.data.user.tenantId;

    log.success(`Logged in as: saby@saby.ai`);
    log.info(`Tenant ID: ${tenantId}`);
    log.info(`Token: ${authToken.substring(0, 20)}...`);

    return true;
  } catch (error) {
    log.error(
      `Login failed: ${error.response?.data?.message || error.message}`
    );
    return false;
  }
}

// Create test submission
async function createSubmission() {
  log.section();
  log.step('STEP 2: CREATE - Submit Test Data');

  try {
    const submissionData = {
      tenantId,
      projectId: 'proj_test_crud',
      formId: 'form_test_crud',
      nodeId: 'node_crud_test',
      payload: {
        testField1: 'Original Value',
        testField2: true,
        testField3: 123,
      },
      source: 'api',
      perm_enabled: false,
    };

    log.info('Submitting test data...');

    const response = await axios.post(
      `${BASE_URL}/submissions`,
      submissionData,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    log.success('Submission created!');
    log.info(`Job ID: ${response.data.jobId}`);
    log.info(`Status: ${response.data.status}`);

    projectId = submissionData.projectId;
    formId = submissionData.formId;

    // Wait for worker to process
    log.info('Waiting 3 seconds for worker to process...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return true;
  } catch (error) {
    log.error(
      `Create failed: ${error.response?.data?.message || error.message}`
    );
    return false;
  }
}

// Read submissions (list and get by ID)
async function readSubmissions() {
  log.section();
  log.step('STEP 3: READ - List & Get Submissions');

  try {
    // List all submissions
    log.info('Fetching submissions list...');
    const listResponse = await axios.get(`${BASE_URL}/submissions`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { tenant_id: tenantId, limit: 5 },
    });

    const submissions = listResponse.data.results || listResponse.data;
    log.success(`Found ${submissions.length} submissions`);

    if (submissions.length === 0) {
      log.warning(
        'No submissions found. Using test submission from create step.'
      );
      return false;
    }

    // Get the first one
    testSubmissionId = submissions[0].id;
    log.info(`Test Submission ID: ${testSubmissionId}`);

    // Get submission by ID
    log.info('Fetching submission by ID...');
    const getResponse = await axios.get(
      `${BASE_URL}/submissions/${testSubmissionId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    const submission = getResponse.data.submission || getResponse.data;
    log.success('Submission retrieved successfully!');
    log.info(`Project: ${submission.project_id}`);
    log.info(`Node: ${submission.node_id}`);
    log.info(`Data keys: ${Object.keys(submission.data || {}).join(', ')}`);

    return true;
  } catch (error) {
    log.error(`Read failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

// Update submission
async function updateSubmission() {
  log.section();
  log.step('STEP 4: UPDATE - Edit Submission Data');

  if (!testSubmissionId) {
    log.error('No submission ID available for update test');
    return false;
  }

  try {
    const updatedData = {
      data: {
        testField1: 'UPDATED Value',
        testField2: false,
        testField3: 456,
        newField: 'This was added during update',
      },
    };

    log.info(`Updating submission: ${testSubmissionId}`);
    log.info('New data:', JSON.stringify(updatedData.data, null, 2));

    const response = await axios.patch(
      `${BASE_URL}/submissions/${testSubmissionId}`,
      updatedData,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    const updated = response.data.submission || response.data;
    log.success('Submission updated successfully!');
    log.info('Updated data:', JSON.stringify(updated.data, null, 2));

    // Verify the update
    if (updated.data.testField1 === 'UPDATED Value') {
      log.success('✓ Field value changed correctly');
    } else {
      log.warning('⚠️ Field value not updated');
    }

    if (updated.data.newField === 'This was added during update') {
      log.success('✓ New field added correctly');
    } else {
      log.warning('⚠️ New field not added');
    }

    return true;
  } catch (error) {
    log.error(
      `Update failed: ${error.response?.data?.message || error.message}`
    );
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

// Delete submission
async function deleteSubmission() {
  log.section();
  log.step('STEP 5: DELETE - Remove Submission');

  if (!testSubmissionId) {
    log.error('No submission ID available for delete test');
    return false;
  }

  try {
    log.info(`Deleting submission: ${testSubmissionId}`);

    const response = await axios.delete(
      `${BASE_URL}/submissions/${testSubmissionId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    log.success('Submission deleted successfully!');

    // Verify deletion
    log.info('Verifying deletion...');
    try {
      await axios.get(`${BASE_URL}/submissions/${testSubmissionId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      log.warning('⚠️ Submission still exists after delete!');
      return false;
    } catch (error) {
      if (error.response?.status === 404) {
        log.success('✓ Submission confirmed deleted (404)');
        return true;
      } else {
        throw error;
      }
    }
  } catch (error) {
    log.error(
      `Delete failed: ${error.response?.data?.message || error.message}`
    );
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log(
    `\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}║     SUBMISSION CRUD TEST - Full Create/Read/Update/Delete  ║${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );

  const results = {
    login: false,
    create: false,
    read: false,
    update: false,
    delete: false,
  };

  // Run tests sequentially
  results.login = await login();
  if (!results.login) {
    log.error('Login failed, stopping tests');
    process.exit(1);
  }

  results.create = await createSubmission();
  results.read = await readSubmissions();
  results.update = await updateSubmission();
  results.delete = await deleteSubmission();

  // Summary
  log.section();
  console.log(`\n${colors.bright}📊 TEST SUMMARY:${colors.reset}\n`);

  const tests = [
    { name: 'Login', result: results.login },
    { name: 'CREATE (POST)', result: results.create },
    { name: 'READ (GET)', result: results.read },
    { name: 'UPDATE (PATCH)', result: results.update },
    { name: 'DELETE', result: results.delete },
  ];

  tests.forEach((test) => {
    const status = test.result
      ? `${colors.green}✅ PASS${colors.reset}`
      : `${colors.red}❌ FAIL${colors.reset}`;
    console.log(`  ${test.name.padEnd(20)} ${status}`);
  });

  const passCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;

  console.log(
    `\n${colors.bright}Results: ${passCount}/${totalCount} tests passed${colors.reset}`
  );

  if (passCount === totalCount) {
    console.log(
      `\n${colors.bright}${colors.green}🎉 ALL CRUD OPERATIONS WORKING! 🚀${colors.reset}\n`
    );
    process.exit(0);
  } else {
    console.log(
      `\n${colors.bright}${colors.red}⚠️ Some tests failed. Check logs above.${colors.reset}\n`
    );
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});

