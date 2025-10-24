/**
 * Create Test Data for CRUD Reports Testing
 * 
 * This script creates test data for:
 * - Form submissions (regular and PERM)
 * - Event calendar
 * - Compliance tracking
 * - Submission validations
 * - Activity logs
 * 
 * Usage: node create-test-data.js
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
};

let authToken = null;
let tenantId = null;
let userId = null;

// Test data IDs
const testProjectId = uuidv4();
const testFormId = uuidv4();
const testNodeIds = [uuidv4(), uuidv4(), uuidv4()]; // 3 test nodes

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

/**
 * Helper: Make authenticated request
 */
async function apiRequest(method, endpoint, data = null, params = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };

    if (data) config.data = data;
    if (params) config.params = params;

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status,
      details: error.response?.data,
    };
  }
}

/**
 * Step 1: Authenticate
 */
async function authenticate() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 1: Authentication ━━━${colors.reset}`);
  
  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);
  
  if (result.success && result.data.tokens?.access?.token) {
    authToken = result.data.tokens.access.token;
    tenantId = result.data.user?.tenantId;
    userId = result.data.user?.id;
    console.log(`${colors.green}✓${colors.reset} Login successful`);
    console.log(`  Tenant ID: ${tenantId}`);
    console.log(`  User ID: ${userId}`);
    return true;
  } else {
    console.log(`${colors.red}✗${colors.reset} Login failed: ${result.error}`);
    return false;
  }
}

/**
 * Step 2: Create Event Calendar
 */
async function createEventCalendar() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 2: Create Event Calendar ━━━${colors.reset}`);
  
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  
  for (const month of months) {
    const result = await apiRequest('POST', '/event-calendar/generate', {
      tenant_id: tenantId,
      project_id: testProjectId,
      month,
    });
    
    if (result.success || result.status === 409) {
      console.log(`${colors.green}✓${colors.reset} Calendar created for ${month}`);
    } else {
      console.log(`${colors.yellow}⚠${colors.reset} Calendar for ${month}: ${result.error}`);
    }
  }
}

/**
 * Step 3: Create PERM Submissions
 */
async function createPERMSubmissions() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 3: Create PERM Submissions ━━━${colors.reset}`);
  
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  let submissionCount = 0;
  
  for (const nodeId of testNodeIds) {
    for (const month of months) {
      // Create PERM submission data
      const eventData = {
        week_1_monday: { value: 10, submitted: true },
        week_1_tuesday: { value: 12, submitted: true },
        week_1_wednesday: { value: 15, submitted: true },
        week_2_monday: { value: 8, submitted: true },
        week_2_friday: { value: 20, submitted: false },
      };
      
      const submissionData = {
        tenantId: tenantId,
        projectId: testProjectId,
        formId: testFormId,
        nodeId: nodeId,
        userId: userId,
        payload: eventData,
        source: 'api',
        month: month,
        year: parseInt(month.split('-')[0]),
        perm_enabled: true,
        project_name: 'Test PERM Project',
        project_category: 'Healthcare',
      };
      
      const result = await apiRequest('POST', '/submissions', submissionData);
      
      if (result.success) {
        submissionCount++;
        console.log(`${colors.green}✓${colors.reset} PERM submission created: Node ${nodeId.substring(0, 8)}... / ${month}`);
      } else {
        console.log(`${colors.yellow}⚠${colors.reset} Submission failed: ${result.error}`);
      }
      
      // Small delay to avoid overwhelming the queue
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n  Total PERM submissions queued: ${submissionCount}`);
  console.log(`  ${colors.yellow}⏳ Waiting 10 seconds for queue processing...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 10000));
}

/**
 * Step 4: Verify Compliance Tracking Created
 */
async function verifyComplianceTracking() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 4: Verify Compliance Tracking ━━━${colors.reset}`);
  
  const result = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  
  if (result.success && result.data.data) {
    console.log(`${colors.green}✓${colors.reset} Compliance tracking records: ${result.data.data.length}`);
    return result.data.data.length;
  } else {
    console.log(`${colors.red}✗${colors.reset} Failed to verify compliance: ${result.error}`);
    return 0;
  }
}

