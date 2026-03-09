const httpStatus = require('http-status');
const { Nodes, Structures } = require('../models');
const ApiError = require('../utils/ApiError');
const { validateCustomFields } = require('./customField.service');
const { NODE_ESSENTIAL_FIELDS } = require('../config/essentials');

const isObjectId = (value) => /^[0-9a-fA-F]{24}$/.test(value);

/**
 * Create a new node
 * @param {Object} nodeBody
 * @returns {Promise<Node>}
 */
const buildNodeResponse = (nodeDoc) => {
  if (!nodeDoc) {
    return null;
  }
  const plain =
    typeof nodeDoc.toObject === 'function'
      ? nodeDoc.toObject({ virtuals: true })
      : nodeDoc;
  const response = {};

  NODE_ESSENTIAL_FIELDS.forEach((field) => {
    if (plain[field] !== undefined) {
      response[field] = plain[field];
    }
  });

  if (response.profile === undefined) {
    response.profile = plain.profile || {};
  }

  if (
    plain.customFields &&
    typeof plain.customFields === 'object' &&
    Object.keys(plain.customFields).length > 0
  ) {
    response.customFields = plain.customFields;
    response.customFieldsVersion = plain.customFieldsVersion || 0;
  }

  return response;
};

const createNode = async (nodeBody) => {
  // Generate nodeId if not provided
  if (!nodeBody.nodeId) {
    nodeBody.nodeId = await Nodes.generateNodeId();
  }

  // Handle customFields validation if provided
  const customFieldsProvided = Object.prototype.hasOwnProperty.call(
    nodeBody,
    'customFields'
  );
  const customFieldsPayload = customFieldsProvided
    ? nodeBody.customFields
    : undefined;

  if (customFieldsProvided) {
    delete nodeBody.customFields;
  }

  // Create node first to get tenantId
  const node = await Nodes.create(nodeBody);

  // Validate and apply customFields if provided
  if (customFieldsProvided) {
    const { values, version } = await validateCustomFields({
      tenantId: node.tenantId,
      entityType: 'node',
      payload: customFieldsPayload,
    });
    node.customFields = values;
    node.customFieldsVersion = version;
    await node.save();
  }

  return node;
};

/**
 * Get node by id
 * @param {ObjectId} id
 * @param {Object} options - Query options
 * @param {boolean} options.includeDeleted - Include soft-deleted nodes
 * @param {string} options.populate - Fields to populate
 * @returns {Promise<Node>}
 */
const getNodeById = async (id, options = {}) => {
  const { includeDeleted = false, populate = 'level structure users' } =
    options;

  const identifierFilter = isObjectId(id) ? { _id: id } : { nodeId: id };

  const baseFilter = includeDeleted
    ? identifierFilter
    : { ...identifierFilter, deletedAt: null };

  const query = Nodes.findOne(baseFilter);

  if (populate) {
    query.populate(populate);
  }

  const node = await query;
  if (!node) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
  }
  return node;
};

/**
 * Get node by name
 * @param {string} name
 * @returns {Promise<Node>}
 */
const getNodeByName = async (name) => {
  const node = await Nodes.findOne({ name });
  if (!node) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
  }
  return node;
};

/**
 * Update node by id
 * @param {ObjectId} nodeId
 * @param {Object} updateBody
 * @returns {Promise<Node>}
 */
