#!/usr/bin/env node
/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../config/config');
const {
  Level,
  Structures,
  Nodes,
  Role,
  User,
  ProjectForm,
  ProjectFormSubmission,
  Token,
  ApiKey,
} = require('../models');

const parseArgs = () => {
  const out = {};
  process.argv.slice(2).forEach((arg) => {
    const [k, ...rest] = arg.split('=');
    if (!k.startsWith('--')) return;
    out[k.slice(2)] = rest.join('=');
  });
  return out;
};

const run = async () => {
  const args = parseArgs();
  const tenantId = String(args.tenantId || '').trim();
  const yes = String(args.yes || '').trim().toLowerCase() === 'true';
  if (!tenantId || !yes) {
    throw new Error(
      'Usage: node src/scripts/wipe-tenant-data.js --tenantId=<tenantId> --yes=true'
    );
  }

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  try {
    const users = await User.find({ tenantId }).select('_id').lean();
    const userIds = users.map((u) => u._id);

    const result = {};
    result.tokens = userIds.length
      ? (await Token.deleteMany({ user: { $in: userIds } })).deletedCount
      : 0;
    result.projectFormSubmissions = (
      await ProjectFormSubmission.deleteMany({ tenantId })
    ).deletedCount;
    result.projectForms = (await ProjectForm.deleteMany({ tenantId })).deletedCount;
    result.apiKeys = (await ApiKey.deleteMany({ tenantId })).deletedCount;
    result.nodes = (await Nodes.deleteMany({ tenantId })).deletedCount;
    result.structures = (await Structures.deleteMany({ tenantId })).deletedCount;
    result.levels = (await Level.deleteMany({ tenantId })).deletedCount;
    result.roles = (await Role.deleteMany({ tenantId })).deletedCount;
    result.users = (await User.deleteMany({ tenantId })).deletedCount;

    process.stdout.write(
      JSON.stringify({ ok: true, tenantId, deleted: result }, null, 2)
    );
  } finally {
    await mongoose.connection.close();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