/**
 * Step 5: Create Submission Validations
 */
async function createValidations() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 5: Create Validation Records ━━━${colors.reset}`);
  
  // Get existing submissions
  const submissionsResult = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 100,
  });
  
  if (!submissionsResult.success || !submissionsResult.data.data) {
    console.log(`${colors.red}✗${colors.reset} No submissions found to create validations`);
    return;
  }
  
  const submissions = submissionsResult.data.data;
  console.log(`  Found ${submissions.length} submissions`);
  
  // Create validation records directly in PostgreSQL
  const { postgresPool } = require('./src/config/postgres');
  
  let validationCount = 0;
  for (const submission of submissions.slice(0, 5)) { // Create validations for first 5
    const validations = [
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'schema',
        is_valid: true,
        severity: 'info',
        message: 'Schema validation passed',
        field: 'data',
      },
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'business',
        is_valid: false,
        severity: 'warning',
        message: 'Value exceeds recommended threshold',
        field: 'week_1_wednesday',
      },
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'compliance',
        is_valid: true,
        severity: 'info',
        message: 'Compliance requirements met',
        field: null,
      },
    ];
    
    for (const validation of validations) {
      try {
        await postgresPool.query(
          `INSERT INTO submission_validations 
           (id, tenant_id, project_id, submission_id, category, is_valid, severity, message, field, validation_errors, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            uuidv4(),
            validation.tenant_id,
            validation.project_id,
            validation.submission_id,
            validation.category,
            validation.is_valid,
            validation.severity,
            validation.message,
            validation.field,
            validation.is_valid ? null : JSON.stringify([{ code: 'THRESHOLD_EXCEEDED', message: validation.message }]),
          ]
        );
        validationCount++;
      } catch (error) {
        console.log(`${colors.yellow}⚠${colors.reset} Validation insert error: ${error.message}`);
      }
    }
  }
  
  console.log(`${colors.green}✓${colors.reset} Created ${validationCount} validation records`);
}

/**
 * Step 6: Verify All Data
 */
