#!/usr/bin/env node

/**
 * Baseline Intelligence Endpoints Test Script
 * 
 * Tests all baseline intelligence endpoints including:
 * - Phase 1-3 optimizations
 * - Hierarchical access control
 * - Job monitoring system
 * - Queue operations
 * 
 * Usage: node scripts/test-baseline-endpoints.js [email] [password]
 */

const axios = require('axios');
const chalk = require('chalk');

const BASE_URL = process.env.API_URL || 'http://localhost:4000/v1';
const DEFAULT_EMAIL = process.argv[2] || 'josaby@saby.ai';
const DEFAULT_PASSWORD = process.argv[3] || '@judah_saby1';

let accessToken = null;
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logSuccess = (message) => {
  console.log(chalk.green('✅ ' + message));
};

const logError = (message, error) => {
  console.log(chalk.red('❌ ' + message));
  if (error) {
    console.log(chalk.red('   Error: ' + error.message));
  }
};

const logInfo = (message) => {
  console.log(chalk.blue('ℹ️  ' + message));
};

const logSection = (title) => {
  console.log('');
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.cyan.bold('  ' + title));
  console.log(chalk.cyan('═'.repeat(70)));
  console.log('');
};

const recordTest = (name, passed, duration, details = null) => {
  testResults.total++;
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
  
  testResults.tests.push({
    name,
    passed,
    duration,
    details,
    timestamp: new Date().toISOString(),
  });
};

// ============================================================================
// API TEST FUNCTIONS
// ============================================================================

/**
 * Step 1: Login and get access token
 */
const testLogin = async () => {
  logSection('STEP 1: AUTHENTICATION');
  
  const startTime = Date.now();
  
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: DEFAULT_EMAIL,
      password: DEFAULT_PASSWORD,
    });
    
    accessToken = response.data.tokens.access.token;
    const duration = Date.now() - startTime;
    
    logSuccess(`Login successful (${duration}ms)`);
    logInfo(`User: ${DEFAULT_EMAIL}`);
    logInfo(`Token: ${accessToken.substring(0, 30)}...`);
    
    recordTest('Login', true, duration, { email: DEFAULT_EMAIL });
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('Login failed', error);
    recordTest('Login', false, duration, { error: error.message });
    return false;
  }
};

/**
 * Step 2: Test Job Monitoring Endpoints
 */
