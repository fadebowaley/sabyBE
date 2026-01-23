/**
 * Validation Report Controller
 *
 * HTTP endpoints for validation reporting and management.
 *
 * @module controllers/validationReport
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const validationReportService = require('../services/validationReport.service');
const pick = require('../utils/pick');

/**
 * GET /v1/validation-reports
 * Get validations with filters and pagination
 */
const getValidations = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'submission_id',
    'category',
    'severity',
    'is_valid',
  ]);

  const options = pick(req.query, ['limit', 'offset']);

  const result = await validationReportService.getValidations(filters, options);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validations retrieved successfully',
    data: result.results,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: result.pages,
    },
  });
});

/**
 * GET /v1/validation-reports/:id
 * Get validation by ID
 */
const getValidationById = catchAsync(async (req, res) => {
  const validation = await validationReportService.getValidationById(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validation retrieved successfully',
    data: validation,
  });
});

/**
 * GET /v1/validation-reports/submission/:id
 * Get validations by submission
 */
const getValidationsBySubmission = catchAsync(async (req, res) => {
  const validations = await validationReportService.getValidationsBySubmission(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validations retrieved successfully',
    data: validations,
    count: validations.length,
  });
});

/**
 * GET /v1/validation-reports/failed
 * Get failed validations
 */
const getFailedValidations = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'category',
    'severity',
    'limit',
    'offset',
  ]);

  const validations = await validationReportService.getFailedValidations(
    filters
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Failed validations retrieved successfully',
    data: validations,
    count: validations.length,
  });
});

/**
 * GET /v1/validation-reports/stats
 * Get validation statistics
 */
const getValidationStats = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const stats = await validationReportService.getValidationStats(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validation statistics retrieved successfully',
    data: stats,
  });
});

/**
 * GET /v1/validation-reports/errors
 * Get validation errors within date range
 */
const getValidationErrors = catchAsync(async (req, res) => {
  const { tenant_id, start_date, end_date } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const errors = await validationReportService.getValidationErrors(tenant_id, {
    start_date,
    end_date,
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validation errors retrieved successfully',
    data: errors,
    count: errors.length,
  });
});

/**
 * PATCH /v1/validation-reports/:id/resolve
 * Resolve validation
 */
const resolveValidation = catchAsync(async (req, res) => {
  const { resolution_note } = req.body;
  const user_id = req.user?.id || 'system';

  const resolved = await validationReportService.resolveValidation(
    req.params.id,
    user_id,
    resolution_note
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validation resolved successfully',
    data: resolved,
  });
});

/**
 * POST /v1/validation-reports/bulk-resolve
 * Bulk resolve validations
 */
const bulkResolveValidations = catchAsync(async (req, res) => {
  const { ids, resolution_note } = req.body;
  const user_id = req.user?.id || 'system';

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'ids array is required',
    });
  }

  const result = await validationReportService.bulkResolveValidations(
    ids,
    user_id,
    resolution_note
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `${result.resolved_count} validation(s) resolved successfully`,
    data: result,
  });
});

/**
 * DELETE /v1/validation-reports/:id
 * Delete validation
 */
const deleteValidation = catchAsync(async (req, res) => {
  const deleted = await validationReportService.deleteValidation(req.params.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validation deleted successfully',
    data: deleted,
  });
});

module.exports = {
  getValidations,
  getValidationById,
  getValidationsBySubmission,
  getFailedValidations,
  getValidationStats,
  getValidationErrors,
  resolveValidation,
  bulkResolveValidations,
  deleteValidation,
};