async function verifyAllData() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 6: Verify All Test Data ━━━${colors.reset}`);
  
  // Check submissions
  const submissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 100,
  });
  console.log(`${colors.green}✓${colors.reset} Submissions: ${submissions.data?.data?.length || 0}`);
  
  // Check compliance
  const compliance = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${colors.green}✓${colors.reset} Compliance records: ${compliance.data?.data?.length || 0}`);
  
  // Check validations
  const validations = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validations: ${validations.data?.data?.length || 0}`);
  
  // Check stats
  const stats = await apiRequest('GET', '/submission-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Submission stats: Total=${stats.data?.data?.total || 0}`);
  
  const valStats = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validation stats: Total=${valStats.data?.data?.total_validations || 0}`);
}

/**
 * Step 7: Test Sample Endpoints
 */
async function testSampleEndpoints() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 7: Test Sample Endpoints ━━━${colors.reset}`);
  
  // Test 1: Get monthly submissions
  let result = await apiRequest('GET', '/submission-reports/monthly/2025-01-01', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Monthly submissions (Jan 2025): ${result.data?.data?.length || 0}`);
  
  // Test 2: Get compliance trends
  result = await apiRequest('GET', '/compliance-reports/trends', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Compliance trends: ${result.data?.data?.length || 0} months`);
  
  // Test 3: Get failed validations
  result = await apiRequest('GET', '/validation-reports/failed', null, {
    tenant_id: tenantId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Failed validations: ${result.data?.data?.length || 0}`);
  
  // Test 4: Get node compliance
  if (testNodeIds[0]) {
    result = await apiRequest('GET', `/compliance-reports/node/${testNodeIds[0]}`, null, {
      tenant_id: tenantId,
      project_id: testProjectId,
    });
    console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Node compliance history: ${result.data?.data?.length || 0}`);
  }
  
  // Test 5: Get incomplete submissions
  result = await apiRequest('GET', '/submission-reports/incomplete/2025-01-01', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Incomplete submissions: ${result.data?.data?.length || 0}`);
}

/**
 * Main function
 */
async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║              CREATE TEST DATA FOR CRUD REPORTS                        ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Project ID: ${testProjectId}`);
  console.log(`Test Nodes: ${testNodeIds.length}`);
  
  try {
    // Step 1: Authenticate
    const authSuccess = await authenticate();
    if (!authSuccess) {
      console.log(`\n${colors.red}Authentication failed. Exiting.${colors.reset}`);
      process.exit(1);
    }
    
    // Step 2: Create event calendar
    await createEventCalendar();
    
    // Step 3: Create PERM submissions
    await createPERMSubmissions();
    
    // Step 4: Verify compliance tracking
    await verifyComplianceTracking();
    
    // Step 5: Create validations
    await createValidations();
    
    // Step 6: Verify all data
    await verifyAllData();
    
    // Step 7: Test sample endpoints
    await testSampleEndpoints();
    
    // Final summary
    console.log(`\n${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════╗
║                    ✅ TEST DATA CREATED SUCCESSFULLY                  ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    console.log(`\n${colors.cyan}Next steps:${colors.reset}`);
    console.log(`  1. Run: node test-crud-reports.js`);
    console.log(`  2. Verify all 34 endpoints are working`);
    console.log(`  3. Check pass rate increases to ~80-90%\n`);
    
  } catch (error) {
    console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();

/**
 * Create Test Data for CRUD Reports Testing
 * 
 * This script creates test data for:
 * - Form submissions (regular and PERM)
 * - Event calendar
 * - Compliance tracking
 * - Submission validations
 * - Activity logs
 * 
 * Usage: node create-test-data.js
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
};

let authToken = null;
let tenantId = null;
let userId = null;

// Test data IDs
const testProjectId = uuidv4();
const testFormId = uuidv4();
const testNodeIds = [uuidv4(), uuidv4(), uuidv4()]; // 3 test nodes

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

/**
 * Helper: Make authenticated request
 */
async function apiRequest(method, endpoint, data = null, params = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };

    if (data) config.data = data;
    if (params) config.params = params;

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status,
      details: error.response?.data,
    };
  }
}

/**
 * Step 1: Authenticate
 */
async function authenticate() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 1: Authentication ━━━${colors.reset}`);
  
  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);
  
  if (result.success && result.data.tokens?.access?.token) {
    authToken = result.data.tokens.access.token;
    tenantId = result.data.user?.tenantId;
    userId = result.data.user?.id;
    console.log(`${colors.green}✓${colors.reset} Login successful`);
    console.log(`  Tenant ID: ${tenantId}`);
    console.log(`  User ID: ${userId}`);
    return true;
  } else {
    console.log(`${colors.red}✗${colors.reset} Login failed: ${result.error}`);
    return false;
  }
}

/**
 * Step 2: Create Event Calendar
 */
async function createEventCalendar() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 2: Create Event Calendar ━━━${colors.reset}`);
  
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  
  for (const month of months) {
    const result = await apiRequest('POST', '/event-calendar/generate', {
      tenant_id: tenantId,
      project_id: testProjectId,
      month,
    });
    
    if (result.success || result.status === 409) {
      console.log(`${colors.green}✓${colors.reset} Calendar created for ${month}`);
    } else {
      console.log(`${colors.yellow}⚠${colors.reset} Calendar for ${month}: ${result.error}`);
    }
  }
}

/**
 * Step 3: Create PERM Submissions
 */
async function createPERMSubmissions() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 3: Create PERM Submissions ━━━${colors.reset}`);
  
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  let submissionCount = 0;
  
  for (const nodeId of testNodeIds) {
    for (const month of months) {
      // Create PERM submission data
      const eventData = {
        week_1_monday: { value: 10, submitted: true },
        week_1_tuesday: { value: 12, submitted: true },
        week_1_wednesday: { value: 15, submitted: true },
        week_2_monday: { value: 8, submitted: true },
        week_2_friday: { value: 20, submitted: false },
      };
      
      const submissionData = {
        tenantId: tenantId,
        projectId: testProjectId,
        formId: testFormId,
        nodeId: nodeId,
        userId: userId,
        payload: eventData,
        source: 'api',
        month: month,
        year: parseInt(month.split('-')[0]),
        perm_enabled: true,
        project_name: 'Test PERM Project',
        project_category: 'Healthcare',
      };
      
      const result = await apiRequest('POST', '/submissions', submissionData);
      
      if (result.success) {
        submissionCount++;
        console.log(`${colors.green}✓${colors.reset} PERM submission created: Node ${nodeId.substring(0, 8)}... / ${month}`);
      } else {
        console.log(`${colors.yellow}⚠${colors.reset} Submission failed: ${result.error}`);
      }
      
      // Small delay to avoid overwhelming the queue
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n  Total PERM submissions queued: ${submissionCount}`);
  console.log(`  ${colors.yellow}⏳ Waiting 10 seconds for queue processing...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 10000));
}