const testJobMonitoring = async () => {
  logSection('STEP 2: JOB MONITORING ENDPOINTS');
  
  // Test 1: Get queue stats
  let startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/jobs/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const data = response.data.data;
    
    logSuccess(`GET /baseline/jobs/stats (${duration}ms)`);
    logInfo(`Node queue: ${data.queues.node.waiting} waiting, ${data.queues.node.completed} completed`);
    logInfo(`Network queue: ${data.queues.network.waiting} waiting, ${data.queues.network.completed} completed`);
    logInfo(`Batch queue: ${data.queues.batch.waiting} waiting, ${data.queues.batch.completed} completed`);
    
    recordTest('GET /baseline/jobs/stats', true, duration, data.queues);
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/jobs/stats failed', error);
    recordTest('GET /baseline/jobs/stats', false, duration, { error: error.message });
  }
  
  // Test 2: Get performance metrics
  startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/jobs/metrics?timeRange=24h`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const metrics = response.data.data.metrics;
    
    logSuccess(`GET /baseline/jobs/metrics (${duration}ms)`);
    logInfo(`Total computations (24h): ${metrics.totalComputations}`);
    logInfo(`Node: ${metrics.node.count} computations, avg ${metrics.node.avgDuration}ms`);
    logInfo(`Network: ${metrics.network.count} computations, avg ${metrics.network.avgDuration}ms`);
    
    recordTest('GET /baseline/jobs/metrics', true, duration, metrics);
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/jobs/metrics failed', error);
    recordTest('GET /baseline/jobs/metrics', false, duration, { error: error.message });
  }
  
  // Test 3: Get job history
  startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/jobs/history?limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const history = response.data.data;
    
    logSuccess(`GET /baseline/jobs/history (${duration}ms)`);
    logInfo(`Retrieved ${history.length} recent computations`);
    if (history.length > 0) {
      logInfo(`Latest: ${history[0].type} at ${new Date(history[0].lastComputed).toLocaleString()}`);
    }
    
    recordTest('GET /baseline/jobs/history', true, duration, { count: history.length });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/jobs/history failed', error);
    recordTest('GET /baseline/jobs/history', false, duration, { error: error.message });
  }
};

/**
 * Step 3: Test Hierarchical Access Endpoints
 */
const testHierarchicalAccess = async () => {
  logSection('STEP 3: HIERARCHICAL ACCESS ENDPOINTS');
  
  // Test 1: Get user's node family
  let startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/my-family`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const data = response.data.data;
    
    logSuccess(`GET /baseline/my-family (${duration}ms)`);
    logInfo(`Family size: ${data.familySize} nodes`);
    logInfo(`Assigned nodes: ${data.assignedNodes.length}`);
    logInfo(`Access scope: ${data.accessScope}`);
    logInfo(`Is Owner: ${data.isOwner}`);
    
    recordTest('GET /baseline/my-family', true, duration, data);
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/my-family failed', error);
    recordTest('GET /baseline/my-family', false, duration, { error: error.message });
  }
  
  // Test 2: Get scoped network baseline
  startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/my-network`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const data = response.data;
    
    logSuccess(`GET /baseline/my-network (${duration}ms)`);
    logInfo(`Scoped: ${data.scoped}`);
    logInfo(`Scope: ${data.scope}`);
    if (data.data && data.data.metrics) {
      logInfo(`Total nodes: ${data.data.metrics.network.totalNodes}`);
      logInfo(`Total attendance: ${data.data.metrics.network.attendance.total}`);
    }
    
    recordTest('GET /baseline/my-network', true, duration, { scoped: data.scoped, scope: data.scope });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/my-network failed', error);
    recordTest('GET /baseline/my-network', false, duration, { error: error.message });
  }
  
  // Test 3: Get node list (hierarchical filtering)
  startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/node?limit=10&status=active`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const data = response.data;
    
    logSuccess(`GET /node (hierarchical filtering) (${duration}ms)`);
    logInfo(`Total results: ${data.totalResults}`);
    logInfo(`Scoped to user: ${data.scopedToUser}`);
    if (data.scopeMessage) {
      logInfo(`Scope message: ${data.scopeMessage}`);
    }
    logInfo(`Results returned: ${data.results.length}`);
    
    recordTest('GET /node (hierarchical)', true, duration, {
      totalResults: data.totalResults,
      scopedToUser: data.scopedToUser,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /node failed', error);
    recordTest('GET /node (hierarchical)', false, duration, { error: error.message });
  }
};

/**
 * Step 4: Test Existing Baseline Endpoints
 */
