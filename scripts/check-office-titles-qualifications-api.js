/**
 * Diagnostic Script: Check Office Titles and Qualifications via API
 * 
 * This script uses API endpoints to check if users have officeTitle and 
 * highestQualification fields populated and provides statistics.
 * 
 * Usage:
 *   node scripts/check-office-titles-qualifications-api.js
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('../src/config/logger');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Authentication credentials
const AUTH_EMAIL = 'josaby@saby.ai';
const AUTH_PASSWORD = '@judah_saby1';

// API Configuration
// Inside Docker container, use localhost since we're in the same container
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/v1';

let authToken = null;
let tenantId = null;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make API request with authentication
 */
function apiRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(`${API_BASE_URL}${endpoint}`);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const postData = data ? JSON.stringify(data) : null;
      // Use 127.0.0.1 if hostname is localhost to avoid IPv6 issues
      const hostname = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
      
      const options = {
        hostname: hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      };

      if (authToken) {
        options.headers.Authorization = `Bearer ${authToken}`;
      }

      if (postData) {
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = httpModule.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              const error = new Error(parsed.message || `HTTP ${res.statusCode}`);
              error.statusCode = res.statusCode;
              error.response = parsed;
              reject(error);
            }
          } catch (e) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 100)}`));
            }
          }
        });
      });

      req.on('error', (error) => {
        logger.error(`API Error [${method} ${endpoint}]:`, error.message || error.toString());
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout for ${method} ${endpoint}`));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    } catch (error) {
      logger.error(`API Error [${method} ${endpoint}]:`, error.message);
      reject(error);
    }
  });
}

/**
 * Authenticate and get access token
 */
async function authenticate() {
  logger.info('🔐 Authenticating...');
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
    logger.error('❌ Authentication failed:', error.message || error.toString());
    logger.error('Error details:', error);
    throw error;
  }
}

/**
 * Get users from API and check office titles and qualifications
 */
