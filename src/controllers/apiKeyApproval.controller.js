const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { apiKeyApprovalService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Get pending approvals (SabyUser only)
 * @param {Object} req.query - Query parameters
 * @returns {Object} Paginated pending approvals
 */
const getPendingApprovals = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['tenant', 'category']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const result = await apiKeyApprovalService.getPendingApprovals(
    filter,
    options
  );

  res.send(result);
});

/**
 * Get all approvals (filtered)
 * @param {Object} req.query - Query parameters
 * @returns {Object} Paginated approvals
 */
const getApprovals = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['tenant', 'status', 'category']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const result = await apiKeyApprovalService.getApprovals(filter, options);

  res.send(result);
});

/**
 * Approve API key (SabyUser only)
 * @param {string} req.params.approvalId - Approval ID
 * @param {string} req.body.notes - Optional approval notes
 * @returns {Object} Updated approval
 */
const approveApiKey = catchAsync(async (req, res) => {
  const { approvalId } = req.params;
  const { notes } = req.body;
  const sabyUserId = req.user._id;

  const approval = await apiKeyApprovalService.approveApiKey(
    approvalId,
    sabyUserId,
    notes
  );

  res.send({
    message: 'API key approved successfully',
    approval,
  });
});

/**
 * Reject API key (SabyUser only)
 * @param {string} req.params.approvalId - Approval ID
 * @param {string} req.body.reason - Rejection reason
 * @returns {Object} Updated approval
 */
const rejectApiKey = catchAsync(async (req, res) => {
  const { approvalId } = req.params;
  const { reason } = req.body;
  const sabyUserId = req.user._id;

  if (!reason) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Rejection reason is required');
  }

  const approval = await apiKeyApprovalService.rejectApiKey(
    approvalId,
    sabyUserId,
    reason
  );

  res.send({
    message: 'API key rejected',
    approval,
  });
});

/**
 * Get production keys (Go Live table)
 * @param {Object} req.query - Query parameters
 * @returns {Object} Paginated production keys
 */
const getProductionKeys = catchAsync(async (req, res) => {
  const { user } = req;
  const tenantId = user.isSaby ? null : user.tenantId;

  const filter = pick(req.query, ['category', 'tenant']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const result = await apiKeyApprovalService.getProductionKeys(
    tenantId,
    filter,
    options
  );

  res.send(result);
});

module.exports = {
  getPendingApprovals,
  getApprovals,
  approveApiKey,
  rejectApiKey,
  getProductionKeys,
};
