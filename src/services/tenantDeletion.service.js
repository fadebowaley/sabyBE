const crypto = require('crypto');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const models = require('../models');
const { postgresPool } = require('../config/postgres');

const MONGO_MODEL_EXCLUDES = new Set([
  'SubscriptionCatalog',
  'ExecutiveIntelligenceAuditEvent',
]);

const POSTGRES_TABLE_EXCLUDES = new Set([
  'schema_migrations',
  'knex_migrations',
  'knex_migrations_lock',
]);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const getSecurityKey = () =>
  String(
    process.env.TENANT_DELETION_SECURITY_KEY ||
      process.env.SABY_TENANT_DELETE_KEY ||
      ''
  );

const assertSecurityKey = (candidate) => {
  const expected = getSecurityKey();
  if (!expected) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Tenant deletion security key is not configured.'
    );
  }
  const supplied = String(candidate || '').trim();
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid tenant deletion security key.');
  }
};

const normalizeTenantId = (tenantId) => {
  const normalized = String(tenantId || '').trim();
  if (!normalized) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required.');
  }
  return normalized;
};

const getTenantMongoModels = () =>
  Object.entries(models)
    .filter(([name, Model]) => {
      if (MONGO_MODEL_EXCLUDES.has(name)) return false;
      return Boolean(Model?.schema?.path?.('tenantId') && Model.countDocuments);
    })
    .sort(([a], [b]) => a.localeCompare(b));

const countMongo = async (tenantId) => {
  const counts = {};
  const tenantModels = getTenantMongoModels();
  await Promise.all(
    tenantModels.map(async ([name, Model]) => {
      counts[name] = await Model.countDocuments({ tenantId });
    })
  );

  const users = models.User?.find ? await models.User.find({ tenantId }).select('_id').lean() : [];
  const userIds = users.map((user) => user._id);
  counts.Token = userIds.length && models.Token?.countDocuments
    ? await models.Token.countDocuments({ user: { $in: userIds } })
    : 0;

  return counts;
};

const getTenantPostgresTables = async () => {
  const result = await postgresPool.query(
    `SELECT DISTINCT c.table_schema, c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
      WHERE c.column_name = 'tenant_id'
        AND t.table_type = 'BASE TABLE'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY c.table_schema, c.table_name`
  );
  return result.rows.filter((row) => {
    const key = `${row.table_schema}.${row.table_name}`;
    return !POSTGRES_TABLE_EXCLUDES.has(row.table_name) && !POSTGRES_TABLE_EXCLUDES.has(key);
  });
};

const countPostgres = async (tenantId) => {
  const counts = {};
  const tables = await getTenantPostgresTables();
  for (const table of tables) {
    const tableRef = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await postgresPool.query(
        `SELECT COUNT(*)::int AS count FROM ${tableRef} WHERE tenant_id = $1`,
        [tenantId]
      );
      counts[`${table.table_schema}.${table.table_name}`] = Number(result.rows?.[0]?.count || 0);
    } catch (error) {
      counts[`${table.table_schema}.${table.table_name}`] = {
        error: error.message,
      };
    }
  }
  return counts;
};

const previewTenantDeletion = async (tenantId) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const [mongo, postgres] = await Promise.all([
    countMongo(normalizedTenantId),
    countPostgres(normalizedTenantId),
  ]);
  return {
    tenantId: normalizedTenantId,
    mongo,
    postgres,
    totals: {
      mongo: Object.values(mongo).reduce(
        (sum, value) => sum + (typeof value === 'number' ? value : 0),
        0
      ),
      postgres: Object.values(postgres).reduce(
        (sum, value) => sum + (typeof value === 'number' ? value : 0),
        0
      ),
    },
  };
};

const deletePostgresTenantData = async (tenantId) => {
  const tables = await getTenantPostgresTables();
  const client = await postgresPool.connect();
  const deleted = {};
  try {
    await client.query('BEGIN');
    for (const table of tables.reverse()) {
      const tableRef = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`;
      // eslint-disable-next-line no-await-in-loop
      const result = await client.query(`DELETE FROM ${tableRef} WHERE tenant_id = $1`, [tenantId]);
      deleted[`${table.table_schema}.${table.table_name}`] = Number(result.rowCount || 0);
    }
    await client.query('COMMIT');
    return deleted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const deleteMongoTenantData = async (tenantId) => {
  const deleted = {};
  const users = models.User?.find ? await models.User.find({ tenantId }).select('_id').lean() : [];
  const userIds = users.map((user) => user._id);

  if (userIds.length && models.Token?.deleteMany) {
    const tokenResult = await models.Token.deleteMany({ user: { $in: userIds } });
    deleted.Token = Number(tokenResult.deletedCount || 0);
  } else {
    deleted.Token = 0;
  }

  const tenantModels = getTenantMongoModels().filter(([name]) => name !== 'Token');
  for (const [name, Model] of tenantModels) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Model.deleteMany({ tenantId });
    deleted[name] = Number(result.deletedCount || 0);
  }
  return deleted;
};

const deleteTenant = async ({ tenantId, securityKey, confirmation, actor = {} }) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  assertSecurityKey(securityKey);

  const normalizedConfirmation = String(confirmation || '').trim();
  if (normalizedConfirmation !== normalizedTenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Type the exact tenant ID to confirm deletion.'
    );
  }

  const preview = await previewTenantDeletion(normalizedTenantId);
  const startedAt = Date.now();
  const postgres = await deletePostgresTenantData(normalizedTenantId);
  const mongo = await deleteMongoTenantData(normalizedTenantId);

  await models.ExecutiveIntelligenceAuditEvent.create({
    tenantId: normalizedTenantId,
    userId: actor.userId ? String(actor.userId) : null,
    component: 'tenant-deletion',
    action: 'delete_tenant',
    status: 'completed',
    durationMs: Date.now() - startedAt,
    inputReferences: {
      tenantId: normalizedTenantId,
      previewTotals: preview.totals,
    },
    outputReferences: {
      deleted: { mongo, postgres },
    },
    metadata: {
      actorEmail: actor.email || null,
      irreversible: true,
    },
  });

  return {
    tenantId: normalizedTenantId,
    preview,
    deleted: {
      mongo,
      postgres,
    },
  };
};

module.exports = {
  previewTenantDeletion,
  deleteTenant,
};
