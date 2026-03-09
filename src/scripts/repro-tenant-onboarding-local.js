#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const config = require('../config/config');
const authService = require('../services/auth.service');
const onboardingService = require('../services/copilotOnboarding.service');
const {
  User,
  Role,
  Level,
  Structures,
  Nodes,
  ProjectForm,
  ProjectFormSubmission,
  ApiKey,
  Token,
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

const writeJson = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
};

const snapshotTenant = async (tenantId, runDir, label) => {
  const users = await User.find({ tenantId }).lean();
  const userIds = users.map((u) => u._id);
  const collections = {
    users,
    roles: await Role.find({ tenantId }).lean(),
    levels: await Level.find({ tenantId }).lean(),
    structures: await Structures.find({ tenantId }).lean(),
    nodes: await Nodes.find({ tenantId }).lean(),
    projectForms: await ProjectForm.find({ tenantId }).lean(),
    projectFormSubmissions: await ProjectFormSubmission.find({ tenantId }).lean(),
    apiKeys: await ApiKey.find({ tenantId }).lean(),
    tokens: userIds.length ? await Token.find({ user: { $in: userIds } }).lean() : [],
  };
  const counts = {};
  Object.keys(collections).forEach((k) => {
    counts[k] = collections[k].length;
  });
  const payload = {
    label,
    tenantId,
    createdAt: new Date().toISOString(),
    counts,
    collections,
  };
  writeJson(path.join(runDir, `${label}.json`), payload);
  return counts;
};

const wipeTenant = async (tenantId) => {
  const users = await User.find({ tenantId }).select('_id').lean();
  const userIds = users.map((u) => u._id);
  const deleted = {
    tokens: userIds.length
      ? (await Token.deleteMany({ user: { $in: userIds } })).deletedCount
      : 0,
    projectFormSubmissions: (
      await ProjectFormSubmission.deleteMany({ tenantId })
    ).deletedCount,
    projectForms: (await ProjectForm.deleteMany({ tenantId })).deletedCount,
    apiKeys: (await ApiKey.deleteMany({ tenantId })).deletedCount,
    nodes: (await Nodes.deleteMany({ tenantId })).deletedCount,
    structures: (await Structures.deleteMany({ tenantId })).deletedCount,
    levels: (await Level.deleteMany({ tenantId })).deletedCount,
    roles: (await Role.deleteMany({ tenantId })).deletedCount,
    users: (await User.deleteMany({ tenantId })).deletedCount,
  };
  return deleted;
};

const createOwner = async ({
  email,
  password,
  firstname = 'Tenant',
  lastname = 'Owner',
  phone = '+2348000000000',
}) => {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.createUser({
      firstname,
      lastname,
      email,
      password,
      isOwner: true,
      isSuper: true,
      isAgreed: true,
      phoneNumber: phone,
    });
  }
  user.otpVerified = true;
  user.status = true;
  user.isEmailVerified = true;
  await user.save();
  return user;
};

const run = async () => {
  const args = parseArgs();
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const runDir = path.resolve(
    args.runDir || `artifacts/onboarding-runs/local_${ts}`
  );
  const masterCsv = path.resolve(
    args.masterCsv || 'docs/onboarding-master-template.csv'
  );
  const structureName = String(args.structureName || 'Master Structure');
  const ownerEmail = String(args.ownerEmail || `owner.${ts}@dummy.saby.local`).toLowerCase();
  const ownerPassword = String(args.ownerPassword || 'SabyOwner123!');

  fs.mkdirSync(runDir, { recursive: true });
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  try {
    const owner = await createOwner({
      email: ownerEmail,
      password: ownerPassword,
      firstname: args.firstname || 'Tenant',
      lastname: args.lastname || 'Owner',
      phone: args.phone || '+2348000000000',
    });

    const authUser = await authService.loginUserWithEmailAndPassword(
      ownerEmail,
      ownerPassword,
      'web'
    );

    const meta = {
      runDir,
      tenantId: owner.tenantId,
      ownerEmail,
      ownerPassword,
      ownerId: String(owner._id),
      createdAt: new Date().toISOString(),
    };
    writeJson(path.join(runDir, 'owner.json'), meta);

    const preCounts = await snapshotTenant(owner.tenantId, runDir, 'pre-import');

    const convertedCsv = path.join(runDir, 'onboarding-import.csv');
    execFileSync(
      'node',
      [
        path.resolve('scripts/convert-onboarding-master.js'),
        masterCsv,
        convertedCsv,
        structureName,
      ],
      { stdio: 'pipe' }
    );
    const csvText = fs.readFileSync(convertedCsv, 'utf8');

    const dryRun = await onboardingService.validateOnboardingCsvDryRun({
      tenantId: owner.tenantId,
      csvText,
    });
    writeJson(path.join(runDir, 'dry-run.json'), dryRun);
    if (!dryRun.ok) {
      throw new Error('Dry-run failed. See dry-run.json');
    }

    const imported = await onboardingService.importOnboardingCsv({
      tenantId: owner.tenantId,
      csvText,
      actorUser: authUser,
    });
    writeJson(path.join(runDir, 'import.json'), imported);
    if (!imported.ok) {
      throw new Error('Import failed. See import.json');
    }

    const postCounts = await snapshotTenant(owner.tenantId, runDir, 'post-import');
    const deleted = await wipeTenant(owner.tenantId);
    writeJson(path.join(runDir, 'wipe.json'), {
      tenantId: owner.tenantId,
      deleted,
    });
    const postWipeCounts = await snapshotTenant(owner.tenantId, runDir, 'post-wipe');

    const summary = [
      `Run Dir: ${runDir}`,
      `Tenant ID: ${owner.tenantId}`,
      `Owner Email: ${ownerEmail}`,
      `Owner Password: ${ownerPassword}`,
      `Master CSV: ${masterCsv}`,
      `Converted CSV: ${convertedCsv}`,
      '',
      `Pre-import counts: ${JSON.stringify(preCounts)}`,
      `Post-import counts: ${JSON.stringify(postCounts)}`,
      `Wipe deleted: ${JSON.stringify(deleted)}`,
      `Post-wipe counts: ${JSON.stringify(postWipeCounts)}`,
    ].join('\n');
    fs.writeFileSync(path.join(runDir, 'SUMMARY.txt'), summary, 'utf8');
    console.log(summary);
  } finally {
    await mongoose.connection.close();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