/**
 * Step 4: Verify Compliance Tracking Created
 */
async function verifyComplianceTracking() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 4: Verify Compliance Tracking ━━━${colors.reset}`);
  
  const result = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  
  if (result.success && result.data.data) {
    console.log(`${colors.green}✓${colors.reset} Compliance tracking records: ${result.data.data.length}`);
    return result.data.data.length;
  } else {
    console.log(`${colors.red}✗${colors.reset} Failed to verify compliance: ${result.error}`);
    return 0;
  }
}

/**
 * Step 5: Create Submission Validations
 */
async function createValidations() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 5: Create Validation Records ━━━${colors.reset}`);
  
  // Get existing submissions
  const submissionsResult = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 100,
  });
  
  if (!submissionsResult.success || !submissionsResult.data.data) {
    console.log(`${colors.red}✗${colors.reset} No submissions found to create validations`);
    return;
  }
  
  const submissions = submissionsResult.data.data;
  console.log(`  Found ${submissions.length} submissions`);
  
  // Create validation records directly in PostgreSQL
  const { postgresPool } = require('./src/config/postgres');
  
  let validationCount = 0;
  for (const submission of submissions.slice(0, 5)) { // Create validations for first 5
    const validations = [
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'schema',
        is_valid: true,
        severity: 'info',
        message: 'Schema validation passed',
        field: 'data',
      },
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'business',
        is_valid: false,
        severity: 'warning',
        message: 'Value exceeds recommended threshold',
        field: 'week_1_wednesday',
      },
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'compliance',
        is_valid: true,
        severity: 'info',
        message: 'Compliance requirements met',
        field: null,
      },
    ];
    
    for (const validation of validations) {
      try {
        await postgresPool.query(
          `INSERT INTO submission_validations 
           (id, tenant_id, project_id, submission_id, category, is_valid, severity, message, field, validation_errors, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            uuidv4(),
            validation.tenant_id,
            validation.project_id,
            validation.submission_id,
            validation.category,
            validation.is_valid,
            validation.severity,
            validation.message,
            validation.field,
            validation.is_valid ? null : JSON.stringify([{ code: 'THRESHOLD_EXCEEDED', message: validation.message }]),
          ]
        );
        validationCount++;
      } catch (error) {
        console.log(`${colors.yellow}⚠${colors.reset} Validation insert error: ${error.message}`);
      }
    }
  }
  
  console.log(`${colors.green}✓${colors.reset} Created ${validationCount} validation records`);
}

/**
 * Step 6: Verify All Data
 */
async function verifyAllData() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 6: Verify All Test Data ━━━${colors.reset}`);
  
  // Check submissions
  const submissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 100,
  });
  console.log(`${colors.green}✓${colors.reset} Submissions: ${submissions.data?.data?.length || 0}`);
  
  // Check compliance
  const compliance = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${colors.green}✓${colors.reset} Compliance records: ${compliance.data?.data?.length || 0}`);
  
  // Check validations
  const validations = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validations: ${validations.data?.data?.length || 0}`);
  
  // Check stats
  const stats = await apiRequest('GET', '/submission-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Submission stats: Total=${stats.data?.data?.total || 0}`);
  
  const valStats = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validation stats: Total=${valStats.data?.data?.total_validations || 0}`);
}

/**
 * Step 7: Test Sample Endpoints
 */
async function testSampleEndpoints() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 7: Test Sample Endpoints ━━━${colors.reset}`);
  
  // Test 1: Get monthly submissions
  let result = await apiRequest('GET', '/submission-reports/monthly/2025-01-01', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Monthly submissions (Jan 2025): ${result.data?.data?.length || 0}`);
  
  // Test 2: Get compliance trends
  result = await apiRequest('GET', '/compliance-reports/trends', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Compliance trends: ${result.data?.data?.length || 0} months`);
  
  // Test 3: Get failed validations
  result = await apiRequest('GET', '/validation-reports/failed', null, {
    tenant_id: tenantId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Failed validations: ${result.data?.data?.length || 0}`);
  
  // Test 4: Get node compliance
  if (testNodeIds[0]) {
    result = await apiRequest('GET', `/compliance-reports/node/${testNodeIds[0]}`, null, {
      tenant_id: tenantId,
      project_id: testProjectId,
    });
    console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Node compliance history: ${result.data?.data?.length || 0}`);
  }
  
  // Test 5: Get incomplete submissions
  result = await apiRequest('GET', '/submission-reports/incomplete/2025-01-01', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Incomplete submissions: ${result.data?.data?.length || 0}`);
}

/**
 * Main function
 */
async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║              CREATE TEST DATA FOR CRUD REPORTS                        ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Project ID: ${testProjectId}`);
  console.log(`Test Nodes: ${testNodeIds.length}`);
  
  try {
    // Step 1: Authenticate
    const authSuccess = await authenticate();
    if (!authSuccess) {
      console.log(`\n${colors.red}Authentication failed. Exiting.${colors.reset}`);
      process.exit(1);
    }
    
    // Step 2: Create event calendar
    await createEventCalendar();
    
    // Step 3: Create PERM submissions
    await createPERMSubmissions();
    
    // Step 4: Verify compliance tracking
    await verifyComplianceTracking();
    
    // Step 5: Create validations
    await createValidations();
    
    // Step 6: Verify all data
    await verifyAllData();
    
    // Step 7: Test sample endpoints
    await testSampleEndpoints();
    
    // Final summary
    console.log(`\n${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════╗
║                    ✅ TEST DATA CREATED SUCCESSFULLY                  ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    console.log(`\n${colors.cyan}Next steps:${colors.reset}`);
    console.log(`  1. Run: node test-crud-reports.js`);
    console.log(`  2. Verify all 34 endpoints are working`);
    console.log(`  3. Check pass rate increases to ~80-90%\n`);
    
  } catch (error) {
    console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();

/**
 * Create Test Data for CRUD Reports Testing
 * 
 * This script creates test data for:
 * - Form submissions (regular and PERM)
 * - Event calendar
 * - Compliance tracking
 * - Submission validations
 * - Activity logs
 * 
 * Usage: node create-test-data.js
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
};

let authToken = null;
let tenantId = null;
let userId = null;

// Test data IDs
const testProjectId = uuidv4();
const testFormId = uuidv4();
const testNodeIds = [uuidv4(), uuidv4(), uuidv4()]; // 3 test nodes

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

/**
 * Helper: Make authenticated request
 */
async function apiRequest(method, endpoint, data = null, params = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };

    if (data) config.data = data;
    if (params) config.params = params;

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status,
      details: error.response?.data,
    };
  }
}

/**
 * Step 1: Authenticate
 */
async function authenticate() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 1: Authentication ━━━${colors.reset}`);
  
  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);
  
  if (result.success && result.data.tokens?.access?.token) {
    authToken = result.data.tokens.access.token;
    tenantId = result.data.user?.tenantId;
    userId = result.data.user?.id;
    console.log(`${colors.green}✓${colors.reset} Login successful`);
    console.log(`  Tenant ID: ${tenantId}`);
    console.log(`  User ID: ${userId}`);
    return true;
  } else {
    console.log(`${colors.red}✗${colors.reset} Login failed: ${result.error}`);
    return false;
  }
}

