const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { User, Nodes } = require('../models');
const logger = require('../config/logger');

/**
 * Calculate compliance score for a user-node pair
 * Formula: (User Compliance × 0.5) + (Node Compliance × 0.5)
 *
 * @param {string} userId - User ID
 * @param {string} nodeId - Node ID (optional, if user has assigned node)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Compliance score and details
 */
const calculateComplianceScore = async (userId, nodeId, tenantId) => {
  try {
    // Get user
    const user = await User.findOne({ _id: userId, tenantId });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Calculate user compliance (50% weight)
    const userCompliance = calculateUserCompliance(user);
    const userComplianceScore = userCompliance.isCompliant ? 100 : 0;

    // Calculate node compliance (50% weight) if nodeId provided
    let nodeComplianceScore = 0;
    let nodeCompliance = null;

    if (nodeId) {
      const node = await Nodes.findOne({ nodeId, tenantId });
      if (node) {
        nodeCompliance = calculateNodeCompliance(node);
        nodeComplianceScore = nodeCompliance.isCompliant ? 100 : 0;
      }
    } else {
      // If no nodeId provided, try to get user's assigned node
      const userNodes = await Nodes.find({
        users: userId,
        tenantId,
        deletedAt: null,
      }).limit(1);

      if (userNodes.length > 0) {
        const node = userNodes[0];
        nodeCompliance = calculateNodeCompliance(node);
        nodeComplianceScore = nodeCompliance.isCompliant ? 100 : 0;
        nodeId = node.nodeId;
      }
    }

    // Calculate overall compliance: (User × 0.5) + (Node × 0.5)
    const overallCompliance =
      userComplianceScore * 0.5 + nodeComplianceScore * 0.5;

    return {
      userId: user._id.toString(),
      nodeId: nodeId || null,
      userCompliance: {
        score: userComplianceScore,
        isCompliant: userCompliance.isCompliant,
        details: userCompliance,
        weight: 0.5,
      },
      nodeCompliance: nodeCompliance
        ? {
            score: nodeComplianceScore,
            isCompliant: nodeCompliance.isCompliant,
            details: nodeCompliance,
            weight: 0.5,
          }
        : null,
      overallCompliance: Math.round(overallCompliance),
      isCompliant: overallCompliance >= 50, // Threshold: 50% or higher
    };
  } catch (error) {
    logger.error('Error calculating compliance score:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to calculate compliance score'
    );
  }
};

/**
 * Calculate user compliance
 * User is compliant if:
 * 1. Profile has required fields filled (automatic - no manual approval needed)
 *
 * @param {Object} user - User document
 * @returns {Object} User compliance details
 */
const calculateUserCompliance = (user) => {
  // Check if ALL required profile fields are filled
  const requiredFields = {
    gender: user.profile?.gender,
    dateOfBirth: user.profile?.dateOfBirth,
    stateOfOrigin: user.profile?.stateOfOrigin,
    maritalStatus: user.profile?.maritalStatus,
    occupation: user.profile?.occupation,
  };

  // Check if all required fields have values
  const allRequiredFieldsFilled = Object.values(requiredFields).every(
    (value) => value !== undefined && value !== null && value !== ''
  );

  // Check if customFields exist and have at least one non-null value
  const hasCustomFields =
    user.customFields &&
    typeof user.customFields === 'object' &&
    Object.keys(user.customFields).length > 0 &&
    Object.values(user.customFields).some(
      (value) => value !== undefined && value !== null && value !== ''
    );

  // Check if customFields exist but are all null/empty (meaning they're configured but not filled)
  const hasCustomFieldsConfigured =
    user.customFields &&
    typeof user.customFields === 'object' &&
    Object.keys(user.customFields).length > 0;

  // User must have ALL required fields filled AND:
  // - If customFields are configured, at least one must have a value
  // - If no customFields are configured, we don't require them
  const hasProfileData =
    allRequiredFieldsFilled && (!hasCustomFieldsConfigured || hasCustomFields);

  // User is compliant automatically if profile data is complete (no manual approval needed)
  const isCompliant = hasProfileData;

  return {
    isCompliant,
    hasProfileData,
    isManuallyCompliant: false, // Deprecated - kept for backward compatibility
    profileUpdateCompliant: isCompliant, // Auto-set based on profile completeness
    profileUpdateCompliantAt: hasProfileData
      ? user.profileUpdateCompliantAt || new Date()
      : null,
    profileUpdateCompliantBy: null, // Auto-compliance doesn't track approver
    missingFields: allRequiredFieldsFilled
      ? []
      : Object.keys(requiredFields).filter(
          (key) => !requiredFields[key] || requiredFields[key] === ''
        ),
  };
};

