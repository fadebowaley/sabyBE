const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { nodeService } = require('../services');

const MAX_NODE_QUERY_LIMIT = 500;
const DEFAULT_NODE_QUERY_LIMIT = 50;
const TABLE_NODE_SELECT_FIELDS =
  'nodeId name level parent structure path isActive isMain users createdAt updatedAt';
const TABLE_NODE_POPULATE = [
  { path: 'level', select: 'name rank' },
  { path: 'structure', select: 'name level' },
  {
    path: 'users',
    select: 'firstname lastname email avatar roles',
    options: { limit: 1 },
    populate: {
      path: 'roles',
      select: 'name',
    },
  },
];

// Create a new node
const createNode = catchAsync(async (req, res) => {
  // SECURITY: Add tenantId from authenticated user
  req.body.tenantId = req.user.tenantId;
  const node = await nodeService.createNode(req.body);
  res.status(httpStatus.CREATED).send(nodeService.buildNodeResponse(node));
});

// Get node by ID (with profile)
const getNodeById = catchAsync(async (req, res) => {
  const node = await nodeService.getNodeById(req.params.nodeId);
  if (!node) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
  }
  // SECURITY: Verify node belongs to user's tenant
  if (node.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - node belongs to different tenant'
    );
  }

  // Return node directly (profile model doesn't exist yet)
  res.send(nodeService.buildNodeResponse(node));
});

// Get node by name
const getNodeByName = catchAsync(async (req, res) => {
  const node = await nodeService.getNodeByName(req.params.nodeName);
  if (!node) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
  }
  res.send(nodeService.buildNodeResponse(node));
});

// Update node by ID
const updateNodeById = catchAsync(async (req, res) => {
  const node = await nodeService.getNodeById(req.params.nodeId);
  // SECURITY: Verify node belongs to user's tenant
  if (node.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - node belongs to different tenant'
    );
  }
  const updatedNode = await nodeService.updateNodeById(
    req.params.nodeId,
    req.body
  );
  res.send(nodeService.buildNodeResponse(updatedNode));
});

const getNodeBranch = catchAsync(async (req, res) => {
  const node = await nodeService.getNodeById(req.params.nodeId);
  if (!node) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
  }
  if (node.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - node belongs to different tenant'
    );
  }
  const includeDeleted = req.query.includeDeleted === 'true';
  const branch = await nodeService.getNodeBranchByPath(node.path, {
    includeDeleted,
    select: TABLE_NODE_SELECT_FIELDS,
    populate: TABLE_NODE_POPULATE,
  });
  res.send({ results: branch });
});

const getNodeBranches = catchAsync(async (req, res) => {
  const { nodeIds = [], includeDeleted = false } = req.body || {};
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'nodeIds array is required');
  }
  const branches = await nodeService.getNodeBranchesByIds(nodeIds, {
    tenantId: req.user.tenantId,
    includeDeleted,
    select: TABLE_NODE_SELECT_FIELDS,
    populate: TABLE_NODE_POPULATE,
  });
  res.send({ results: branches });
});

// Delete node by ID
const deleteNodeById = catchAsync(async (req, res) => {
  const node = await nodeService.getNodeById(req.params.nodeId);
  // SECURITY: Verify node belongs to user's tenant
  if (node.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - node belongs to different tenant'
    );
  }
  await nodeService.deleteNodeById(req.params.nodeId);
  res.status(httpStatus.NO_CONTENT).send();
});