/**
 * Step 2: Create Event Calendar
 */
async function createEventCalendar() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 2: Create Event Calendar ━━━${colors.reset}`);
  
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  
  for (const month of months) {
    const result = await apiRequest('POST', '/event-calendar/generate', {
      tenant_id: tenantId,
      project_id: testProjectId,
      month,
    });
    
    if (result.success || result.status === 409) {
      console.log(`${colors.green}✓${colors.reset} Calendar created for ${month}`);
    } else {
      console.log(`${colors.yellow}⚠${colors.reset} Calendar for ${month}: ${result.error}`);
    }
  }
}

/**
 * Step 3: Create PERM Submissions
 */
async function createPERMSubmissions() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 3: Create PERM Submissions ━━━${colors.reset}`);
  
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  let submissionCount = 0;
  
  for (const nodeId of testNodeIds) {
    for (const month of months) {
      // Create PERM submission data
      const eventData = {
        week_1_monday: { value: 10, submitted: true },
        week_1_tuesday: { value: 12, submitted: true },
        week_1_wednesday: { value: 15, submitted: true },
        week_2_monday: { value: 8, submitted: true },
        week_2_friday: { value: 20, submitted: false },
      };
      
      const submissionData = {
        tenantId: tenantId,
        projectId: testProjectId,
        formId: testFormId,
        nodeId: nodeId,
        userId: userId,
        payload: eventData,
        source: 'api',
        month: month,
        year: parseInt(month.split('-')[0]),
        perm_enabled: true,
        project_name: 'Test PERM Project',
        project_category: 'Healthcare',
      };
      
      const result = await apiRequest('POST', '/submissions', submissionData);
      
      if (result.success) {
        submissionCount++;
        console.log(`${colors.green}✓${colors.reset} PERM submission created: Node ${nodeId.substring(0, 8)}... / ${month}`);
      } else {
        console.log(`${colors.yellow}⚠${colors.reset} Submission failed: ${result.error}`);
      }
      
      // Small delay to avoid overwhelming the queue
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n  Total PERM submissions queued: ${submissionCount}`);
  console.log(`  ${colors.yellow}⏳ Waiting 10 seconds for queue processing...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 10000));
}

