#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config({ path: 'env.local' });

const mongoose = require('mongoose');
const config = require('../../src/config/config');
const User = require('../../src/models/user.model');
const Role = require('../../src/models/role.model');
const Level = require('../../src/models/level.model');
const Structures = require('../../src/models/structure.model');
const Nodes = require('../../src/models/node.model');

async function cleanupTenant(tenantEmail) {
  if (!tenantEmail) {
    console.error('❌  Usage: node cleanup_tenant.js --tenantEmail <email>');
    process.exit(1);
  }

  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  try {
    const owner = await User.findOne({ email: tenantEmail });
    if (!owner) {
      console.error(`❌  Owner with email ${tenantEmail} not found`);
      process.exit(1);
    }

    const tenantId = owner.tenantId;
    console.log(`🧹 Cleaning tenant ${tenantId} (${tenantEmail})`);

    const userResult = await User.deleteMany({
      tenantId,
      email: { $ne: tenantEmail },
    });
    console.log(`   👤 Users removed: ${userResult.deletedCount}`);

    const nodeResult = await Nodes.deleteMany({ tenantId });
    console.log(`   🌳 Nodes removed: ${nodeResult.deletedCount}`);

    const structureResult = await Structures.deleteMany({ tenantId });
    console.log(`   🏛️ Structures removed: ${structureResult.deletedCount}`);

    const levelResult = await Level.deleteMany({ tenantId });
    console.log(`   📏 Levels removed: ${levelResult.deletedCount}`);

    const roleResult = await Role.deleteMany({ tenantId });
    console.log(`   🛡️ Roles removed: ${roleResult.deletedCount}`);

    console.log('✅  Tenant cleanup completed');
  } catch (error) {
    console.error('❌  Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--tenantEmail' && args[i + 1]) {
      return args[i + 1];
    }
  }
  return null;
}

if (require.main === module) {
  const email = parseArgs();
  cleanupTenant(email);
}

module.exports = cleanupTenant;

