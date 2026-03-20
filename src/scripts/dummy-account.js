#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const axios = require('axios');
const config = require('../config/config');
const { postgresPool } = require('../config/postgres');
const models = require('../models');

const {
  User,
  Token,
  Nodes,
} = models;

const DEFAULT_PASSWORD_PREFIX = 'TempPass';
const DEFAULT_DOMAIN = 'example.test';
const BACKUP_DIR = path.join(__dirname, '../../artifacts/dummy-account-backups');

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    if (body.includes('=')) {
      const [key, ...rest] = body.split('=');
      out[key] = rest.join('=');
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[body] = next;
      i += 1;
    } else {
      out[body] = 'true';
    }
  }
  return out;
};

const toBool = (value, fallback = false) => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
};

const nowStamp = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
};

const randomString = (length = 6) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const buildGeneratedCredentials = ({ email, password, domain }) => {
  const baseDomain = String(domain || DEFAULT_DOMAIN).trim().toLowerCase();
  const stamp = Date.now();
  const id = randomString(5);
  const generatedEmail =
    email && String(email).trim()
      ? String(email).trim().toLowerCase()
      : `dummy.owner.${stamp}.${id}@${baseDomain}`;
  const generatedPassword =
    password && String(password).trim()
      ? String(password).trim()
      : `${DEFAULT_PASSWORD_PREFIX}${String(stamp).slice(-6)}!`;
  return { email: generatedEmail, password: generatedPassword };
};

const maskMongoUrl = (url) => {
  const input = String(url || '');
  return input.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');
};

const sanitizeModelName = (name) => String(name || '').replace(/[^\w.-]/g, '_');

const getTenantScopedModels = () =>
  Object.entries(models)
    .filter(([, model]) => model && model.schema && model.schema.path('tenantId'))
    .map(([name, model]) => ({ name, model }));

