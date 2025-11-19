/**
 * Test script for custom fields functionality
 * 
 * This script tests:
 * 1. Creating a tenant config for users/nodes
 * 2. Creating a user/node with customFields
 * 3. Updating a user/node with customFields
 * 4. Validating that customFields are properly stored
 * 
 * Usage: node scripts/test_custom_fields.js
 */

require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const { User, Nodes, TenantConfig, Level, Structures } = require('../src/models');
const { validateCustomFields } = require('../src/services/customField.service');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/halo-local';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  // Clean up test data if needed
  await TenantConfig.deleteMany({ tenantId: 'test-tenant-123' });
  await User.deleteMany({ email: 'test-custom@example.com' });
  await Nodes.deleteMany({ name: 'Test Node Custom Fields' });
  console.log('✅ Cleanup complete');
}

async function testTenantConfig() {
  console.log('\n📋 Testing Tenant Config Creation...');
  
  const testConfig = {
    tenantId: 'test-tenant-123',
    entityType: 'user',
    fields: [
      {
        id: 'emergency_contact',
        label: 'Emergency Contact',
        type: 'text',
        required: false,
        defaultValue: '',
      },
      {
        id: 'blood_type',
        label: 'Blood Type',
        type: 'select',
        required: true,
        options: [
          { label: 'A+', value: 'A+' },
          { label: 'B+', value: 'B+' },
          { label: 'O+', value: 'O+' },
          { label: 'AB+', value: 'AB+' },
        ],
      },
    ],
    ui: {
      sections: [
        { id: 'medical', title: 'Medical Information', order: 1 },
      ],
    },
  };

  const config = await TenantConfig.findOneAndUpdate(
    { tenantId: testConfig.tenantId, entityType: testConfig.entityType },
    { $set: testConfig, $inc: { version: 1 } },
    { new: true, upsert: true }
  );

  console.log('✅ Tenant config created:', config._id);
  return config;
}

async function testCustomFieldsValidation() {
  console.log('\n🔍 Testing Custom Fields Validation...');
  
  const testPayload = {
    emergency_contact: 'John Doe - 123-456-7890',
    blood_type: 'O+',
  };

  try {
    const result = await validateCustomFields({
      tenantId: 'test-tenant-123',
      entityType: 'user',
      payload: testPayload,
    });

    console.log('✅ Validation passed:', result);
    return result;
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    throw error;
  }
}

async function testUserWithCustomFields() {
  console.log('\n👤 Testing User Creation with Custom Fields...');
  
  // First, create a test user (without customFields)
  const userBody = {
    firstname: 'Test',
    lastname: 'User',
    email: 'test-custom@example.com',
    password: 'Test123456',
    tenantId: 'test-tenant-123',
    isOwner: true,
  };

  const user = await User.createUser(userBody);
  console.log('✅ User created:', user._id);

  // Now add customFields
  const customFieldsPayload = {
    emergency_contact: 'Jane Doe - 987-654-3210',
    blood_type: 'A+',
  };

  const { values, version } = await validateCustomFields({
    tenantId: user.tenantId,
    entityType: 'user',
    payload: customFieldsPayload,
  });

  user.customFields = values;
  user.customFieldsVersion = version;
  await user.save();

  console.log('✅ User customFields updated:', user.customFields);
  console.log('✅ User customFieldsVersion:', user.customFieldsVersion);

  // Verify
  const updatedUser = await User.findById(user._id);
  console.log('✅ Verified user.customFields:', updatedUser.customFields);

  return updatedUser;
}

async function testNodeWithCustomFields() {
  console.log('\n🏢 Testing Node Creation with Custom Fields...');
  
  // First, we need a level and structure
  // Try to find an existing level first, or use the test user's tenant
  let level = await Level.findOne({ tenantId: 'test-tenant-123' });
  if (!level) {
    // Get the highest rank for this tenant to create a new level
    const maxRankLevel = await Level.findOne({ tenantId: 'test-tenant-123' })
      .sort({ rank: -1 })
      .limit(1);
    const nextRank = maxRankLevel ? maxRankLevel.rank + 1 : 0;
    
    level = await Level.create({
      name: 'Test Level',
      tenantId: 'test-tenant-123',
      rank: nextRank,
    });
    console.log('✅ Test level created:', level._id);
  }

  let structure = await Structures.findOne({ 
    level: level._id, 
    tenantId: 'test-tenant-123' 
  });
  if (!structure) {
    structure = await Structures.create({
      name: 'Test Structure',
      level: level._id,
      tenantId: 'test-tenant-123',
    });
    console.log('✅ Test structure created:', structure._id);
  }

  // Create node config
  const nodeConfig = {
    tenantId: 'test-tenant-123',
    entityType: 'node',
    fields: [
      {
        id: 'capacity',
        label: 'Seating Capacity',
        type: 'number',
        required: false,
      },
      {
        id: 'facility_type',
        label: 'Facility Type',
        type: 'select',
        required: true,
        options: [
          { label: 'Auditorium', value: 'auditorium' },
          { label: 'Hall', value: 'hall' },
          { label: 'Office', value: 'office' },
        ],
      },
    ],
  };

  await TenantConfig.findOneAndUpdate(
    { tenantId: nodeConfig.tenantId, entityType: nodeConfig.entityType },
    { $set: nodeConfig, $inc: { version: 1 } },
    { new: true, upsert: true }
  );
  console.log('✅ Node config created');

  // Create node
  const nodeBody = {
    name: 'Test Node Custom Fields',
    level: level._id,
    structure: structure._id,
    tenantId: 'test-tenant-123',
  };

  const node = await Nodes.create(nodeBody);
  console.log('✅ Node created:', node._id);

  // Add customFields
  const customFieldsPayload = {
    capacity: 500,
    facility_type: 'auditorium',
  };

  const { values, version } = await validateCustomFields({
    tenantId: node.tenantId,
    entityType: 'node',
    payload: customFieldsPayload,
  });

  node.customFields = values;
  node.customFieldsVersion = version;
  await node.save();

  console.log('✅ Node customFields updated:', node.customFields);
  console.log('✅ Node customFieldsVersion:', node.customFieldsVersion);

  // Verify
  const updatedNode = await Nodes.findById(node._id);
  console.log('✅ Verified node.customFields:', updatedNode.customFields);

  return updatedNode;
}

async function runTests() {
  try {
    await connectDB();
    
    // Clean up any existing test data
    await cleanup();
    
    // Run tests
    await testTenantConfig();
    await testCustomFieldsValidation();
    await testUserWithCustomFields();
    await testNodeWithCustomFields();
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };

