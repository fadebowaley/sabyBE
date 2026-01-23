/**
 * Create API Key for SabyAgentic Communication
 * 
 * This script creates a dedicated API key for sabyAgentic to communicate
 * with sabyBackend without needing JWT authentication.
 * 
 * Usage: node scripts/create_agentic_api_key.js
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const ApiKey = require('../src/models/apiKey.model');
const User = require('../src/models/user.model');

async function createAgenticApiKey() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find SabyUser (saby@saby.ai)
    const sabyUser = await User.findOne({ email: 'saby@saby.ai' });
    
    if (!sabyUser) {
      console.error('❌ SabyUser (saby@saby.ai) not found');
      console.log('Please create SabyUser first using scripts/createSabyUser.js');
      process.exit(1);
    }

    console.log('✅ Found SabyUser:', sabyUser.email);
    console.log('   Tenant ID:', sabyUser.tenantId);
    console.log('   User ID:', sabyUser._id);

    // Check if system API key for agentic already exists
    const existingKey = await ApiKey.findOne({
      tenantId: sabyUser.tenantId,
      category: 'system',
      label: 'SabyAgentic Communication Key',
      isActive: true
    });

    if (existingKey) {
      console.log('\n⚠️  Active SabyAgentic API key already exists:');
      console.log('   Key ID:', existingKey._id);
      console.log('   Label:', existingKey.label);
      console.log('   Created:', existingKey.createdAt);
      console.log('\n❓ Use existing key or create new one?');
      console.log('   To create new, first deactivate existing key in the database');
      process.exit(0);
    }

    // Generate new API key for SabyAgentic
    console.log('\n🔑 Generating new API key for SabyAgentic...');
    
    const { rawKey, keyDoc } = await ApiKey.generateKey({
      tenantId: sabyUser.tenantId,
      label: 'SabyAgentic Communication Key',
      environment: 'staging', // Use staging for development
      permissions: ['read', 'write', 'delete'], // Full permissions
      category: 'system', // System category for internal communication
      scope: 'system', // Match deprecated scope field
      rateLimit: 10000, // High rate limit for agent operations
      createdBy: sabyUser._id,
    });

    // Auto-approve and activate
    keyDoc.approvalStatus = 'auto-approved';
    keyDoc.isActive = true;
    await keyDoc.save();

    console.log('\n✅ API Key created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 API KEY DETAILS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Key ID:        ', keyDoc._id);
    console.log('Label:         ', keyDoc.label);
    console.log('Environment:   ', keyDoc.environment);
    console.log('Category:      ', keyDoc.category);
    console.log('Permissions:   ', keyDoc.permissions.join(', '));
    console.log('Rate Limit:    ', keyDoc.rateLimit, 'requests/hour');
    console.log('Status:        ', keyDoc.isActive ? '✅ Active' : '❌ Inactive');
    console.log('Created:       ', keyDoc.createdAt);
    console.log('');
    console.log('🔐 RAW API KEY (save this - it won\'t be shown again):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(rawKey);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📝 NEXT STEPS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. Copy the RAW API KEY above');
    console.log('2. Add to sabyAgentic/.env:');
    console.log('   BACKEND_API_TOKEN=' + rawKey);
    console.log('');
    console.log('3. Or export it temporarily:');
    console.log('   export BACKEND_API_TOKEN="' + rawKey + '"');
    console.log('');
    console.log('4. Test connection:');
    console.log('   cd sabyAgentic && python3 test_e2e_real_data.py');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the script
createAgenticApiKey();


 * 
 * This script creates a dedicated API key for sabyAgentic to communicate
 * with sabyBackend without needing JWT authentication.
 * 
 * Usage: node scripts/create_agentic_api_key.js
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const ApiKey = require('../src/models/apiKey.model');
const User = require('../src/models/user.model');

async function createAgenticApiKey() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find SabyUser (saby@saby.ai)
    const sabyUser = await User.findOne({ email: 'saby@saby.ai' });
    
    if (!sabyUser) {
      console.error('❌ SabyUser (saby@saby.ai) not found');
      console.log('Please create SabyUser first using scripts/createSabyUser.js');
      process.exit(1);
    }

    console.log('✅ Found SabyUser:', sabyUser.email);
    console.log('   Tenant ID:', sabyUser.tenantId);
    console.log('   User ID:', sabyUser._id);

    // Check if system API key for agentic already exists
    const existingKey = await ApiKey.findOne({
      tenantId: sabyUser.tenantId,
      category: 'system',
      label: 'SabyAgentic Communication Key',
      isActive: true
    });

    if (existingKey) {
      console.log('\n⚠️  Active SabyAgentic API key already exists:');
      console.log('   Key ID:', existingKey._id);
      console.log('   Label:', existingKey.label);
      console.log('   Created:', existingKey.createdAt);
      console.log('\n❓ Use existing key or create new one?');
      console.log('   To create new, first deactivate existing key in the database');
      process.exit(0);
    }

    // Generate new API key for SabyAgentic
    console.log('\n🔑 Generating new API key for SabyAgentic...');
    
    const { rawKey, keyDoc } = await ApiKey.generateKey({
      tenantId: sabyUser.tenantId,
      label: 'SabyAgentic Communication Key',
      environment: 'staging', // Use staging for development
      permissions: ['read', 'write', 'delete'], // Full permissions
      category: 'system', // System category for internal communication
      scope: 'system', // Match deprecated scope field
      rateLimit: 10000, // High rate limit for agent operations
      createdBy: sabyUser._id,
    });

    // Auto-approve and activate
    keyDoc.approvalStatus = 'auto-approved';
    keyDoc.isActive = true;
    await keyDoc.save();

    console.log('\n✅ API Key created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 API KEY DETAILS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Key ID:        ', keyDoc._id);
    console.log('Label:         ', keyDoc.label);
    console.log('Environment:   ', keyDoc.environment);
    console.log('Category:      ', keyDoc.category);
    console.log('Permissions:   ', keyDoc.permissions.join(', '));
    console.log('Rate Limit:    ', keyDoc.rateLimit, 'requests/hour');
    console.log('Status:        ', keyDoc.isActive ? '✅ Active' : '❌ Inactive');
    console.log('Created:       ', keyDoc.createdAt);
    console.log('');
    console.log('🔐 RAW API KEY (save this - it won\'t be shown again):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(rawKey);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📝 NEXT STEPS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. Copy the RAW API KEY above');
    console.log('2. Add to sabyAgentic/.env:');
    console.log('   BACKEND_API_TOKEN=' + rawKey);
    console.log('');
    console.log('3. Or export it temporarily:');
    console.log('   export BACKEND_API_TOKEN="' + rawKey + '"');
    console.log('');
    console.log('4. Test connection:');
    console.log('   cd sabyAgentic && python3 test_e2e_real_data.py');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the script
createAgenticApiKey();


 * 
 * This script creates a dedicated API key for sabyAgentic to communicate
 * with sabyBackend without needing JWT authentication.
 * 
 * Usage: node scripts/create_agentic_api_key.js
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const ApiKey = require('../src/models/apiKey.model');
const User = require('../src/models/user.model');

async function createAgenticApiKey() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find SabyUser (saby@saby.ai)
    const sabyUser = await User.findOne({ email: 'saby@saby.ai' });
    
    if (!sabyUser) {
      console.error('❌ SabyUser (saby@saby.ai) not found');
      console.log('Please create SabyUser first using scripts/createSabyUser.js');
      process.exit(1);
    }

    console.log('✅ Found SabyUser:', sabyUser.email);
    console.log('   Tenant ID:', sabyUser.tenantId);
    console.log('   User ID:', sabyUser._id);

    // Check if system API key for agentic already exists
    const existingKey = await ApiKey.findOne({
      tenantId: sabyUser.tenantId,
      category: 'system',
      label: 'SabyAgentic Communication Key',
      isActive: true
    });

    if (existingKey) {
      console.log('\n⚠️  Active SabyAgentic API key already exists:');
      console.log('   Key ID:', existingKey._id);
      console.log('   Label:', existingKey.label);
      console.log('   Created:', existingKey.createdAt);
      console.log('\n❓ Use existing key or create new one?');
      console.log('   To create new, first deactivate existing key in the database');
      process.exit(0);
    }

    // Generate new API key for SabyAgentic
    console.log('\n🔑 Generating new API key for SabyAgentic...');
    
    const { rawKey, keyDoc } = await ApiKey.generateKey({
      tenantId: sabyUser.tenantId,
      label: 'SabyAgentic Communication Key',
      environment: 'staging', // Use staging for development
      permissions: ['read', 'write', 'delete'], // Full permissions
      category: 'system', // System category for internal communication
      scope: 'system', // Match deprecated scope field
      rateLimit: 10000, // High rate limit for agent operations
      createdBy: sabyUser._id,
    });

    // Auto-approve and activate
    keyDoc.approvalStatus = 'auto-approved';
    keyDoc.isActive = true;
    await keyDoc.save();

    console.log('\n✅ API Key created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 API KEY DETAILS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Key ID:        ', keyDoc._id);
    console.log('Label:         ', keyDoc.label);
    console.log('Environment:   ', keyDoc.environment);
    console.log('Category:      ', keyDoc.category);
    console.log('Permissions:   ', keyDoc.permissions.join(', '));
    console.log('Rate Limit:    ', keyDoc.rateLimit, 'requests/hour');
    console.log('Status:        ', keyDoc.isActive ? '✅ Active' : '❌ Inactive');
    console.log('Created:       ', keyDoc.createdAt);
    console.log('');
    console.log('🔐 RAW API KEY (save this - it won\'t be shown again):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(rawKey);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📝 NEXT STEPS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. Copy the RAW API KEY above');
    console.log('2. Add to sabyAgentic/.env:');
    console.log('   BACKEND_API_TOKEN=' + rawKey);
    console.log('');
    console.log('3. Or export it temporarily:');
    console.log('   export BACKEND_API_TOKEN="' + rawKey + '"');
    console.log('');
    console.log('4. Test connection:');
    console.log('   cd sabyAgentic && python3 test_e2e_real_data.py');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the script
createAgenticApiKey();

