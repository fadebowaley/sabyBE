/**
 * Script to Update User and Node Profiles via API
 *
 * This script uses API endpoints to update user and node profiles with data.
 * All fields that can be updated are listed below for your guidance.
 *
 * Usage:
 *   node scripts/update-profiles-via-api.js
 *
 * Configuration:
 *   - Set AUTH_EMAIL and AUTH_PASSWORD for authentication
 *   - Configure API_BASE_URL (defaults to http://localhost:3000/v1)
 *   - Customize field values in the configuration section below
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
// FIELD DEFINITIONS - ALL FIELDS THAT CAN BE UPDATED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * USER FIELDS - All fields that can be updated via PATCH /v1/users/:userId
 *
 * Direct User Fields:
 *   - email: string (email format)
 *   - password: string (min 8 chars, must contain uppercase, lowercase, number, special char)
 *   - firstname: string
 *   - lastname: string
 *   - phoneNumber: string (pattern: /^[+]?[1-9][\d]{0,15}$/)
 *   - isSuper: boolean
 *   - isOwner: boolean
 *   - isSaby: boolean
 *   - isActive: boolean
 *   - isEmailVerified: boolean
 *   - roles: array of role IDs (ObjectId strings)
 *
 * Profile Fields (nested under 'profile' object):
 *   - title: string (e.g., "Mr.", "Mrs.", "Dr.", "Pastor", "Rev.")
 *   - otherName: string
 *   - gender: "Male" | "Female" | "Other"
 *   - dateOfBirth: Date (ISO string or Date object)
 *   - highestQualification: string (e.g., "Bachelors", "Masters", "PhD", "Diploma")
 *   - professional: string (professional category)
 *   - employmentCategory: string (e.g., "Full-time", "Part-time", "Self-employed", "Unemployed")
 *   - occupation: string (job title/occupation)
 *   - employeeId: string
 *   - officeTitle: string (e.g., "Pastor", "HOD", "Bishop", "Deacon")
 *   - maritalStatus: "Single" | "Married" | "Divorced" | "Widowed"
 *   - spouse: {
 *       name: string
 *       phoneNumber: string
 *       dateOfBirth: Date
 *     }
 *   - nextOfKin: {
 *       name: string
 *       phoneNumber: string
 *       relationship: string
 *     }
 *   - stateOfOrigin: string
 *   - lgaOfOrigin: string (Local Government Area)
 *   - homeTown: string
 *   - residentialAddress: string
 *   - stateOfResidence: string
 *   - lgaOfResidence: string
 *
 * Custom Fields (nested under 'customFields' object):
 *   - Any custom fields defined by tenant (key-value pairs)
 *   - Examples: yearsOfExperience, monthlyIncome, educationLevel, department, skills, etc.
 */

/**
 * NODE FIELDS - All fields that can be updated via PATCH /v1/nodes/:nodeId
 *
 * Direct Node Fields:
 *   - level: string (ObjectId of Level)
 *   - parent: string (ObjectId of parent node) | null
 *   - structure: string (ObjectId of Structure)
 *   - isMain: boolean
 *   - isOwner: boolean
 *   - name: string
 *   - address: string
 *   - city: string
 *   - state: string
 *   - country: string
 *   - postalCode: string
 *   - users: array of user IDs (ObjectId strings)
 *   - isActive: boolean
 *
 * Profile Fields (nested under 'profile' object):
 *   - dateOfEstablishment: Date (ISO string or Date object)
 *   - propertyStatus: "Owned" | "Rented" | "Leased" | "Other"
 *   - estimatedValue: number (property value in Naira)
 *   - buildingType: string (e.g., "Auditorium", "Hall", "Tent", "Office", "Multi-purpose")
 *   - facilityStatus: "Active" | "Inactive" | "Under Construction"
 *   - averageAttendance: number (min: 0)
 *   - averageIncome: number (min: 0, in Naira)
 *
 * Custom Fields (nested under 'customFields' object):
 *   - Any custom fields defined by tenant (key-value pairs)
 *   - Examples: seatingCapacity, parkingSpaces, numberOfFloors, wifiAvailable, etc.
 */

