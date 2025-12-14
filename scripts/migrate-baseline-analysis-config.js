/**
 * Migration Script: Create BaselineAnalysisConfig for All Tenants
 * 
 * This script:
 * 1. Connects to MongoDB using env.docker configuration
 * 2. Finds all tenants in the system
 * 3. Uses API endpoints to create BaselineAnalysisConfig for each tenant
 * 4. Creates both 'user' and 'node' entity type configs
 * 
 * Usage: 
 *   node scripts/migrate-baseline-analysis-config.js
 * 
 * Environment:
 *   - Uses MongoDB connection from env.docker
 *   - Uses API endpoints for migration (not direct DB access)
 *   - Requires authentication as Saby user
 */

const mongoose = require('mongoose');
const axios = require('axios');
const config = require('../src/config/config');
const logger = require('../src/config/logger');
require('dotenv').config({ path: './env.docker' });

// API Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/v1';
const AUTH_EMAIL = process.env.AUTH_EMAIL || 'josaby@saby.ai';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '@judah_saby1';

let authToken = null;
let tenantId = null;

/**
 * Make authenticated API request
 */
async function apiRequest(method, endpoint, data = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const config = {
      method,
      url,
      headers,
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      logger.error(`API Error [${method} ${endpoint}]:`, {
        status: error.response.status,
        data: error.response.data,
      });
      throw new Error(
        `API request failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`
      );
    }
    throw error;
  }
}

/**
 * Authenticate and get access token
 */
async function authenticate() {
  logger.info('\n╔════════════════════════════════════════════════════════════════╗');
  logger.info('║  STEP 1: Authentication                                        ║');
  logger.info('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    const response = await apiRequest('POST', '/auth/login', {
      email: AUTH_EMAIL,
      password: AUTH_PASSWORD,
    });

    authToken = response.tokens.access.token;
    tenantId = response.user.tenantId;

    logger.info('✅ Authenticated successfully');
    logger.info(`   User: ${response.user.email}`);
    logger.info(`   Tenant ID: ${tenantId}`);
    logger.info(`   User ID: ${response.user.id}\n`);

    return { token: authToken, tenantId, userId: response.user.id };
  } catch (error) {
    logger.error('❌ Authentication failed:', error.message);
    throw error;
  }
}

/**
 * Get all tenants from database
 * Gets unique tenantIds from users collection
 */
async function getAllTenants() {
  logger.info('\n╔════════════════════════════════════════════════════════════════╗');
  logger.info('║  STEP 2: Fetching All Tenants                                  ║');
  logger.info('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    const { User } = require('../src/models');
    
    // Get all unique tenantIds from users
    // Using distinct to get unique tenant IDs
    const tenantIds = await User.distinct('tenantId', { tenantId: { $exists: true, $ne: null } });
    
    // Also check TenantConfig for tenant IDs
    const { TenantConfig } = require('../src/models');
    const tenantConfigs = await TenantConfig.find({}).select('tenantId').lean();
    const configTenantIds = tenantConfigs.map(tc => tc.tenantId).filter(Boolean);
    
    // Combine and deduplicate
    const allTenantIds = [...new Set([...tenantIds, ...configTenantIds])];
    
    // Create tenant objects
    const tenants = allTenantIds.map(tenantId => ({
      tenantId,
      _id: tenantId, // For compatibility
    }));
    
    logger.info(`✅ Found ${tenants.length} tenant(s)`);
    tenants.forEach((tenant, index) => {
      logger.info(`   ${index + 1}. Tenant ID: ${tenant.tenantId}`);
    });
    logger.info('');

    return tenants;
  } catch (error) {
    logger.error('❌ Failed to fetch tenants:', error.message);
    throw error;
  }
}

/**
 * Create BaselineAnalysisConfig for a tenant using service
 * The service auto-creates default config if it doesn't exist
 */
async function createConfigForTenant(tenant, entityType) {
  try {
    const { baselineAnalysisConfigService } = require('../src/services');
    const tenantId = tenant.tenantId || tenant._id.toString();
    
    // Get or create config (this will create default if it doesn't exist)
    // The service's getAnalysisConfig method creates defaults automatically
    const config = await baselineAnalysisConfigService.getAnalysisConfig(tenantId, entityType);

    return config;
  } catch (error) {
    logger.error(`   ❌ Failed to create ${entityType} config:`, error.message);
    throw error;
  }
}

/**
 * Migrate all tenants
 */