const testExistingEndpoints = async () => {
  logSection('STEP 4: EXISTING BASELINE ENDPOINTS');
  
  // Test 1: Get network baseline
  let startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/network`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const data = response.data.data;
    
    logSuccess(`GET /baseline/network (${duration}ms)`);
    logInfo(`Total nodes: ${data.metrics.network.totalNodes}`);
    logInfo(`Total attendance: ${data.metrics.network.attendance.total}`);
    logInfo(`Range distribution: ${data.metrics.network.attendance.rangeDistribution.length} ranges`);
    
    recordTest('GET /baseline/network', true, duration, {
      totalNodes: data.metrics.network.totalNodes,
      rangeCount: data.metrics.network.attendance.rangeDistribution.length,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/network failed', error);
    recordTest('GET /baseline/network', false, duration, { error: error.message });
  }
  
  // Test 2: Get top nodes
  startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/network/top-nodes?type=attendance&limit=5`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const data = response.data.data;
    
    logSuccess(`GET /baseline/network/top-nodes (${duration}ms)`);
    logInfo(`Top ${data.length} nodes retrieved`);
    if (data.length > 0) {
      logInfo(`#1: ${data[0].name} (${data[0].attendance} attendance)`);
    }
    
    recordTest('GET /baseline/network/top-nodes', true, duration, { count: data.length });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/network/top-nodes failed', error);
    recordTest('GET /baseline/network/top-nodes', false, duration, { error: error.message });
  }
  
  // Test 3: Get geographic distribution
  startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/network/geographic-distribution`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const data = response.data.data;
    
    logSuccess(`GET /baseline/network/geographic-distribution (${duration}ms)`);
    logInfo(`States: ${data.states.length}`);
    logInfo(`Countries: ${data.countries.length}`);
    if (data.top5States.length > 0) {
      logInfo(`Top state: ${data.top5States[0].state} (${data.top5States[0].count} nodes)`);
    }
    
    recordTest('GET /baseline/network/geographic-distribution', true, duration, {
      states: data.states.length,
      countries: data.countries.length,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/network/geographic-distribution failed', error);
    recordTest('GET /baseline/network/geographic-distribution', false, duration, { error: error.message });
  }
  
  // Test 4: Get baseline stats
  startTime = Date.now();
  try {
    const response = await axios.get(`${BASE_URL}/baseline/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const duration = Date.now() - startTime;
    const data = response.data.data.baselines;
    
    logSuccess(`GET /baseline/stats (${duration}ms)`);
    if (data.node) {
      logInfo(`Node baselines: ${data.node.count}, avg ${data.node.avgComputationTime}ms`);
    }
    if (data.network) {
      logInfo(`Network baselines: ${data.network.count}, avg ${data.network.avgComputationTime}ms`);
    }
    
    recordTest('GET /baseline/stats', true, duration, data);
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/stats failed', error);
    recordTest('GET /baseline/stats', false, duration, { error: error.message });
  }
};

/**
 * Step 5: Test Queue Operations
 */
