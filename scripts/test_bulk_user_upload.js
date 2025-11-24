const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Script to test bulk user upload functionality
 *
 * Usage:
 *   node scripts/test_bulk_user_upload.js
 *
 * This script will:
 * 1. Login with provided credentials
 * 2. Read the test CSV file
 * 3. Parse and upload users via bulk-create endpoint
 * 4. Display results
 */

const BASE_URL = process.env.API_URL || 'http://localhost:4000/v1';
const TEST_CSV_PATH = path.join(
  __dirname,
  'migration_data',
  'users_bulk_import_test.csv'
);

// Test credentials
const LOGIN_CREDENTIALS = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
};

/**
 * Login and get access token
 */
const login = async () => {
  try {
    console.log('🔐 Logging in...');
    console.log(`   Email: ${LOGIN_CREDENTIALS.email}`);
    console.log(`   Endpoint: ${BASE_URL}/auth/login\n`);

    const response = await axios.post(
      `${BASE_URL}/auth/login`,
      LOGIN_CREDENTIALS
    );

    if (response.data && response.data.tokens && response.data.tokens.access) {
      const token = response.data.tokens.access.token;
      const user = response.data.user;

      console.log('✅ Login successful!');
      console.log(`   User: ${user.firstname} ${user.lastname}`);
      console.log(`   Tenant ID: ${user.tenantId}`);
      console.log(
        `   Privileges: isSaby=${user.isSaby}, isSuper=${user.isSuper}, isOwner=${user.isOwner}\n`
      );

      return token;
    } else {
      throw new Error('Invalid login response format');
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ Login failed!');
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Error: ${
          error.response.data.message || JSON.stringify(error.response.data)
        }`
      );
    } else {
      console.error('❌ Login error:', error.message);
      if (error.code === 'ECONNREFUSED') {
        console.error('\n💡 Backend server is not running. Start it with:');
        console.error('   cd sabyBackend && npm run dev\n');
      }
    }
    throw error;
  }
};

/**
 * Simple CSV parser
 */
const parseCSV = (csvContent) => {
  const lines = csvContent.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header and one data row');
  }

  // Parse header
  const headers = lines[0].split(',').map((h) => h.trim());

  // Parse data rows
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    // Skip empty rows
    if (Object.values(row).some((v) => v !== '')) {
      data.push(row);
    }
  }

  return data;
};

/**
 * Read and parse CSV file
 */
const readAndParseCSV = () => {
  try {
    console.log('📄 Reading CSV file...');
    console.log(`   Path: ${TEST_CSV_PATH}\n`);

    if (!fs.existsSync(TEST_CSV_PATH)) {
      throw new Error(`CSV file not found: ${TEST_CSV_PATH}`);
    }

    const csvContent = fs.readFileSync(TEST_CSV_PATH, 'utf-8');
    const data = parseCSV(csvContent);

    console.log(`✅ CSV parsed successfully!`);
    console.log(`   Found ${data.length} users to import\n`);

    return data;
  } catch (error) {
    console.error('❌ Error reading CSV:', error.message);
    throw error;
  }
};

/**
 * Transform CSV data to API payload format
 */
const transformCSVData = (csvData) => {
  return csvData.map((item) => {
    // Map phone to phoneNumber
    const phoneNumber = item.phoneNumber || item.phone || '';

    // Handle status conversion (string to boolean)
    let status = false;
    if (
      item.status !== undefined &&
      item.status !== null &&
      item.status !== ''
    ) {
      if (typeof item.status === 'string') {
        status =
          item.status.toLowerCase() === 'true' ||
          item.status.toLowerCase() === 'active';
      } else {
        status = Boolean(item.status);
      }
    }

    // Handle roles - can be comma-separated string or array
    let roles = [];
    if (item.roles && item.roles.trim() !== '') {
      if (typeof item.roles === 'string') {
        roles = item.roles
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r);
      } else if (Array.isArray(item.roles)) {
        roles = item.roles;
      }
    }

    // Build payload with all allowed fields
    const payload = {
      firstname: item.firstname,
      lastname: item.lastname,
      email: item.email,
      password: item.password,
      status: status,
    };

    // Add phoneNumber if present
    if (phoneNumber && phoneNumber.trim() !== '') {
      payload.phoneNumber = phoneNumber.trim();
    }

    // Add roles if present
    if (roles.length > 0) {
      payload.roles = roles;
    }

    // Convert boolean fields properly
    if (
      item.isEmailVerified !== undefined &&
      item.isEmailVerified !== null &&
      item.isEmailVerified !== ''
    ) {
      const emailVerified =
        typeof item.isEmailVerified === 'string'
          ? item.isEmailVerified.toLowerCase() === 'true'
          : Boolean(item.isEmailVerified);
      payload.isEmailVerified = emailVerified;
    }

    if (
      item.isPhoneVerified !== undefined &&
      item.isPhoneVerified !== null &&
      item.isPhoneVerified !== ''
    ) {
      const phoneVerified =
        typeof item.isPhoneVerified === 'string'
          ? item.isPhoneVerified.toLowerCase() === 'true'
          : Boolean(item.isPhoneVerified);
      payload.isPhoneVerified = phoneVerified;
    }

    return payload;
  });
};

/**
 * Upload users via bulk-create endpoint
 */
const bulkCreateUsers = async (token, payload) => {
  try {
    console.log('📤 Uploading users...');
    console.log(`   Endpoint: ${BASE_URL}/users/bulk-create`);
    console.log(`   Users: ${payload.length}\n`);

    const response = await axios.post(
      `${BASE_URL}/users/bulk-create`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('❌ Bulk create failed!');
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Error: ${JSON.stringify(error.response.data, null, 2)}`
      );
    } else {
      console.error('❌ Upload error:', error.message);
    }
    throw error;
  }
};

