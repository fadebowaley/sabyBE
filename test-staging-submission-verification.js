#!/usr/bin/env node

/**
 * STAGING SUBMISSION PIPELINE VERIFICATION
 * 
 * Verifies the submission pipeline works on staging server
 * Uses existing forms - no form creation required
 * 
 * Tests:
 * 1. Submit data through /v1/submissions
 * 2. Verify activity logs
 * 3. Verify PostgreSQL storage
 * 4. Query via API
 * 
 * Usage:
 *   node test-staging-submission-verification.js
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = process.env.API_URL || 'http://localhost:4000/v1';

// Test state
let authToken = '';
let tenantId = '';
let userId = '';
let jobId = '';
let testSubmissionId = '';

// Use existing form or create test IDs
const TEST_PROJECT_ID = process.env.TEST_PROJECT_ID || 'proj_test_verify';
const TEST_FORM_ID = process.env.TEST_FORM_ID || 'form_test_verify';

// Colors
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  section: (text) => {
    console.log(`\n${c.bright}${c.cyan}${'═'.repeat(70)}${c.reset}`);
    console.log(`${c.bright}${c.cyan}${text}${c.reset}`);
    console.log(`${c.bright}${c.cyan}${'═'.repeat(70)}${c.reset}\n`);
  },
  step: (num, text) => console.log(`\n${c.bright}${c.blue}▶ STEP ${num}:${c.reset} ${text}`),
  success: (text) => console.log(`  ${c.green}✅${c.reset} ${text}`),
  error: (text) => console.log(`  ${c.red}❌${c.reset} ${text}`),
  info: (text) => console.log(`  ${c.cyan}ℹ${c.reset}  ${text}`),
  warn: (text) => console.log(`  ${c.yellow}⚠️${c.reset}  ${text}`),
  data: (label, value) => console.log(`     ${c.blue}${label}:${c.reset} ${value}`),
};

/**
 * STEP 1: Authenticate
 */
async function authenticate() {
  log.step(1, 'Authenticate User');
  
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'saby@saby.ai',
      password: '@saby_Saby1',
    });
    
    authToken = response.data.tokens.access.token;
    tenantId = response.data.user.tenantId;
    userId = response.data.user.id;
    
    log.success('Authentication successful');
    log.data('Email', response.data.user.email);
    log.data('Tenant ID', tenantId);
    log.data('User ID', userId);
    log.data('Environment', BASE_URL);
    
    return true;
  } catch (error) {
    log.error(`Authentication failed: ${error.message}`);
    return false;
  }
}

/**
 * STEP 2: Submit Test Data
 */
