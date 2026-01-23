/**
 * Test Script: Get User Nodes and Test Branch Endpoint
 *
 * This script:
 * 1. Logs in with provided credentials
 * 2. Gets user's assigned nodes from GET /v1/users/:userId/nodes
 * 3. Uses the first node ID to test GET /v1/node/:nodeId/branch
 *
 * Usage:
 *   node scripts/test-user-nodes-and-branch.js <email> <password>
 *
 * Example:
 *   node scripts/test-user-nodes-and-branch.js isreal@sotsm.org judah_saby1
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
const { User: UserModel } = require(modelsPath);

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.stg.saby.ai/v1';
const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('❌ Error: Email and password are required');
  console.log(
    '\nUsage: node scripts/test-user-nodes-and-branch.js <email> <password>'
  );
  console.log('\nExample:');
  console.log(
    '  node scripts/test-user-nodes-and-branch.js isreal@sotsm.org judah_saby1'
  );
  process.exit(1);
}

/**
 * Get JWT token by logging in
 */
async function getAuthToken(email, password) {
  try {
    console.log(`\n🔐 Logging in as: ${email}`);
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email,
      password,
    });

    // Handle both response formats: { token } or { tokens: { access: { token } } }
    if (response.data) {
      if (response.data.token) {
        console.log('✅ Login successful');
        return response.data.token;
      } else if (
        response.data.tokens &&
        response.data.tokens.access &&
        response.data.tokens.access.token
      ) {
        console.log('✅ Login successful');
        return response.data.tokens.access.token;
      }
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
 * Get user info from token
 */
async function getUserInfo(token) {
  try {
    const response = await axios.get(`${API_BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error(
      '❌ Error getting user info:',
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Get user's assigned nodes
 */
async function getUserNodes(userId, token) {
  try {
    console.log(`\n📋 Getting nodes for user: ${userId}`);
    const response = await axios.get(`${API_BASE_URL}/users/${userId}/nodes`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(
        '❌ Error getting user nodes:',
        error.response.status,
        error.response.data
      );
    } else {
      console.error('❌ Error:', error.message);
    }
    throw error;
  }
}

/**
 * Test branch endpoint
 */
async function testBranchEndpoint(nodeId, token) {
  try {
    console.log(`\n🌳 Testing branch endpoint for node: ${nodeId}`);
    const response = await axios.get(`${API_BASE_URL}/node/${nodeId}/branch`, {
      headers: { Authorization: `Bearer ${token}` },
    });

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
 * Main execution
 */
async function main() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 Test: Get User Nodes and Test Branch Endpoint');
    console.log('='.repeat(80));
    console.log(`Email: ${TEST_EMAIL}`);
    console.log(`API Base URL: ${API_BASE_URL}`);

    // Connect to MongoDB (optional, for user info lookup)
    try {
      await mongoose.connect(Config.mongoose.url, Config.mongoose.options);
      console.log('✅ Connected to MongoDB\n');
    } catch (e) {
      console.log('⚠️  Could not connect to MongoDB (continuing anyway)\n');
    }

    // Step 1: Login
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    // Extract token and user info from login response
    let token;
    let userInfo;
    if (loginResponse.data.token) {
      token = loginResponse.data.token;
      userInfo = loginResponse.data.user || {};
    } else if (loginResponse.data.tokens && loginResponse.data.tokens.access) {
      token = loginResponse.data.tokens.access.token;
      userInfo = loginResponse.data.user || {};
    } else {
      throw new Error('No token in login response');
    }

    console.log(`\n👤 User Info (from login):`);
    console.log(`   - ID: ${userInfo.id || userInfo._id}`);
    console.log(
      `   - Name: ${userInfo.firstname || ''} ${userInfo.lastname || ''}`
    );
    console.log(`   - Email: ${userInfo.email}`);
    console.log(`   - isOwner: ${userInfo.isOwner || false}`);
    console.log(`   - isSuper: ${userInfo.isSuper || false}`);
    console.log(`   - isSaby: ${userInfo.isSaby || false}`);
    console.log(`   - Tenant: ${userInfo.tenantId || 'N/A'}`);

    const userId = userInfo.id || userInfo._id;

    // Step 3: Get user's assigned nodes
    const nodesResponse = await getUserNodes(userId, token);

    let firstNode;
    if (!nodesResponse.results || nodesResponse.results.length === 0) {
      console.log('\n⚠️  User has no assigned nodes');

      // If user is owner/super/saby, try to get a node from their tenant
      if (userInfo.isOwner || userInfo.isSuper || userInfo.isSaby) {
        console.log(
          '   User is Owner/Super/Saby - fetching a node from tenant...'
        );
        try {
          const { Nodes: NodesModel } = require(modelsPath);
          const tenantNode = await NodesModel.findOne({
            tenantId: userInfo.tenantId,
            deletedAt: null,
          })
            .populate('level', 'name rank')
            .populate('structure', 'name')
            .lean();

          if (tenantNode) {
            firstNode = {
              id: tenantNode._id.toString(),
              _id: tenantNode._id.toString(),
              nodeId: tenantNode.nodeId,
              name: tenantNode.name,
              level: tenantNode.level,
              structure: tenantNode.structure,
            };
            console.log(
              `   ✅ Found node: ${firstNode.name} (${firstNode.nodeId})`
            );
          } else {
            console.log('   ❌ No nodes found in tenant');
            await mongoose.disconnect();
            return;
          }
        } catch (error) {
          console.error('   ❌ Error fetching tenant node:', error.message);
          await mongoose.disconnect();
          return;
        }
      } else {
        console.log('   Cannot test branch endpoint without a node ID');
        await mongoose.disconnect();
        return;
      }
    } else {
      firstNode = nodesResponse.results[0];
    }

    if (nodesResponse.results && nodesResponse.results.length > 0) {
      console.log(
        `\n✅ Found ${nodesResponse.results.length} assigned node(s):`
      );
      nodesResponse.results.forEach((node, idx) => {
        console.log(`\n   ${idx + 1}. Node ID: ${node.id || node._id}`);
        console.log(`      - nodeId: ${node.nodeId || 'N/A'}`);
        console.log(`      - Name: ${node.name || 'N/A'}`);
        console.log(`      - Level: ${node.level?.name || 'N/A'}`);
        console.log(`      - Structure: ${node.structure?.name || 'N/A'}`);
        console.log(`      - Address: ${node.address || 'N/A'}`);
      });
    }

    // Step 4: Use first node to test branch endpoint
    const firstNodeId = firstNode.id || firstNode._id;

    console.log(`\n` + '='.repeat(80));
    console.log(`🌳 Testing Branch Endpoint with First Node`);
    console.log('='.repeat(80));
    console.log(`Node ID: ${firstNodeId}`);
    console.log(`Node Name: ${firstNode.name || 'N/A'}`);

    const branchResult = await testBranchEndpoint(firstNodeId, token);

    if (branchResult.success) {
      console.log(`\n✅ Branch endpoint successful!`);
      console.log(`   Status: ${branchResult.status}`);
      console.log(`   Total nodes in branch: ${branchResult.nodeCount}`);

      if (branchResult.data.results && branchResult.data.results.length > 0) {
        console.log(`\n📋 Branch Structure:`);
        console.log(
          `   - Root node: ${
            branchResult.data.results[0].name ||
            branchResult.data.results[0].nodeId
          }`
        );
        console.log(`   - Total descendants: ${branchResult.nodeCount - 1}`);

        // Show first few nodes
        console.log(`\n📝 First 5 nodes in branch:`);
        branchResult.data.results.slice(0, 5).forEach((node, idx) => {
          console.log(
            `   ${idx + 1}. ${node.name || node.nodeId} (${node.path || 'N/A'})`
          );
        });

        if (branchResult.nodeCount > 5) {
          console.log(`   ... and ${branchResult.nodeCount - 5} more nodes`);
        }

        // Verify hierarchy
        const nodePaths = branchResult.data.results
          .map((n) => n.path || '')
          .filter(Boolean);
        if (nodePaths.length > 0) {
          const basePath = nodePaths[0] || '';
          const allMatchBase = nodePaths.every((p) => p.startsWith(basePath));
          console.log(`\n🔍 Hierarchy Check:`);
          console.log(`   - Base path: ${basePath}`);
          console.log(
            `   - All paths start with base: ${allMatchBase ? '✅' : '❌'}`
          );
        }
      }
    } else {
      console.log(`\n❌ Branch endpoint failed:`);
      console.log(`   Status: ${branchResult.status}`);
      console.log(`   Message: ${branchResult.message}`);
      if (branchResult.status === 403) {
        console.log(`\n⚠️  Access denied - check permissions or tenant`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Testing Complete');
    console.log('='.repeat(80));

    await mongoose.disconnect();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run script
main();
