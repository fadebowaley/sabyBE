/**
 * Script to Update User and Node Profiles and Test Baseline Intelligence
 * 
 * This script:
 * 1. Finds tenant ID from user email
 * 2. Updates existing users with profile data (non-essential fields only)
 * 3. Updates existing nodes with profile data (non-essential fields only)
 * 4. Tests baseline intelligence computation
 * 
 * Usage: node scripts/update-profiles-and-test-baseline.js
 * 
 * Note: Uses hardcoded credentials to find tenant ID
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const logger = require('../src/config/logger');
const { connectRedis } = require('../src/config/redis');

// Note: mongoose is already imported at top level

// Import services and models
const { 
  baselineIntelligenceService, 
  baselineInsightsService 
} = require('../src/services');
const { User, Nodes, BaselineIntelligence, Level, Structures } = require('../src/models');

// Credentials to find tenant ID (optional - can also set TENANT_ID directly)
const USER_EMAIL = 'josaby@saby.ai';
const USER_PASSWORD = '@judah_saby1';

// Use this tenant ID directly if you know it, otherwise it will be looked up from email
const TENANT_ID_OVERRIDE = '0gmUVnDgpY'; // Set to null to use email lookup

let TENANT_ID = null;

// Dummy data generators
const genders = ['Male', 'Female', 'Other'];
const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
const states = ['Lagos', 'Abuja', 'Kano', 'Rivers', 'Ogun', 'Kaduna', 'Enugu', 'Delta'];
const titles = ['Mr.', 'Mrs.', 'Miss', 'Dr.', 'Prof.', 'Engr.', 'Pastor', 'Rev.'];
const occupations = ['Teacher', 'Engineer', 'Doctor', 'Lawyer', 'Business Owner', 'Accountant', 'Nurse', 'Farmer'];
const employmentCategories = ['Full-time', 'Part-time', 'Self-employed', 'Unemployed'];
const officeTitles = ['Pastor', 'HOD', 'Bishop', 'Deacon', 'Elder', 'Minister', 'Reverend', 'Prophet'];
const propertyStatuses = ['Owned', 'Rented', 'Leased', 'Other'];
const buildingTypes = ['Auditorium', 'Hall', 'Tent', 'Office', 'Multi-purpose', 'Church', 'Mosque', 'School', 'Community Center'];
const facilityStatuses = ['Active', 'Inactive', 'Under Construction'];
const hometowns = ['Ikeja', 'Victoria Island', 'Maitama', 'Garki', 'Kano City', 'Port Harcourt', 'Abeokuta', 'Kaduna City', 'Enugu City', 'Asaba'];

/**
 * Connect to database and Redis
 * Handles Docker connection strings when running from host machine
 */