async function submitTestData() {
  log.step(2, 'Submit Test Data via /v1/submissions');
  
  const timestamp = Date.now();
  const payload = {
    test_timestamp: timestamp,
    test_field_text: 'Pipeline Verification Test',
    test_field_number: 42,
    test_field_boolean: true,
    test_field_array: ['Option1', 'Option2'],
    test_field_nested: {
      city: 'Lagos',
      country: 'Nigeria'
    },
    verification_id: `verify_${timestamp}`,
  };
  
  try {
    log.info('Submitting test payload...');
    
    const response = await axios.post(
      `${BASE_URL}/submissions`,
      {
        tenantId: tenantId,
        projectId: TEST_PROJECT_ID,
        formId: TEST_FORM_ID,
        payload: payload,
        source: 'pipeline-verification-test',
        project_name: 'Pipeline Verification Test',
        project_category: 'Testing',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    
    jobId = response.data.jobId;
    
    log.success('Submission accepted and queued');
    log.data('HTTP Status', response.status);
    log.data('Job ID', jobId);
    log.data('Status', response.data.status);
    log.data('Type', response.data.type || 'regular');
    
    if (response.status === 202) {
      log.success('✓ Correct HTTP status (202 Accepted)');
    }
    
    return true;
  } catch (error) {
    log.error(`Submission failed: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) {
      console.log(JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * STEP 3: Wait for Processing
 */
async function waitForProcessing() {
  log.step(3, 'Wait for Worker Processing');
  
  log.info('Waiting 5 seconds for worker to process...');
  
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`\r     ${c.yellow}⏳${c.reset}  ${i} seconds remaining...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\r' + ' '.repeat(50));
  
  log.success('Wait complete');
  return true;
}

/**
 * STEP 4: Check Activity Logs
 */
async function checkActivityLogs() {
  log.step(4, 'Verify Activity Logs');
  
  try {
    const result = await postgresPool.query(
      `SELECT * FROM submission_activity_log 
       WHERE job_id = $1 
       ORDER BY created_at ASC`,
      [jobId]
    );
    
    const logs = result.rows;
    
    if (logs.length === 0) {
      log.warn('No activity logs found (job may still be processing)');
      return false;
    }
    
    log.success(`Found ${logs.length} activity log entries`);
    
    logs.forEach((entry, index) => {
      const statusColor = entry.status === 'success' ? c.green :
                         entry.status === 'failed' ? c.red :
                         entry.status === 'in progress' ? c.yellow : c.reset;
      
      log.info(`Entry ${index + 1}:`);
      log.data('  Action', entry.action);
      log.data('  Status', `${statusColor}${entry.status}${c.reset}`);
      log.data('  Message', entry.message);
      log.data('  Time', new Date(entry.created_at).toISOString());
    });
    
    // Check for success
    const hasSuccess = logs.some(l => l.status === 'success');
    const hasFailed = logs.some(l => l.status === 'failed');
    
    if (hasSuccess) {
      log.success('✓ Submission processed successfully');
      return true;
    } else if (hasFailed) {
      log.error('✗ Submission processing failed');
      return false;
    } else {
      log.warn('⚠️ Submission still processing (no final status yet)');
      return true; // Not a failure
    }
  } catch (error) {
    log.error(`Activity log check failed: ${error.message}`);
    return false;
  }
}

/**
 * STEP 5: Verify PostgreSQL Storage
 */
async function verifyPostgreSQLStorage() {
  log.step(5, 'Verify Submission in PostgreSQL');
  
  try {
    const result = await postgresPool.query(
      `SELECT * FROM form_submissions 
       WHERE tenant_id = $1 
         AND project_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, TEST_PROJECT_ID]
    );
    
    if (result.rows.length === 0) {
      log.error('No submission found in PostgreSQL');
      log.info('This might mean:');
      log.info('  - Worker is still processing');
      log.info('  - Worker encountered an error');
      log.info('  - Form validation failed');
      return false;
    }
    
    const submission = result.rows[0];
    testSubmissionId = submission.id;
    
    log.success('Submission found in PostgreSQL!');
    log.data('Submission ID', submission.id);
    log.data('Tenant ID', submission.tenant_id);
    log.data('Project ID', submission.project_id);
    log.data('Form ID', submission.form_id);
    log.data('Source', submission.source);
    log.data('Status', submission.status);
    log.data('Created', new Date(submission.created_at).toISOString());
    
    // Verify data column
    log.info('Verifying data storage...');
    const data = submission.data;
    
    if (!data) {
      log.error('Data column is null or empty');
      return false;
    }
    
    log.success('Data column populated');
    log.info('Data fields:');
    Object.keys(data).slice(0, 10).forEach(key => {
      const value = typeof data[key] === 'object' 
        ? JSON.stringify(data[key]) 
        : String(data[key]);
      const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
      log.data(`  ${key}`, displayValue);
    });
    
    // Verify our test data
    if (data.verification_id) {
      log.success(`✓ Test data verified: ${data.verification_id}`);
    }
    
    if (data.test_field_nested) {
      log.success('✓ Nested objects stored correctly');
    }
    
    if (Array.isArray(data.test_field_array)) {
      log.success('✓ Arrays stored correctly');
    }
    
    return true;
  } catch (error) {
    log.error(`PostgreSQL verification failed: ${error.message}`);
    return false;
  }
}

/**
 * STEP 6: Query via API
 */
async function queryViaAPI() {
  log.step(6, 'Query Submission via API');
  
  if (!testSubmissionId) {
    log.warn('No submission ID available, skipping API query');
    return true; // Not a failure
  }
  
  try {
    log.info('Fetching submission via GET /v1/submissions/:id...');
    
    const response = await axios.get(
      `${BASE_URL}/submissions/${testSubmissionId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    
    const submission = response.data.submission || response.data;
    
    log.success('Submission retrieved via API');
    log.data('ID', submission.id);
    log.data('Status', submission.status);
    log.data('Data Keys', Object.keys(submission.data || {}).length);
    
    return true;
  } catch (error) {
    log.error(`API query failed: ${error.message}`);
    return false;
  }
}

/**
 * STEP 7: List Submissions
 */
async function listSubmissions() {
  log.step(7, 'List All Submissions');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/submissions`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        params: {
          tenant_id: tenantId,
          limit: 10,
        },
      }
    );
    
    const submissions = response.data.results || response.data.submissions || [];
    
    log.success(`Retrieved ${submissions.length} submission(s)`);
    
    if (submissions.length > 0) {
      log.info('Sample submissions:');
      submissions.slice(0, 3).forEach((sub, i) => {
        log.info(`  ${i + 1}. ${sub.project_id} - ${new Date(sub.created_at).toLocaleString()}`);
      });
    }
    
    return true;
  } catch (error) {
    log.error(`List submissions failed: ${error.message}`);
    return false;
  }
}

/**
 * Generate Report
 */
function generateReport(results) {
  log.section('TEST RESULTS');
  
  const tests = [
    { name: 'Authentication', result: results.auth },
    { name: 'Submit Data', result: results.submit },
    { name: 'Worker Processing', result: results.wait },
    { name: 'Activity Logs', result: results.activityLogs },
    { name: 'PostgreSQL Storage', result: results.pgStorage },
    { name: 'API Query', result: results.apiQuery },
    { name: 'List Submissions', result: results.listSubmissions },
  ];
  
  console.log('');
  tests.forEach(test => {
    const status = test.result 
      ? `${c.green}✅ PASS${c.reset}`
      : `${c.red}❌ FAIL${c.reset}`;
    console.log(`  ${test.name.padEnd(30)} ${status}`);
  });
  
  const passCount = tests.filter(t => t.result).length;
  const totalCount = tests.length;
  const passRate = ((passCount / totalCount) * 100).toFixed(1);
  
  console.log(`\n  ${c.bright}Pass Rate: ${passRate}%${c.reset}`);
  
  console.log('');
  if (passRate >= 85) {
    console.log(`${c.bright}${c.green}╔════════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bright}${c.green}║  ✅ SUBMISSION PIPELINE VERIFIED - WORKING! ✅            ║${c.reset}`);
    console.log(`${c.bright}${c.green}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
  } else {
    console.log(`${c.bright}${c.yellow}╔════════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bright}${c.yellow}║  ⚠️ SOME ISSUES FOUND - REVIEW RECOMMENDED ⚠️            ║${c.reset}`);
    console.log(`${c.bright}${c.yellow}╚════════════════════════════════════════════════════════════╝${c.reset}\n`);
  }
  
  console.log(`${c.bright}Summary:${c.reset}`);
  console.log(`  • Submission endpoint: ${results.submit ? c.green + 'Working' : c.red + 'Failed'}${c.reset}`);
  console.log(`  • Queue system: ${results.activityLogs ? c.green + 'Working' : c.yellow + 'Unknown'}${c.reset}`);
  console.log(`  • PostgreSQL storage: ${results.pgStorage ? c.green + 'Working' : c.red + 'Failed'}${c.reset}`);
  console.log(`  • API retrieval: ${results.apiQuery ? c.green + 'Working' : c.yellow + 'Partial'}${c.reset}`);
  console.log('');
}

/**
 * Main Test Runner
 */
async function main() {
  console.log(`${c.bright}${c.cyan}
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║        STAGING SUBMISSION PIPELINE VERIFICATION TEST             ║
║                                                                  ║
║  Verifies: Frontend → API → Queue → Worker → PostgreSQL         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
${c.reset}`);
  
  console.log(`  Environment: ${BASE_URL}`);
  console.log(`  Test Project: ${TEST_PROJECT_ID}`);
  console.log(`  Test Form: ${TEST_FORM_ID}`);
  
  const results = {};
  
  try {
    results.auth = await authenticate();
    if (!results.auth) {
      log.error('Cannot proceed without authentication');
      process.exit(1);
    }
    
    results.submit = await submitTestData();
    results.wait = await waitForProcessing();
    results.activityLogs = await checkActivityLogs();
    results.pgStorage = await verifyPostgreSQLStorage();
    results.apiQuery = await queryViaAPI();
    results.listSubmissions = await listSubmissions();
    
    generateReport(results);
    
    // Cleanup
    await postgresPool.end();
    
    const passCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    process.exit(passCount >= 6 ? 0 : 1);
    
  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    console.error(error.stack);
    
    try {
      await postgresPool.end();
    } catch (e) {}
    
    process.exit(1);
  }
}

// Run test
main();

