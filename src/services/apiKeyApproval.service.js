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
  const result = await ApiKeyApproval.paginate(combinedFilter, {
    ...options,
    populate: 'apiKey requestedBy',
    sortBy: options.sortBy || 'createdAt:desc',
  });

  // Handle null apiKey references (deleted API keys)
  // Use requestDetails as fallback data
  if (result.results && Array.isArray(result.results)) {
    result.results = result.results.map((approval) => {
      // Convert to plain object to avoid Mongoose document serialization issues
      const approvalObj = approval.toObject ? approval.toObject() : approval;

      // If apiKey is null or undefined (deleted), create a fallback object from requestDetails
      if (
        (!approvalObj.apiKey || approvalObj.apiKey === null) &&
        approvalObj.requestDetails
      ) {
        // Generate a placeholder ID for deleted keys (frontend expects string, not null)
        const deletedId = `deleted-${
          approvalObj.id || approvalObj._id || 'unknown'
        }`;
        approvalObj.apiKey = {
          id: deletedId, // String ID to prevent frontend .slice() errors
          _id: deletedId, // Also provide _id for compatibility
          label: approvalObj.requestDetails.label || 'Deleted API Key',
          category: approvalObj.requestDetails.category || 'web',
          environment: approvalObj.requestDetails.environment || 'production',
          permissions: approvalObj.requestDetails.permissions || [],
          rateLimit: approvalObj.requestDetails.rateLimit || 0,
          isActive: false,
          isDeleted: true, // Flag to indicate this is a fallback
          // Add other expected fields with safe defaults
          usageCount: 0,
          createdAt: approvalObj.createdAt,
          updatedAt: approvalObj.updatedAt,
          tenant: approvalObj.tenant,
          scope: approvalObj.requestDetails.category || 'web', // Deprecated but might be expected
        };
      }
      // Ensure apiKey always has id/_id even if it exists but is missing these fields
      if (
        approvalObj.apiKey &&
        !approvalObj.apiKey.id &&
        !approvalObj.apiKey._id
      ) {
        const fallbackId =
          approvalObj.apiKey._id || approvalObj.apiKey.id || 'unknown';
        approvalObj.apiKey.id = fallbackId;
        approvalObj.apiKey._id = approvalObj.apiKey._id || fallbackId;
      }
      return approvalObj;
    });
  }

  return result;
};

/**
 * Get all approvals (with filters)
 * @param {Object} filter - Filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getApprovals = async (filter = {}, options = {}) => {
  const result = await ApiKeyApproval.paginate(filter, {
    ...options,
    populate: 'apiKey requestedBy approvedBy rejectedBy',
    sortBy: options.sortBy || 'createdAt:desc',
  });

  // Handle null apiKey references (deleted API keys)
  // Use requestDetails as fallback data
  if (result.results && Array.isArray(result.results)) {
    result.results = result.results.map((approval) => {
      // Convert to plain object to avoid Mongoose document serialization issues
      const approvalObj = approval.toObject ? approval.toObject() : approval;

      // If apiKey is null or undefined (deleted), create a fallback object from requestDetails
      if (
        (!approvalObj.apiKey || approvalObj.apiKey === null) &&
        approvalObj.requestDetails
      ) {
        // Generate a placeholder ID for deleted keys (frontend expects string, not null)
        const deletedId = `deleted-${
          approvalObj.id || approvalObj._id || 'unknown'
        }`;
        approvalObj.apiKey = {
          id: deletedId, // String ID to prevent frontend .slice() errors
          _id: deletedId, // Also provide _id for compatibility
          label: approvalObj.requestDetails.label || 'Deleted API Key',
          category: approvalObj.requestDetails.category || 'web',
          environment: approvalObj.requestDetails.environment || 'production',
          permissions: approvalObj.requestDetails.permissions || [],
          rateLimit: approvalObj.requestDetails.rateLimit || 0,
          isActive: false,
          isDeleted: true, // Flag to indicate this is a fallback
          // Add other expected fields with safe defaults
          usageCount: 0,
          createdAt: approvalObj.createdAt,
          updatedAt: approvalObj.updatedAt,
          tenant: approvalObj.tenant,
          scope: approvalObj.requestDetails.category || 'web', // Deprecated but might be expected
        };
      }
      // Ensure apiKey always has id/_id even if it exists but is missing these fields
      if (
        approvalObj.apiKey &&
        !approvalObj.apiKey.id &&
        !approvalObj.apiKey._id
      ) {
        const fallbackId =
          approvalObj.apiKey._id || approvalObj.apiKey.id || 'unknown';
        approvalObj.apiKey.id = fallbackId;
        approvalObj.apiKey._id = approvalObj.apiKey._id || fallbackId;
      }
      return approvalObj;
    });
  }

  return result;
};

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