async function migrateTenants() {
  logger.info('\n╔════════════════════════════════════════════════════════════════╗');
  logger.info('║  STEP 3: Migrating Tenants                                       ║');
  logger.info('╚════════════════════════════════════════════════════════════════╝\n');

  const tenants = await getAllTenants();
  
  if (tenants.length === 0) {
    logger.warn('⚠️  No tenants found. Nothing to migrate.');
    return;
  }

  const results = {
    total: tenants.length,
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i];
    const tenantId = tenant.tenantId || tenant._id.toString();
    const tenantName = tenant.name || tenantId;

    logger.info(`\n[${i + 1}/${tenants.length}] Processing tenant: ${tenantName}`);

    try {
      // Check if configs already exist
      const { BaselineAnalysisConfig } = require('../src/models');
      const existingUserConfig = await BaselineAnalysisConfig.findOne({
        tenantId,
        entityType: 'user',
      });
      const existingNodeConfig = await BaselineAnalysisConfig.findOne({
        tenantId,
        entityType: 'node',
      });

      if (existingUserConfig && existingNodeConfig) {
        logger.info(`   ⏭️  Configs already exist for tenant ${tenantName}, skipping...`);
        results.skipped++;
        continue;
      }

      // Create user config
      if (!existingUserConfig) {
        logger.info(`   📝 Creating user config...`);
        await createConfigForTenant(tenant, 'user');
        logger.info(`   ✅ User config created`);
      } else {
        logger.info(`   ✓ User config already exists`);
      }

      // Create node config
      if (!existingNodeConfig) {
        logger.info(`   📝 Creating node config...`);
        await createConfigForTenant(tenant, 'node');
        logger.info(`   ✅ Node config created`);
      } else {
        logger.info(`   ✓ Node config already exists`);
      }

      results.success++;
      logger.info(`   ✅ Tenant ${tenantName} migrated successfully`);
    } catch (error) {
      results.failed++;
      results.errors.push({
        tenantId,
        tenantName,
        error: error.message,
      });
      logger.error(`   ❌ Failed to migrate tenant ${tenantName}:`, error.message);
    }
  }

  return results;
}

/**
 * Connect to MongoDB using env.docker configuration
 */
async function connectDatabase() {
  logger.info('\n╔════════════════════════════════════════════════════════════════╗');
  logger.info('║  Database Connection                                            ║');
  logger.info('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Use MongoDB URL from env.docker
    let mongoUrl = process.env.MONGODB_URL || config.mongoose.url;
    
    // If running from host machine, replace 'mongodb' hostname with 'localhost'
    if (mongoUrl && mongoUrl.includes('@mongodb:')) {
      mongoUrl = mongoUrl.replace('@mongodb:', '@localhost:');
      logger.info('🔄 Adjusted MongoDB URL for host machine access');
      logger.info(`   Using: ${mongoUrl.split('@')[0]}@***`);
    }

    logger.info(`🔌 Connecting to MongoDB...`);
    await mongoose.connect(mongoUrl, config.mongoose.options);
    logger.info('✅ Connected to MongoDB\n');
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', error.message);
    throw error;
  }
}

/**
 * Main migration function
 */
async function main() {
  try {
    logger.info('╔══════════════════════════════════════════════════════════════════════════════╗');
    logger.info('║  BaselineAnalysisConfig Migration Script                                      ║');
    logger.info('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Step 1: Connect to database
    await connectDatabase();

    // Step 2: Authenticate (for API calls if needed)
    await authenticate();

    // Step 3: Migrate all tenants
    const results = await migrateTenants();

    // Step 4: Print summary
    logger.info('\n╔════════════════════════════════════════════════════════════════╗');
    logger.info('║  Migration Summary                                               ║');
    logger.info('╚════════════════════════════════════════════════════════════════╝\n');
    logger.info(`Total Tenants:     ${results.total}`);
    logger.info(`✅ Successful:     ${results.success}`);
    logger.info(`⏭️  Skipped:        ${results.skipped}`);
    logger.info(`❌ Failed:         ${results.failed}\n`);

    if (results.errors.length > 0) {
      logger.info('Errors:');
      results.errors.forEach((err) => {
        logger.error(`   - ${err.tenantName} (${err.tenantId}): ${err.error}`);
      });
    }

    logger.info('\n✅ Migration completed!\n');
  } catch (error) {
    logger.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info('🔌 Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main, migrateTenants, getAllTenants, createConfigForTenant };