const deleteNodeHardById = catchAsync(async (req, res) => {
  await nodeService.deleteNodeById(req.params.nodeId, true, {
    includeDeleted: true,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const restoreNodeById = catchAsync(async (req, res) => {
  const restoredNode = await nodeService.restoreNodeById(
    req.params.nodeId,
    req.body || {}
  );
  res.send(nodeService.buildNodeResponse(restoredNode));
});

// Query nodes with filters and pagination
const queryNodes = catchAsync(async (req, res) => {
  // SECURITY: Always filter by authenticated user's tenantId
  const filter = pick(req.query, ['type', 'parent']);
  filter.tenantId = req.user.tenantId;

  const search = req.query.search && req.query.search.trim();
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }

  if (filter.parent === 'root') {
    filter.$or = [{ parent: null }, { parent: { $exists: false } }];
    delete filter.parent;
  }

  const status = req.query.status || 'active';
  if (status === 'active') {
    filter.deletedAt = null;
  } else if (status === 'archived') {
    filter.deletedAt = { $ne: null };
  }

  // HIERARCHICAL FILTERING: Apply user-based access control
  // Owners/Supers/Saby see all nodes, regular users see only their family
  const { nodeAccessService } = require('../services');
  await nodeAccessService.applyNodeAccessFilter(
    filter,
    req.user,
    req.user.tenantId
  );

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const requestedLimit = parseInt(options.limit, 10);
  const safeLimit = Number.isNaN(requestedLimit)
    ? DEFAULT_NODE_QUERY_LIMIT
    : Math.min(Math.max(requestedLimit, 1), MAX_NODE_QUERY_LIMIT);
  options.limit = safeLimit;
  const requestedPage = parseInt(options.page, 10);
  options.page =
    Number.isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;
  options.populate = TABLE_NODE_POPULATE;
  options.select = TABLE_NODE_SELECT_FIELDS;

  const result = await nodeService.queryNodes(filter, options);

  // Add metadata about access scope
  result.scopedToUser =
    !req.user.isOwner && !req.user.isSuper && !req.user.isSaby;
  if (result.scopedToUser) {
    result.scopeMessage =
      'Showing nodes you are assigned to and their descendants';
  }

  res.send(result);
});

// Get nodes by type
const getNodesByType = catchAsync(async (req, res) => {
  const nodes = await nodeService.getNodesByType(req.params.nodeType);
  res.send(nodes.map((node) => nodeService.buildNodeResponse(node)));
});

// Get parent node
const getParentNode = catchAsync(async (req, res) => {
  const parentNode = await nodeService.getParentNode(req.params.nodeId);
  res.send(nodeService.buildNodeResponse(parentNode));
});

// Get child nodes
const getChildNodes = catchAsync(async (req, res) => {
  const childNodes = await nodeService.getChildNodes(req.params.nodeId);
  res.send(childNodes.map((node) => nodeService.buildNodeResponse(node)));
});

// Move node to a new parent
const moveNodeToParent = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.moveNodeToParent(
    req.params.nodeId,
    req.body.parentId
  );
  res.send(nodeService.buildNodeResponse(updatedNode));
});

// Get node path
const getNodePath = catchAsync(async (req, res) => {
  const path = await nodeService.getNodePath(req.params.nodeId);
  res.send(path);
});

// Activate a node
const activateNode = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.activateNode(req.params.nodeId);
  res.send(nodeService.buildNodeResponse(updatedNode));
});

// Deactivate a node
const deactivateNode = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.deactivateNode(req.params.nodeId);
  res.send(nodeService.buildNodeResponse(updatedNode));
});

// Assign users to a node
const assignUsersToNode = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.assignUsersToNode(
    req.params.nodeId,
    req.body.userIds
  );
  res.send(nodeService.buildNodeResponse(updatedNode));
});

// Bulk import nodes
const bulkImportNodes = catchAsync(async (req, res) => {
  const nodes = await nodeService.bulkImportNodes(req.body.nodes);
  res.status(httpStatus.CREATED).json({
    message: `${nodes.length} nodes successfully imported.`,
    data: nodes.map((node) => nodeService.buildNodeResponse(node)),
  });
});

/**
 * Update profile update compliance status for a node
 * @param {Object} req
 * @param {Object} res
 */
const updateProfileCompliance = catchAsync(async (req, res) => {
  const { nodeId } = req.params;
  const { profileUpdateCompliant } = req.body;
  const currentUser = req.user;

  if (typeof profileUpdateCompliant !== 'boolean') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'profileUpdateCompliant must be a boolean value'
    );
  }

  const node = await nodeService.getNodeById(nodeId);
  if (!node) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
  }

  // SECURITY: Verify node belongs to same tenant
  if (node.tenantId !== currentUser.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - node belongs to different tenant'
    );
  }

  // Update compliance fields
  node.profileUpdateCompliant = profileUpdateCompliant;
  node.profileUpdateCompliantAt = profileUpdateCompliant ? new Date() : null;
  node.profileUpdateCompliantBy = profileUpdateCompliant
    ? currentUser._id
    : null;

  await node.save();

  res.send({
    success: true,
    data: nodeService.buildNodeResponse(node),
    message: profileUpdateCompliant
      ? 'Node profile update marked as compliant'
      : 'Node profile update compliance removed',
  });
});

module.exports = {
  createNode,
  getNodeById,
  getNodeByName,
  updateNodeById,
  getNodeBranch,
  getNodeBranches,
  deleteNodeById,
  deleteNodeHardById,
  restoreNodeById,
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
  updateProfileCompliance,
};
