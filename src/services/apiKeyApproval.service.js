const httpStatus = require('http-status');
const { ApiKeyApproval, ApiKey } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Check if user can create API key with specific category
 * @param {Object} user - Current user
 * @param {string} category - API key category
 * @returns {boolean}
 */
const canCreateCategory = (user, category) => {
  const sabyUserOnlyCategories = ['internal', 'external', 'partner', 'system'];

  if (sabyUserOnlyCategories.includes(category)) {
    return user.isSaby === true;
  }

  return true; // web, api, mobile allowed for all
};

/**
 * Create approval request for production API key
 * @param {ApiKey} apiKey
 * @param {ObjectId} requestedBy
 * @param {string} tenantId
 * @returns {Promise<ApiKeyApproval>}
 */
const createApprovalRequest = async (apiKey, requestedBy, tenantId) => {
  const approval = await ApiKeyApproval.create({
    apiKey: apiKey._id,
    tenant: tenantId,
    requestedBy,
    status: 'pending',
    requestDetails: {
      label: apiKey.label,
      category: apiKey.category,
      environment: apiKey.environment,
      permissions: apiKey.permissions,
      rateLimit: apiKey.rateLimit,
    },
  });

  return approval;
};

/**
 * Get all pending approvals (SabyUser only)
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getPendingApprovals = async (filter = {}, options = {}) => {
  const combinedFilter = { status: 'pending', ...filter };
  return ApiKeyApproval.paginate(combinedFilter, {
    ...options,
    populate: 'apiKey requestedBy',
    sortBy: options.sortBy || 'createdAt:desc',
  });
};

/**
 * Get all approvals (with filters)
 * @param {Object} filter - Filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getApprovals = async (filter = {}, options = {}) =>
  ApiKeyApproval.paginate(filter, {
    ...options,
    populate: 'apiKey requestedBy approvedBy rejectedBy',
    sortBy: options.sortBy || 'createdAt:desc',
  });

/**
 * Approve API key (SabyUser only)
 * @param {ObjectId} approvalId
 * @param {ObjectId} sabyUserId
 * @param {string} notes
 * @returns {Promise<ApiKeyApproval>}
 */
const approveApiKey = async (approvalId, sabyUserId, notes = '') => {
  const approval = await ApiKeyApproval.findById(approvalId).populate('apiKey');

  if (!approval) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Approval request not found');
  }

  if (approval.status !== 'pending') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Approval request already processed'
    );
  }

  // Update approval
  approval.status = 'approved';
  approval.approvedBy = sabyUserId;
  approval.approvedAt = new Date();
  approval.notes = notes;
  await approval.save();

  // Activate the API key
  const apiKey = await ApiKey.findById(approval.apiKey._id || approval.apiKey);
  if (apiKey) {
    apiKey.isActive = true;
    apiKey.approvalStatus = 'approved';
    apiKey.approvedBy = sabyUserId;
    apiKey.approvedAt = new Date();
    apiKey.isProductionReady = true;
    await apiKey.save();
  }

  return approval;
};

/**
 * Reject API key (SabyUser only)
 * @param {ObjectId} approvalId
 * @param {ObjectId} sabyUserId
 * @param {string} reason
 * @returns {Promise<ApiKeyApproval>}
 */
const rejectApiKey = async (approvalId, sabyUserId, reason) => {
  const approval = await ApiKeyApproval.findById(approvalId).populate('apiKey');

  if (!approval) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Approval request not found');
  }

  if (approval.status !== 'pending') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Approval request already processed'
    );
  }

  // Update approval
  approval.status = 'rejected';
  approval.rejectedBy = sabyUserId;
  approval.rejectedAt = new Date();
  approval.rejectionReason = reason;
  await approval.save();

  // Update API key
  const apiKey = await ApiKey.findById(approval.apiKey._id || approval.apiKey);
  if (apiKey) {
    apiKey.approvalStatus = 'rejected';
    apiKey.rejectionReason = reason;
    await apiKey.save();
  }

  return approval;
};

/**
 * Get production keys (Go Live table)
 * @param {string|null} tenantId - Tenant ID (null for SabyUser to see all)
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getProductionKeys = async (tenantId, filter = {}, options = {}) => {
  const combinedFilter = {
    environment: 'production',
    approvalStatus: 'approved',
    isActive: true,
    ...filter,
  };

  // If not SabyUser, filter by tenant
  if (tenantId) {
    combinedFilter.tenant = tenantId;
  }

  return ApiKey.paginate(combinedFilter, {
    ...options,
    populate: 'approvedBy createdBy',
    sortBy: options.sortBy || 'createdAt:desc',
  });
};

module.exports = {
  canCreateCategory,
  createApprovalRequest,
  getPendingApprovals,
  getApprovals,
  approveApiKey,
  rejectApiKey,
  getProductionKeys,
};