/**
 * Calculate node compliance
 * Node is compliant if:
 * 1. Profile has required fields filled (automatic - no manual approval needed)
 *
 * @param {Object} node - Node document
 * @returns {Object} Node compliance details
 */
const calculateNodeCompliance = (node) => {
  // Check if ALL required profile fields are filled
  const requiredFields = {
    propertyStatus: node.profile?.propertyStatus,
    buildingType: node.profile?.buildingType,
    dateOfEstablishment: node.dateOfEstablishment,
    averageAttendance: node.profile?.averageAttendance,
    averageIncome: node.profile?.averageIncome,
  };

  // Check if all required fields have values
  // For numeric fields (averageAttendance, averageIncome), check they're not undefined/null and >= 0
  const allRequiredFieldsFilled =
    requiredFields.propertyStatus !== undefined &&
    requiredFields.propertyStatus !== null &&
    requiredFields.propertyStatus !== '' &&
    requiredFields.buildingType !== undefined &&
    requiredFields.buildingType !== null &&
    requiredFields.buildingType !== '' &&
    requiredFields.dateOfEstablishment !== undefined &&
    requiredFields.dateOfEstablishment !== null &&
    requiredFields.averageAttendance !== undefined &&
    requiredFields.averageAttendance !== null &&
    typeof requiredFields.averageAttendance === 'number' &&
    requiredFields.averageAttendance >= 0 &&
    requiredFields.averageIncome !== undefined &&
    requiredFields.averageIncome !== null &&
    (typeof requiredFields.averageIncome === 'number' ||
      (typeof requiredFields.averageIncome === 'object' &&
        requiredFields.averageIncome !== null));

  // Check if customFields exist and have at least one non-null value
  const hasCustomFields =
    node.customFields &&
    typeof node.customFields === 'object' &&
    Object.keys(node.customFields).length > 0 &&
    Object.values(node.customFields).some(
      (value) => value !== undefined && value !== null && value !== ''
    );

  // Node must have ALL required fields filled AND (customFields if they exist OR no customFields configured)
  // Note: If customFields is an empty object or null, we don't require it
  const hasProfileData =
    allRequiredFieldsFilled &&
    (hasCustomFields ||
      !node.customFields ||
      Object.keys(node.customFields).length === 0);

  // Node is compliant automatically if profile data is complete (no manual approval needed)
  const isCompliant = hasProfileData;

  return {
    isCompliant,
    hasProfileData,
    isManuallyCompliant: false, // Deprecated - kept for backward compatibility
    profileUpdateCompliant: isCompliant, // Auto-set based on profile completeness
    profileUpdateCompliantAt: hasProfileData
      ? node.profileUpdateCompliantAt || new Date()
      : null,
    profileUpdateCompliantBy: null, // Auto-compliance doesn't track approver
    missingFields: allRequiredFieldsFilled
      ? []
      : Object.keys(requiredFields).filter((key) => {
          const value = requiredFields[key];
          if (key === 'averageAttendance') {
            return (
              value === undefined ||
              value === null ||
              typeof value !== 'number' ||
              value < 0
            );
          }
          if (key === 'averageIncome') {
            return (
              value === undefined ||
              value === null ||
              (typeof value !== 'number' && typeof value !== 'object')
            );
          }
          return !value || value === '';
        }),
  };
};

/**
 * Get compliance data for users with pagination and filters
 *
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} Paginated compliance data
 */