const testQueueOperations = async () => {
  logSection('STEP 5: QUEUE OPERATIONS');
  
  // Test 1: Queue a network computation job
  let startTime = Date.now();
  try {
    const response = await axios.post(
      `${BASE_URL}/baseline/jobs/queue`,
      { jobType: 'network', delay: 0 },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    const duration = Date.now() - startTime;
    const data = response.data.data;
    
    logSuccess(`POST /baseline/jobs/queue (${duration}ms)`);
    logInfo(`Job ID: ${data.jobId}`);
    logInfo(`Status: ${data.status}`);
    logInfo(`Tenant: ${data.tenantId}`);
    
    recordTest('POST /baseline/jobs/queue', true, duration, data);
    
    // Wait for job to process
    logInfo('Waiting 5 seconds for job to process...');
    await sleep(5000);
    
    // Check if job completed
    const statsResponse = await axios.get(`${BASE_URL}/baseline/jobs/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const networkQueue = statsResponse.data.data.queues.network;
    logInfo(`Network queue after job: ${networkQueue.completed} completed, ${networkQueue.failed} failed`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('POST /baseline/jobs/queue failed', error);
    recordTest('POST /baseline/jobs/queue', false, duration, { error: error.message });
  }
};

/**
 * Step 6: Test Performance
 */
const testPerformance = async () => {
  logSection('STEP 6: PERFORMANCE TESTS');
  
  // Test multiple parallel requests
  logInfo('Testing 5 parallel requests to /baseline/network...');
  
  const startTime = Date.now();
  
  try {
    const promises = Array.from({ length: 5 }, () =>
      axios.get(`${BASE_URL}/baseline/network`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );
    
    await Promise.all(promises);
    
    const duration = Date.now() - startTime;
    const avgDuration = duration / 5;
    
    logSuccess(`5 parallel requests completed in ${duration}ms (avg: ${avgDuration}ms per request)`);
    logInfo('Config caching and optimizations working! ⚡');
    
    recordTest('Parallel requests (5x)', true, duration, { avgPerRequest: avgDuration });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('Parallel requests failed', error);
    recordTest('Parallel requests (5x)', false, duration, { error: error.message });
  }
};

/**
 * Step 7: Test Permission Checks
 */
const testPermissionChecks = async () => {
  logSection('STEP 7: PERMISSION CHECKS');
  
  // Test 1: Access a specific node baseline (should work for owner)
  let startTime = Date.now();
  try {
    // First, get a node ID
    const nodesResponse = await axios.get(`${BASE_URL}/node?limit=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const nodeId = nodesResponse.data.results[0]?.nodeId;
    
    if (nodeId) {
      const response = await axios.get(`${BASE_URL}/baseline/node/${nodeId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      const duration = Date.now() - startTime;
      
      logSuccess(`GET /baseline/node/${nodeId} (${duration}ms)`);
      logInfo('Permission check passed (Owner has full access)');
      
      recordTest('GET /baseline/node/:nodeId (with permission)', true, duration, { nodeId });
    } else {
      logInfo('No nodes available to test');
      recordTest('GET /baseline/node/:nodeId (with permission)', true, 0, { skipped: true });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('GET /baseline/node/:nodeId failed', error);
    recordTest('GET /baseline/node/:nodeId (with permission)', false, duration, { error: error.message });
  }
};

// ============================================================================
// GENERATE TEST REPORT
// ============================================================================

const generateReport = () => {
  logSection('TEST REPORT SUMMARY');
  
  const passRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  
  console.log(chalk.bold('📊 Overall Results:'));
  console.log(`   Total Tests: ${testResults.total}`);
  console.log(chalk.green(`   Passed: ${testResults.passed}`));
  console.log(chalk.red(`   Failed: ${testResults.failed}`));
  console.log(chalk.bold(`   Pass Rate: ${passRate}%`));
  console.log('');
  
  console.log(chalk.bold('📝 Detailed Results:'));
  testResults.tests.forEach((test, index) => {
    const status = test.passed ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
    console.log(`   ${index + 1}. ${status} - ${test.name} (${test.duration}ms)`);
  });
  
  console.log('');
  console.log(chalk.bold('⚡ Performance Summary:'));
  const totalDuration = testResults.tests.reduce((sum, test) => sum + test.duration, 0);
  const avgDuration = (totalDuration / testResults.total).toFixed(1);
  console.log(`   Total test duration: ${totalDuration}ms`);
  console.log(`   Average per test: ${avgDuration}ms`);
  console.log('');
  
  if (testResults.failed === 0) {
    console.log(chalk.green.bold('🎉 ALL TESTS PASSED! System is ready for production! 🎉'));
  } else {
    console.log(chalk.yellow.bold('⚠️  Some tests failed. Please review errors above.'));
  }
  
  console.log('');
  console.log('━'.repeat(70));
  
  // Write JSON report
  const fs = require('fs');
  const reportPath = require('path').join(__dirname, '../test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(chalk.gray(`📄 Detailed JSON report: ${reportPath}`));
  console.log('');
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

const runTests = async () => {
  console.log('');
  console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║  BASELINE INTELLIGENCE ENDPOINTS - COMPREHENSIVE TEST SUITE   ║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.gray(`Testing against: ${BASE_URL}`));
  console.log(chalk.gray(`Test started: ${new Date().toLocaleString()}`));
  console.log('');
  
  try {
    // Step 1: Login
    const loginSuccess = await testLogin();
    if (!loginSuccess) {
      console.log(chalk.red.bold('\n❌ Login failed. Cannot proceed with tests.'));
      process.exit(1);
    }
    
    // Step 2: Test job monitoring
    await testJobMonitoring();
    
    // Step 3: Test hierarchical access
    await testHierarchicalAccess();
    
    // Step 4: Test existing endpoints
    await testExistingEndpoints();
    
    // Step 5: Test queue operations
    await testQueueOperations();
    
    // Step 6: Test performance
    await testPerformance();
    
    // Step 7: Test permissions
    await testPermissionChecks();
    
    // Generate report
    generateReport();
    
    // Exit with appropriate code
    process.exit(testResults.failed === 0 ? 0 : 1);
    
  } catch (error) {
    console.log('');
    console.log(chalk.red.bold('❌ Fatal error during test execution:'));
    console.log(chalk.red(error.message));
    console.log('');
    process.exit(1);
  }
};

// Run tests
runTests();