async function connectServices() {
  try {
    // For Docker MongoDB, use localhost when running script from host machine
    // The env.docker uses 'mongodb' as hostname (Docker service name)
    // But when running from host, we need 'localhost'
    // Also need to use the same auth credentials as Docker backend
    let mongoUrl = config.mongoose.url;
    const originalUrl = mongoUrl;
    
    // Check if we're running inside Docker (mongodb hostname will resolve)
    // or on host machine (need to use localhost)
    const isDocker = process.env.MONGODB_URL && process.env.MONGODB_URL.includes('@mongodb:');
    const isHost = !isDocker && (mongoUrl && mongoUrl.includes('@mongodb:'));
    
    if (isHost) {
      // Running from host machine - replace mongodb with localhost
      mongoUrl = mongoUrl.replace('@mongodb:', '@localhost:');
      logger.info('🔄 Adjusted MongoDB URL for host machine access');
      logger.info(`   Original: ${originalUrl.split('@')[0]}@***`);
      logger.info(`   Adjusted: ${mongoUrl.split('@')[0]}@***`);
    } else if (mongoUrl && mongoUrl.includes('mongodb://mongodb:')) {
      // Simple connection string format
      mongoUrl = mongoUrl.replace('mongodb://mongodb:', 'mongodb://localhost:');
      logger.info('🔄 Adjusted MongoDB URL for host machine access');
    } else if (isDocker) {
      // Running inside Docker - use the connection string as-is
      mongoUrl = process.env.MONGODB_URL;
      logger.info('🔄 Using Docker MongoDB connection string (inside container)');
    }
    
    // Connect to MongoDB
    logger.info(`🔌 Connecting to MongoDB...`);
    logger.info(`   Database: ${mongoUrl.split('/').pop().split('?')[0]}`);
    await mongoose.connect(mongoUrl, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Connect to Redis - also check if we need to use localhost
    const redisConfig = config.redis;
    if (redisConfig && redisConfig.host === 'redis') {
      // If Redis host is 'redis' (Docker service name), use localhost when running from host
      logger.info('🔄 Using localhost for Redis connection (running from host)');
      // Temporarily override Redis host for this script
      process.env.REDIS_HOST = 'localhost';
    }
    connectRedis();
    logger.info('✅ Connected to Redis');

    return true;
  } catch (error) {
    logger.error('❌ Failed to connect to services:', error);
    logger.error('   MongoDB URL (masked):', config.mongoose.url ? config.mongoose.url.replace(/:[^:@]+@/, ':****@') : 'not set');
    throw error;
  }
}

/**
 * Get tenant ID from user email
 */
async function getTenantIdFromUser() {
  try {
    logger.info(`🔍 Finding tenant ID from user email: ${USER_EMAIL}`);
    
    const user = await User.findOne({ email: USER_EMAIL.toLowerCase().trim() });
    
    if (!user) {
      throw new Error(`User not found with email: ${USER_EMAIL}`);
    }

    // Verify password
    const isPasswordMatch = await user.isPasswordMatch(USER_PASSWORD);
    if (!isPasswordMatch) {
      throw new Error('Invalid password for user');
    }

    if (!user.tenantId) {
      throw new Error(`User ${USER_EMAIL} does not have a tenantId`);
    }

    logger.info(`✅ Found user: ${user.email} (tenantId: ${user.tenantId})`);
    return user.tenantId;
  } catch (error) {
    logger.error('❌ Error finding tenant ID:', error);
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
  return new Date(year, month, day);
}

/**
 * Update user data and profiles with dummy data (non-essential fields only)
 */
async function updateUserProfiles() {
  logger.info('👥 Updating user data and profiles...');

  try {
    // Find all users for the tenant
    // Note: Only exclude admin user if we're using email lookup
    // Pass isSaby: true in options to bypass TenantPlugin filtering
    const userQuery = { tenantId: TENANT_ID };
    if (TENANT_ID_OVERRIDE && USER_EMAIL) {
      // If using override, still exclude the admin user if email matches
      userQuery.email = { $ne: USER_EMAIL };
    }
    
    // Use lean() and set options to bypass TenantPlugin
    const users = await User.find(userQuery).setOptions({ user: { isSaby: true } });
    
    if (users.length === 0) {
      logger.warn(`⚠️  No users found for tenant ${TENANT_ID}`);
      return { updated: 0, total: 0 };
    }

    logger.info(`Found ${users.length} users to update`);

    let updatedCount = 0;
    const updates = users.map(async (user, index) => {
      try {
        // Generate random profile data
        const gender = genders[Math.floor(Math.random() * genders.length)];
        const dateOfBirth = generateDateOfBirth();
        const maritalStatus = maritalStatuses[Math.floor(Math.random() * maritalStatuses.length)];
        const state = states[Math.floor(Math.random() * states.length)];
        const occupation = occupations[Math.floor(Math.random() * occupations.length)];
        const employmentCategory = employmentCategories[Math.floor(Math.random() * employmentCategories.length)];

        // ========== UPDATE USER DATA (Non-essential fields) ==========
        // Update phone number if missing
        if (!user.phoneNumber) {
          user.phoneNumber = `+234${Math.floor(Math.random() * 9000000000) + 1000000000}`;
        }

        // Update verification status (non-essential)
        user.isEmailVerified = Math.random() > 0.2; // 80% verified
        user.isPhoneVerified = Math.random() > 0.3; // 70% verified

        // Update status (non-essential, but keep existing if set)
        if (user.status === undefined || user.status === null) {
          user.status = Math.random() > 0.1; // 90% active
        }

        // ========== UPDATE USER PROFILE DATA ==========
        // Update or merge profile data (preserve existing values)
        const title = titles[Math.floor(Math.random() * titles.length)];
        const otherName = index % 3 === 0 ? `${user.firstname.charAt(0)}.` : index % 3 === 1 ? 'A.' : '';
        const employeeId = `EMP${String(index + 1).padStart(5, '0')}`;
        const lgaOfOrigin = `${state} LGA`;
        const homeTown = hometowns[Math.floor(Math.random() * hometowns.length)];
        
        user.profile = {
          ...user.profile, // Preserve existing profile data
          title: user.profile?.title || title,
          otherName: user.profile?.otherName || otherName,
          gender: user.profile?.gender || gender,
          dateOfBirth: user.profile?.dateOfBirth || dateOfBirth,
          maritalStatus: user.profile?.maritalStatus || maritalStatus,
          stateOfOrigin: user.profile?.stateOfOrigin || state,
          lgaOfOrigin: user.profile?.lgaOfOrigin || lgaOfOrigin,
          homeTown: user.profile?.homeTown || homeTown,
          stateOfResidence: user.profile?.stateOfResidence || state,
          lgaOfResidence: user.profile?.lgaOfResidence || `${state} LGA`,
          occupation: user.profile?.occupation || occupation,
          employmentCategory: user.profile?.employmentCategory || employmentCategory,
          highestQualification: user.profile?.highestQualification || (index % 3 === 0 ? 'Bachelors' : index % 3 === 1 ? 'Masters' : 'Diploma'),
          professional: user.profile?.professional || occupation,
          employeeId: user.profile?.employeeId || employeeId,
          officeTitle: user.profile?.officeTitle || officeTitles[Math.floor(Math.random() * officeTitles.length)],
          // Add spouse info for married users (if not exists)
          ...(maritalStatus === 'Married' && !user.profile?.spouse?.name && {
            spouse: {
              name: `Spouse ${user.firstname}`,
              phoneNumber: `+234${Math.floor(Math.random() * 9000000000) + 1000000000}`,
              dateOfBirth: generateDateOfBirth(),
            },
          }),
          // Add next of kin (if not exists)
          ...(!user.profile?.nextOfKin?.name && {
            nextOfKin: {
              name: `Next of Kin ${user.firstname}`,
              phoneNumber: `+234${Math.floor(Math.random() * 9000000000) + 1000000000}`,
              relationship: index % 4 === 0 ? 'Parent' : index % 4 === 1 ? 'Sibling' : index % 4 === 2 ? 'Spouse' : 'Other',
            },
          }),
          residentialAddress: user.profile?.residentialAddress || `${Math.floor(Math.random() * 100)} Street, ${state}`,
        };

        // ========== UPDATE CUSTOM FIELDS ==========
        // Merge custom fields (preserve existing)
        user.customFields = {
          ...user.customFields,
          yearsOfExperience: user.customFields?.yearsOfExperience || Math.floor(Math.random() * 20),
          monthlyIncome: user.customFields?.monthlyIncome || Math.floor(Math.random() * 500000) + 50000,
          educationLevel: user.customFields?.educationLevel || (index % 4 === 0 ? 'Primary' : index % 4 === 1 ? 'Secondary' : index % 4 === 2 ? 'Tertiary' : 'Post-graduate'),
          department: user.customFields?.department || `Department ${(index % 5) + 1}`,
          skills: user.customFields?.skills || ['Communication', 'Leadership', 'Technical'],
        };

        // ========== UPDATE COMPLIANCE TRACKING ==========
        // Mark profile as updated (randomly, but preserve if already set)
        if (user.profileUpdateCompliant === undefined || user.profileUpdateCompliant === null) {
          user.profileUpdateCompliant = index % 3 === 0; // 33% compliant
          if (user.profileUpdateCompliant) {
            user.profileUpdateCompliantAt = new Date();
          }
        }

        await user.save();
        updatedCount++;
        
        if ((index + 1) % 10 === 0) {
          logger.info(`   Updated ${index + 1}/${users.length} users...`);
        }
      } catch (error) {
        logger.error(`   Error updating user ${user._id}:`, error.message);
      }
    });

    await Promise.all(updates);

    logger.info(`✅ Updated ${updatedCount}/${users.length} user profiles`);
    return { updated: updatedCount, total: users.length };
  } catch (error) {
    logger.error('❌ Error updating user profiles:', error);
    throw error;
  }
}

/**
 * Update node data and profiles with dummy data (non-essential fields only)
 */
async function updateNodeProfiles() {
  logger.info('🏢 Updating node data and profiles...');

  try {
    // Find all nodes for the tenant
    // Pass isSaby: true in options to bypass TenantPlugin filtering
    const nodes = await Nodes.find({ 
      tenantId: TENANT_ID,
      deletedAt: null 
    }).setOptions({ user: { isSaby: true } });
    
    if (nodes.length === 0) {
      logger.warn(`⚠️  No nodes found for tenant ${TENANT_ID}`);
      return { updated: 0, total: 0 };
    }

    logger.info(`Found ${nodes.length} nodes to update`);

    let updatedCount = 0;
    const updates = nodes.map(async (node, index) => {
      try {
        // Generate random profile data
        const propertyStatus = propertyStatuses[Math.floor(Math.random() * propertyStatuses.length)];
        const buildingType = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
        const facilityStatus = facilityStatuses[Math.floor(Math.random() * facilityStatuses.length)];
        const estimatedValue = Math.floor(Math.random() * 50000000) + 1000000; // 1M - 50M

        // ========== UPDATE NODE DATA (Non-essential fields) ==========
        // Update location data (non-essential, preserve existing if set)
        if (!node.address) {
          node.address = `${Math.floor(Math.random() * 100)} Main Street`;
        }
        if (!node.city) {
          node.city = states[Math.floor(Math.random() * states.length)];
        }
        if (!node.state) {
          node.state = states[Math.floor(Math.random() * states.length)];
        }
        if (!node.country) {
          node.country = 'Nigeria';
        }
        if (!node.postalCode) {
          node.postalCode = `${Math.floor(Math.random() * 900000) + 100000}`;
        }

        // Update date of establishment if missing (non-essential)
        if (!node.dateOfEstablishment) {
          const yearsAgo = Math.floor(Math.random() * 20) + 1; // 1-20 years ago
          node.dateOfEstablishment = new Date(new Date().setFullYear(new Date().getFullYear() - yearsAgo));
        }

        // Update isActive (non-essential, preserve existing if set)
        if (node.isActive === undefined || node.isActive === null) {
          node.isActive = Math.random() > 0.1; // 90% active
        }

        // ========== UPDATE NODE PROFILE DATA ==========
        // Update or merge profile data (preserve existing values)
        // Note: estimatedValue is Decimal128 type, need to convert
        node.profile = {
          ...node.profile, // Preserve existing profile data
          propertyStatus: node.profile?.propertyStatus || propertyStatus,
          estimatedValue: node.profile?.estimatedValue || mongoose.Types.Decimal128.fromString(estimatedValue.toString()),
          buildingType: node.profile?.buildingType || buildingType,
          facilityStatus: node.profile?.facilityStatus || facilityStatus,
        };

        // ========== UPDATE CUSTOM FIELDS ==========
        // Merge custom fields (preserve existing)
        node.customFields = {
          ...node.customFields,
          seatingCapacity: node.customFields?.seatingCapacity || Math.floor(Math.random() * 5000) + 100,
          parkingSpaces: node.customFields?.parkingSpaces || Math.floor(Math.random() * 200),
          numberOfFloors: node.customFields?.numberOfFloors || Math.floor(Math.random() * 5) + 1,
          wifiAvailable: node.customFields?.wifiAvailable !== undefined ? node.customFields.wifiAvailable : Math.random() > 0.3,
          airConditioning: node.customFields?.airConditioning !== undefined ? node.customFields.airConditioning : Math.random() > 0.2,
          generatorAvailable: node.customFields?.generatorAvailable !== undefined ? node.customFields.generatorAvailable : Math.random() > 0.4,
        };

        // ========== UPDATE COMPLIANCE TRACKING ==========
        // Mark profile as updated (randomly, but preserve if already set)
        if (node.profileUpdateCompliant === undefined || node.profileUpdateCompliant === null) {
          node.profileUpdateCompliant = index % 2 === 0; // 50% compliant
          if (node.profileUpdateCompliant) {
            node.profileUpdateCompliantAt = new Date();
          }
        }

        await node.save();
        updatedCount++;
        
        if ((index + 1) % 5 === 0) {
          logger.info(`   Updated ${index + 1}/${nodes.length} nodes...`);
        }
      } catch (error) {
        logger.error(`   Error updating node ${node._id}:`, error.message);
      }
    });

    await Promise.all(updates);

    logger.info(`✅ Updated ${updatedCount}/${nodes.length} node profiles`);
    return { updated: updatedCount, total: nodes.length };
  } catch (error) {
    logger.error('❌ Error updating node profiles:', error);
    throw error;
  }
}

/**
 * Test baseline computation for all nodes
 */
async function testNodeBaselineComputation() {
  logger.info('🧮 Testing node baseline computation...');

  try {
    // Pass isSaby: true in options to bypass TenantPlugin filtering
    const nodes = await Nodes.find({ 
      tenantId: TENANT_ID,
      deletedAt: null 
    }).setOptions({ user: { isSaby: true } }).limit(5); // Test first 5 nodes

    if (nodes.length === 0) {
      logger.warn(`⚠️  No nodes found for baseline computation`);
      return [];
    }

    const results = [];
    for (const node of nodes) {
      try {
        logger.info(`   Computing baseline for node: ${node.name} (${node.nodeId})`);
        
        const baselineData = await baselineIntelligenceService.computeNodeBaseline(
          node.nodeId,
          TENANT_ID
        );

        // Generate insights
        const insights = baselineInsightsService.generateAllInsights({
          type: 'node',
          metrics: baselineData.metrics,
        });

        // Save baseline
        const savedBaseline = await baselineIntelligenceService.saveBaseline(baselineData, insights);

        logger.info(`   ✅ Node baseline computed:`, {
          nodeId: node.nodeId,
          totalUsers: baselineData.metrics?.users?.total || 0,
          activeUsers: baselineData.metrics?.users?.active || 0,
          averageAge: baselineData.metrics?.users?.demographics?.averageAge?.toFixed(1) || 0,
          insights: insights.length,
          computationTime: `${baselineData.computationDuration}ms`,
        });

        results.push({
          nodeId: node.nodeId,
          nodeName: node.name,
          baseline: savedBaseline,
          metrics: baselineData.metrics,
        });
      } catch (error) {
        logger.error(`   ❌ Error computing baseline for node ${node.nodeId}:`, error.message);
      }
    }

    return results;
  } catch (error) {
    logger.error('❌ Error testing node baseline computation:', error);
    throw error;
  }
}

/**
 * Test network baseline computation
 */
async function testNetworkBaselineComputation() {
  logger.info('🌐 Testing network baseline computation...');

  try {
    logger.info(`   Computing network baseline for tenant: ${TENANT_ID}`);
    
    const baselineData = await baselineIntelligenceService.computeNetworkBaseline(TENANT_ID);

    // Generate insights
    const insights = baselineInsightsService.generateAllInsights({
      type: 'network',
      metrics: baselineData.metrics,
    });

    // Save baseline
    const savedBaseline = await baselineIntelligenceService.saveBaseline(baselineData, insights);

    logger.info(`   ✅ Network baseline computed:`, {
      totalNodes: baselineData.metrics?.network?.totalNodes || 0,
      totalUsers: baselineData.metrics?.users?.total || 0,
      activeUsers: baselineData.metrics?.users?.active || 0,
      averageAge: baselineData.metrics?.users?.demographics?.averageAge?.toFixed(1) || 0,
      insights: insights.length,
      computationTime: `${baselineData.computationDuration}ms`,
    });

    return {
      baseline: savedBaseline,
      metrics: baselineData.metrics,
    };
  } catch (error) {
    logger.error('❌ Error testing network baseline computation:', error);
    throw error;
  }
}

/**
 * Test baseline retrieval (simulating API calls)
 */
async function testBaselineRetrieval() {
  logger.info('📥 Testing baseline retrieval...');

  try {
    // Test network baseline retrieval
    const networkBaseline = await baselineIntelligenceService.getBaseline(TENANT_ID, null);
    if (networkBaseline) {
      logger.info(`   ✅ Network baseline retrieved:`, {
        totalUsers: networkBaseline.metrics?.users?.total || 0,
        insights: networkBaseline.insights?.length || 0,
      });
    } else {
      logger.warn(`   ⚠️  Network baseline not found`);
    }

    // Test node baseline retrieval
    // Pass isSaby: true in options to bypass TenantPlugin filtering
    const nodes = await Nodes.find({ 
      tenantId: TENANT_ID,
      deletedAt: null 
    }).setOptions({ user: { isSaby: true } }).limit(3);

    for (const node of nodes) {
      const nodeBaseline = await baselineIntelligenceService.getBaseline(TENANT_ID, node.nodeId);
      if (nodeBaseline) {
        logger.info(`   ✅ Node baseline retrieved for ${node.name}:`, {
          totalUsers: nodeBaseline.metrics?.users?.total || 0,
          insights: nodeBaseline.insights?.length || 0,
        });
      } else {
        logger.warn(`   ⚠️  Node baseline not found for ${node.name}`);
      }
    }

    return true;
  } catch (error) {
    logger.error('❌ Error testing baseline retrieval:', error);
    throw error;
  }
}

/**
 * Display summary statistics
 */
async function displaySummary() {
  logger.info('📊 Summary Statistics...');

  try {
    // Use aggregate to bypass TenantPlugin (aggregate doesn't use the plugin hooks)
    const userStats = await User.aggregate([
      { $match: { tenantId: TENANT_ID } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withProfile: {
            $sum: {
              $cond: [
                { $or: [
                  { $ne: ['$profile.gender', null] },
                  { $ne: ['$profile.dateOfBirth', null] },
                  { $gt: [{ $size: { $ifNull: ['$customFields', {}] } }, 0] }
                ]},
                1,
                0
              ]
            }
          },
          compliant: {
            $sum: { $cond: ['$profileUpdateCompliant', 1, 0] }
          },
          verified: {
            $sum: { $cond: ['$isEmailVerified', 1, 0] }
          },
        }
      }
    ]);

    // Use aggregate to bypass TenantPlugin (aggregate doesn't use the plugin hooks)
    const nodeStats = await Nodes.aggregate([
      { $match: { tenantId: TENANT_ID, deletedAt: null } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withProfile: {
            $sum: {
              $cond: [
                { $or: [
                  { $ne: ['$profile.propertyStatus', null] },
                  { $ne: ['$profile.buildingType', null] },
                  { $gt: [{ $size: { $ifNull: ['$customFields', {}] } }, 0] }
                ]},
                1,
                0
              ]
            }
          },
          compliant: {
            $sum: { $cond: ['$profileUpdateCompliant', 1, 0] }
          },
        }
      }
    ]);

    const baselineStats = await BaselineIntelligence.aggregate([
      { $match: { tenantId: TENANT_ID } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalInsights: { $sum: { $size: '$insights' } },
        }
      }
    ]);

    logger.info('   Users:', userStats[0] || { total: 0, withProfile: 0, compliant: 0, verified: 0 });
    logger.info('   Nodes:', nodeStats[0] || { total: 0, withProfile: 0, compliant: 0 });
    logger.info('   Baselines:', baselineStats);

    return { userStats, nodeStats, baselineStats };
  } catch (error) {
    logger.error('❌ Error getting summary:', error);
    return null;
  }
}

