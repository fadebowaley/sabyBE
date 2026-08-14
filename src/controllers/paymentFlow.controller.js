const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const paymentFlowService = require('../services/paymentFlow.service');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const getPaymentFlow = catchAsync(async (req, res) => {
  const effectiveTenantId =
    (req.user?.isSuper || req.user?.isSaby) && req.query.tenantId
      ? req.query.tenantId
      : req.user?.tenantId;

  if (!effectiveTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const data = await paymentFlowService.queryPaymentFlow({
    ...req.query,
    tenantId: effectiveTenantId,
  });

  res.status(httpStatus.OK).send(data);
}, { resource: 'payment_flow', action: 'read' });

const exportPaymentFlow = catchAsync(async (req, res) => {
  const effectiveTenantId =
    (req.user?.isSuper || req.user?.isSaby) && req.query.tenantId
      ? req.query.tenantId
      : req.user?.tenantId;

  if (!effectiveTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const data = await paymentFlowService.queryPaymentFlow({
    ...req.query,
    tenantId: effectiveTenantId,
    limit: 5000,
    page: 1,
  });

  const format = req.query.format || 'json';
  if (format === 'csv') {
    const rows = data.results;
    if (!rows.length) {
      res.setHeader('Content-Type', 'text/csv');
      return res.status(httpStatus.OK).send('');
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payment-flow-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(httpStatus.OK).send(csv);
  }

  res.status(httpStatus.OK).send(data);
}, { resource: 'payment_flow', action: 'export' });

module.exports = { getPaymentFlow, exportPaymentFlow };