const updateNodeById = async (nodeId, updateBody) => {
  let node = await getNodeById(nodeId);

  const customFieldsProvided = Object.prototype.hasOwnProperty.call(
    updateBody,
    'customFields'
  );
  const customFieldsPayload = customFieldsProvided
    ? updateBody.customFields
    : undefined;
  if (customFieldsProvided) {
    delete updateBody.customFields;
  }

  // Separate node fields from profile fields
  const nodeFields = [
    'level',
    'parent',
    'name',
    'address',
    'city',
    'state',
    'country',
    'postalCode',
    'isMain',
    'users',
    'isActive',
    'structure',
  ];

  const profileFields = [
    'dateOfEstablishment',
    'propertyStatus',
    'estimatedValue',
    'buildingType',
    'status',
    'averageAttendance',
    'averageIncome',
  ];

  // Extract node-specific fields and profile fields
  const nodeUpdate = {};
  const profileUpdate = {};

  let newParentId = null;
  const parentProvided = Object.prototype.hasOwnProperty.call(
    updateBody,
    'parent'
  );

  Object.keys(updateBody).forEach((key) => {
    if (key === 'parent') {
      newParentId = updateBody[key] || null;
      return;
    }

    if (nodeFields.includes(key)) {
      nodeUpdate[key] = updateBody[key];
    } else if (profileFields.includes(key)) {
      profileUpdate[key] = updateBody[key];
    }
  });

  console.log(
    `📝 [NodeService.updateNodeById] Node fields to update:`,
    Object.keys(nodeUpdate)
  );
  console.log(
    `📝 [NodeService.updateNodeById] Profile fields to update:`,
    Object.keys(profileUpdate)
  );

  // If level is being updated, we need to find a structure that matches the new level
  if (nodeUpdate.level && !nodeUpdate.structure) {
    const newLevelId = nodeUpdate.level;
    // Find a structure that belongs to this level
    const matchingStructure = await Structures.findOne({
      level: newLevelId,
      tenantId: node.tenantId,
      isActive: true,
    });

    if (matchingStructure) {
      nodeUpdate.structure = matchingStructure._id;
      console.log(
        `🔄 [NodeService.updateNodeById] Auto-updated structure to match new level:`,
        matchingStructure._id
      );
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No active structure found for the selected level. Please select a structure that matches the level.`
      );
    }
  }

  let shouldSave = false;

  // Only update fields that are present in nodeUpdate
  Object.keys(nodeUpdate).forEach((key) => {
    node[key] = nodeUpdate[key];
    shouldSave = true;
  });

  if (customFieldsProvided) {
    const { values, version } = await validateCustomFields({
      tenantId: node.tenantId,
      entityType: 'node',
      payload: customFieldsPayload,
    });
    node.customFields = values;
    node.customFieldsVersion = version;
    shouldSave = true;
  }

  // Update profile if profile fields exist (BEFORE saving)
  if (Object.keys(profileUpdate).length > 0) {
    console.log(
      `📝 [NodeService.updateNodeById] Updating profile fields:`,
      Object.keys(profileUpdate)
    );
    // Initialize profile object if it doesn't exist
    if (!node.profile) {
      node.profile = {};
    }
    // Update profile fields
    Object.keys(profileUpdate).forEach((key) => {
      if (key === 'dateOfEstablishment') {
        node.dateOfEstablishment = profileUpdate[key];
      } else {
        node.profile[key] = profileUpdate[key];
      }
    });
    // Mark profile as modified for Mongoose to save it
    node.markModified('profile');
    shouldSave = true;
    console.log(
      `✅ [NodeService.updateNodeById] Profile fields updated successfully`
    );
  }

  if (shouldSave) {
    await node.save();
    console.log(`✅ [NodeService.updateNodeById] Node updated successfully`);
  }

  if (parentProvided) {
    if (newParentId) {
      const movingNode = await getNodeById(node._id, { populate: 'level' });
      const targetParent = await getNodeById(newParentId, { populate: 'level' });
      validateNodeParentMoveConstraints(movingNode, targetParent);
    }
    await Nodes.updateNodeParent(node._id, newParentId);
    node = await getNodeById(node._id);
  }

  // Trigger compliance recalculation if profile was updated
  // This runs asynchronously to avoid blocking the response
  // Note: Compliance is automatically calculated based on profile completeness
  // We just log that compliance will be recalculated when queried
  if (Object.keys(profileUpdate).length > 0) {
    setImmediate(async () => {
      try {
        const logger = require('../config/logger');
        // Calculate node compliance directly (compliance service will recalculate when queried)
        // We log here for visibility, but compliance is calculated on-demand
        logger.info(
          `✅ [NodeService.updateNodeById] Node profile updated for ${node.name} (${node.nodeId}) - compliance will be recalculated automatically on next query`
        );
      } catch (error) {
        const logger = require('../config/logger');
        logger.error(
          `❌ [NodeService.updateNodeById] Error logging compliance update for node ${node._id}:`,
          error
        );
        // Don't throw - logging failure shouldn't break node update
      }
    });
  }

  return node;
};

/**
 * Delete node by id (soft delete)
 * @param {ObjectId} nodeId
 * @param {boolean} hardDelete - If true, permanently delete the node
 * @returns {Promise<Node>}
 */
const deleteNodeById = async (nodeId, hardDelete = false, options = {}) => {
  const { includeDeleted = false } = options;
  const node = await getNodeById(nodeId, { includeDeleted });

  if (hardDelete) {
    await node.remove();
  } else {
    // Soft delete
    node.deletedAt = new Date();
    node.isActive = false;
    await node.save();
  }

  return node;
};

const restoreNodeById = async (nodeId, restoreBody = {}) => {
  const node = await getNodeById(nodeId, { includeDeleted: true });
  node.deletedAt = null;
  node.isActive = true;

  // If level is being updated, we need to find a structure that matches the new level
  if (restoreBody.level) {
    const newLevelId = restoreBody.level;
    // Find a structure that belongs to this level
    const matchingStructure = await Structures.findOne({
      level: newLevelId,
      tenantId: node.tenantId,
      isActive: true,
    });

    if (matchingStructure) {
      node.level = newLevelId;
      node.structure = matchingStructure._id;
      console.log(
        `🔄 [NodeService.restoreNodeById] Auto-updated structure to match new level:`,
        matchingStructure._id
      );
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No active structure found for the selected level. Please select a structure that matches the level.`
      );
    }
  }

  await node.save();

  if (Object.prototype.hasOwnProperty.call(restoreBody, 'parent')) {
    await Nodes.updateNodeParent(
      node._id,
      restoreBody.parent ? restoreBody.parent : null
    );
  }

  return getNodeById(node._id);
};