// ═══════════════════════════════════════════════════════════════════════════
// DATA GENERATION CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Options for random data generation
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'];
const TITLE_OPTIONS = [
  'Mr.',
  'Mrs.',
  'Miss',
  'Dr.',
  'Prof.',
  'Engr.',
  'Pastor',
  'Rev.',
];
const STATE_OPTIONS = [
  'Lagos',
  'Abuja',
  'Kano',
  'Rivers',
  'Ogun',
  'Kaduna',
  'Enugu',
  'Delta',
  'Port Harcourt',
  'Ibadan',
];
const OCCUPATION_OPTIONS = [
  'Teacher',
  'Engineer',
  'Doctor',
  'Lawyer',
  'Business Owner',
  'Accountant',
  'Nurse',
  'Farmer',
  'Pastor',
  'Minister',
];
const EMPLOYMENT_CATEGORY_OPTIONS = [
  'Full-time',
  'Part-time',
  'Self-employed',
  'Unemployed',
];
const QUALIFICATION_OPTIONS = [
  'Primary',
  'Secondary',
  'Diploma',
  'Bachelors',
  'Masters',
  'PhD',
  'Post-graduate',
];
const OFFICE_TITLE_OPTIONS = [
  'Pastor',
  'HOD',
  'Bishop',
  'Deacon',
  'Elder',
  'Minister',
  'Reverend',
  'Prophet',
];
const PROPERTY_STATUS_OPTIONS = ['Owned', 'Rented', 'Leased', 'Other'];
const BUILDING_TYPE_OPTIONS = [
  'Auditorium',
  'Hall',
  'Tent',
  'Office',
  'Multi-purpose',
  'Church',
  'Mosque',
  'School',
  'Community Center',
];
const FACILITY_STATUS_OPTIONS = ['Active', 'Inactive', 'Under Construction'];
const HOMETOWN_OPTIONS = [
  'Ikeja',
  'Victoria Island',
  'Maitama',
  'Garki',
  'Kano City',
  'Port Harcourt',
  'Abeokuta',
  'Kaduna City',
  'Enugu City',
  'Asaba',
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

let authToken = null;
let tenantId = null;
let userId = null;

/**
 * Make API request with authentication
 */
async function apiRequest(method, endpoint, data = null, params = null) {
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

    if (params) {
      config.params = params;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      const errorDetails = {
        status: error.response.status,
        message: error.response.data?.message || error.message,
        data: error.response.data,
      };
      // Log full error details for debugging
      if (error.response.status >= 400) {
        logger.error(
          `API Error [${method} ${endpoint}]: ${error.response.status} - ${
            error.response.data?.message || error.message
          }`
        );
        if (error.response.data) {
          logger.error(
            `   Response: ${JSON.stringify(error.response.data, null, 2)}`
          );
        }
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
    userId = response.user.id;

    logger.info('✅ Authenticated successfully');
    logger.info(`   User: ${response.user.email}`);
    logger.info(`   Tenant ID: ${tenantId}`);
    logger.info(`   User ID: ${userId}\n`);

    return { token: authToken, tenantId, userId };
  } catch (error) {
    logger.error('❌ Authentication failed:', error.message);
    throw error;
  }
}

/**
 * Generate random date of birth (ages 18-70)
 */
function generateDateOfBirth() {
  const age = 18 + Math.floor(Math.random() * 52); // Ages 18-70
  const year = new Date().getFullYear() - age;
  const month = Math.floor(Math.random() * 12);
  const day = Math.floor(Math.random() * 28) + 1;
  return new Date(year, month, day).toISOString();
}

/**
 * Generate random phone number
 */
function generatePhoneNumber() {
  return `+234${Math.floor(Math.random() * 9000000000) + 1000000000}`;
}

/**
 * Get random item from array
 */
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate user update payload
 */
function generateUserUpdatePayload(user, index) {
  const gender = randomItem(GENDER_OPTIONS);
  const maritalStatus = randomItem(MARITAL_STATUS_OPTIONS);
  const state = randomItem(STATE_OPTIONS);
  const occupation = randomItem(OCCUPATION_OPTIONS);
  const employmentCategory = randomItem(EMPLOYMENT_CATEGORY_OPTIONS);
  const qualification = randomItem(QUALIFICATION_OPTIONS);
  const officeTitle = randomItem(OFFICE_TITLE_OPTIONS);
  const title = randomItem(TITLE_OPTIONS);
  const homeTown = randomItem(HOMETOWN_OPTIONS);

  const payload = {
    // Profile fields
    profile: {
      title: title,
      otherName:
        index % 3 === 0
          ? `${user.firstname?.charAt(0) || 'A'}.`
          : index % 3 === 1
          ? 'A.'
          : '',
      gender: gender,
      dateOfBirth: generateDateOfBirth(),
      maritalStatus: maritalStatus,
      stateOfOrigin: state,
      lgaOfOrigin: `${state} LGA`,
      homeTown: homeTown,
      stateOfResidence: state,
      lgaOfResidence: `${state} LGA`,
      occupation: occupation,
      employmentCategory: employmentCategory,
      highestQualification: qualification,
      professional: occupation,
      employeeId: `EMP${String(index + 1).padStart(5, '0')}`,
      officeTitle: officeTitle,
      residentialAddress: `${Math.floor(Math.random() * 100)} Street, ${state}`,
    },
    // Verification status (only isEmailVerified is allowed in validation)
    isEmailVerified: Math.random() > 0.2, // 80% verified
    // Phone number if missing
    ...(user.phoneNumber ? {} : { phoneNumber: generatePhoneNumber() }),
  };

  // Add spouse info for married users
  if (maritalStatus === 'Married') {
    payload.profile.spouse = {
      name: `Spouse ${user.firstname || 'Name'}`,
      phoneNumber: generatePhoneNumber(),
      dateOfBirth: generateDateOfBirth(),
    };
  }

  // Add next of kin
  const relationships = ['Parent', 'Sibling', 'Spouse', 'Other'];
  payload.profile.nextOfKin = {
    name: `Next of Kin ${user.firstname || 'Name'}`,
    phoneNumber: generatePhoneNumber(),
    relationship: relationships[index % relationships.length],
  };

  // Add custom fields
  payload.customFields = {
    yearsOfExperience: Math.floor(Math.random() * 20),
    monthlyIncome: Math.floor(Math.random() * 500000) + 50000,
    educationLevel: qualification,
    department: `Department ${(index % 5) + 1}`,
    skills: ['Communication', 'Leadership', 'Technical'],
  };

  return payload;
}

/**
 * Generate node update payload
 */
function generateNodeUpdatePayload(node, index) {
  const propertyStatus = randomItem(PROPERTY_STATUS_OPTIONS);
  const buildingType = randomItem(BUILDING_TYPE_OPTIONS);
  const facilityStatus = randomItem(FACILITY_STATUS_OPTIONS);
  const state = randomItem(STATE_OPTIONS);
  const estimatedValue = Math.floor(Math.random() * 50000000) + 1000000; // 1M - 50M

  const payload = {
    // Location fields
    address: node.address || `${Math.floor(Math.random() * 100)} Main Street`,
    city: node.city || state,
    state: node.state || state,
    country: node.country || 'Nigeria',
    postalCode:
      node.postalCode || `${Math.floor(Math.random() * 900000) + 100000}`,
    // Date of establishment
    dateOfEstablishment:
      node.dateOfEstablishment ||
      (() => {
        const yearsAgo = Math.floor(Math.random() * 20) + 1; // 1-20 years ago
        return new Date(
          new Date().setFullYear(new Date().getFullYear() - yearsAgo)
        ).toISOString();
      })(),
    // Active status
    isActive: Math.random() > 0.1, // 90% active
    // Profile fields
    profile: {
      propertyStatus: propertyStatus,
      estimatedValue: estimatedValue,
      buildingType: buildingType,
      facilityStatus: facilityStatus,
      averageAttendance: Math.floor(Math.random() * 5000) + 100, // 100-5100
      averageIncome: Math.floor(Math.random() * 2000000) + 100000, // 100K-2.1M
    },
    // Custom fields
    customFields: {
      seatingCapacity: Math.floor(Math.random() * 5000) + 100,
      parkingSpaces: Math.floor(Math.random() * 200),
      numberOfFloors: Math.floor(Math.random() * 5) + 1,
      wifiAvailable: Math.random() > 0.3,
      airConditioning: Math.random() > 0.2,
      generatorAvailable: Math.random() > 0.4,
    },
  };

  return payload;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all users for the tenant
 */
async function getUsers() {
  logger.info('📋 Fetching users...');
  try {
    const response = await apiRequest('GET', '/users', null, {
      limit: 1000, // Adjust as needed
      page: 1,
    });
    return response.results || [];
  } catch (error) {
    logger.error('❌ Error fetching users:', error.message);
    throw error;
  }
}

/**
 * Get all nodes for the tenant
 */
async function getNodes() {
  logger.info('📋 Fetching nodes...');
  try {
    const response = await apiRequest('GET', '/node', null, {
      limit: 1000, // Adjust as needed
      page: 1,
      status: 'all',
    });
    return response.results || [];
  } catch (error) {
    logger.error('❌ Error fetching nodes:', error.message);
    throw error;
  }
}

/**
 * Update user profile via API
 */
async function updateUserProfile(user) {
  try {
    const payload = generateUserUpdatePayload(user, user.index || 0);
    const response = await apiRequest('PATCH', `/users/${user.id}`, payload);
    return response;
  } catch (error) {
    logger.error(`   ❌ Error updating user ${user.id}:`, error.message);
    throw error;
  }
}

/**
 * Update node profile via API
 */
async function updateNodeProfile(node) {
  try {
    const payload = generateNodeUpdatePayload(node, node.index || 0);
    const response = await apiRequest('PATCH', `/node/${node.nodeId}`, payload);
    return response;
  } catch (error) {
    logger.error(`   ❌ Error updating node ${node.nodeId}:`, error.message);
    throw error;
  }
}

/**
 * Update all user profiles
 */
async function updateAllUsers() {
  logger.info(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  logger.info(
    '║  STEP 2: Updating User Profiles                                ║'
  );
  logger.info(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    const users = await getUsers();

    if (users.length === 0) {
      logger.warn('⚠️  No users found for this tenant');
      return { updated: 0, total: 0, failed: 0 };
    }

    logger.info(`Found ${users.length} users to update\n`);

    let updatedCount = 0;
    let failedCount = 0;

    // Process users in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map((user, batchIndex) => {
          user.index = i + batchIndex;
          return updateUserProfile(user);
        })
      );

      results.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          updatedCount++;
          if ((updatedCount + failedCount) % 10 === 0) {
            logger.info(
              `   ✅ Updated ${updatedCount + failedCount}/${
                users.length
              } users...`
            );
          }
        } else {
          failedCount++;
          logger.error(
            `   ❌ Failed to update user ${batch[batchIndex].id}:`,
            result.reason?.message
          );
        }
      });

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info(`\n✅ Updated ${updatedCount}/${users.length} user profiles`);
    if (failedCount > 0) {
      logger.warn(`⚠️  Failed to update ${failedCount} users`);
    }

    return { updated: updatedCount, total: users.length, failed: failedCount };
  } catch (error) {
    logger.error('❌ Error updating user profiles:', error);
    throw error;
  }
}

