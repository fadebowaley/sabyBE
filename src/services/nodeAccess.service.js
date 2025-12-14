/**
 * Node Access Service
 * Handles hierarchical node access control based on user assignments
 */

const { Nodes, User } = require('../models');
const logger = require('../config/logger');

/**
 * Get all node IDs a user has access to (their assigned nodes + all descendants)
 * @param {Object} user - User document with isOwner, isSuper, isSaby flags
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array<string>>} Array of accessible node IDs
 */
const getUserAccessibleNodeIds = async (user, tenantId) => {
  try {
    // 1. Owners, Supers, and Saby users see EVERYTHING
    if (user.isOwner || user.isSuper || user.isSaby) {
      const allNodes = await Nodes.find({ tenantId, deletedAt: null })
        .select('nodeId')
        .lean();
      return allNodes.map((n) => n.nodeId);
    }

    // 2. Find nodes where user is assigned
    const assignedNodes = await Nodes.find({
      tenantId,
      deletedAt: null,
      users: user._id,
    })
      .select('nodeId path _id')
      .lean();

    if (assignedNodes.length === 0) {
      // User not assigned to any node - no access
      logger.warn(
        `User ${user._id} has no node assignments in tenant ${tenantId}`
      );
      return [];
    }

    logger.info(`User ${user._id} assigned to ${assignedNodes.length} nodes`);

    // 3. Get all descendants for each assigned node using EXISTING getNodeWithChildren()
    const accessibleNodeIds = new Set();

    for (const assignedNode of assignedNodes) {
      // Add the assigned node itself
      accessibleNodeIds.add(assignedNode.nodeId);

      // Use the EXISTING static method from node model
      // getNodeWithChildren() uses path regex: { path: { $regex: `^${node.path}` } }
      const family = await Nodes.getNodeWithChildren(assignedNode._id);

      family.forEach((node) => {
        if (node.nodeId) {
          accessibleNodeIds.add(node.nodeId);
        }
      });
    }

    logger.info(
      `User ${user._id} has access to ${accessibleNodeIds.size} nodes (including descendants)`
    );

    return Array.from(accessibleNodeIds);
  } catch (error) {
    logger.error(`Error getting accessible nodes for user ${user._id}:`, error);
    throw error;
  }
};

/**
 * Get detailed node family information for a user
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} { user, assignedNodes, familyNodes, totalFamilySize, isOwner }
 */
const getUserNodeFamily = async (userId, tenantId) => {
  try {
    const user = await User.findById(userId).lean();

    if (!user || user.tenantId !== tenantId) {
      throw new Error('User not found or tenant mismatch');
    }

    // Check if user is owner/super/saby
    const isFullAccess = user.isOwner || user.isSuper || user.isSaby;

    // Get assigned nodes
    const assignedNodes = await Nodes.find({
      tenantId,
      deletedAt: null,
      users: userId,
    })
      .populate(['level', 'structure'])
      .lean();

    // Get accessible node IDs
    const accessibleNodeIds = await getUserAccessibleNodeIds(user, tenantId);

    // Get full node documents for accessible nodes
    const familyNodes = await Nodes.find({
      tenantId,
      deletedAt: null,
      nodeId: { $in: accessibleNodeIds },
    })
      .populate(['level', 'structure', 'parent'])
      .lean();

    return {
      user,
      assignedNodes,
      familyNodes,
      totalFamilySize: familyNodes.length,
      isOwner: isFullAccess,
    };
  } catch (error) {
    logger.error(`Error getting node family for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Check if user can access a specific node
 * @param {Object} user - User document
 * @param {string} nodeId - Node ID to check
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<boolean>}
 */
const canUserAccessNode = async (user, nodeId, tenantId) => {
  try {
    // Owners/Supers/Saby always have access
    if (user.isOwner || user.isSuper || user.isSaby) {
      return true;
    }

    // Get accessible node IDs
    const accessibleNodeIds = await getUserAccessibleNodeIds(user, tenantId);

    return accessibleNodeIds.includes(nodeId);
  } catch (error) {
    logger.error(`Error checking node access for user ${user._id}:`, error);
    return false;
  }
};

/**
 * Apply user-based filtering to node query filter
 * Modifies filter object to include only accessible nodes
 * @param {Object} filter - Mongoose query filter
 * @param {Object} user - User document
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Modified filter with node access restrictions
 */
const applyNodeAccessFilter = async (filter, user, tenantId) => {
  // Owners/Supers/Saby see all nodes
  if (user.isOwner || user.isSuper || user.isSaby) {
    return filter; // No modifications needed
  }

  // Get accessible node IDs for regular users
  const accessibleNodeIds = await getUserAccessibleNodeIds(user, tenantId);

  if (accessibleNodeIds.length === 0) {
    // User has no access - return impossible filter
    filter.nodeId = { $in: [] };
  } else {
    // Restrict to accessible nodes
    filter.nodeId = { $in: accessibleNodeIds };
  }

  return filter;
};

module.exports = {
  getUserAccessibleNodeIds,
  getUserNodeFamily,
  canUserAccessNode,
  applyNodeAccessFilter,
};
