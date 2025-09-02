const httpStatus = require('http-status');
const { Nodes } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a new node
 * @param {Object} nodeBody
 * @returns {Promise<Node>}
 */
const createNode = async (nodeBody) => {
  return Nodes.create(nodeBody);
};

/**
 * Get node by id
 * @param {ObjectId} id
 * @returns {Promise<Node>}
 */
const getNodeById = async (id) => {
  const node = await Nodes.findById(id);
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
  Object.assign(node, updateBody);
  await node.save();
  return node;
};

/**
 * Delete node by id
 * @param {ObjectId} nodeId
 * @returns {Promise<Node>}
 */
const deleteNodeById = async (nodeId) => {
  const node = await getNodeById(nodeId);
  await node.remove();
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
const getNodesByType = async (type) => {
  return Nodes.find({ type });
};

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
const getChildNodes = async (nodeId) => {
  return Nodes.find({ parent: nodeId });
};

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
      const parentNode = nodes.find((n) => n._id.toString() === node.parent.toString());
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
