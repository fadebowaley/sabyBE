/**
 * Test Script for GET /v1/node/:nodeId/branch Endpoint
 *
 * This script tests:
 * 1. If the endpoint returns a node with all its children
 * 2. How the endpoint works (path-based query)
 * 3. If it's role-specific (permission checks)
 *
 * Usage:
 *   node scripts/test-node-branch-endpoint.js <nodeId> [email] [password]
 *
 * Examples:
 *   node scripts/test-node-branch-endpoint.js 507f1f77bcf86cd799439011
 *   node scripts/test-node-branch-endpoint.js 507f1f77bcf86cd799439011 user@example.com password123
 */

const mongoose = require('mongoose');
let axios;
try {
  axios = require('axios');
} catch (e) {
  console.error('❌ axios is required. Install it with: npm install axios');
  process.exit(1);
}

// Support both scripts/ and root execution
let configPath = '../src/config/config';
let modelsPath = '../src/models';
try {
  require.resolve(configPath);
} catch (e) {
  configPath = './src/config/config';
  modelsPath = './src/models';
}
const Config = require(configPath);
const { Nodes: NodesModel, User: UserModel } = require(modelsPath);

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/v1';
const NODE_ID = process.argv[2];
const TEST_EMAIL = process.argv[3];
const TEST_PASSWORD = process.argv[4];

if (!NODE_ID) {
  console.error('❌ Error: Node ID is required');
  console.log(
    '\nUsage: node scripts/test-node-branch-endpoint.js <nodeId> [email] [password]'
  );
  process.exit(1);
}

/**
 * Get JWT token by logging in
 */
async function getAuthToken(email, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email,
      password,
    });

    if (response.data && response.data.token) {
      return response.data.token;
    }
    throw new Error('No token in response');
  } catch (error) {
    if (error.response) {
      console.error('❌ Login failed:', error.response.data);
    } else {
      console.error('❌ Login error:', error.message);
    }
    throw error;
  }
}

/**
 * Test endpoint with authentication
 */
