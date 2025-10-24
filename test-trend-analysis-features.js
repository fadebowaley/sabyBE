/**
 * Trend Analysis Features Test Script
 *
 * Comprehensive test for Phase 6.4: Trend Analysis endpoints.
 * Tests all 6 trend analysis endpoints with various parameters.
 *
 * @module test-trend-analysis-features
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://127.0.0.1:4000/v1';
const TEST_EMAIL = 'saby@saby.ai';
const TEST_PASSWORD = '@saby_Saby1';

// Test results tracking
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// Utility function for API requests
const apiRequest = async (method, endpoint, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response;
  } catch (error) {
    if (error.response) {
      return error.response;
    }
    throw error;
  }
};

// Test runner
const runTest = async (testName, testFunction) => {
  testResults.total++;
  console.log(`\n🧪 Test ${testResults.total}: ${testName}`);
  
  try {
    await testFunction();
    testResults.passed++;
    testResults.tests.push({ name: testName, status: 'PASSED' });
    console.log(`✅ ${testName} - PASSED`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: testName, status: 'FAILED', error: error.message });
    console.log(`❌ ${testName} - FAILED: ${error.message}`);
  }
};

// Authentication
let authToken = null;
let tenantId = null;
let userId = null;

const authenticate = async () => {
  console.log('🔐 Authenticating...');
  
  const authResponse = await apiRequest('POST', '/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });

  if (authResponse.status === 200 && authResponse.data.user) {
    authToken = authResponse.data.tokens.access.token;
    tenantId = authResponse.data.user.tenantId;
    userId = authResponse.data.user.id;
    console.log(`✅ Authentication successful - Tenant: ${tenantId}, User: ${userId}`);
    return true;
  } else {
    throw new Error(`Authentication failed: ${authResponse.data?.message || 'Unknown error'}`);
  }
};

// Test functions
const testSubmissionsTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/submissions/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} timeline periods`);
  console.log(`   📈 Trend analysis: ${response.data.meta?.trend_analysis?.total_submissions || 0} total submissions`);
};

const testSubmissionsTimelineWithFilters = async () => {
  const response = await apiRequest('GET', '/trend-analysis/submissions/timeline?group_by=week&trend_type=compliance', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  console.log(`   📊 Weekly compliance trends: ${response.data.data.length} periods`);
};

const testComplianceTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/compliance/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} compliance periods`);
  console.log(`   📈 Avg completeness: ${response.data.meta?.compliance_analysis?.avg_completeness || 0}%`);
};

const testValidationTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/validations/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} validation periods`);
  console.log(`   📈 Avg success rate: ${response.data.meta?.validation_analysis?.avg_success_rate || 0}%`);
};

const testSeasonalPatterns = async () => {
  const response = await apiRequest('GET', '/trend-analysis/seasonal/patterns?years_back=1', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} seasonal patterns`);
  console.log(`   📈 High activity months: ${response.data.meta?.seasonal_analysis?.high_activity_months || 0}`);
  console.log(`   📈 High performance months: ${response.data.meta?.seasonal_analysis?.high_performance_months || 0}`);
};

const testGrowthMetrics = async () => {
  const response = await apiRequest('GET', '/trend-analysis/growth/metrics?period_months=6', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} growth periods`);
  console.log(`   📈 Avg submission growth: ${response.data.meta?.growth_analysis?.avg_submission_growth || 0}%`);
  console.log(`   📈 Avg node growth: ${response.data.meta?.growth_analysis?.avg_node_growth || 0}%`);
};

const testPredictiveInsights = async () => {
  const response = await apiRequest('GET', '/trend-analysis/predictive/insights?forecast_months=2', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!response.data.data || typeof response.data.data !== 'object') {
    throw new Error('Response data is not an object');
  }

  console.log(`   📊 Forecast confidence: ${response.data.data.forecast_confidence || 'unknown'}`);
  console.log(`   📈 Performance category: ${response.data.data.performance_category || 'unknown'}`);
  console.log(`   📈 Projected monthly submissions: ${response.data.data.projected_monthly_submissions || 0}`);
};

const testTrendAnalysisWithDateRange = async () => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const endDate = new Date();

  const response = await apiRequest('GET', `/trend-analysis/submissions/timeline?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}&group_by=day`, null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  console.log(`   📊 Date range analysis: ${response.data.data.length} days`);
};

const testTrendAnalysisWithProjectFilter = async () => {
  // First get a project ID from submissions
  const submissionsResponse = await apiRequest('GET', '/submission-reports', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (submissionsResponse.status === 200 && submissionsResponse.data.success && submissionsResponse.data.data.length > 0) {
    const projectId = submissionsResponse.data.data[0].project_id;
    
    const response = await apiRequest('GET', `/trend-analysis/submissions/timeline?project_id=${projectId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
    }

    if (!response.data.success) {
      throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
    }

    console.log(`   📊 Project-filtered analysis: ${response.data.data.length} periods for project ${projectId}`);
  } else {
    console.log(`   📊 No project data available for filtering test`);
  }
};

// Main test execution
const runAllTests = async () => {
  console.log('🚀 Starting Trend Analysis Features Tests...\n');

  try {
    await authenticate();
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    process.exit(1);
  }

  // Run all tests
  await runTest('Submissions Timeline Analysis', testSubmissionsTimeline);
  await runTest('Submissions Timeline with Filters', testSubmissionsTimelineWithFilters);
  await runTest('Compliance Timeline Analysis', testComplianceTimeline);
  await runTest('Validation Timeline Analysis', testValidationTimeline);
  await runTest('Seasonal Patterns Analysis', testSeasonalPatterns);
  await runTest('Growth Metrics Analysis', testGrowthMetrics);
  await runTest('Predictive Insights Analysis', testPredictiveInsights);
  await runTest('Trend Analysis with Date Range', testTrendAnalysisWithDateRange);
  await runTest('Trend Analysis with Project Filter', testTrendAnalysisWithProjectFilter);

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('📊 TREND ANALYSIS FEATURES TEST RESULTS');
  console.log('='.repeat(80));
  
  const passRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  
  console.log(`\n📈 Overall Results:`);
  console.log(`   Total Tests: ${testResults.total}`);
  console.log(`   Passed: ${testResults.passed}`);
  console.log(`   Failed: ${testResults.failed}`);
  console.log(`   Pass Rate: ${passRate}%`);
  
  console.log(`\n📋 Test Breakdown:`);
  testResults.tests.forEach((test, index) => {
    const status = test.status === 'PASSED' ? '✅' : '❌';
    console.log(`   ${status} Test ${index + 1}: ${test.name}`);
    if (test.status === 'FAILED' && test.error) {
      console.log(`      Error: ${test.error}`);
    }
  });

  if (testResults.failed === 0) {
    console.log(`\n🎉 All trend analysis endpoints are working!`);
    console.log(`\n✅ Ready for Phase 6.5: Comprehensive Testing`);
  } else {
    console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please review the errors above.`);
  }

  console.log('\n' + '='.repeat(80));
};

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Test execution failed:', error.message);
  process.exit(1);
});

 *
 * Comprehensive test for Phase 6.4: Trend Analysis endpoints.
 * Tests all 6 trend analysis endpoints with various parameters.
 *
 * @module test-trend-analysis-features
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://127.0.0.1:4000/v1';
const TEST_EMAIL = 'saby@saby.ai';
const TEST_PASSWORD = '@saby_Saby1';

// Test results tracking
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// Utility function for API requests
const apiRequest = async (method, endpoint, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response;
  } catch (error) {
    if (error.response) {
      return error.response;
    }
    throw error;
  }
};

// Test runner
const runTest = async (testName, testFunction) => {
  testResults.total++;
  console.log(`\n🧪 Test ${testResults.total}: ${testName}`);
  
  try {
    await testFunction();
    testResults.passed++;
    testResults.tests.push({ name: testName, status: 'PASSED' });
    console.log(`✅ ${testName} - PASSED`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: testName, status: 'FAILED', error: error.message });
    console.log(`❌ ${testName} - FAILED: ${error.message}`);
  }
};

// Authentication
let authToken = null;
let tenantId = null;
let userId = null;

const authenticate = async () => {
  console.log('🔐 Authenticating...');
  
  const authResponse = await apiRequest('POST', '/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });

  if (authResponse.status === 200 && authResponse.data.user) {
    authToken = authResponse.data.tokens.access.token;
    tenantId = authResponse.data.user.tenantId;
    userId = authResponse.data.user.id;
    console.log(`✅ Authentication successful - Tenant: ${tenantId}, User: ${userId}`);
    return true;
  } else {
    throw new Error(`Authentication failed: ${authResponse.data?.message || 'Unknown error'}`);
  }
};

// Test functions
const testSubmissionsTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/submissions/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} timeline periods`);
  console.log(`   📈 Trend analysis: ${response.data.meta?.trend_analysis?.total_submissions || 0} total submissions`);
};

const testSubmissionsTimelineWithFilters = async () => {
  const response = await apiRequest('GET', '/trend-analysis/submissions/timeline?group_by=week&trend_type=compliance', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  console.log(`   📊 Weekly compliance trends: ${response.data.data.length} periods`);
};

const testComplianceTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/compliance/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} compliance periods`);
  console.log(`   📈 Avg completeness: ${response.data.meta?.compliance_analysis?.avg_completeness || 0}%`);
};

const testValidationTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/validations/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} validation periods`);
  console.log(`   📈 Avg success rate: ${response.data.meta?.validation_analysis?.avg_success_rate || 0}%`);
};

const testSeasonalPatterns = async () => {
  const response = await apiRequest('GET', '/trend-analysis/seasonal/patterns?years_back=1', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} seasonal patterns`);
  console.log(`   📈 High activity months: ${response.data.meta?.seasonal_analysis?.high_activity_months || 0}`);
  console.log(`   📈 High performance months: ${response.data.meta?.seasonal_analysis?.high_performance_months || 0}`);
};

const testGrowthMetrics = async () => {
  const response = await apiRequest('GET', '/trend-analysis/growth/metrics?period_months=6', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} growth periods`);
  console.log(`   📈 Avg submission growth: ${response.data.meta?.growth_analysis?.avg_submission_growth || 0}%`);
  console.log(`   📈 Avg node growth: ${response.data.meta?.growth_analysis?.avg_node_growth || 0}%`);
};

const testPredictiveInsights = async () => {
  const response = await apiRequest('GET', '/trend-analysis/predictive/insights?forecast_months=2', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!response.data.data || typeof response.data.data !== 'object') {
    throw new Error('Response data is not an object');
  }

  console.log(`   📊 Forecast confidence: ${response.data.data.forecast_confidence || 'unknown'}`);
  console.log(`   📈 Performance category: ${response.data.data.performance_category || 'unknown'}`);
  console.log(`   📈 Projected monthly submissions: ${response.data.data.projected_monthly_submissions || 0}`);
};

const testTrendAnalysisWithDateRange = async () => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const endDate = new Date();

  const response = await apiRequest('GET', `/trend-analysis/submissions/timeline?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}&group_by=day`, null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  console.log(`   📊 Date range analysis: ${response.data.data.length} days`);
};

const testTrendAnalysisWithProjectFilter = async () => {
  // First get a project ID from submissions
  const submissionsResponse = await apiRequest('GET', '/submission-reports', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (submissionsResponse.status === 200 && submissionsResponse.data.success && submissionsResponse.data.data.length > 0) {
    const projectId = submissionsResponse.data.data[0].project_id;
    
    const response = await apiRequest('GET', `/trend-analysis/submissions/timeline?project_id=${projectId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
    }

    if (!response.data.success) {
      throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
    }

    console.log(`   📊 Project-filtered analysis: ${response.data.data.length} periods for project ${projectId}`);
  } else {
    console.log(`   📊 No project data available for filtering test`);
  }
};

// Main test execution
const runAllTests = async () => {
  console.log('🚀 Starting Trend Analysis Features Tests...\n');

  try {
    await authenticate();
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    process.exit(1);
  }

  // Run all tests
  await runTest('Submissions Timeline Analysis', testSubmissionsTimeline);
  await runTest('Submissions Timeline with Filters', testSubmissionsTimelineWithFilters);
  await runTest('Compliance Timeline Analysis', testComplianceTimeline);
  await runTest('Validation Timeline Analysis', testValidationTimeline);
  await runTest('Seasonal Patterns Analysis', testSeasonalPatterns);
  await runTest('Growth Metrics Analysis', testGrowthMetrics);
  await runTest('Predictive Insights Analysis', testPredictiveInsights);
  await runTest('Trend Analysis with Date Range', testTrendAnalysisWithDateRange);
  await runTest('Trend Analysis with Project Filter', testTrendAnalysisWithProjectFilter);

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('📊 TREND ANALYSIS FEATURES TEST RESULTS');
  console.log('='.repeat(80));
  
  const passRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  
  console.log(`\n📈 Overall Results:`);
  console.log(`   Total Tests: ${testResults.total}`);
  console.log(`   Passed: ${testResults.passed}`);
  console.log(`   Failed: ${testResults.failed}`);
  console.log(`   Pass Rate: ${passRate}%`);
  
  console.log(`\n📋 Test Breakdown:`);
  testResults.tests.forEach((test, index) => {
    const status = test.status === 'PASSED' ? '✅' : '❌';
    console.log(`   ${status} Test ${index + 1}: ${test.name}`);
    if (test.status === 'FAILED' && test.error) {
      console.log(`      Error: ${test.error}`);
    }
  });

  if (testResults.failed === 0) {
    console.log(`\n🎉 All trend analysis endpoints are working!`);
    console.log(`\n✅ Ready for Phase 6.5: Comprehensive Testing`);
  } else {
    console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please review the errors above.`);
  }

  console.log('\n' + '='.repeat(80));
};

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Test execution failed:', error.message);
  process.exit(1);
});

 *
 * Comprehensive test for Phase 6.4: Trend Analysis endpoints.
 * Tests all 6 trend analysis endpoints with various parameters.
 *
 * @module test-trend-analysis-features
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://127.0.0.1:4000/v1';
const TEST_EMAIL = 'saby@saby.ai';
const TEST_PASSWORD = '@saby_Saby1';

// Test results tracking
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// Utility function for API requests
const apiRequest = async (method, endpoint, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response;
  } catch (error) {
    if (error.response) {
      return error.response;
    }
    throw error;
  }
};

// Test runner
const runTest = async (testName, testFunction) => {
  testResults.total++;
  console.log(`\n🧪 Test ${testResults.total}: ${testName}`);
  
  try {
    await testFunction();
    testResults.passed++;
    testResults.tests.push({ name: testName, status: 'PASSED' });
    console.log(`✅ ${testName} - PASSED`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name: testName, status: 'FAILED', error: error.message });
    console.log(`❌ ${testName} - FAILED: ${error.message}`);
  }
};

// Authentication
let authToken = null;
let tenantId = null;
let userId = null;

const authenticate = async () => {
  console.log('🔐 Authenticating...');
  
  const authResponse = await apiRequest('POST', '/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });

  if (authResponse.status === 200 && authResponse.data.user) {
    authToken = authResponse.data.tokens.access.token;
    tenantId = authResponse.data.user.tenantId;
    userId = authResponse.data.user.id;
    console.log(`✅ Authentication successful - Tenant: ${tenantId}, User: ${userId}`);
    return true;
  } else {
    throw new Error(`Authentication failed: ${authResponse.data?.message || 'Unknown error'}`);
  }
};

// Test functions
const testSubmissionsTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/submissions/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} timeline periods`);
  console.log(`   📈 Trend analysis: ${response.data.meta?.trend_analysis?.total_submissions || 0} total submissions`);
};

const testSubmissionsTimelineWithFilters = async () => {
  const response = await apiRequest('GET', '/trend-analysis/submissions/timeline?group_by=week&trend_type=compliance', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  console.log(`   📊 Weekly compliance trends: ${response.data.data.length} periods`);
};

const testComplianceTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/compliance/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} compliance periods`);
  console.log(`   📈 Avg completeness: ${response.data.meta?.compliance_analysis?.avg_completeness || 0}%`);
};

const testValidationTimeline = async () => {
  const response = await apiRequest('GET', '/trend-analysis/validations/timeline', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} validation periods`);
  console.log(`   📈 Avg success rate: ${response.data.meta?.validation_analysis?.avg_success_rate || 0}%`);
};

const testSeasonalPatterns = async () => {
  const response = await apiRequest('GET', '/trend-analysis/seasonal/patterns?years_back=1', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} seasonal patterns`);
  console.log(`   📈 High activity months: ${response.data.meta?.seasonal_analysis?.high_activity_months || 0}`);
  console.log(`   📈 High performance months: ${response.data.meta?.seasonal_analysis?.high_performance_months || 0}`);
};

const testGrowthMetrics = async () => {
  const response = await apiRequest('GET', '/trend-analysis/growth/metrics?period_months=6', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!Array.isArray(response.data.data)) {
    throw new Error('Response data is not an array');
  }

  console.log(`   📊 Found ${response.data.data.length} growth periods`);
  console.log(`   📈 Avg submission growth: ${response.data.meta?.growth_analysis?.avg_submission_growth || 0}%`);
  console.log(`   📈 Avg node growth: ${response.data.meta?.growth_analysis?.avg_node_growth || 0}%`);
};

const testPredictiveInsights = async () => {
  const response = await apiRequest('GET', '/trend-analysis/predictive/insights?forecast_months=2', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  if (!response.data.data || typeof response.data.data !== 'object') {
    throw new Error('Response data is not an object');
  }

  console.log(`   📊 Forecast confidence: ${response.data.data.forecast_confidence || 'unknown'}`);
  console.log(`   📈 Performance category: ${response.data.data.performance_category || 'unknown'}`);
  console.log(`   📈 Projected monthly submissions: ${response.data.data.projected_monthly_submissions || 0}`);
};

const testTrendAnalysisWithDateRange = async () => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const endDate = new Date();

  const response = await apiRequest('GET', `/trend-analysis/submissions/timeline?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}&group_by=day`, null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
  }

  if (!response.data.success) {
    throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
  }

  console.log(`   📊 Date range analysis: ${response.data.data.length} days`);
};

const testTrendAnalysisWithProjectFilter = async () => {
  // First get a project ID from submissions
  const submissionsResponse = await apiRequest('GET', '/submission-reports', null, {
    'Authorization': `Bearer ${authToken}`
  });

  if (submissionsResponse.status === 200 && submissionsResponse.data.success && submissionsResponse.data.data.length > 0) {
    const projectId = submissionsResponse.data.data[0].project_id;
    
    const response = await apiRequest('GET', `/trend-analysis/submissions/timeline?project_id=${projectId}`, null, {
      'Authorization': `Bearer ${authToken}`
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}: ${response.data?.message || 'Unknown error'}`);
    }

    if (!response.data.success) {
      throw new Error(`API returned success: false - ${response.data.message || 'Unknown error'}`);
    }

    console.log(`   📊 Project-filtered analysis: ${response.data.data.length} periods for project ${projectId}`);
  } else {
    console.log(`   📊 No project data available for filtering test`);
  }
};

// Main test execution
const runAllTests = async () => {
  console.log('🚀 Starting Trend Analysis Features Tests...\n');

  try {
    await authenticate();
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    process.exit(1);
  }

  // Run all tests
  await runTest('Submissions Timeline Analysis', testSubmissionsTimeline);
  await runTest('Submissions Timeline with Filters', testSubmissionsTimelineWithFilters);
  await runTest('Compliance Timeline Analysis', testComplianceTimeline);
  await runTest('Validation Timeline Analysis', testValidationTimeline);
  await runTest('Seasonal Patterns Analysis', testSeasonalPatterns);
  await runTest('Growth Metrics Analysis', testGrowthMetrics);
  await runTest('Predictive Insights Analysis', testPredictiveInsights);
  await runTest('Trend Analysis with Date Range', testTrendAnalysisWithDateRange);
  await runTest('Trend Analysis with Project Filter', testTrendAnalysisWithProjectFilter);

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('📊 TREND ANALYSIS FEATURES TEST RESULTS');
  console.log('='.repeat(80));
  
  const passRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  
  console.log(`\n📈 Overall Results:`);
  console.log(`   Total Tests: ${testResults.total}`);
  console.log(`   Passed: ${testResults.passed}`);
  console.log(`   Failed: ${testResults.failed}`);
  console.log(`   Pass Rate: ${passRate}%`);
  
  console.log(`\n📋 Test Breakdown:`);
  testResults.tests.forEach((test, index) => {
    const status = test.status === 'PASSED' ? '✅' : '❌';
    console.log(`   ${status} Test ${index + 1}: ${test.name}`);
    if (test.status === 'FAILED' && test.error) {
      console.log(`      Error: ${test.error}`);
    }
  });

  if (testResults.failed === 0) {
    console.log(`\n🎉 All trend analysis endpoints are working!`);
    console.log(`\n✅ Ready for Phase 6.5: Comprehensive Testing`);
  } else {
    console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please review the errors above.`);
  }

  console.log('\n' + '='.repeat(80));
};

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Test execution failed:', error.message);
  process.exit(1);
});
