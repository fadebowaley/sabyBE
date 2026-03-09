#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
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

const collectionSpecs = [
  ['users', User],
  ['roles', Role],
  ['levels', Level],
  ['structures', Structures],
  ['nodes', Nodes],
  ['projectForms', ProjectForm],
  ['projectFormSubmissions', ProjectFormSubmission],
  ['apiKeys', ApiKey],
];

const run = async () => {
  const args = parseArgs();
  const tenantId = String(args.tenantId || '').trim();
  const outDir = String(args.outDir || '').trim();
  const label = String(args.label || 'snapshot').trim();

  if (!tenantId || !outDir) {
    throw new Error(
      'Usage: node src/scripts/backup-tenant-snapshot.js --tenantId=<tenantId> --outDir=<dir> [--label=pre]'
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  try {
    const snapshot = {
      label,
      tenantId,
      createdAt: new Date().toISOString(),
      collections: {},
    };

    for (const [key, Model] of collectionSpecs) {
      // eslint-disable-next-line no-await-in-loop
      const docs = await Model.find({ tenantId }).lean();
      snapshot.collections[key] = docs;
    }

    const userIds = (snapshot.collections.users || []).map((u) => u._id);
    if (userIds.length) {
      snapshot.collections.tokens = await Token.find({ user: { $in: userIds } }).lean();
    } else {
      snapshot.collections.tokens = [];
    }

    const counts = {};
    Object.keys(snapshot.collections).forEach((k) => {
      counts[k] = Array.isArray(snapshot.collections[k])
        ? snapshot.collections[k].length
        : 0;
    });

    const outFile = path.join(outDir, `${label}.json`);
    fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2), 'utf8');
    process.stdout.write(
      JSON.stringify({ ok: true, tenantId, label, outFile, counts }, null, 2)
    );
  } finally {
    await mongoose.connection.close();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
