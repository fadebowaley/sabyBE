const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { complianceService } = require('../services');
const { userService } = require('../services');
const { nodeService } = require('../services');
const { eventComplianceService } = require('../services');
const { getAllowedDates } = require('../services/calendarEnforcement.service');
const Nodes = require('../models/node.model');

const resolveNodeIdToObjectId = async (tenantId, nodeIdOrObjectId) => {
  if (!nodeIdOrObjectId) return nodeIdOrObjectId;
  if (mongoose.Types.ObjectId.isValid(nodeIdOrObjectId)) return nodeIdOrObjectId;

  const node = await Nodes.findOne({ tenantId, nodeId: nodeIdOrObjectId })
    .select('_id')
    .lean();
  return node ? node._id.toString() : nodeIdOrObjectId;
};

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
 * Get compliance-driven allowed dates + quota metrics + status.
 * @route GET /v1/compliance/dates
 */
const getComplianceDates = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { projectId, nodeId, month } = req.query;
  const resolvedNodeId = await resolveNodeIdToObjectId(tenantId, nodeId);

  const monthKey = month.length === 7 ? `${month}-01` : month;
  const [datesData, isLocked] = await Promise.all([
    getAllowedDates({
      tenantId,
      projectId,
      nodeId: resolvedNodeId,
      month: monthKey,
    }),
    eventComplianceService.isMonthLocked(tenantId, projectId, resolvedNodeId, monthKey),
  ]);

  const dates = Array.isArray(datesData.dates)
    ? datesData.dates.map((item) => {
        let status = 'available';
        if (isLocked === true) {
          status = 'locked';
        } else if (item.isFull) {
          status = 'full';
        } else if ((item.submitted || 0) > 0) {
          status = 'partial';
        }

        return {
          date: item.date,
          dayLabel: item.dayLabel,
          quota_total: item.required,
          submitted_count: item.submitted,
          remaining_count: item.remaining,
          locked: isLocked === true,
          status,
        };
      })
    : [];

  res.status(httpStatus.OK).json({
    success: true,
    projectId,
    nodeId,
    month,
    trackingMode: datesData.trackingMode,
    locked: isLocked === true,
    dates,
    totals: {
      quota_total: datesData.totalRequired || 0,
      submitted_count: datesData.totalSubmitted || 0,
      remaining_count: Math.max(
        (datesData.totalRequired || 0) - (datesData.totalSubmitted || 0),
        0
      ),
    },
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
  getComplianceDates,
  updateUserCompliance,
  updateNodeCompliance,
  getUserComplianceScore,
};

