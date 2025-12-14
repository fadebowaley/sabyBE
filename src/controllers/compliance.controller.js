const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { complianceService } = require('../services');
const { userService } = require('../services');
const { nodeService } = require('../services');

/**
 * Get unified compliance table with pagination and filters
 * @route GET /v1/compliance/table
 */
const getComplianceTable = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const {
    page = 1,
    limit = 25,
    sortBy = 'overallCompliance',
    sortOrder = 'desc',
    nodeId,
    status,
    search,
  } = req.query;

  const filters = {
    nodeId: nodeId || null,
    status: status || null,
    search: search || null,
  };

  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sortBy,
    sortOrder,
  };

  const result = await complianceService.getComplianceForUsers(tenantId, filters, pagination);

  res.status(httpStatus.OK).json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

/**
 * Get compliance summary statistics
 * @route GET /v1/compliance/summary
 */
const getComplianceSummary = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  const summary = await complianceService.getComplianceSummary(tenantId);

  res.status(httpStatus.OK).json({
    success: true,
    data: summary,
  });
});

/**
 * Update user compliance status
 * @route PATCH /v1/compliance/user/:userId
 */
const updateUserCompliance = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { userId } = req.params;
  const { profileUpdateCompliant } = req.body;

  const user = await userService.updateUserById(userId, {
    profileUpdateCompliant,
    profileUpdateCompliantAt: new Date(),
    profileUpdateCompliantBy: req.user._id,
  }, { user: req.user });

  // Recalculate compliance score
  const complianceScore = await complianceService.calculateComplianceScore(
    userId,
    null,
    tenantId
  );

  res.status(httpStatus.OK).json({
    success: true,
    message: profileUpdateCompliant 
      ? 'User profile marked as compliant' 
      : 'User profile compliance removed',
    data: {
      user: {
        id: user._id.toString(),
        profileUpdateCompliant: user.profileUpdateCompliant,
        profileUpdateCompliantAt: user.profileUpdateCompliantAt,
        profileUpdateCompliantBy: user.profileUpdateCompliantBy,
      },
      compliance: complianceScore,
    },
  });
});

/**
 * Update node compliance status
 * @route PATCH /v1/compliance/node/:nodeId
 */
const updateNodeCompliance = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { nodeId } = req.params;
  const { profileUpdateCompliant } = req.body;

  const node = await nodeService.updateNodeById(nodeId, {
    profileUpdateCompliant,
    profileUpdateCompliantAt: new Date(),
    profileUpdateCompliantBy: req.user._id,
  }, { user: req.user });

  res.status(httpStatus.OK).json({
    success: true,
    message: profileUpdateCompliant 
      ? 'Node profile marked as compliant' 
      : 'Node profile compliance removed',
    data: {
      node: {
        id: node._id.toString(),
        nodeId: node.nodeId,
        profileUpdateCompliant: node.profileUpdateCompliant,
        profileUpdateCompliantAt: node.profileUpdateCompliantAt,
        profileUpdateCompliantBy: node.profileUpdateCompliantBy,
      },
    },
  });
});

/**
 * Get compliance score for a specific user
 * @route GET /v1/compliance/user/:userId/score
 */
const getUserComplianceScore = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { userId } = req.params;
  const { nodeId } = req.query; // Optional nodeId

  const complianceScore = await complianceService.calculateComplianceScore(
    userId,
    nodeId || null,
    tenantId
  );

  res.status(httpStatus.OK).json({
    success: true,
    data: complianceScore,
  });
});

module.exports = {
  getComplianceTable,
  getComplianceSummary,
  updateUserCompliance,
  updateNodeCompliance,
  getUserComplianceScore,
};

