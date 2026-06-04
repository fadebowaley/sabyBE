const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');
const calendarEnforcementService = require('./calendarEnforcement.service');
const {
  ensureRollupTables,
} = require('./incrementalSubmissionRollup.service');

const parseLimit = (value) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, 500);
};

const parseOffset = (value) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const buildRollupQuery = (tableName, bucketColumn, filters = {}) => {
  const where = [];
  const values = [];
  let idx = 1;

  if (filters.tenant_id) {
    where.push(`${bucketColumnTableAlias(bucketColumn)}tenant_id = $${idx++}`);
    values.push(filters.tenant_id);
  }
  if (filters.project_id) {
    where.push(`${bucketColumnTableAlias(bucketColumn)}project_id = $${idx++}`);
    values.push(filters.project_id);
  }
  if (filters.node_id) {
    where.push(`${bucketColumnTableAlias(bucketColumn)}node_id = $${idx++}`);
    values.push(filters.node_id);
  }
  if (filters.start_date) {
    where.push(`${bucketColumn} >= $${idx++}`);
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    where.push(`${bucketColumn} <= $${idx++}`);
    values.push(filters.end_date);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = parseLimit(filters.limit);
  const offset = parseOffset(filters.offset);

  const query = `
    SELECT *, COUNT(*) OVER () AS total_count
    FROM ${tableName}
    ${whereClause}
    ORDER BY ${bucketColumn} DESC
    LIMIT $${idx++} OFFSET $${idx}
  `;

  values.push(limit, offset);

  return { query, values };
};

const bucketColumnTableAlias = (bucketColumn) => {
  switch (bucketColumn) {
    case 'day_bucket':
      return '';
    case 'week_bucket':
      return '';
    case 'month_bucket':
      return '';
    default:
      return '';
  }
};

const formatRollupResult = (rows = [], sourceLabel = null) => {
  if (!rows.length) {
    return { results: [], total: 0 };
  }

  const total = Number(rows[0].total_count) || rows.length;
  const formatted = rows.map(({ total_count, ...rest }) => ({
    ...rest,
    ...(sourceLabel ? { rollup_source: sourceLabel } : {}),
  }));

  return { results: formatted, total };
};

const getRollup = async (tableName, bucketColumn, filters = {}, sourceLabel = null) => {
  await ensureRollupTables();
  const { query, values } = buildRollupQuery(tableName, bucketColumn, filters);
  const { rows } = await postgresPool.query(query, values);
  return formatRollupResult(rows, sourceLabel);
};

const getDailyRollup = (filters = {}) =>
  getRollup('submission_rollup_daily', 'day_bucket', filters, 'Incremental daily rollup');

const getWeeklyRollup = (filters = {}) =>
  getRollup('submission_rollup_weekly', 'week_bucket', filters, 'Incremental weekly rollup');

const getMonthlyRollup = (filters = {}) =>
  getRollup('submission_rollup_monthly', 'month_bucket', filters, 'Incremental monthly rollup');

const getSubmissionStatus = async (filters = {}) => {
  const { tenant_id, project_id, node_id } = filters;
  if (!project_id) {
    throw new ApiError(400, 'project_id is required');
  }

  const tenantId = tenant_id;
  if (!tenantId) {
    throw new ApiError(400, 'tenant_id is required');
  }

  const status = await calendarEnforcementService.getSubmissionWindowStatus({
    tenantId,
    projectId: project_id,
    nodeId: node_id || null,
  });

  return status;
};

module.exports = {
  getDailyRollup,
  getWeeklyRollup,
  getMonthlyRollup,
  getSubmissionStatus,
};