const backupTenantData = async ({ tenantId, email, outDir }) => {
  const scopedModels = getTenantScopedModels();
  const snapshot = {
    tenantId,
    email,
    createdAt: new Date().toISOString(),
    collections: {},
    counts: {},
  };

  for (const { name, model } of scopedModels) {
    // eslint-disable-next-line no-await-in-loop
    const docs = await model.find({ tenantId }).lean();
    snapshot.collections[name] = docs;
    snapshot.counts[name] = docs.length;
  }

  const users = await User.find({ tenantId }).select('_id').lean();
  const userIds = users.map((user) => user._id);
  const tokens = userIds.length
    ? await Token.find({ user: { $in: userIds } }).lean()
    : [];
  snapshot.collections.Token = tokens;
  snapshot.counts.Token = tokens.length;

  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(
    outDir,
    `tenant-${sanitizeModelName(tenantId)}-${nowStamp()}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');
  return { outputPath, counts: snapshot.counts };
};

const purgeTenantMongo = async (tenantId) => {
  const deleted = {};
  const scopedModels = getTenantScopedModels();
  const users = await User.find({ tenantId }).select('_id').lean();
  const userIds = users.map((user) => user._id);

  if (userIds.length) {
    const tokenResult = await Token.deleteMany({ user: { $in: userIds } });
    deleted.Token = tokenResult.deletedCount || 0;
  } else {
    deleted.Token = 0;
  }

  for (const { name, model } of scopedModels) {
    // eslint-disable-next-line no-await-in-loop
    const result = await model.deleteMany({ tenantId });
    deleted[name] = result.deletedCount || 0;
  }

  return deleted;
};

const purgeTenantPostgres = async (tenantId) => {
  const client = await postgresPool.connect();
  const summary = { attempted: 0, deletedRows: {}, errors: {} };
  try {
    const query = `
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND column_name IN ('tenant_id', 'tenantid', 'tenantId')
      ORDER BY table_schema, table_name
    `;
    const { rows } = await client.query(query);

    for (const row of rows) {
      const schema = row.table_schema;
      const table = row.table_name;
      const column = row.column_name;
      const key = `${schema}.${table}`;
      summary.attempted += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await client.query(
          `DELETE FROM "${schema}"."${table}" WHERE "${column}" = $1`,
          [tenantId]
        );
        summary.deletedRows[key] = Number(result.rowCount || 0);
      } catch (error) {
        summary.errors[key] = error.message;
      }
    }
    return summary;
  } finally {
    client.release();
  }
};

const createDummyOwner = async (args) => {
  const firstname = String(args.firstname || 'Dummy').trim();
  const lastname = String(args.lastname || 'Owner').trim();
  const phoneNumber = String(args.phone || '+2348000000000').trim();
  const { email, password } = buildGeneratedCredentials({
    email: args.email,
    password: args.password,
    domain: args.domain,
  });

  let user = await User.findOne({ email });
  let created = false;
  let effectivePassword = password;
  if (!user) {
    created = true;
    user = await User.createUser({
      firstname,
      lastname,
      email,
      password,
      isOwner: true,
      isSuper: true,
      isAgreed: true,
      phoneNumber,
    });
  } else if (toBool(args.resetPassword, false)) {
    user.password = password;
  } else {
    effectivePassword = '(unchanged-existing-user)';
  }

  user.otpVerified = true;
  user.status = true;
  user.isEmailVerified = true;
  user.isPhoneVerified = Boolean(user.phoneNumber);
  await user.save();

  const result = {
    action: 'create',
    ok: true,
    created,
    email,
    password: effectivePassword,
    userId: String(user._id),
    tenantId: String(user.tenantId),
    db: {
      mongodbUrl: maskMongoUrl(config.mongoose.url),
    },
    loginHint: 'Use /v1/auth/login with email + password',
  };
  const shouldCheckApiLogin = toBool(args.checkApiLogin, false);
  if (shouldCheckApiLogin) {
    const baseUrl = String(args.apiBaseUrl || 'http://localhost:4000/v1').replace(
      /\/+$/,
      ''
    );
    try {
      const response = await axios.post(
        `${baseUrl}/auth/login`,
        { email, password: effectivePassword },
        { timeout: 10000 }
      );
      result.apiLoginCheck = {
        ok: true,
        baseUrl,
        status: response.status,
      };
    } catch (error) {
      result.apiLoginCheck = {
        ok: false,
        baseUrl,
        status: error?.response?.status || null,
        message:
          error?.response?.data?.message || error?.message || 'Unknown login check error',
      };
    }
  }
  return result;
};

const deleteAccountResources = async (args) => {
  const email = String(args.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Missing --email for delete action');
  }
  const requireYes = toBool(args.yes, false);
  if (!requireYes) {
    throw new Error('Delete action requires --yes=true');
  }

  const user = await User.findOne({ email });
  if (!user) {
    return {
      action: 'delete',
      ok: true,
      email,
      message: 'User not found; nothing to delete.',
    };
  }

  const tenantId = String(user.tenantId || '');
  const isOwnerLike = Boolean(user.isOwner || user.isSuper || user.isSaby);
  const purgeTenant = toBool(args.purgeTenant, isOwnerLike);
  const backup = toBool(args.backup, purgeTenant);
  const purgePostgres = toBool(args.purgePostgres, purgeTenant);
  const output = {
    action: 'delete',
    ok: true,
    email,
    userId: String(user._id),
    tenantId,
    purgeTenant,
    backup,
    purgePostgres,
  };

  if (purgeTenant) {
    if (backup) {
      const outDir = String(args.backupDir || BACKUP_DIR);
      output.backup = await backupTenantData({ tenantId, email, outDir });
    }
    output.mongoDeleted = await purgeTenantMongo(tenantId);
    if (purgePostgres) {
      output.postgresDeleted = await purgeTenantPostgres(tenantId);
    }
    return output;
  }

  const nodePullResult = await Nodes.updateMany(
    { users: user._id },
    { $pull: { users: user._id } }
  );
  const tokenDeleted = await Token.deleteMany({ user: user._id });
  await User.deleteOne({ _id: user._id });
  output.partialDeleted = {
    users: 1,
    tokens: tokenDeleted.deletedCount || 0,
    nodeAssignmentsUpdated: nodePullResult.modifiedCount || 0,
  };
  return output;
};

const printHelp = () => {
  console.log(`
Dummy Account Utility

Create owner:
  node src/scripts/dummy-account.js create [--email=<email>] [--password=<password>] [--firstname=Dummy] [--lastname=Owner] [--phone=+234...] [--domain=example.test] [--checkApiLogin=true] [--apiBaseUrl=http://localhost:4000/v1]

Delete account + resources:
  node src/scripts/dummy-account.js delete --email=<email> --yes=true [--purgeTenant=true|false] [--backup=true|false] [--backupDir=<dir>] [--purgePostgres=true|false]

Notes:
  - If purgeTenant is true, all tenant Mongo resources are deleted.
  - If purgePostgres is true, all Postgres rows with tenant_id/tenantId/tenantid are deleted (best effort).
`);
};

const run = async () => {
  const args = parseArgs();
  const action = String(args.action || args._[0] || '').trim().toLowerCase();

  if (!action || ['help', '-h', '--help'].includes(action)) {
    printHelp();
    return;
  }

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  try {
    let result;
    if (action === 'create') {
      result = await createDummyOwner(args);
    } else if (action === 'delete') {
      result = await deleteAccountResources(args);
    } else {
      throw new Error(`Unknown action "${action}". Use create|delete.`);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await mongoose.connection.close();
    await postgresPool.end().catch(() => null);
  }
};

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