async function testBranchEndpoint(nodeId, token) {
  try {
    const url = `${API_BASE_URL}/node/${nodeId}/branch`;
    console.log(`\n🔍 Testing: GET ${url}`);
    console.log(`   Auth: ${token ? 'Bearer token' : 'None'}`);

    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await axios.get(url, { headers });

    return {
      success: true,
      status: response.status,
      data: response.data,
      nodeCount: response.data.results ? response.data.results.length : 0,
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status,
      error: error.response?.data || error.message,
      message: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Get node details from database
 */
async function getNodeDetails(nodeId) {
  try {
    const node = await NodesModel.findById(nodeId)
      .populate('level', 'name rank')
      .populate('structure', 'name')
      .lean();

    if (!node) {
      return null;
    }

    // Count direct children
    const directChildren = await NodesModel.countDocuments({
      parent: nodeId,
      deletedAt: null,
    });

    // Count all descendants using path
    const allDescendants = await NodesModel.countDocuments({
      path: { $regex: `^${node.path}` },
      _id: { $ne: nodeId }, // Exclude the node itself
      deletedAt: null,
    });

    return {
      nodeId: node._id.toString(),
      name: node.name,
      path: node.path,
      level: node.level?.name || 'N/A',
      structure: node.structure?.name || 'N/A',
      directChildren,
      allDescendants,
      tenantId: node.tenantId?.toString() || 'N/A',
    };
  } catch (error) {
    console.error('❌ Error getting node details:', error.message);
    return null;
  }
}

/**
 * Test without authentication (should fail)
 */
async function testWithoutAuth(nodeId) {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: Request WITHOUT Authentication');
  console.log('='.repeat(80));

  const result = await testBranchEndpoint(nodeId, null);

  if (!result.success) {
    console.log(`✅ Expected failure: ${result.status} - ${result.message}`);
    return true;
  } else {
    console.log(`❌ Unexpected success: Should require authentication`);
    return false;
  }
}

/**
 * Test with authentication
 */
async function testWithAuth(nodeId, token, userInfo) {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Request WITH Authentication');
  console.log('='.repeat(80));
  console.log(`User: ${userInfo.email}`);
  console.log(
    `Roles: isOwner=${userInfo.isOwner}, isSuper=${userInfo.isSuper}, isSaby=${userInfo.isSaby}`
  );

  const result = await testBranchEndpoint(nodeId, token);

  if (result.success) {
    console.log(`✅ Success: ${result.status}`);
    console.log(`📊 Nodes returned: ${result.nodeCount}`);
    console.log(`\n📋 Response structure:`);
    console.log(
      `   - Has 'results' array: ${Array.isArray(result.data.results)}`
    );
    console.log(`   - Results length: ${result.data.results?.length || 0}`);

    if (result.data.results && result.data.results.length > 0) {
      const firstNode = result.data.results[0];
      console.log(`\n📝 First node in results:`);
      console.log(`   - ID: ${firstNode.id || firstNode._id || 'N/A'}`);
      console.log(`   - Name: ${firstNode.name || 'N/A'}`);
      console.log(`   - Path: ${firstNode.path || 'N/A'}`);
      console.log(`   - Level: ${firstNode.level?.name || 'N/A'}`);

      // Check if results include the requested node
      const requestedNode = result.data.results.find(
        (n) => (n.id || n._id || '').toString() === nodeId.toString()
      );
      console.log(
        `\n🔍 Requested node included: ${requestedNode ? '✅ Yes' : '❌ No'}`
      );

      // Check hierarchy
      if (result.data.results.length > 1) {
        console.log(`\n🌳 Hierarchy check:`);
        const nodePaths = result.data.results
          .map((n) => n.path || '')
          .filter(Boolean);
        const basePath = nodePaths[0] || '';
        const allMatchBase = nodePaths.every((p) => p.startsWith(basePath));
        console.log(
          `   - All paths start with base path: ${allMatchBase ? '✅' : '❌'}`
        );
        console.log(`   - Base path: ${basePath}`);
        console.log(
          `   - Total descendants: ${result.data.results.length - 1}`
        );
      }
    }

    return result;
  } else {
    console.log(`❌ Failed: ${result.status} - ${result.message}`);
    return result;
  }
}

/**
 * Compare with database
 */
async function compareWithDatabase(nodeId, apiResult) {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Compare API Results with Database');
  console.log('='.repeat(80));

  const nodeDetails = await getNodeDetails(nodeId);

  if (!nodeDetails) {
    console.log('❌ Node not found in database');
    return;
  }

  console.log(`\n📊 Node Details from Database:`);
  console.log(`   - Name: ${nodeDetails.name}`);
  console.log(`   - Path: ${nodeDetails.path}`);
  console.log(`   - Level: ${nodeDetails.level}`);
  console.log(`   - Structure: ${nodeDetails.structure}`);
  console.log(`   - Direct children: ${nodeDetails.directChildren}`);
  console.log(`   - All descendants: ${nodeDetails.allDescendants}`);

  if (apiResult.success && apiResult.data.results) {
    const apiCount = apiResult.data.results.length;
    const expectedCount = nodeDetails.allDescendants + 1; // +1 for the node itself

    console.log(`\n📊 Comparison:`);
    console.log(`   - API returned: ${apiCount} nodes`);
    console.log(`   - Expected (node + descendants): ${expectedCount}`);
    console.log(`   - Match: ${apiCount === expectedCount ? '✅' : '❌'}`);

    if (apiCount !== expectedCount) {
      console.log(`\n⚠️  Count mismatch!`);
      console.log(`   - Difference: ${Math.abs(apiCount - expectedCount)}`);
    }
  }
}

/**
 * Test with different roles (if multiple users provided)
 */
async function testRoleSpecificAccess(nodeId) {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: Role-Specific Access Check');
  console.log('='.repeat(80));

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.log('⚠️  Skipping role test - no test user credentials provided');
    console.log(
      '   To test: node scripts/test-node-branch-endpoint.js <nodeId> <email> <password>'
    );
    return;
  }

  try {
    const token = await getAuthToken(TEST_EMAIL, TEST_PASSWORD);
    const user = await UserModel.findOne({ email: TEST_EMAIL }).lean();

    if (!user) {
      console.log('❌ User not found in database');
      return;
    }

    console.log(`\n👤 Test User:`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Name: ${user.firstname} ${user.lastname}`);
    console.log(`   - isOwner: ${user.isOwner || false}`);
    console.log(`   - isSuper: ${user.isSuper || false}`);
    console.log(`   - isSaby: ${user.isSaby || false}`);
    console.log(`   - Tenant: ${user.tenantId?.toString() || 'N/A'}`);

    const nodeDetails = await getNodeDetails(nodeId);
    if (nodeDetails) {
      const sameTenant = nodeDetails.tenantId === user.tenantId?.toString();
      console.log(`\n🏢 Tenant Check:`);
      console.log(`   - Node tenant: ${nodeDetails.tenantId}`);
      console.log(`   - User tenant: ${user.tenantId?.toString() || 'N/A'}`);
      console.log(`   - Same tenant: ${sameTenant ? '✅' : '❌'}`);

      if (!sameTenant) {
        console.log(`\n⚠️  Warning: Node and user are from different tenants`);
        console.log(`   Access may be denied due to tenant mismatch`);
      }
    }

    const result = await testBranchEndpoint(nodeId, token);

    if (result.success) {
      console.log(`\n✅ Access granted for user: ${user.email}`);
      console.log(
        `   Role-based access: ${
          user.isOwner || user.isSuper || user.isSaby
            ? 'Full access (Owner/Super/Saby)'
            : 'Scoped access (Regular user)'
        }`
      );
    } else {
      console.log(`\n❌ Access denied: ${result.message}`);
      if (result.status === 403) {
        console.log(
          `   This indicates role/tenant-based access control is working`
        );
      }
    }
  } catch (error) {
    console.error('❌ Error testing role access:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 Testing GET /v1/node/:nodeId/branch Endpoint');
    console.log('='.repeat(80));
    console.log(`Node ID: ${NODE_ID}`);
    console.log(`API Base URL: ${API_BASE_URL}`);

    // Connect to MongoDB
    await mongoose.connect(Config.mongoose.url, Config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Without auth (should fail)
    await testWithoutAuth(NODE_ID);

    // Test 2: With auth (if credentials provided)
    if (TEST_EMAIL && TEST_PASSWORD) {
      const token = await getAuthToken(TEST_EMAIL, TEST_PASSWORD);
      const user = await UserModel.findOne({ email: TEST_EMAIL }).lean();
      const result = await testWithAuth(NODE_ID, token, user || {});
      await compareWithDatabase(NODE_ID, result);
    } else {
      console.log(
        '\n⚠️  Skipping authenticated tests - no credentials provided'
      );
      console.log(
        '   To test with auth: node scripts/test-node-branch-endpoint.js <nodeId> <email> <password>'
      );
    }

    // Test 3: Role-specific access
    await testRoleSpecificAccess(NODE_ID);

    console.log('\n' + '='.repeat(80));
    console.log('✅ Testing Complete');
    console.log('='.repeat(80));

    await mongoose.disconnect();
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error('   Stack:', error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run script
main();
