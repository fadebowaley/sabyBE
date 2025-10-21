const httpStatus = require('http-status');
const { Nodes } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a new node
 * @param {Object} nodeBody
 * @returns {Promise<Node>}
 */
const createNode = async (nodeBody) => {
  // Generate nodeId if not provided
  if (!nodeBody.nodeId) {
    nodeBody.nodeId = await Nodes.generateNodeId();
  }
  return Nodes.create(nodeBody);
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

  const query = includeDeleted
    ? Nodes.findById(id)
    : Nodes.findOne({ _id: id, deletedAt: null });

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
  const node = await getNodeById(nodeId);

  // Define allowed fields for update
  const allowedFields = [
    'level',
    'parent',
    'name',
    'address',
    'city',
    'state',
    'country',
    'postalCode',
    'dateOfEstablishment',
    'isMain',
    'users',
    'isActive',
  ];

  // Only update allowed fields
  Object.keys(updateBody).forEach((key) => {
    if (allowedFields.includes(key)) {
      node[key] = updateBody[key];
    }
  });

  await node.save();
  return node;
};

/**
 * Delete node by id (soft delete)
 * @param {ObjectId} nodeId
 * @param {boolean} hardDelete - If true, permanently delete the node
 * @returns {Promise<Node>}
 */
const deleteNodeById = async (nodeId, hardDelete = false) => {
  const node = await getNodeById(nodeId);

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
  return nodes;
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

/**
 * Move node to new parent
 * @param {ObjectId} nodeId
 * @param {ObjectId} newParentId
 * @returns {Promise<Node>}
 */
const moveNodeToParent = async (nodeId, newParentId) => {
  const node = await getNodeById(nodeId);
  const newParent = await getNodeById(newParentId);

  node.parent = newParentId;
  node.path = `${newParent.path}/${node.name}`;

  await node.save();
  return node;
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
  deleteNodeById,
  queryNodes,
  getNodesByType,
  getParentNode,
  getChildNodes,
  moveNodeToParent,
  getNodePath,
  activateNode,
  deactivateNode,
  assignUsersToNode,
  bulkImportNodes,
};