/**
 * Step 4: Verify Compliance Tracking Created
 */
async function verifyComplianceTracking() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 4: Verify Compliance Tracking ━━━${colors.reset}`);
  
  const result = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  
  if (result.success && result.data.data) {
    console.log(`${colors.green}✓${colors.reset} Compliance tracking records: ${result.data.data.length}`);
    return result.data.data.length;
  } else {
    console.log(`${colors.red}✗${colors.reset} Failed to verify compliance: ${result.error}`);
    return 0;
  }
}

/**
 * Step 5: Create Submission Validations
 */
async function createValidations() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 5: Create Validation Records ━━━${colors.reset}`);
  
  // Get existing submissions
  const submissionsResult = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 100,
  });
  
  if (!submissionsResult.success || !submissionsResult.data.data) {
    console.log(`${colors.red}✗${colors.reset} No submissions found to create validations`);
    return;
  }
  
  const submissions = submissionsResult.data.data;
  console.log(`  Found ${submissions.length} submissions`);
  
  // Create validation records directly in PostgreSQL
  const { postgresPool } = require('./src/config/postgres');
  
  let validationCount = 0;
  for (const submission of submissions.slice(0, 5)) { // Create validations for first 5
    const validations = [
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'schema',
        is_valid: true,
        severity: 'info',
        message: 'Schema validation passed',
        field: 'data',
      },
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'business',
        is_valid: false,
        severity: 'warning',
        message: 'Value exceeds recommended threshold',
        field: 'week_1_wednesday',
      },
      {
        tenant_id: tenantId,
        project_id: testProjectId,
        submission_id: submission.id,
        category: 'compliance',
        is_valid: true,
        severity: 'info',
        message: 'Compliance requirements met',
        field: null,
      },
    ];
    
    for (const validation of validations) {
      try {
        await postgresPool.query(
          `INSERT INTO submission_validations 
           (id, tenant_id, project_id, submission_id, category, is_valid, severity, message, field, validation_errors, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            uuidv4(),
            validation.tenant_id,
            validation.project_id,
            validation.submission_id,
            validation.category,
            validation.is_valid,
            validation.severity,
            validation.message,
            validation.field,
            validation.is_valid ? null : JSON.stringify([{ code: 'THRESHOLD_EXCEEDED', message: validation.message }]),
          ]
        );
        validationCount++;
      } catch (error) {
        console.log(`${colors.yellow}⚠${colors.reset} Validation insert error: ${error.message}`);
      }
    }
  }
  
  console.log(`${colors.green}✓${colors.reset} Created ${validationCount} validation records`);
}

/**
 * Step 6: Verify All Data
 */
async function verifyAllData() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 6: Verify All Test Data ━━━${colors.reset}`);
  
  // Check submissions
  const submissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 100,
  });
  console.log(`${colors.green}✓${colors.reset} Submissions: ${submissions.data?.data?.length || 0}`);
  
  // Check compliance
  const compliance = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${colors.green}✓${colors.reset} Compliance records: ${compliance.data?.data?.length || 0}`);
  
  // Check validations
  const validations = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validations: ${validations.data?.data?.length || 0}`);
  
  // Check stats
  const stats = await apiRequest('GET', '/submission-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Submission stats: Total=${stats.data?.data?.total || 0}`);
  
  const valStats = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validation stats: Total=${valStats.data?.data?.total_validations || 0}`);
}

/**
 * Step 7: Test Sample Endpoints
 */
async function testSampleEndpoints() {
  console.log(`\n${colors.cyan}${colors.bright}━━━ Step 7: Test Sample Endpoints ━━━${colors.reset}`);
  
  // Test 1: Get monthly submissions
  let result = await apiRequest('GET', '/submission-reports/monthly/2025-01-01', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Monthly submissions (Jan 2025): ${result.data?.data?.length || 0}`);
  
  // Test 2: Get compliance trends
  result = await apiRequest('GET', '/compliance-reports/trends', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Compliance trends: ${result.data?.data?.length || 0} months`);
  
  // Test 3: Get failed validations
  result = await apiRequest('GET', '/validation-reports/failed', null, {
    tenant_id: tenantId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Failed validations: ${result.data?.data?.length || 0}`);
  
  // Test 4: Get node compliance
  if (testNodeIds[0]) {
    result = await apiRequest('GET', `/compliance-reports/node/${testNodeIds[0]}`, null, {
      tenant_id: tenantId,
      project_id: testProjectId,
    });
    console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Node compliance history: ${result.data?.data?.length || 0}`);
  }
  
  // Test 5: Get incomplete submissions
  result = await apiRequest('GET', '/submission-reports/incomplete/2025-01-01', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${result.success ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Incomplete submissions: ${result.data?.data?.length || 0}`);
}

