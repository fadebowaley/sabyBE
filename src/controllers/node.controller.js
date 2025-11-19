const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { nodeService } = require('../services');

// Create a new node
const createNode = catchAsync(async (req, res) => {
  console.log(
    '[NODE CONTROLLER - CREATE] Creating node for tenant:',
    req.user.tenantId
  );
  // SECURITY: Add tenantId from authenticated user
  req.body.tenantId = req.user.tenantId;
  const node = await nodeService.createNode(req.body);
  console.log(
    '[NODE CONTROLLER - CREATE] Node created successfully:',
    node._id
  );
  res
    .status(httpStatus.CREATED)
    .send(nodeService.buildNodeResponse(node));
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
  console.log(
    '[NODE CONTROLLER - UPDATE] Node ID:',
    req.params.nodeId,
    'Tenant:',
    req.user.tenantId
  );
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

// Delete node by ID
const deleteNodeById = catchAsync(async (req, res) => {
  console.log(
    '[NODE CONTROLLER - DELETE] Node ID:',
    req.params.nodeId,
    'Tenant:',
    req.user.tenantId
  );
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
  console.log(
    '[NODE CONTROLLER - HARD DELETE] Node ID:',
    req.params.nodeId,
    'Tenant:',
    req.user.tenantId
  );
  await nodeService.deleteNodeById(req.params.nodeId, true, {
    includeDeleted: true,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const restoreNodeById = catchAsync(async (req, res) => {
  console.log(
    '[NODE CONTROLLER - RESTORE] Node ID:',
    req.params.nodeId,
    'Tenant:',
    req.user.tenantId
  );
  const restoredNode = await nodeService.restoreNodeById(
    req.params.nodeId,
    req.body || {}
  );
  res.send(nodeService.buildNodeResponse(restoredNode));
});

// Query nodes with filters and pagination
const queryNodes = catchAsync(async (req, res) => {
  console.log(
    '[NODE CONTROLLER - QUERY] Query params:',
    req.query,
    'Tenant:',
    req.user.tenantId
  );
  // SECURITY: Always filter by authenticated user's tenantId
  const filter = pick(req.query, ['type', 'parent']);
  filter.tenantId = req.user.tenantId;

  const status = req.query.status || 'active';
  if (status === 'active') {
    filter.deletedAt = null;
  } else if (status === 'archived') {
    filter.deletedAt = { $ne: null };
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'level,structure,users.roles';
  console.log('[NODE CONTROLLER - QUERY] Filter with tenantId:', filter);
  const result = await nodeService.queryNodes(filter, options);
  console.log(
    '[NODE CONTROLLER - QUERY] Found',
    result.results && Array.isArray(result.results) ? result.results.length : 0,
    'nodes for tenant:',
    filter.tenantId
  );
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
  res.send(
    childNodes.map((node) => nodeService.buildNodeResponse(node))
  );
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

module.exports = {
  createNode,
  getNodeById,
  getNodeByName,
  updateNodeById,
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
};
