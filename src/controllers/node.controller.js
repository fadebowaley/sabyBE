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
  res.status(httpStatus.CREATED).send(node);
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

  // Fetch node profile
  const ChurchProfile = require('../models/nodeprofile');
  const profile = await ChurchProfile.findOne({ church: req.params.nodeId });

  // Combine data
  const response = {
    ...node.toObject(),
    profile: profile ? profile.toObject() : null,
  };

  res.send(response);
});

// Get node by name
const getNodeByName = catchAsync(async (req, res) => {
  const node = await nodeService.getNodeByName(req.params.nodeName);
  if (!node) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
  }
  res.send(node);
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
  res.send(updatedNode);
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
  res.send(nodes);
});

// Get parent node
const getParentNode = catchAsync(async (req, res) => {
  const parentNode = await nodeService.getParentNode(req.params.nodeId);
  res.send(parentNode);
});

// Get child nodes
const getChildNodes = catchAsync(async (req, res) => {
  const childNodes = await nodeService.getChildNodes(req.params.nodeId);
  res.send(childNodes);
});

// Move node to a new parent
const moveNodeToParent = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.moveNodeToParent(
    req.params.nodeId,
    req.body.parentId
  );
  res.send(updatedNode);
});

// Get node path
const getNodePath = catchAsync(async (req, res) => {
  const path = await nodeService.getNodePath(req.params.nodeId);
  res.send(path);
});

// Activate a node
const activateNode = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.activateNode(req.params.nodeId);
  res.send(updatedNode);
});

// Deactivate a node
const deactivateNode = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.deactivateNode(req.params.nodeId);
  res.send(updatedNode);
});

// Assign users to a node
const assignUsersToNode = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.assignUsersToNode(
    req.params.nodeId,
    req.body.userIds
  );
  res.send(updatedNode);
});

// Bulk import nodes
const bulkImportNodes = catchAsync(async (req, res) => {
  const nodes = await nodeService.bulkImportNodes(req.body.nodes);
  res.status(httpStatus.CREATED).json({
    message: `${nodes.length} nodes successfully imported.`,
    data: nodes,
  });
});

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