/**
 * Query for nodes
 * @param {Object} filter - Mongoose filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryNodes = async (filter, options) => {
  const nodes = await Nodes.paginate(filter, options);
  if (nodes.results && nodes.results.length > 0) {
    nodes.results = nodes.results.map((node) => buildNodeResponse(node));
  }
  return nodes;
};

const getNodeBranchByPath = async (path, options = {}) => {
  const { includeDeleted = false, select, populate } = options;
  const filter = { path: { $regex: `^${path}` } };
  if (!includeDeleted) {
    filter.deletedAt = null;
  }

  let query = Nodes.find(filter);

  if (select) {
    query = query.select(select);
  }

  if (populate) {
    query = query.populate(populate);
  }

  const nodes = await query;
  return nodes.map((node) => buildNodeResponse(node));
};

const getNodeBranchesByIds = async (nodeIds = [], options = {}) => {
  const {
    includeDeleted = false,
    tenantId = null,
    select,
    populate,
  } = options;

  if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(
    new Set(
      nodeIds
        .map((value) => (typeof value === 'string' ? value.trim() : value))
        .filter(Boolean)
    )
  );

  const aggregated = [];
  const seenIds = new Set();

  for (const identifier of uniqueIds) {
    const node = await getNodeById(identifier, { includeDeleted: true });

    if (
      tenantId &&
      node.tenantId &&
      node.tenantId.toString() !== tenantId.toString()
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Access denied - node belongs to different tenant'
      );
    }

    const branchNodes = await getNodeBranchByPath(node.path, {
      includeDeleted,
      select,
      populate,
    });

    branchNodes.forEach((branchNode) => {
      const key =
        branchNode.id ||
        branchNode.nodeId ||
        (branchNode._id && branchNode._id.toString());
      if (key && !seenIds.has(key)) {
        seenIds.add(key);
        aggregated.push(branchNode);
      }
    });
  }

  return aggregated;
};

/**
 * Get nodes by type
 * @param {string} type - Node type
 * @returns {Promise<Array<Node>>}
 */
const getNodesByType = async (type) => Nodes.find({ type });

/**
 * Get parent node
 * @param {ObjectId} nodeId
 * @returns {Promise<Node>}
 */
const getParentNode = async (nodeId) => {
  const node = await getNodeById(nodeId);
  if (!node.parent) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Parent node not found');
  }
  return getNodeById(node.parent);
};

/**
 * Get child nodes
 * @param {ObjectId} nodeId
 * @returns {Promise<Array<Node>>}
 */
