#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: 'env.local' });

const mongoose = require('mongoose');
const config = require('../../src/config/config');
const User = require('../../src/models/user.model');
const Role = require('../../src/models/role.model');
const Level = require('../../src/models/level.model');
const Structure = require('../../src/models/structure.model');
const Node = require('../../src/models/node.model');

async function purgeTenant(tenantId, preserveEmails = []) {
  const emailFilter = preserveEmails.length ? { email: { $nin: preserveEmails } } : {};
  const baseFilter = { tenantId };

  const userResult = await User.deleteMany({
    ...baseFilter,
    ...emailFilter,
    isSaby: { $ne: true },
  });

  const nodeResult = await Node.deleteMany(baseFilter);
  const structureResult = await Structure.deleteMany(baseFilter);
  const levelResult = await Level.deleteMany(baseFilter);
  const roleResult = await Role.deleteMany(baseFilter);

  return {
    userResult,
    nodeResult,
    structureResult,
    levelResult,
    roleResult,
  };
}

async function cleanupNonSabyTenants() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  try {
    const sabyTenantIds = await User.distinct('tenantId', { isSaby: true });
    if (!sabyTenantIds.length) {
      console.warn('⚠️  No isSaby users found. Aborting to avoid wiping critical data.');
      process.exit(1);
    }

    const allTenantIds = await User.distinct('tenantId');
    const targetTenantIds = allTenantIds.filter((id) => !sabyTenantIds.includes(id));

    if (!targetTenantIds.length) {
      console.log('✅  No non-Saby tenants found. Nothing to clean.');
      return;
    }

    console.log(`🧹 Cleaning ${targetTenantIds.length} tenant(s), preserving ${sabyTenantIds.length} Saby tenant(s)`);

    for (const tenantId of targetTenantIds) {
      console.log(`\n➡️  Cleaning tenant ${tenantId}`);
      const results = await purgeTenant(tenantId);
      console.log(`   👤 Users removed: ${results.userResult.deletedCount}`);
      console.log(`   🌳 Nodes removed: ${results.nodeResult.deletedCount}`);
      console.log(`   🏛️ Structures removed: ${results.structureResult.deletedCount}`);
      console.log(`   📏 Levels removed: ${results.levelResult.deletedCount}`);
      console.log(`   🛡️ Roles removed: ${results.roleResult.deletedCount}`);
    }

    console.log('\n✅  Non-Saby tenants cleaned successfully.');
  } catch (error) {
    console.error('❌  Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  cleanupNonSabyTenants();
}

module.exports = cleanupNonSabyTenants;


