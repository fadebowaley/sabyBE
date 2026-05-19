const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const rollupReportService = require('../services/rollupReport.service');

const buildFilters = (req) =>
  pick(req.query, [
    'tenant_id',
    'project_id',
    'node_id',
    'start_date',
    'end_date',
    'limit',
    'offset',
  ]);

const applyTenantScope = (req, filters) => {
  if (!filters.tenant_id && req.user?.tenantId) {
    return { ...filters, tenant_id: req.user.tenantId };
  }
  return filters;
};

const getDailyRollup = catchAsync(async (req, res) => {
  const filters = applyTenantScope(req, buildFilters(req));
  const data = await rollupReportService.getDailyRollup(filters);
  res.status(httpStatus.OK).send({ success: true, ...data });
});

const getWeeklyRollup = catchAsync(async (req, res) => {
  const filters = applyTenantScope(req, buildFilters(req));
  const data = await rollupReportService.getWeeklyRollup(filters);
  res.status(httpStatus.OK).send({ success: true, ...data });
});

const getMonthlyRollup = catchAsync(async (req, res) => {
  const filters = applyTenantScope(req, buildFilters(req));
  const data = await rollupReportService.getMonthlyRollup(filters);
  res.status(httpStatus.OK).send({ success: true, ...data });
});

const getSubmissionStatus = catchAsync(async (req, res) => {
  const filters = applyTenantScope(req, buildFilters(req));
  const status = await rollupReportService.getSubmissionStatus(filters);
  res.status(httpStatus.OK).send({ success: true, status });
});

module.exports = {
  getDailyRollup,
  getWeeklyRollup,
  getMonthlyRollup,
  getSubmissionStatus,
};
