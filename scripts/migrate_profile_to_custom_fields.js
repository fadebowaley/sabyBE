/**
 * Migration Script: Move legacy profile fields into customFields and reset profiles.
 *
 * - Backfills user and node profile data into tenant-specific customFields using the
 *   tenant's current TenantConfig definitions.
 * - Clears the legacy `profile` object after migration so future updates rely solely
 *   on the configurable schema.
 *
 * Usage:
 *   MONGODB_URL="mongodb://localhost:27017/halo-local" node scripts/migrate_profile_to_custom_fields.js
 *   TENANT_ID=tenant123 node scripts/migrate_profile_to_custom_fields.js    # optional scope
 */

require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const mongoose = require('mongoose');
const { User, Nodes, TenantConfig } = require('../src/models');
const tenantConfigService = require('../src/services/tenantConfig.service');
const { validateCustomFields } = require('../src/services/customField.service');

const MONGODB_URL =
  process.env.MONGODB_URL ||
  process.env.DB_URL ||
  process.env.MONGO_URL ||
  'mongodb://localhost:27017/halo-local';
const TARGET_TENANT = process.env.TENANT_ID || process.argv[2] || null;

const USER_FIELD_PATHS = new Map();
registerPaths(USER_FIELD_PATHS, ['title'], ['profile', 'title']);
registerPaths(USER_FIELD_PATHS, ['other_name', 'otherName'], [
  'profile',
  'otherName',
]);
registerPaths(USER_FIELD_PATHS, ['gender'], ['profile', 'gender']);
registerPaths(USER_FIELD_PATHS, ['date_of_birth', 'dateOfBirth'], [
  'profile',
  'dateOfBirth',
]);
registerPaths(
  USER_FIELD_PATHS,
  ['highest_qualification', 'highestQualification'],
  ['profile', 'highestQualification']
);
registerPaths(USER_FIELD_PATHS, ['professional'], ['profile', 'professional']);
registerPaths(
  USER_FIELD_PATHS,
  ['employment_category', 'employmentCategory'],
  ['profile', 'employmentCategory']
);
registerPaths(USER_FIELD_PATHS, ['occupation'], ['profile', 'occupation']);
registerPaths(USER_FIELD_PATHS, ['employee_id', 'employeeId'], [
  'profile',
  'employeeId',
]);
registerPaths(USER_FIELD_PATHS, ['marital_status', 'maritalStatus'], [
  'profile',
  'maritalStatus',
]);
registerPaths(USER_FIELD_PATHS, ['spouse_name', 'spouseName'], [
  'profile',
  'spouse',
  'name',
]);
registerPaths(
  USER_FIELD_PATHS,
  ['spouse_phone', 'spousePhoneNumber'],
  ['profile', 'spouse', 'phoneNumber']
);
registerPaths(
  USER_FIELD_PATHS,
  ['spouse_date_of_birth', 'spouseDateOfBirth'],
  ['profile', 'spouse', 'dateOfBirth']
);
registerPaths(USER_FIELD_PATHS, ['next_of_kin_name', 'nextOfKinName'], [
  'profile',
  'nextOfKin',
  'name',
]);
registerPaths(
  USER_FIELD_PATHS,
  ['next_of_kin_phone', 'nextOfKinPhoneNumber'],
  ['profile', 'nextOfKin', 'phoneNumber']
);
registerPaths(
  USER_FIELD_PATHS,
  ['next_of_kin_relationship', 'nextOfKinRelationship'],
  ['profile', 'nextOfKin', 'relationship']
);
registerPaths(USER_FIELD_PATHS, ['state_of_origin', 'stateOfOrigin'], [
  'profile',
  'stateOfOrigin',
]);
registerPaths(USER_FIELD_PATHS, ['lga_of_origin', 'lgaOfOrigin'], [
  'profile',
  'lgaOfOrigin',
]);
registerPaths(USER_FIELD_PATHS, ['home_town', 'homeTown'], [
  'profile',
  'homeTown',
]);
registerPaths(
  USER_FIELD_PATHS,
  ['residential_address', 'residentialAddress'],
  ['profile', 'residentialAddress']
);
registerPaths(
  USER_FIELD_PATHS,
  ['state_of_residence', 'stateOfResidence'],
  ['profile', 'stateOfResidence']
);
registerPaths(USER_FIELD_PATHS, ['lga_of_residence', 'lgaOfResidence'], [
  'profile',
  'lgaOfResidence',
]);

const NODE_FIELD_PATHS = new Map();
registerPaths(
  NODE_FIELD_PATHS,
  ['date_of_establishment', 'dateOfEstablishment'],
  ['profile', 'dateOfEstablishment']
);
registerPaths(
  NODE_FIELD_PATHS,
  ['property_status', 'propertyStatus'],
  ['profile', 'propertyStatus']
);
registerPaths(
  NODE_FIELD_PATHS,
  ['estimated_value', 'estimatedValue'],
  ['profile', 'estimatedValue']
);
registerPaths(
  NODE_FIELD_PATHS,
  ['building_type', 'buildingType'],
  ['profile', 'buildingType']
);
registerPaths(
  NODE_FIELD_PATHS,
  ['facility_status', 'facilityStatus'],
  ['profile', 'facilityStatus']
);

function registerPaths(map, keys, path) {
  keys.forEach((key) => map.set(key, path));
}

function getValueByPath(source, path) {
  return path.reduce((acc, segment) => {
    if (acc === undefined || acc === null) {
      return undefined;
    }
    return acc[segment];
  }, source);
}

