const { postgresPool } = require('../config/postgres');
const { Subscription, User, Nodes, ProjectForm, Storage } = require('../models');

const startOfMonth = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const endOfMonth = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);

const resolveUsageWindow = (subscription = null) => {
  const start = subscription?.currentPeriodStart
    ? new Date(subscription.currentPeriodStart)
    : startOfMonth(new Date());
  const end = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : endOfMonth(start);

  return { start, end };
};

const PUBLIC_UPLOAD_TABLE = 'public_form_uploads';

const getPublicUploadStorageAggregate = async (tenantId) => {
  const tableResult = await postgresPool.query(
    `SELECT to_regclass('public.${PUBLIC_UPLOAD_TABLE}') AS table_name`
  );
  const tableName = tableResult.rows?.[0]?.table_name || null;
  if (!tableName) {
    return { totalBytes: 0, totalFiles: 0 };
  }

  const aggregateResult = await postgresPool.query(
    `
      SELECT
        COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes,
        COUNT(*)::int AS total_files
      FROM ${PUBLIC_UPLOAD_TABLE}
      WHERE tenant_id = $1
        AND status IN ('uploaded_pending_verification', 'uploaded', 'submitted')
    `,
    [tenantId]
  );

  return {
    totalBytes: Number(aggregateResult.rows?.[0]?.total_bytes || 0),
    totalFiles: Number(aggregateResult.rows?.[0]?.total_files || 0),
  };
};

const collectTenantUsage = async ({ tenantId, subscription = null }) => {
  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId) {
    return null;
  }

  const { start, end } = resolveUsageWindow(subscription);
  const billableProjectFormFilter = {
    tenantId: normalizedTenantId,
    deletedAt: null,
    'identity.category': { $ne: 'system' },
    'identity.status': { $nin: ['archived'] },
    status: { $nin: ['archived'] },
  };

  const [
    seats,
    nodes,
    forms,
    storageAggregate,
    publicUploadAggregate,
    submissionResult,
  ] = await Promise.all([
    User.countDocuments({ tenantId: normalizedTenantId, deletedAt: null }),
    Nodes.countDocuments({ tenantId: normalizedTenantId, deletedAt: null }),
    ProjectForm.countDocuments(billableProjectFormFilter),
    Storage.aggregate([
      {
        $match: {
          tenantId: normalizedTenantId,
          status: { $ne: 'deleted' },
        },
      },
      {
        $group: {
          _id: null,
          totalBytes: { $sum: '$fileSize' },
          totalFiles: { $sum: 1 },
        },
      },
    ]),
    getPublicUploadStorageAggregate(normalizedTenantId),
    postgresPool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM form_submissions
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at < $3
          AND COALESCE(status, '') <> 'deleted'
      `,
      [normalizedTenantId, start.toISOString(), end.toISOString()]
    ),
  ]);

  const storageRow = Array.isArray(storageAggregate) ? storageAggregate[0] || {} : {};
  const totalStorageBytes =
    Number(storageRow.totalBytes || 0) + Number(publicUploadAggregate.totalBytes || 0);
  const systemCounters = subscription?.usageCounters?.system || {};
  const manualCounters = subscription?.usageCounters?.manual || {};

  return {
    seats,
    nodes,
    forms,
    totalFiles:
      Number(storageRow.totalFiles || 0) + Number(publicUploadAggregate.totalFiles || 0),
    storageBytes: totalStorageBytes,
    storageMb: Math.round((totalStorageBytes / (1024 * 1024)) * 100) / 100,
    submissionsCurrentPeriod: Number(submissionResult.rows?.[0]?.total || 0),
    apiCallsCurrentHour: Number(systemCounters.apiCallsCurrentHour || 0),
    emailsCurrentPeriod: Number(systemCounters.emailsCurrentPeriod || 0),
    smsCurrentPeriod: Number(systemCounters.smsCurrentPeriod || 0),
    manual: manualCounters,
    window: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    refreshedAt: new Date().toISOString(),
  };
};

const refreshUsageSnapshot = async (tenantId) => {
  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId) {
    return null;
  }

  const subscription = await Subscription.findOne({ tenantId: normalizedTenantId });
  if (!subscription) {
    return null;
  }

  const usage = await collectTenantUsage({
    tenantId: normalizedTenantId,
    subscription,
  });

  subscription.usageCounters = {
    ...(subscription.usageCounters || {}),
    system: {
      ...(subscription.usageCounters?.system || {}),
      ...usage,
    },
  };
  await subscription.save();

  return usage;
};

const incrementUsageCounter = async ({
  tenantId,
  counterKey,
  delta = 1,
}) => {
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedCounterKey = String(counterKey || '').trim();
  if (!normalizedTenantId || !normalizedCounterKey) {
    return null;
  }

  const path = `usageCounters.system.${normalizedCounterKey}`;
  return Subscription.findOneAndUpdate(
    { tenantId: normalizedTenantId },
    {
      $inc: {
        [path]: Number(delta || 0),
      },
      $set: {
        'usageCounters.system.lastIncrementedAt': new Date().toISOString(),
      },
    },
    {
      new: true,
    }
  );
};

module.exports = {
  collectTenantUsage,
  refreshUsageSnapshot,
  incrementUsageCounter,
};