const getChildNodes = async (nodeId) => Nodes.find({ parent: nodeId });

const validateNodeParentMoveConstraints = (node, newParent) => {
  if (String(node._id) === String(newParent._id)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot move a node under itself'
    );
  }

  if (node.tenantId && newParent.tenantId && node.tenantId !== newParent.tenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot move node across tenants'
    );
  }

  const nodePath = String(node.path || '');
  const newParentPath = String(newParent.path || '');
  if (newParentPath === nodePath || newParentPath.startsWith(`${nodePath}/`)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot move a node under its own descendant'
    );
  }

  const nodeRank =
    typeof node?.level?.rank === 'number' ? Number(node.level.rank) : null;
  const parentRank =
    typeof newParent?.level?.rank === 'number'
      ? Number(newParent.level.rank)
      : null;
  if (nodeRank != null && parentRank != null && parentRank >= nodeRank) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Target parent must be higher in hierarchy than the node being moved'
    );
  }
};

/**
 * Move node to new parent
 * @param {ObjectId} nodeId
 * @param {ObjectId} newParentId
 * @returns {Promise<Node>}
 */
const moveNodeToParent = async (nodeId, newParentId) => {
  const node = await getNodeById(nodeId, { populate: 'level' });
  const newParent = await getNodeById(newParentId, { populate: 'level' });
  validateNodeParentMoveConstraints(node, newParent);

  // Use model hierarchy update so node + descendants keep consistent identity/path.
  await Nodes.updateNodeParent(node._id, newParent._id);
  return getNodeById(node._id);
};

/**
 * Get node path
 * @param {ObjectId} nodeId
 * @returns {Promise<string>}
 */
const getNodePath = async (nodeId) => {
  const node = await getNodeById(nodeId);
  return node.path;
};

/**
 * Activate node
 * @param {ObjectId} nodeId
 * @returns {Promise<Node>}
 */
const activateNode = async (nodeId) => {
  const node = await getNodeById(nodeId);
  node.isActive = true;
  await node.save();
  return node;
};

/**
 * Deactivate node
 * @param {ObjectId} nodeId
 * @returns {Promise<Node>}
 */
const deactivateNode = async (nodeId) => {
  const node = await getNodeById(nodeId);
  node.isActive = false;
  await node.save();
  return node;
};

/**
 * Assign users to a node
 * @param {ObjectId} nodeId
 * @param {Array<ObjectId>} userIds
 * @returns {Promise<Node>}
 */
const assignUsersToNode = async (nodeId, userIds) => {
  const node = await getNodeById(nodeId);
  node.users = userIds;
  await node.save();

  // Populate users with their roles for the response
  const populatedNode = await Nodes.findById(nodeId).populate({
    path: 'users',
    populate: {
      path: 'roles',
      select: 'name',
    },
  });

  return populatedNode;
};

/**
 * Bulk import nodes
 * @param {Array} nodesData - Array of node objects to be imported
 * @returns {Promise<Array<Node>>}
 */
const bulkImportNodes = async (nodesData) => {
  // Generate nodeIds for all nodes
  const nodesWithIds = await Promise.all(
    nodesData.map(async (data) => ({
      ...data,
      nodeId: await Nodes.generateNodeId(),
    }))
  );

  // Create all nodes
  const nodes = await Nodes.insertMany(nodesWithIds);

  // Update parent references and hierarchy
  for (const node of nodes) {
    if (node.parent) {
      const parentNode = nodes.find(
        (n) => n._id.toString() === node.parent.toString()
      );
      if (parentNode) {
        node.path = `${parentNode.path}/${node._id}`;
        await node.save();
      }
    }
  }

  return nodes;
};

module.exports = {
  createNode,
  getNodeById,
  getNodeByName,
  updateNodeById,
  getNodeBranchByPath,
  deleteNodeById,
  restoreNodeById,
  queryNodes,
  getNodeBranchesByIds,
  getNodesByType,
  getParentNode,
  getChildNodes,
  moveNodeToParent,
  getNodePath,
  activateNode,
  deactivateNode,
  assignUsersToNode,
  bulkImportNodes,
  buildNodeResponse,
};