async function checkUsersData() {
  logger.info('📊 Fetching users data...');
  try {
    // Fetch users with pagination
    let allUsers = [];
    let page = 1;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await apiRequest('GET', `/users?page=${page}&limit=${limit}`);
      const users = response.data?.results || response.results || [];
      allUsers = allUsers.concat(users);
      
      const totalPages = response.data?.totalPages || response.totalPages || 1;
      hasMore = page < totalPages;
      page++;
      
      if (users.length === 0) break;
    }

    logger.info(`✅ Fetched ${allUsers.length} users\n`);

    // Analyze office titles
    const usersWithOfficeTitle = allUsers.filter(u => 
      u.profile?.officeTitle && 
      typeof u.profile.officeTitle === 'string' && 
      u.profile.officeTitle.trim() !== ''
    );

    // Analyze qualifications
    const usersWithQualification = allUsers.filter(u => 
      u.profile?.highestQualification && 
      typeof u.profile.highestQualification === 'string' && 
      u.profile.highestQualification.trim() !== ''
    );

    // Count unique values
    const officeTitleMap = new Map();
    const qualificationMap = new Map();

    usersWithOfficeTitle.forEach(u => {
      const title = u.profile.officeTitle.trim();
      officeTitleMap.set(title, (officeTitleMap.get(title) || 0) + 1);
    });

    usersWithQualification.forEach(u => {
      const qual = u.profile.highestQualification.trim();
      qualificationMap.set(qual, (qualificationMap.get(qual) || 0) + 1);
    });

    // Print statistics
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('OFFICE TITLES STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Users with officeTitle: ${usersWithOfficeTitle.length} / ${allUsers.length} (${allUsers.length > 0 ? ((usersWithOfficeTitle.length / allUsers.length) * 100).toFixed(1) : 0}%)`);
    console.log(`Unique office titles: ${officeTitleMap.size}`);
    
    if (officeTitleMap.size > 0) {
      console.log('\nOffice Title Distribution:');
      const sortedTitles = Array.from(officeTitleMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedTitles.forEach(([title, count]) => {
        console.log(`  - ${title}: ${count} users`);
      });
    } else {
      console.log('\n⚠️  No office titles found in database!');
      console.log('   Users need to have profile.officeTitle field populated.');
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('ACADEMIC QUALIFICATIONS STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Users with highestQualification: ${usersWithQualification.length} / ${allUsers.length} (${allUsers.length > 0 ? ((usersWithQualification.length / allUsers.length) * 100).toFixed(1) : 0}%)`);
    console.log(`Unique qualifications: ${qualificationMap.size}`);
    
    if (qualificationMap.size > 0) {
      console.log('\nQualification Distribution:');
      const sortedQuals = Array.from(qualificationMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedQuals.forEach(([qual, count]) => {
        console.log(`  - ${qual}: ${count} users`);
      });
    } else {
      console.log('\n⚠️  No qualifications found in database!');
      console.log('   Users need to have profile.highestQualification field populated.');
    }

    // Sample users without data
    const usersWithoutOfficeTitle = allUsers.filter(u => 
      !u.profile?.officeTitle || 
      typeof u.profile.officeTitle !== 'string' || 
      u.profile.officeTitle.trim() === ''
    ).slice(0, 5);

    const usersWithoutQualification = allUsers.filter(u => 
      !u.profile?.highestQualification || 
      typeof u.profile.highestQualification !== 'string' || 
      u.profile.highestQualification.trim() === ''
    ).slice(0, 5);

    if (usersWithoutOfficeTitle.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('SAMPLE USERS WITHOUT OFFICE TITLE (first 5):');
      usersWithoutOfficeTitle.forEach(u => {
        console.log(`  - ${u.firstname || ''} ${u.lastname || ''} (${u.email || 'no email'})`);
        console.log(`    profile.officeTitle: ${u.profile?.officeTitle || 'undefined/null'}`);
      });
    }

    if (usersWithoutQualification.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('SAMPLE USERS WITHOUT QUALIFICATION (first 5):');
      usersWithoutQualification.forEach(u => {
        console.log(`  - ${u.firstname || ''} ${u.lastname || ''} (${u.email || 'no email'})`);
        console.log(`    profile.highestQualification: ${u.profile?.highestQualification || 'undefined/null'}`);
      });
    }

    // Check baseline data
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('BASELINE DATA CHECK');
    console.log('═══════════════════════════════════════════════════════════════');
    try {
      const baselineResponse = await apiRequest('GET', '/baseline/summary');
      const baseline = baselineResponse.data || baselineResponse;
      const baselineOfficeTitles = baseline.users?.officeTitles || baseline.officeTitles || [];
      const baselineQualifications = baseline.users?.qualifications || baseline.qualifications || [];

      console.log(`Baseline Office Titles: ${baselineOfficeTitles.length} unique titles`);
      if (baselineOfficeTitles.length > 0) {
        console.log(`  Top 3: ${baselineOfficeTitles.slice(0, 3).map(t => `${t.title} (${t.count})`).join(', ')}`);
      } else {
        console.log('  ⚠️  No office titles in baseline - recompute needed');
      }

      console.log(`Baseline Qualifications: ${baselineQualifications.length} unique qualifications`);
      if (baselineQualifications.length > 0) {
        console.log(`  Top 3: ${baselineQualifications.slice(0, 3).map(q => `${q.qualification} (${q.count})`).join(', ')}`);
      } else {
        console.log('  ⚠️  No qualifications in baseline - recompute needed');
      }
    } catch (error) {
      console.log('  ⚠️  Could not fetch baseline data:', error.message);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════════');
    
    if (usersWithOfficeTitle.length === 0) {
      console.log('❌ No office titles found. Run the update script to populate data:');
      console.log('   node scripts/update-profiles-via-api.js');
    } else if (officeTitleMap.size > 0 && usersWithOfficeTitle.length < allUsers.length * 0.5) {
      console.log('⚠️  Less than 50% of users have office titles. Consider updating more users.');
    } else {
      console.log('✅ Office titles data exists. If dashboard shows no data, recompute baseline:');
      console.log('   node scripts/recompute-baseline-via-api.js');
    }

    if (usersWithQualification.length === 0) {
      console.log('❌ No qualifications found. Run the update script to populate data:');
      console.log('   node scripts/update-profiles-via-api.js');
    } else if (qualificationMap.size > 0 && usersWithQualification.length < allUsers.length * 0.5) {
      console.log('⚠️  Less than 50% of users have qualifications. Consider updating more users.');
    } else {
      console.log('✅ Qualifications data exists. If dashboard shows no data, recompute baseline:');
      console.log('   node scripts/recompute-baseline-via-api.js');
    }

    return {
      totalUsers: allUsers.length,
      usersWithOfficeTitle: usersWithOfficeTitle.length,
      usersWithQualification: usersWithQualification.length,
      officeTitleCount: officeTitleMap.size,
      qualificationCount: qualificationMap.size,
    };
  } catch (error) {
    logger.error('❌ Error checking users data:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  logger.info('🚀 Starting Office Titles & Qualifications Diagnostic');
  logger.info('========================================================\n');

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Check users data
    const stats = await checkUsersData();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total Users: ${stats.totalUsers}`);
    console.log(`Users with Office Title: ${stats.usersWithOfficeTitle} (${stats.officeTitleCount} unique)`);
    console.log(`Users with Qualification: ${stats.usersWithQualification} (${stats.qualificationCount} unique)`);
    console.log('\n✅ Diagnostic completed!\n');

  } catch (error) {
    logger.error('\n========================================================');
    logger.error('💥 Diagnostic failed:', error.message);
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
  checkUsersData,
};