/**
 * Update all node profiles
 */
async function updateAllNodes() {
  logger.info(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  logger.info(
    '║  STEP 3: Updating Node Profiles                               ║'
  );
  logger.info(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    const nodes = await getNodes();

    if (nodes.length === 0) {
      logger.warn('⚠️  No nodes found for this tenant');
      return { updated: 0, total: 0, failed: 0 };
    }

    logger.info(`Found ${nodes.length} nodes to update\n`);

    let updatedCount = 0;
    let failedCount = 0;

    // Process nodes in batches
    const batchSize = 10;
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map((node, batchIndex) => {
          node.index = i + batchIndex;
          return updateNodeProfile(node);
        })
      );

      results.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          updatedCount++;
          if ((updatedCount + failedCount) % 5 === 0) {
            logger.info(
              `   ✅ Updated ${updatedCount + failedCount}/${
                nodes.length
              } nodes...`
            );
          }
        } else {
          failedCount++;
          logger.error(
            `   ❌ Failed to update node ${batch[batchIndex].nodeId}:`,
            result.reason?.message
          );
        }
      });

      // Small delay between batches
      if (i + batchSize < nodes.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info(`\n✅ Updated ${updatedCount}/${nodes.length} node profiles`);
    if (failedCount > 0) {
      logger.warn(`⚠️  Failed to update ${failedCount} nodes`);
    }

    return { updated: updatedCount, total: nodes.length, failed: failedCount };
  } catch (error) {
    logger.error('❌ Error updating node profiles:', error);
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
  logger.info('🚀 Starting Profile Update via API');
  logger.info('========================================================\n');

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Update users
    const userResult = await updateAllUsers();

    // Step 3: Update nodes
    const nodeResult = await updateAllNodes();

    // Summary
    logger.info(
      '\n╔════════════════════════════════════════════════════════════════╗'
    );
    logger.info(
      '║  SUMMARY                                                       ║'
    );
    logger.info(
      '╚════════════════════════════════════════════════════════════════╝\n'
    );
    logger.info(`✅ Users: ${userResult.updated}/${userResult.total} updated`);
    if (userResult.failed > 0) {
      logger.info(`   ⚠️  ${userResult.failed} users failed`);
    }
    logger.info(`✅ Nodes: ${nodeResult.updated}/${nodeResult.total} updated`);
    if (nodeResult.failed > 0) {
      logger.info(`   ⚠️  ${nodeResult.failed} nodes failed`);
    }
    logger.info('\n🎉 Profile update completed!\n');
  } catch (error) {
    logger.error('\n========================================================');
    logger.error('💥 Update failed:', error.message);
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
  updateAllUsers,
  updateAllNodes,
  generateUserUpdatePayload,
  generateNodeUpdatePayload,
};
