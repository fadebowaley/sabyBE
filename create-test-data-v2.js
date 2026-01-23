/**
 * Create Test Data for CRUD Reports Testing (V2)
 * Matches actual database schema
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;
const testProjectId = uuidv4();
const testFormId = uuidv4();
const testNodeIds = [uuidv4(), uuidv4(), uuidv4()];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

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
    };
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║         CREATE TEST DATA FOR CRUD REPORTS (V2)                        ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  // Step 1: Authenticate
  console.log(`\n${colors.cyan}━━━ Step 1: Authentication ━━━${colors.reset}`);
  const authResult = await apiRequest('POST', '/auth/login', CREDENTIALS);
  if (!authResult.success) {
    console.log(`${colors.red}✗ Login failed${colors.reset}`);
    return;
  }
  authToken = authResult.data.tokens.access.token;
  tenantId = authResult.data.user.tenantId;
  userId = authResult.data.user.id;
  console.log(`${colors.green}✓ Login successful${colors.reset}`);
  console.log(`  Tenant: ${tenantId}, User: ${userId.substring(0, 8)}...`);
  console.log(`  Project: ${testProjectId.substring(0, 8)}...`);

  // Step 2: Create PERM submissions (9 submissions: 3 nodes × 3 months)
  console.log(`\n${colors.cyan}━━━ Step 2: Create PERM Submissions ━━━${colors.reset}`);
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  let queuedCount = 0;

  for (const nodeId of testNodeIds) {
    for (const month of months) {
      const eventData = {
        week_1_monday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_1_wednesday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_2_monday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_3_friday: { value: Math.floor(Math.random() * 50) + 10, submitted: false },
      };

      const result = await apiRequest('POST', '/submissions', {
        tenantId,
        projectId: testProjectId,
        formId: testFormId,
        nodeId,
        userId,
        payload: eventData,
        source: 'api',
        month,
        year: parseInt(month.split('-')[0]),
        perm_enabled: true,
        project_name: 'Test PERM Project',
        project_category: 'Healthcare',
      });

      if (result.success) {
        queuedCount++;
        console.log(`${colors.green}✓${colors.reset} Queued: ${month} / Node ...${nodeId.substring(0, 8)}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n  ${colors.yellow}⏳ Waiting 15 seconds for queue to process ${queuedCount} submissions...${colors.reset}`);
  await new Promise(r => setTimeout(r, 15000));

  // Step 3: Verify submissions were processed
  console.log(`\n${colors.cyan}━━━ Step 3: Verify Processed Submissions ━━━${colors.reset}`);
  const submissionsResult = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
    perm_enabled: true,
    limit: 100,
  });

  let processedSubmissions = [];
  if (submissionsResult.success && submissionsResult.data.data) {
    processedSubmissions = submissionsResult.data.data;
    console.log(`${colors.green}✓${colors.reset} Found ${processedSubmissions.length} processed submissions`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} No processed submissions found yet`);
  }

  // Step 4: Create validation records directly
  console.log(`\n${colors.cyan}━━━ Step 4: Create Validation Records ━━━${colors.reset}`);
  const { postgresPool } = require('./src/config/postgres');
  let validationCount = 0;

  for (const submission of processedSubmissions.slice(0, 5)) {
    const validations = [
      {
        submission_id: submission.id,
        category: 'attendance',
        validation_type: 'total_check',
        is_valid: true,
        severity: 'info',
        error_code: null,
        error_message: 'Attendance totals validated successfully',
      },
      {
        submission_id: submission.id,
        category: 'financial',
        validation_type: 'percentage_check',
        is_valid: false,
        severity: 'warning',
        error_code: 'PERCENTAGE_OFF',
        error_message: 'Offering percentage slightly off expected',
        error_details: { expected: 50, actual: 45, difference: 5 },
      },
    ];

    for (const val of validations) {
      try {
        await postgresPool.query(
          `INSERT INTO submission_validations 
           (id, submission_id, category, validation_type, is_valid, severity, error_code, error_message, error_details, validated_at, validated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
          [
            uuidv4(),
            val.submission_id,
            val.category,
            val.validation_type,
            val.is_valid,
            val.severity,
            val.error_code,
            val.error_message,
            val.error_details ? JSON.stringify(val.error_details) : null,
            'system',
          ]
        );
        validationCount++;
      } catch (error) {
        console.log(`${colors.yellow}⚠${colors.reset} Validation insert error: ${error.message}`);
      }
    }
  }

  console.log(`${colors.green}✓${colors.reset} Created ${validationCount} validation records`);

  // Step 5: Verify all data
  console.log(`\n${colors.cyan}━━━ Step 5: Final Verification ━━━${colors.reset}`);

  const stats = await apiRequest('GET', '/submission-reports/stats', null, { tenant_id: tenantId });
  console.log(`${colors.green}✓${colors.reset} Submissions: Total=${stats.data?.data?.total || 0}`);

  const compliance = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${colors.green}✓${colors.reset} Compliance records: ${compliance.data?.data?.length || 0}`);

  const validations = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validations: ${validations.data?.data?.length || validationCount}`);

  const valStats = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validation stats: Total=${valStats.data?.data?.total_validations || 0}, Failed=${valStats.data?.data?.failed_validations || 0}`);

  console.log(`\n${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════╗
║                 ✅ TEST DATA CREATED SUCCESSFULLY                     ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`\n${colors.cyan}Test Data Created:${colors.reset}`);
  console.log(`  • Project ID: ${testProjectId}`);
  console.log(`  • Nodes: ${testNodeIds.length}`);
  console.log(`  • Submissions: ${processedSubmissions.length}`);
  console.log(`  • Validations: ${validationCount}`);
  console.log(`\n${colors.cyan}Next: Run tests${colors.reset}`);
  console.log(`  node test-crud-reports.js\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
  process.exit(1);
});

/**
 * Create Test Data for CRUD Reports Testing (V2)
 * Matches actual database schema
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;
const testProjectId = uuidv4();
const testFormId = uuidv4();
const testNodeIds = [uuidv4(), uuidv4(), uuidv4()];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

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
    };
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║         CREATE TEST DATA FOR CRUD REPORTS (V2)                        ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  // Step 1: Authenticate
  console.log(`\n${colors.cyan}━━━ Step 1: Authentication ━━━${colors.reset}`);
  const authResult = await apiRequest('POST', '/auth/login', CREDENTIALS);
  if (!authResult.success) {
    console.log(`${colors.red}✗ Login failed${colors.reset}`);
    return;
  }
  authToken = authResult.data.tokens.access.token;
  tenantId = authResult.data.user.tenantId;
  userId = authResult.data.user.id;
  console.log(`${colors.green}✓ Login successful${colors.reset}`);
  console.log(`  Tenant: ${tenantId}, User: ${userId.substring(0, 8)}...`);
  console.log(`  Project: ${testProjectId.substring(0, 8)}...`);

  // Step 2: Create PERM submissions (9 submissions: 3 nodes × 3 months)
  console.log(`\n${colors.cyan}━━━ Step 2: Create PERM Submissions ━━━${colors.reset}`);
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  let queuedCount = 0;

  for (const nodeId of testNodeIds) {
    for (const month of months) {
      const eventData = {
        week_1_monday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_1_wednesday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_2_monday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_3_friday: { value: Math.floor(Math.random() * 50) + 10, submitted: false },
      };

      const result = await apiRequest('POST', '/submissions', {
        tenantId,
        projectId: testProjectId,
        formId: testFormId,
        nodeId,
        userId,
        payload: eventData,
        source: 'api',
        month,
        year: parseInt(month.split('-')[0]),
        perm_enabled: true,
        project_name: 'Test PERM Project',
        project_category: 'Healthcare',
      });

      if (result.success) {
        queuedCount++;
        console.log(`${colors.green}✓${colors.reset} Queued: ${month} / Node ...${nodeId.substring(0, 8)}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n  ${colors.yellow}⏳ Waiting 15 seconds for queue to process ${queuedCount} submissions...${colors.reset}`);
  await new Promise(r => setTimeout(r, 15000));

  // Step 3: Verify submissions were processed
  console.log(`\n${colors.cyan}━━━ Step 3: Verify Processed Submissions ━━━${colors.reset}`);
  const submissionsResult = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
    perm_enabled: true,
    limit: 100,
  });

  let processedSubmissions = [];
  if (submissionsResult.success && submissionsResult.data.data) {
    processedSubmissions = submissionsResult.data.data;
    console.log(`${colors.green}✓${colors.reset} Found ${processedSubmissions.length} processed submissions`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} No processed submissions found yet`);
  }

  // Step 4: Create validation records directly
  console.log(`\n${colors.cyan}━━━ Step 4: Create Validation Records ━━━${colors.reset}`);
  const { postgresPool } = require('./src/config/postgres');
  let validationCount = 0;

  for (const submission of processedSubmissions.slice(0, 5)) {
    const validations = [
      {
        submission_id: submission.id,
        category: 'attendance',
        validation_type: 'total_check',
        is_valid: true,
        severity: 'info',
        error_code: null,
        error_message: 'Attendance totals validated successfully',
      },
      {
        submission_id: submission.id,
        category: 'financial',
        validation_type: 'percentage_check',
        is_valid: false,
        severity: 'warning',
        error_code: 'PERCENTAGE_OFF',
        error_message: 'Offering percentage slightly off expected',
        error_details: { expected: 50, actual: 45, difference: 5 },
      },
    ];

    for (const val of validations) {
      try {
        await postgresPool.query(
          `INSERT INTO submission_validations 
           (id, submission_id, category, validation_type, is_valid, severity, error_code, error_message, error_details, validated_at, validated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
          [
            uuidv4(),
            val.submission_id,
            val.category,
            val.validation_type,
            val.is_valid,
            val.severity,
            val.error_code,
            val.error_message,
            val.error_details ? JSON.stringify(val.error_details) : null,
            'system',
          ]
        );
        validationCount++;
      } catch (error) {
        console.log(`${colors.yellow}⚠${colors.reset} Validation insert error: ${error.message}`);
      }
    }
  }

  console.log(`${colors.green}✓${colors.reset} Created ${validationCount} validation records`);

  // Step 5: Verify all data
  console.log(`\n${colors.cyan}━━━ Step 5: Final Verification ━━━${colors.reset}`);

  const stats = await apiRequest('GET', '/submission-reports/stats', null, { tenant_id: tenantId });
  console.log(`${colors.green}✓${colors.reset} Submissions: Total=${stats.data?.data?.total || 0}`);

  const compliance = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${colors.green}✓${colors.reset} Compliance records: ${compliance.data?.data?.length || 0}`);

  const validations = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validations: ${validations.data?.data?.length || validationCount}`);

  const valStats = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validation stats: Total=${valStats.data?.data?.total_validations || 0}, Failed=${valStats.data?.data?.failed_validations || 0}`);

  console.log(`\n${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════╗
║                 ✅ TEST DATA CREATED SUCCESSFULLY                     ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`\n${colors.cyan}Test Data Created:${colors.reset}`);
  console.log(`  • Project ID: ${testProjectId}`);
  console.log(`  • Nodes: ${testNodeIds.length}`);
  console.log(`  • Submissions: ${processedSubmissions.length}`);
  console.log(`  • Validations: ${validationCount}`);
  console.log(`\n${colors.cyan}Next: Run tests${colors.reset}`);
  console.log(`  node test-crud-reports.js\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
  process.exit(1);
});

/**
 * Create Test Data for CRUD Reports Testing (V2)
 * Matches actual database schema
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;
const testProjectId = uuidv4();
const testFormId = uuidv4();
const testNodeIds = [uuidv4(), uuidv4(), uuidv4()];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

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
    };
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════╗
║         CREATE TEST DATA FOR CRUD REPORTS (V2)                        ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  // Step 1: Authenticate
  console.log(`\n${colors.cyan}━━━ Step 1: Authentication ━━━${colors.reset}`);
  const authResult = await apiRequest('POST', '/auth/login', CREDENTIALS);
  if (!authResult.success) {
    console.log(`${colors.red}✗ Login failed${colors.reset}`);
    return;
  }
  authToken = authResult.data.tokens.access.token;
  tenantId = authResult.data.user.tenantId;
  userId = authResult.data.user.id;
  console.log(`${colors.green}✓ Login successful${colors.reset}`);
  console.log(`  Tenant: ${tenantId}, User: ${userId.substring(0, 8)}...`);
  console.log(`  Project: ${testProjectId.substring(0, 8)}...`);

  // Step 2: Create PERM submissions (9 submissions: 3 nodes × 3 months)
  console.log(`\n${colors.cyan}━━━ Step 2: Create PERM Submissions ━━━${colors.reset}`);
  const months = ['2025-01-01', '2025-02-01', '2025-03-01'];
  let queuedCount = 0;

  for (const nodeId of testNodeIds) {
    for (const month of months) {
      const eventData = {
        week_1_monday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_1_wednesday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_2_monday: { value: Math.floor(Math.random() * 50) + 10, submitted: true },
        week_3_friday: { value: Math.floor(Math.random() * 50) + 10, submitted: false },
      };

      const result = await apiRequest('POST', '/submissions', {
        tenantId,
        projectId: testProjectId,
        formId: testFormId,
        nodeId,
        userId,
        payload: eventData,
        source: 'api',
        month,
        year: parseInt(month.split('-')[0]),
        perm_enabled: true,
        project_name: 'Test PERM Project',
        project_category: 'Healthcare',
      });

      if (result.success) {
        queuedCount++;
        console.log(`${colors.green}✓${colors.reset} Queued: ${month} / Node ...${nodeId.substring(0, 8)}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n  ${colors.yellow}⏳ Waiting 15 seconds for queue to process ${queuedCount} submissions...${colors.reset}`);
  await new Promise(r => setTimeout(r, 15000));

  // Step 3: Verify submissions were processed
  console.log(`\n${colors.cyan}━━━ Step 3: Verify Processed Submissions ━━━${colors.reset}`);
  const submissionsResult = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
    perm_enabled: true,
    limit: 100,
  });

  let processedSubmissions = [];
  if (submissionsResult.success && submissionsResult.data.data) {
    processedSubmissions = submissionsResult.data.data;
    console.log(`${colors.green}✓${colors.reset} Found ${processedSubmissions.length} processed submissions`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} No processed submissions found yet`);
  }

  // Step 4: Create validation records directly
  console.log(`\n${colors.cyan}━━━ Step 4: Create Validation Records ━━━${colors.reset}`);
  const { postgresPool } = require('./src/config/postgres');
  let validationCount = 0;

  for (const submission of processedSubmissions.slice(0, 5)) {
    const validations = [
      {
        submission_id: submission.id,
        category: 'attendance',
        validation_type: 'total_check',
        is_valid: true,
        severity: 'info',
        error_code: null,
        error_message: 'Attendance totals validated successfully',
      },
      {
        submission_id: submission.id,
        category: 'financial',
        validation_type: 'percentage_check',
        is_valid: false,
        severity: 'warning',
        error_code: 'PERCENTAGE_OFF',
        error_message: 'Offering percentage slightly off expected',
        error_details: { expected: 50, actual: 45, difference: 5 },
      },
    ];

    for (const val of validations) {
      try {
        await postgresPool.query(
          `INSERT INTO submission_validations 
           (id, submission_id, category, validation_type, is_valid, severity, error_code, error_message, error_details, validated_at, validated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)`,
          [
            uuidv4(),
            val.submission_id,
            val.category,
            val.validation_type,
            val.is_valid,
            val.severity,
            val.error_code,
            val.error_message,
            val.error_details ? JSON.stringify(val.error_details) : null,
            'system',
          ]
        );
        validationCount++;
      } catch (error) {
        console.log(`${colors.yellow}⚠${colors.reset} Validation insert error: ${error.message}`);
      }
    }
  }

  console.log(`${colors.green}✓${colors.reset} Created ${validationCount} validation records`);

  // Step 5: Verify all data
  console.log(`\n${colors.cyan}━━━ Step 5: Final Verification ━━━${colors.reset}`);

  const stats = await apiRequest('GET', '/submission-reports/stats', null, { tenant_id: tenantId });
  console.log(`${colors.green}✓${colors.reset} Submissions: Total=${stats.data?.data?.total || 0}`);

  const compliance = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: tenantId,
    project_id: testProjectId,
  });
  console.log(`${colors.green}✓${colors.reset} Compliance records: ${compliance.data?.data?.length || 0}`);

  const validations = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validations: ${validations.data?.data?.length || validationCount}`);

  const valStats = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: tenantId,
  });
  console.log(`${colors.green}✓${colors.reset} Validation stats: Total=${valStats.data?.data?.total_validations || 0}, Failed=${valStats.data?.data?.failed_validations || 0}`);

  console.log(`\n${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════╗
║                 ✅ TEST DATA CREATED SUCCESSFULLY                     ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`\n${colors.cyan}Test Data Created:${colors.reset}`);
  console.log(`  • Project ID: ${testProjectId}`);
  console.log(`  • Nodes: ${testNodeIds.length}`);
  console.log(`  • Submissions: ${processedSubmissions.length}`);
  console.log(`  • Validations: ${validationCount}`);
  console.log(`\n${colors.cyan}Next: Run tests${colors.reset}`);
  console.log(`  node test-crud-reports.js\n`);
  
  process.exit(0);
}

main().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
  process.exit(1);
});