async function connectDB() {
  await mongoose.connect(MONGODB_URL);
  console.log(`✅ Connected to MongoDB: ${MONGODB_URL}`);
}

async function disconnectDB() {
  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

async function getTenantIds() {
  const filter = TARGET_TENANT ? { tenantId: TARGET_TENANT } : {};
  const tenantIds = await TenantConfig.distinct('tenantId', filter);
  return tenantIds.filter(Boolean);
}

function extractMigratableValues(entity, config, pathMap) {
  if (!config || !config.fields || !config.fields.length) {
    return { additions: {}, mapped: 0 };
  }
  const additions = {};
  let mapped = 0;

  config.fields.forEach((field) => {
    const fieldId = field.id;
    if (!fieldId) {
      return;
    }
    if (
      entity.customFields &&
      entity.customFields[fieldId] !== undefined &&
      entity.customFields[fieldId] !== null &&
      entity.customFields[fieldId] !== ''
    ) {
      return; // already has value
    }
    const path = pathMap.get(fieldId);
    if (!path) {
      return;
    }
    const value = getValueByPath(entity, path);
    if (value === undefined || value === null || value === '') {
      return;
    }
    additions[fieldId] = value;
    mapped += 1;
  });

  return { additions, mapped };
}

async function migrateUsersForTenant(tenantId, config) {
  if (!config || !config.fields || config.fields.length === 0) {
    console.log(`⚠️  Tenant ${tenantId}: no user custom fields defined, skipping.`);
    return { scanned: 0, updated: 0 };
  }

  const cursor = User.find({ tenantId }).cursor();
  let scanned = 0;
  let updated = 0;

  for await (const user of cursor) {
    scanned += 1;
    const { additions, mapped } = extractMigratableValues(
      user,
      config,
      USER_FIELD_PATHS
    );

    const existingProfileHasData =
      user.profile && Object.keys(user.profile || {}).length > 0;

    if (!mapped && !existingProfileHasData) {
      continue;
    }

    try {
      if (mapped) {
        const merged = { ...(user.customFields || {}), ...additions };
        const { values, version } = await validateCustomFields({
          tenantId,
          entityType: 'user',
          payload: merged,
        });
        user.customFields = values;
        user.customFieldsVersion = version;
      }

      user.profile = {};
      user.markModified('profile');
      await user.save();
      updated += 1;
    } catch (error) {
      console.error(
        `❌  Failed to migrate user ${user._id} (tenant ${tenantId}):`,
        error.message
      );
    }
  }

  console.log(
    `👥 Tenant ${tenantId}: scanned ${scanned} users, migrated ${updated} profiles`
  );
  return { scanned, updated };
}

async function migrateNodesForTenant(tenantId, config) {
  if (!config || !config.fields || config.fields.length === 0) {
    console.log(`⚠️  Tenant ${tenantId}: no node custom fields defined, skipping.`);
    return { scanned: 0, updated: 0 };
  }

  const cursor = Nodes.find({ tenantId }).cursor();
  let scanned = 0;
  let updated = 0;

  for await (const node of cursor) {
    scanned += 1;
    const { additions, mapped } = extractMigratableValues(
      node,
      config,
      NODE_FIELD_PATHS
    );
    const existingProfileHasData =
      node.profile && Object.keys(node.profile || {}).length > 0;

    if (!mapped && !existingProfileHasData) {
      continue;
    }

    try {
      if (mapped) {
        const merged = { ...(node.customFields || {}), ...additions };
        const { values, version } = await validateCustomFields({
          tenantId,
          entityType: 'node',
          payload: merged,
        });
        node.customFields = values;
        node.customFieldsVersion = version;
      }

      node.profile = {};
      node.markModified('profile');
      await node.save();
      updated += 1;
    } catch (error) {
      console.error(
        `❌  Failed to migrate node ${node._id} (tenant ${tenantId}):`,
        error.message
      );
    }
  }

  console.log(
    `🏗️  Tenant ${tenantId}: scanned ${scanned} nodes, migrated ${updated} profiles`
  );
  return { scanned, updated };
}

async function runMigration() {
  await connectDB();
  const summary = {
    tenantsProcessed: 0,
    users: { scanned: 0, updated: 0 },
    nodes: { scanned: 0, updated: 0 },
  };

  try {
    const tenantIds = await getTenantIds();
    if (!tenantIds.length) {
      console.log('ℹ️  No tenants found with custom configs. Nothing to migrate.');
      return;
    }

    for (const tenantId of tenantIds) {
      summary.tenantsProcessed += 1;
      console.log(`\n===== Tenant ${tenantId} =====`);

      const userConfig = await tenantConfigService.getTenantConfig(
        tenantId,
        'user'
      );
      if (userConfig) {
        const result = await migrateUsersForTenant(tenantId, userConfig);
        summary.users.scanned += result.scanned;
        summary.users.updated += result.updated;
      }

      const nodeConfig = await tenantConfigService.getTenantConfig(
        tenantId,
        'node'
      );
      if (nodeConfig) {
        const result = await migrateNodesForTenant(tenantId, nodeConfig);
        summary.nodes.scanned += result.scanned;
        summary.nodes.updated += result.updated;
      }
    }
  } finally {
    await disconnectDB();
  }

  console.log('\n===== Migration Summary =====');
  console.log(`Tenants processed: ${summary.tenantsProcessed}`);
  console.log(
    `Users migrated: ${summary.users.updated} / ${summary.users.scanned} scanned`
  );
  console.log(
    `Nodes migrated: ${summary.nodes.updated} / ${summary.nodes.scanned} scanned`
  );
}

runMigration()
  .then(() => {
    console.log('\n✅ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

