const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { FlutterwaveTransferLog } = require('../models');
const ApiError = require('../utils/ApiError');

const listTransferLogs = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 25,
    sortBy = 'createdAt',
    order = 'desc',
    status,
    tenantId,
    paymentReference,
    providerTransferId,
    from,
    to,
  } = req.query;

  const filter = {};

  if (status) filter.status = status;
  if (tenantId) filter.tenantId = tenantId;
  if (paymentReference) filter.paymentReference = paymentReference;
  if (providerTransferId) filter['response.providerTransferId'] = providerTransferId;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { [sortBy]: order === 'desc' ? -1 : 1 },
  };

  const result = await FlutterwaveTransferLog.paginate(filter, options);

  res.status(httpStatus.OK).send({
    ok: true,
    data: result.docs,
    pagination: {
      total: result.totalDocs,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    },
  });
});

const getTransferLog = catchAsync(async (req, res) => {
  const { id } = req.params;
  const log = await FlutterwaveTransferLog.findById(id);

  if (!log) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Transfer log not found');
  }

  res.status(httpStatus.OK).send({ ok: true, data: log });
});

const getTransferLogsBySettlement = catchAsync(async (req, res) => {
  const { settlementId } = req.params;
  const logs = await FlutterwaveTransferLog.find({ settlementId })
    .sort({ createdAt: -1 })
    .lean();

  res.status(httpStatus.OK).send({ ok: true, data: logs });
});

const getTransferLogsByPayment = catchAsync(async (req, res) => {
  const { paymentReference } = req.params;
  const logs = await FlutterwaveTransferLog.find({ paymentReference })
    .sort({ createdAt: -1 })
    .lean();

  res.status(httpStatus.OK).send({ ok: true, data: logs });
});

const getTransferStats = catchAsync(async (req, res) => {
  const { tenantId } = req.query;
  const filter = tenantId ? { tenantId } : {};

  const [
    total,
    initiated,
    successful,
    failed,
    queued,
    processing,
  ] = await Promise.all([
    FlutterwaveTransferLog.countDocuments({}),
    FlutterwaveTransferLog.countDocuments({ status: 'initiated' }),
    FlutterwaveTransferLog.countDocuments({ status: 'successful' }),
    FlutterwaveTransferLog.countDocuments({ status: 'failed' }),
    FlutterwaveTransferLog.countDocuments({ status: 'transfer_queued' }),
    FlutterwaveTransferLog.countDocuments({ status: 'processing' }),
  ]);

  const totalAmountResult = await FlutterwaveTransferLog.aggregate([
    { $match: { 'response.success': true } },
    { $group: { _id: null, total: { $sum: '$response.transferAmount' } } },
  ]);

  const failedAmountResult = await FlutterwaveTransferLog.aggregate([
    { $match: { status: 'failed' } },
    { $group: { _id: null, total: { $sum: '$request.amount' } } },
  ]);

  const totalTransferred = totalAmountResult[0]?.total || 0;
  const failedAmount = failedAmountResult[0]?.total || 0;

  res.status(httpStatus.OK).send({
    ok: true,
    data: {
      total,
      byStatus: {
        initiated,
        successful,
        failed,
        queued,
        processing,
      },
      totalTransferred,
      failedAmount,
    },
  });
});

const exportTransferLogs = catchAsync(async (req, res) => {
  const { format = 'csv' } = req.query;
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.tenantId) filter.tenantId = req.query.tenantId;
  if (req.query.paymentReference) filter.paymentReference = req.query.paymentReference;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const logs = await FlutterwaveTransferLog.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  if (format === 'csv') {
    const headers = [
      'ID',
      'Created At',
      'Status',
      'Settlement ID',
      'Payment Reference',
      'Tenant ID',
      'Request Reference',
      'Amount',
      'Currency',
      'Account Number',
      'Bank Code',
      'Bank Name',
      'Beneficiary Name',
      'Response Status Code',
      'Success',
      'Provider Transfer ID',
      'Provider Reference',
      'Flutterwave Status',
      'Transfer Fee',
      'Transfer Amount',
      'Bank Name',
      'Full Name',
      'Error Message',
      'Created At',
    ];

    const rows = logs.map((log) => [
      log._id,
      log.createdAt,
      log.status,
      log.settlementId || '',
      log.paymentReference || '',
      log.tenantId || '',
      log.request?.reference || '',
      log.request?.amount || '',
      log.request?.currency || '',
      log.request?.accountNumber || '',
      log.request?.bankCode || '',
      log.request?.bankName || '',
      log.request?.beneficiaryName || '',
      log.response?.statusCode || '',
      log.response?.success || '',
      log.response?.providerTransferId || '',
      log.response?.providerReference || '',
      log.response?.flutterwaveStatus || '',
      log.response?.transferFee || '',
      log.response?.transferAmount || '',
      log.response?.bankName || '',
      log.response?.fullName || '',
      log.error?.message || '',
      log.createdAt,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="flutterwave-transfer-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(httpStatus.OK).send(csv);
  }

  res.status(httpStatus.OK).send({ ok: true, data: logs });
});

module.exports = {
  listTransferLogs,
  getTransferLog,
  getTransferLogsBySettlement,
  getTransferLogsByPayment,
  getTransferStats,
  exportTransferLogs,
};