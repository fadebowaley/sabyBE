const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const ALLOWED_COLUMNS = new Set([
  'id', 'tenant_id', 'user_id', 'user_name', 'user_email',
  'action', 'resource', 'resource_id',
  'method', 'path', 'status_code', 'ip_address', 'user_agent',
  'duration_ms', 'error_message', 'correlation_id', 'source', 'created_at',
]);

const TEXT_SEARCH_COLUMNS = [
  'user_name', 'user_email', 'action', 'resource', 'resource_id', 'path',
];

const getAuditTrail = catchAsync(async (req, res) => {
  const {
    tenantId,
    userId,
    action,
    resource,
    resourceId,
    method,
    statusCode,
    ipAddress,
    from,
    to,
    path,
    search,
    sortBy = 'created_at',
    order = 'desc',
    limit = 50,
    page = 1,
  } = req.query;

  // Tenant scope — non-super users only see their own tenant
  const effectiveTenantId =
    (req.user?.isSuper || req.user?.isSaby) && tenantId
      ? tenantId
      : req.user?.tenantId;

  if (!effectiveTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  if (!ALLOWED_COLUMNS.has(sortBy)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid sortBy: ${sortBy}`);
  }

  const conditions = ['tenant_id = $1'];
  const params = [effectiveTenantId];
  let paramIndex = 2;

  if (userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(userId);
  }
  if (action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(action);
  }
  if (resource) {
    conditions.push(`resource = $${paramIndex++}`);
    params.push(resource);
  }
  if (resourceId) {
    conditions.push(`resource_id = $${paramIndex++}`);
    params.push(resourceId);
  }
  if (method) {
    conditions.push(`method = $${paramIndex++}`);
    params.push(method);
  }
  if (statusCode) {
    conditions.push(`status_code = $${paramIndex++}`);
    params.push(Number(statusCode));
  }
  if (ipAddress) {
    conditions.push(`ip_address = $${paramIndex++}`);
    params.push(ipAddress);
  }
  if (from) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(to);
  }
  if (path) {
    conditions.push(`path ILIKE $${paramIndex++}`);
    params.push(`%${path}%`);
  }
  if (search) {
    const searchClauses = TEXT_SEARCH_COLUMNS.map(
      (col) => `${col}::text ILIKE $${paramIndex}`
    );
    conditions.push(`(${searchClauses.join(' OR ')})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const countResult = await postgresPool.query(
    `SELECT COUNT(*)::int AS total FROM public.audit_trail WHERE ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  const dataResult = await postgresPool.query(
    `SELECT *
     FROM public.audit_trail
     WHERE ${whereClause}
     ORDER BY ${sortBy} ${order === 'asc' ? 'ASC' : 'DESC'}
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );

  res.status(httpStatus.OK).send({
    results: dataResult.rows,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}, { resource: 'audit_trail', action: 'read' });

const exportAuditTrail = catchAsync(async (req, res) => {
  const {
    tenantId,
    from,
    to,
    resource,
    action,
    format = 'json',
  } = req.query;

  const effectiveTenantId =
    (req.user?.isSuper || req.user?.isSaby) && tenantId
      ? tenantId
      : req.user?.tenantId;

  if (!effectiveTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const conditions = ['tenant_id = $1'];
  const params = [effectiveTenantId];
  let paramIndex = 2;

  if (from) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(to);
  }
  if (resource) {
    conditions.push(`resource = $${paramIndex++}`);
    params.push(resource);
  }
  if (action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(action);
  }

  const whereClause = conditions.join(' AND ');

  const result = await postgresPool.query(
    `SELECT *
     FROM public.audit_trail
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT 10000`,
    params
  );

  if (format === 'csv') {
    const rows = result.rows;
    if (!rows.length) {
      res.setHeader('Content-Type', 'text/csv');
      return res.status(httpStatus.OK).send('');
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(',')
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.status(httpStatus.OK).send(csv);
  }

  res.status(httpStatus.OK).send({
    results: result.rows,
    total: result.rows.length,
  });
}, { resource: 'audit_trail', action: 'export' });

module.exports = {
  getAuditTrail,
  exportAuditTrail,
};