/**
 * Main function
 */
async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║              CREATE TEST DATA FOR CRUD REPORTS                        ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Project ID: ${testProjectId}`);
  console.log(`Test Nodes: ${testNodeIds.length}`);
  
  try {
    // Step 1: Authenticate
    const authSuccess = await authenticate();
    if (!authSuccess) {
      console.log(`\n${colors.red}Authentication failed. Exiting.${colors.reset}`);
      process.exit(1);
    }
    
    // Step 2: Create event calendar
    await createEventCalendar();
    
    // Step 3: Create PERM submissions
    await createPERMSubmissions();
    
    // Step 4: Verify compliance tracking
    await verifyComplianceTracking();
    
    // Step 5: Create validations
    await createValidations();
    
    // Step 6: Verify all data
    await verifyAllData();
    
    // Step 7: Test sample endpoints
    await testSampleEndpoints();
    
    // Final summary
    console.log(`\n${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════╗
║                    ✅ TEST DATA CREATED SUCCESSFULLY                  ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    console.log(`\n${colors.cyan}Next steps:${colors.reset}`);
    console.log(`  1. Run: node test-crud-reports.js`);
    console.log(`  2. Verify all 34 endpoints are working`);
    console.log(`  3. Check pass rate increases to ~80-90%\n`);
    
  } catch (error) {
    console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();

