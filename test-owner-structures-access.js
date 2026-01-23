/**
 * Test script to debug Owner access to structures endpoint
 *
 * This script will help identify why the Owner role is being denied access
 * to the structures resource despite it being in the ownerResourceBundle.
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/v1';
const OWNER_JWT = process.env.OWNER_JWT; // You need to provide an Owner JWT token

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testStructureAccess() {
  log('cyan', '='.repeat(80));
  log('cyan', 'Testing Owner Access to Structures Endpoint');
  log('cyan', '='.repeat(80));

  if (!OWNER_JWT) {
    log('red', '\n❌ ERROR: OWNER_JWT environment variable is not set!');
    log('yellow', '\nUsage:');
    log(
      'yellow',
      '  OWNER_JWT=<your-jwt-token> node test-owner-structures-access.js'
    );
    log('yellow', '\nOr set API_BASE_URL if not using localhost:3000');
    process.exit(1);
  }

  console.log('\n📋 Configuration:');
  log('blue', `  API Base URL: ${BASE_URL}`);
  log('blue', `  JWT Token: ${OWNER_JWT.substring(0, 20)}...`);

  console.log('\n🔍 Testing GET /v1/structure endpoint...\n');

  try {
    const response = await axios.get(`${BASE_URL}/structure`, {
      headers: {
        Authorization: `Bearer ${OWNER_JWT}`,
      },
    });

    log('green', '✅ SUCCESS! Owner can access structures endpoint');
    log('green', `   Status: ${response.status}`);
    console.log('   Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      log('red', '❌ FAILED! Owner was denied access');
      log('red', `   Status: ${error.response.status}`);
      log(
        'red',
        `   Message: ${
          error.response.data.message || error.response.statusText
        }`
      );
      console.log(
        '\n📊 Full error response:',
        JSON.stringify(error.response.data, null, 2)
      );
    } else if (error.request) {
      log('red', '❌ FAILED! No response from server');
      log('red', '   Is the backend running?');
    } else {
      log('red', `❌ FAILED! ${error.message}`);
    }
  }

  console.log('\n');
  log('cyan', '='.repeat(80));
  log('cyan', 'Debugging Tips:');
  log('cyan', '='.repeat(80));
  console.log(`
1. Check backend logs for detailed debug information:
   - Look for lines starting with 🔍 [AUTH MIDDLEWARE]
   - These will show what's in the ownerResourceBundle
   
2. The debug logs will show:
   - If "structures" is in the loaded bundle
   - The exact comparison being made
   - Character-by-character comparison of strings
   
3. If the bundle shows "structures" but the check fails, there might be:
   - Whitespace in the JSON file
   - Character encoding issues
   - Case sensitivity problems
   
4. Common issues:
   - JSON file not being reloaded (restart the backend)
   - Typo in the permission name
   - Bundle not including the resource
  `);

  log('cyan', '='.repeat(80));
}

// Check the ownerResource.json file
async function checkJsonFile() {
  const fs = require('fs');
  const path = require('path');

  const jsonPath = path.join(
    __dirname,
    'src/scripts/permissions/ownerResource.json'
  );

  log('cyan', '\n📄 Checking ownerResource.json file...\n');

  try {
    const fileContent = fs.readFileSync(jsonPath, 'utf-8');
    log('blue', 'File contents:');
    console.log(fileContent);

    const parsed = JSON.parse(fileContent);
    log('blue', '\n✅ JSON is valid');
    log('blue', `   Bundle array length: ${parsed.ownerResourceBundle.length}`);
    log('blue', '   Resources in bundle:');

    parsed.ownerResourceBundle.forEach((resource, idx) => {
      console.log(`     [${idx}] "${resource}" (length: ${resource.length})`);

      // Check for whitespace
      if (resource !== resource.trim()) {
        log(
          'red',
          `     ⚠️  WARNING: Resource has leading/trailing whitespace!`
        );
      }

      // Check if it's "structures"
      if (resource === 'structures') {
        log('green', '     ✅ "structures" found in bundle');
      }
    });

    // Specific check for structures
    const hasStructures = parsed.ownerResourceBundle.includes('structures');
    console.log('\n');
    if (hasStructures) {
      log('green', '✅ "structures" is in the bundle (using .includes())');
    } else {
      log('red', '❌ "structures" is NOT in the bundle (using .includes())');
      log(
        'yellow',
        '   This indicates a potential encoding or whitespace issue'
      );
    }
  } catch (error) {
    log('red', `❌ Error reading JSON file: ${error.message}`);
  }
}

// Run tests
(async () => {
  await checkJsonFile();
  await testStructureAccess();
})();