/**
 * Display results
 */
const displayResults = (result) => {
  console.log('\n' + '='.repeat(60));
  console.log('📊 BULK UPLOAD RESULTS');
  console.log('='.repeat(60) + '\n');

  if (result.summary) {
    console.log('Summary:');
    console.log(`   Total:    ${result.summary.total}`);
    console.log(`   Created:  ${result.summary.created} ✅`);
    console.log(
      `   Failed:   ${result.summary.failed} ${
        result.summary.failed > 0 ? '❌' : ''
      }`
    );
    console.log('');
  }

  if (result.createdUsers && result.createdUsers.length > 0) {
    console.log('✅ Successfully Created Users:');
    console.log('-'.repeat(60));
    result.createdUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email}`);
      if (user.userId) {
        console.log(`      User ID: ${user.userId}`);
      }
      if (user.message) {
        console.log(`      ${user.message}`);
      }
    });
    console.log('');
  }

  if (result.errors && result.errors.length > 0) {
    console.log('❌ Errors:');
    console.log('-'.repeat(60));
    result.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error.email || 'Unknown'}`);
      console.log(`      Error: ${error.error}`);
    });
    console.log('');
  }

  console.log('='.repeat(60) + '\n');
};

/**
 * Main test function
 */
const runTest = async () => {
  try {
    console.log('\n' + '🧪'.repeat(30));
    console.log('BULK USER UPLOAD TEST');
    console.log('🧪'.repeat(30) + '\n');

    // Step 1: Login
    const token = await login();

    // Step 2: Read CSV
    const csvData = readAndParseCSV();

    // Step 3: Transform data
    console.log('🔄 Transforming data...\n');
    const payload = transformCSVData(csvData);

    console.log('📋 Payload preview (first user):');
    console.log(JSON.stringify(payload[0], null, 2));
    console.log('');

    // Step 4: Upload
    const result = await bulkCreateUsers(token, payload);

    // Step 5: Display results
    displayResults(result);

    console.log('✅ Test completed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
};

// Run the test
if (require.main === module) {
  runTest();
}

module.exports = {
  runTest,
  login,
  readAndParseCSV,
  transformCSVData,
  bulkCreateUsers,
};
