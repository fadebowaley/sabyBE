const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const DEFAULT_LIMIT = 50;

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, 200);
};

const createAuditExportJob = async ({
  tenantId,
  requestedBy,
  exportType,
  filters = {},
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!exportType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'exportType is required');
  }

  const result = await postgresPool.query(
    `INSERT INTO copilot.audit_export_jobs (
       tenant_id,
       requested_by,
       export_type,
       filters_json,
       status
     ) VALUES ($1, $2, $3, $4::jsonb, 'queued')
     RETURNING id, tenant_id, requested_by, export_type, filters_json, status, output_location, error_message, created_at, started_at, completed_at, updated_at`,
    [
      tenantId,
      requestedBy || null,
      exportType,
      JSON.stringify(filters || {}),
    ]
  );

  return result.rows[0];
};

const listAuditExportJobs = async ({ tenantId, status, limit }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const safeLimit = normalizeLimit(limit);
  const values = [tenantId];
  let whereClause = 'WHERE tenant_id = $1';

  if (status) {
    values.push(status);
    whereClause += ` AND status = $${values.length}`;
  }

  values.push(safeLimit);

  const result = await postgresPool.query(
    `SELECT id, tenant_id, requested_by, export_type, filters_json, status, output_location, error_message, created_at, started_at, completed_at, updated_at
     FROM copilot.audit_export_jobs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows;
};

const getAuditExportJobById = async ({ tenantId, jobId }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const result = await postgresPool.query(
    `SELECT id, tenant_id, requested_by, export_type, filters_json, status, output_location, error_message, created_at, started_at, completed_at, updated_at
     FROM copilot.audit_export_jobs
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, jobId]
  );

  if (!result.rows[0]) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Audit export job not found');
  }

  return result.rows[0];
};

module.exports = {
  createAuditExportJob,
  listAuditExportJobs,
  getAuditExportJobById,
};