const getComplianceForUsers = async (
  tenantId,
  filters = {},
  pagination = {}
) => {
  try {
    const {
      nodeId = null,
      status = null, // 'compliant', 'non-compliant', 'partial'
      search = null,
    } = filters;

    const {
      page = 1,
      limit = 25,
      sortBy = 'overallCompliance',
      sortOrder = 'desc',
    } = pagination;

    // Build user query
    const userQuery = { tenantId };

    if (search) {
      userQuery.$or = [
        { firstname: { $regex: search, $options: 'i' } },
        { lastname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // Get users with pagination
    // Note: We can't sort by overallCompliance/userCompliance/nodeCompliance here since they're calculated later
    // So we'll sort by createdAt or updatedAt, then sort the results after calculation
    const needsPostSort = [
      'overallCompliance',
      'userCompliance',
      'nodeCompliance',
    ].includes(sortBy);
    const sortField = needsPostSort ? 'updatedAt' : sortBy;

    // For post-sorting, we need to fetch more users to ensure we have enough after filtering
    const fetchLimit = needsPostSort ? limit * 3 : limit; // Fetch 3x more if we need to post-sort

    const skip = (page - 1) * limit;
    const users = await User.find(userQuery)
      .skip(needsPostSort ? 0 : skip) // If post-sorting, fetch from beginning
      .limit(needsPostSort ? fetchLimit : limit)
      .sort({ [sortField]: sortOrder === 'desc' ? -1 : 1 })
      .lean();

    const totalUsers = await User.countDocuments(userQuery);

    // Get nodes for users with populated level and structure
    const userIds = users.map((u) => u._id);
    const nodes = await Nodes.find({
      tenantId,
      users: { $in: userIds },
      deletedAt: null,
    })
      .populate('level', 'name')
      .populate('structure', 'name')
      .lean();

    // Create node map by user
    const nodeMapByUser = new Map();
    for (const node of nodes) {
      for (const userId of node.users || []) {
        const userIdStr = userId.toString();
        if (!nodeMapByUser.has(userIdStr)) {
          nodeMapByUser.set(userIdStr, node);
        }
      }
    }

    // Calculate compliance for each user
    const complianceData = [];
    for (const user of users) {
      const userIdStr = user._id.toString();
      const userNode = nodeMapByUser.get(userIdStr);
      const nodeIdForUser = userNode?.nodeId || null;

      const userCompliance = calculateUserCompliance(user);
      const nodeCompliance = userNode
        ? calculateNodeCompliance(userNode)
        : null;

      const userComplianceScore = userCompliance.isCompliant ? 100 : 0;
      const nodeComplianceScore = nodeCompliance?.isCompliant ? 100 : 0;

      // If no node, user compliance is 100% of the score
      const overallCompliance = userNode
        ? userComplianceScore * 0.5 + nodeComplianceScore * 0.5
        : userComplianceScore;

      // Apply status filter
      if (status === 'compliant' && overallCompliance < 50) continue;
      if (status === 'non-compliant' && overallCompliance >= 50) continue;
      if (
        status === 'partial' &&
        (overallCompliance === 0 || overallCompliance === 100)
      )
        continue;

      // Apply node filter
      if (nodeId && nodeIdForUser !== nodeId) continue;

      complianceData.push({
        id: userIdStr,
        userId: user.userId || user.haloId || userIdStr,
        user: {
          id: userIdStr,
          fullName: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
          email: user.email,
          phoneNumber: user.phoneNumber || '',
          avatar: user.avatar || '',
        },
        node: userNode
          ? {
              id: userNode._id.toString(),
              nodeId: userNode.nodeId,
              name: userNode.name,
              levelName:
                userNode.level?.name ||
                (typeof userNode.level === 'object' && userNode.level?.name) ||
                'N/A',
              structureName:
                userNode.structure?.name ||
                (typeof userNode.structure === 'object' &&
                  userNode.structure?.name) ||
                'N/A',
            }
          : null,
        userCompliance: {
          score: userComplianceScore,
          isCompliant: userCompliance.isCompliant,
          hasProfileData: userCompliance.hasProfileData,
          isManuallyCompliant: userCompliance.isManuallyCompliant,
          profileUpdateCompliant: userCompliance.profileUpdateCompliant,
          profileUpdateCompliantAt: userCompliance.profileUpdateCompliantAt,
        },
        nodeCompliance: nodeCompliance
          ? {
              score: nodeComplianceScore,
              isCompliant: nodeCompliance.isCompliant,
              hasProfileData: nodeCompliance.hasProfileData,
              isManuallyCompliant: nodeCompliance.isManuallyCompliant,
              profileUpdateCompliant: nodeCompliance.profileUpdateCompliant,
              profileUpdateCompliantAt: nodeCompliance.profileUpdateCompliantAt,
            }
          : null,
        overallCompliance: Math.round(overallCompliance),
        isCompliant: overallCompliance >= 50,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    }

    // Sort by calculated fields if needed
    if (needsPostSort) {
      complianceData.sort((a, b) => {
        const aValue =
          sortBy === 'overallCompliance'
            ? a.overallCompliance
            : sortBy === 'userCompliance'
            ? a.userCompliance.score
            : a.nodeCompliance?.score || 0;
        const bValue =
          sortBy === 'overallCompliance'
            ? b.overallCompliance
            : sortBy === 'userCompliance'
            ? b.userCompliance.score
            : b.nodeCompliance?.score || 0;
        return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
      });

      // Apply pagination after sorting
      const startIndex = skip;
      const endIndex = startIndex + limit;
      const paginatedData = complianceData.slice(startIndex, endIndex);

      return {
        data: paginatedData,
        pagination: {
          page,
          limit,
          total: complianceData.length, // Total after filtering
          totalPages: Math.ceil(complianceData.length / limit),
        },
      };
    }

    return {
      data: complianceData,
      pagination: {
        page,
        limit,
        total: totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      },
    };
  } catch (error) {
    logger.error('Error getting compliance for users:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to get compliance data'
    );
  }
};

/**
 * Get compliance summary statistics
 *
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Compliance summary
 */
const getComplianceSummary = async (tenantId) => {
  try {
    const users = await User.find({ tenantId }).lean();
    const nodes = await Nodes.find({ tenantId, deletedAt: null }).lean();

    // Create node map by user
    const nodeMapByUser = new Map();
    for (const node of nodes) {
      for (const userId of node.users || []) {
        const userIdStr = userId.toString();
        if (!nodeMapByUser.has(userIdStr)) {
          nodeMapByUser.set(userIdStr, node);
        }
      }
    }

    let totalCompliant = 0;
    let totalNonCompliant = 0;
    let totalPartial = 0;
    let totalComplianceScore = 0;

    for (const user of users) {
      const userIdStr = user._id.toString();
      const userNode = nodeMapByUser.get(userIdStr);

      const userCompliance = calculateUserCompliance(user);
      const nodeCompliance = userNode
        ? calculateNodeCompliance(userNode)
        : null;

      const userComplianceScore = userCompliance.isCompliant ? 100 : 0;
      const nodeComplianceScore = nodeCompliance?.isCompliant ? 100 : 0;

      const overallCompliance = userNode
        ? userComplianceScore * 0.5 + nodeComplianceScore * 0.5
        : userComplianceScore;

      totalComplianceScore += overallCompliance;

      if (overallCompliance >= 50) {
        totalCompliant++;
      } else if (overallCompliance === 0) {
        totalNonCompliant++;
      } else {
        totalPartial++;
      }
    }

    const totalUsers = users.length;
    const averageCompliance =
      totalUsers > 0 ? Math.round(totalComplianceScore / totalUsers) : 0;

    return {
      totalUsers,
      totalCompliant,
      totalNonCompliant,
      totalPartial,
      averageCompliance,
      complianceRate:
        totalUsers > 0 ? Math.round((totalCompliant / totalUsers) * 100) : 0,
    };
  } catch (error) {
    logger.error('Error getting compliance summary:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to get compliance summary'
    );
  }
};

module.exports = {
  calculateComplianceScore,
  calculateUserCompliance,
  calculateNodeCompliance,
  getComplianceForUsers,
  getComplianceSummary,
};
