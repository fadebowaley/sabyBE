/**
 * Script to Recompute Baseline Intelligence via API
 * 
 * This script recomputes baseline intelligence after profile updates
 * to ensure all analytics reflect the latest data.
 * 
 * Usage: 
 *   node scripts/recompute-baseline-via-api.js
 */

const axios = require('axios');
const logger = require('../src/config/logger');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Authentication credentials
const AUTH_EMAIL = 'josaby@saby.ai';
const AUTH_PASSWORD = '@judah_saby1';

// API Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/v1';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

let authToken = null;
let tenantId = null;

/**
 * Make API request with authentication
 */
async function apiRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      logger.error(
        `API Error [${method} ${endpoint}]: ${error.response.status} - ${error.response.data?.message || error.message}`
      );
      if (error.response.data) {
        logger.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    } else if (error.request) {
      logger.error(
        `API Error [${method} ${endpoint}]: No response received. Is the server running at ${API_BASE_URL}?`
      );
      logger.error(`   Error: ${error.message}`);
    } else {
      logger.error(`API Error [${method} ${endpoint}]:`, error.message);
    }
    throw error;
  }
}

/**
 * Authenticate and get access token
 */
async function authenticate() {
  logger.info(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  logger.info(
    '║  STEP 1: Authentication                                        ║'
  );
  logger.info(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    const response = await apiRequest('POST', '/auth/login', {
      email: AUTH_EMAIL,
      password: AUTH_PASSWORD,
    });

    authToken = response.tokens.access.token;
    tenantId = response.user.tenantId;

    logger.info('✅ Authenticated successfully');
    logger.info(`   User: ${response.user.email}`);
    logger.info(`   Tenant ID: ${tenantId}\n`);

    return { token: authToken, tenantId };
  } catch (error) {
    logger.error('❌ Authentication failed:', error.message);
    throw error;
  }
}

/**
 * Recompute network baseline
 */
async function recomputeNetworkBaseline() {
  logger.info(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  logger.info(
    '║  STEP 2: Recomputing Network Baseline                         ║'
  );
  logger.info(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    logger.info('🔄 Computing network baseline...');
    const response = await apiRequest('POST', '/baseline/network/recompute');

    logger.info('✅ Network baseline recomputed successfully');
    logger.info(`   Computation time: ${response.data?.computationTime || response.computationTime || 'N/A'}ms`);
    const metrics = response.data?.metrics || response.data?.data?.metrics || {};
    logger.info(`   Total users: ${metrics.users?.total || metrics.totalUsers || 'N/A'}`);
    logger.info(`   Total nodes: ${metrics.network?.totalNodes || 'N/A'}`);
    logger.info(`   Insights generated: ${(response.data?.insights || response.data?.data?.insights || []).length}\n`);

    return response.data;
  } catch (error) {
    logger.error('❌ Error recomputing network baseline:', error.message);
    throw error;
  }
}

/**
 * Recompute all baselines (network + all nodes)
 */
async function recomputeAllBaselines() {
  logger.info(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  logger.info(
    '║  STEP 3: Recomputing All Baselines                            ║'
  );
  logger.info(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    logger.info('🔄 Computing all baselines (this may take a while)...');
    const response = await apiRequest('POST', '/baseline/recompute/all');

    logger.info('✅ All baselines recomputed successfully');
    logger.info(`   Nodes processed: ${response.data?.data?.nodesProcessed || 0}`);
    logger.info(`   Network processed: ${response.data?.data?.networkProcessed ? 'Yes' : 'No'}`);
    logger.info(`   Total duration: ${response.data?.data?.duration || 0}ms`);
    
    if (response.data?.data?.errors?.length > 0) {
      logger.warn(`   ⚠️  Errors: ${response.data.data.errors.length}`);
      response.data.data.errors.forEach((error, index) => {
        logger.warn(`      ${index + 1}. ${error.nodeId || error.type}: ${error.error}`);
      });
    }
    logger.info('');

    return response.data;
  } catch (error) {
    logger.error('❌ Error recomputing all baselines:', error.message);
    throw error;
  }
}

/**
 * Get baseline summary to verify
 */
async function verifyBaseline() {
  logger.info(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  logger.info(
    '║  STEP 4: Verifying Baseline Data                               ║'
  );
  logger.info(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    logger.info('📊 Fetching baseline summary...');
    const response = await apiRequest('GET', '/baseline/summary');

    const summary = response.data || response;
    logger.info('✅ Baseline summary retrieved:');
    logger.info(`   Total Users: ${summary.users?.total || summary.totalUsers || 0}`);
    logger.info(`   Active Users: ${summary.users?.active || 0}`);
    logger.info(`   Total Nodes: ${summary.network?.totalNodes || summary.totalNodes || 0}`);
    const avgAge = summary.users?.demographics?.averageAge || summary.averageAge || summary.users?.averageAge;
    logger.info(`   Average Age: ${avgAge ? avgAge.toFixed(1) : 'N/A'}`);
    const genderDist = summary.users?.demographics?.genderDistribution || summary.genderDistribution || summary.users?.genderDistribution || {};
    logger.info(`   Gender Distribution:`);
    logger.info(`      Male: ${genderDist.male || 0}`);
    logger.info(`      Female: ${genderDist.female || 0}`);
    
    // Check office titles and qualifications
    const officeTitles = summary.users?.officeTitles || summary.officeTitles || [];
    const qualifications = summary.users?.qualifications || summary.qualifications || [];
    logger.info(`   Office Titles: ${officeTitles.length} unique titles`);
    if (officeTitles.length > 0) {
      logger.info(`      Top 3: ${officeTitles.slice(0, 3).map(t => `${t.title} (${t.count})`).join(', ')}`);
    } else {
      logger.warn(`      ⚠️  No office titles found - users need profile.officeTitle populated`);
    }
    logger.info(`   Qualifications: ${qualifications.length} unique qualifications`);
    if (qualifications.length > 0) {
      logger.info(`      Top 3: ${qualifications.slice(0, 3).map(q => `${q.qualification} (${q.count})`).join(', ')}`);
    } else {
      logger.warn(`      ⚠️  No qualifications found - users need profile.highestQualification populated`);
    }
    
    logger.info(`   Network Insights: ${(summary.networkInsights || []).length}`);
    logger.info(`   Node Insights: ${(summary.nodeInsights || []).length}\n`);

    return summary;
  } catch (error) {
    logger.error('❌ Error verifying baseline:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main execution function
 */
async function main() {
  logger.info('🚀 Starting Baseline Intelligence Recomputation');
  logger.info('========================================================\n');

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Recompute network baseline
    await recomputeNetworkBaseline();

    // Step 3: Recompute all baselines (optional - can be slow)
    // Uncomment if you want to recompute all node baselines too
    // await recomputeAllBaselines();

    // Step 4: Verify baseline data
    await verifyBaseline();

    logger.info(
      '\n╔════════════════════════════════════════════════════════════════╗'
    );
    logger.info(
      '║  SUMMARY                                                       ║'
    );
    logger.info(
      '╚════════════════════════════════════════════════════════════════╝\n'
    );
    logger.info('✅ Baseline intelligence recomputation completed!');
    logger.info('\n📊 Next steps:');
    logger.info('   1. Check the baseline intelligence dashboard');
    logger.info('   2. Verify all metrics are displaying correctly');
    logger.info('   3. Review insights and health scores');
    logger.info('\n🎉 All done!\n');

  } catch (error) {
    logger.error('\n========================================================');
    logger.error('💥 Recomputation failed:', error.message);
    logger.error('========================================================');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  main,
  recomputeNetworkBaseline,
  recomputeAllBaselines,
  verifyBaseline,
};