/**
 * Main execution function
 */
async function main() {
  logger.info('🚀 Starting Profile Update and Baseline Intelligence Test');
  logger.info('========================================================\n');

  try {
    // Connect to services
    const connected = await connectServices();
    if (!connected) {
      throw new Error('Failed to connect to required services');
    }

    // Get tenant ID - use override if provided, otherwise lookup from email
    if (TENANT_ID_OVERRIDE) {
      TENANT_ID = TENANT_ID_OVERRIDE;
      logger.info(`✅ Using Tenant ID from override: ${TENANT_ID}`);
      
      // Verify tenant exists by checking for users
      // Pass isSaby: true in options to bypass TenantPlugin filtering
      const userCount = await User.countDocuments({ tenantId: TENANT_ID }).setOptions({ user: { isSaby: true } });
      logger.info(`   Found ${userCount} users for this tenant`);
    } else {
      TENANT_ID = await getTenantIdFromUser();
      logger.info(`✅ Using Tenant ID from email lookup: ${TENANT_ID}`);
    }
    logger.info(`\n`);

    // Step 1: Update user profiles
    logger.info('\n📝 Step 1: Updating User Profiles');
    logger.info('-----------------------------------');
    const userUpdateResult = await updateUserProfiles();
    
    // Step 2: Update node profiles
    logger.info('\n📝 Step 2: Updating Node Profiles');
    logger.info('-----------------------------------');
    const nodeUpdateResult = await updateNodeProfiles();

    // Step 3: Test node baseline computation
    logger.info('\n🧮 Step 3: Testing Node Baseline Computation');
    logger.info('---------------------------------------------');
    const nodeBaselines = await testNodeBaselineComputation();

    // Step 4: Test network baseline computation
    logger.info('\n🌐 Step 4: Testing Network Baseline Computation');
    logger.info('------------------------------------------------');
    const networkBaseline = await testNetworkBaselineComputation();

    // Step 5: Test baseline retrieval
    logger.info('\n📥 Step 5: Testing Baseline Retrieval');
    logger.info('--------------------------------------');
    await testBaselineRetrieval();

    // Step 6: Display summary
    logger.info('\n📊 Step 6: Summary Statistics');
    logger.info('------------------------------');
    await displaySummary();

    logger.info('\n========================================================');
    logger.info('🎉 All tests completed successfully!');
    logger.info('========================================================');
    logger.info(`\n✅ Updated ${userUpdateResult.updated} users and ${nodeUpdateResult.updated} nodes`);
    logger.info(`✅ Computed ${nodeBaselines.length} node baselines and 1 network baseline`);
    logger.info(`\nYou can now test the baseline intelligence endpoints:`);
    logger.info(`   GET /v1/baseline/network`);
    logger.info(`   GET /v1/baseline/node/:nodeId`);
    logger.info(`   GET /v1/baseline/summary`);

  } catch (error) {
    logger.error('\n========================================================');
    logger.error('💥 Test failed:', error);
    logger.error('========================================================');
    process.exit(1);
  } finally {
    // Close connections
    await mongoose.connection.close();
    logger.info('\n📴 Database connection closed');
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  main,
  updateUserProfiles,
  updateNodeProfiles,
  testNodeBaselineComputation,
  testNetworkBaselineComputation,
};

