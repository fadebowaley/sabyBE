const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { Nodes } = require('../models');
const { nodeService } = require('../services');
const copilotActionService = require('../services/copilotAction.service');
const {
  invalidateTenantEntityCaches,
} = require('../services/copilotEntityResolver.service');

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

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const invalidateNodeResolverCache = async (tenantId) => {
  if (!tenantId) return;
  try {
    await invalidateTenantEntityCaches({
      tenantId: String(tenantId),
      entityType: 'node',
    });
  } catch (_) {
    // non-blocking cache invalidation
  }
};

// Create a new node
const createNode = catchAsync(async (req, res) => {
  // SECURITY: Add tenantId from authenticated user
  req.body.tenantId = req.user.tenantId;
  const node = await nodeService.createNode(req.body);
  await invalidateNodeResolverCache(req.user?.tenantId || node?.tenantId);
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'create_node',
    entityType: 'node',
    entityId: String(node._id || node.id || node.nodeId || ''),
    payload: {
      source: 'node.controller.createNode',
      nodeName: node.name || req.body.name || null,
      parent: req.body.parent || null,
    },
    source: 'existing-service',
    priority: 8,
  });
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
  const previousParent = node.parent ? String(node.parent) : null;
  const updatedNode = await nodeService.updateNodeById(
    req.params.nodeId,
    req.body
  );
  await invalidateNodeResolverCache(req.user?.tenantId || updatedNode?.tenantId);

  if (Object.prototype.hasOwnProperty.call(req.body, 'parent')) {
    const nextParent = updatedNode.parent ? String(updatedNode.parent) : null;
    if (previousParent !== nextParent) {
      await copilotActionService.recordExistingAction({
        tenantId: req.user.tenantId,
        actorUserId: req.user._id || req.user.id,
        actionType: 'move_node',
        entityType: 'node',
        entityId: String(req.params.nodeId),
        payload: {
          source: 'node.controller.updateNodeById',
          previousParent,
          nextParent,
        },
        source: 'existing-service',
        priority: 7,
      });
    }
  }
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
  await invalidateNodeResolverCache(req.user?.tenantId || node?.tenantId);
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'delete_node',
    entityType: 'node',
    entityId: String(req.params.nodeId),
    payload: {
      source: 'node.controller.deleteNodeById',
      mode: 'soft',
      nodeName: node.name || null,
    },
    source: 'existing-service',
    priority: 9,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const deleteNodeHardById = catchAsync(async (req, res) => {
  const node = await nodeService.getNodeById(req.params.nodeId);
  await nodeService.deleteNodeById(req.params.nodeId, true, {
    includeDeleted: true,
  });
  await invalidateNodeResolverCache(req.user?.tenantId || node?.tenantId);
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId || node?.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'delete_node',
    entityType: 'node',
    entityId: String(req.params.nodeId),
    payload: {
      source: 'node.controller.deleteNodeHardById',
      mode: 'hard',
      nodeName: node?.name || null,
    },
    source: 'existing-service',
    priority: 10,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const restoreNodeById = catchAsync(async (req, res) => {
  const restoredNode = await nodeService.restoreNodeById(
    req.params.nodeId,
    req.body || {}
  );
  await invalidateNodeResolverCache(req.user?.tenantId || restoredNode?.tenantId);
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId || restoredNode.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'restore_node',
    entityType: 'node',
    entityId: String(restoredNode._id || restoredNode.id || req.params.nodeId),
    payload: {
      source: 'node.controller.restoreNodeById',
      nodeName: restoredNode.name || null,
    },
    source: 'existing-service',
    priority: 8,
  });
  res.send(nodeService.buildNodeResponse(restoredNode));
});

// Query nodes with filters and pagination
const queryNodes = catchAsync(async (req, res) => {
  // SECURITY: Always filter by authenticated user's tenantId
  const filter = pick(req.query, ['type', 'parent', 'level']);
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

  const includeFamily =
    String(req.query.includeFamily || '').toLowerCase() === 'true';

  let result;
  if (includeFamily && search && !filter.level) {
    const matchedRoots = await Nodes.find(filter)
      .select('path')
      .limit(safeLimit)
      .lean();

    if (!matchedRoots.length) {
      result = {
        results: [],
        page: options.page,
        limit: options.limit,
        totalPages: 0,
        totalResults: 0,
      };
    } else {
      const familyPathFilters = matchedRoots
        .map((node) => String(node.path || '').trim())
        .filter(Boolean)
        .map((pathValue) => ({
          path: { $regex: `^${escapeRegex(pathValue)}` },
        }));

      const baseFilter = { ...filter };
      delete baseFilter.name;

      const familyFilter = {
        $and: [baseFilter, { $or: familyPathFilters }],
      };

      result = await nodeService.queryNodes(familyFilter, options);
    }
  } else {
    result = await nodeService.queryNodes(filter, options);
  }

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
  const currentNode = await nodeService.getNodeById(req.params.nodeId);
  const updatedNode = await nodeService.moveNodeToParent(
    req.params.nodeId,
    req.body.parentId
  );
  await invalidateNodeResolverCache(req.user?.tenantId || updatedNode?.tenantId);
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId || currentNode.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'move_node',
    entityType: 'node',
    entityId: String(req.params.nodeId),
    payload: {
      source: 'node.controller.moveNodeToParent',
      previousParent: currentNode.parent ? String(currentNode.parent) : null,
      nextParent: req.body.parentId || null,
    },
    source: 'existing-service',
    priority: 7,
  });
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
  await invalidateNodeResolverCache(req.user?.tenantId || updatedNode?.tenantId);
  res.send(nodeService.buildNodeResponse(updatedNode));
});

// Deactivate a node
const deactivateNode = catchAsync(async (req, res) => {
  const updatedNode = await nodeService.deactivateNode(req.params.nodeId);
  await invalidateNodeResolverCache(req.user?.tenantId || updatedNode?.tenantId);
  res.send(nodeService.buildNodeResponse(updatedNode));
});

// Assign users to a node
const assignUsersToNode = catchAsync(async (req, res) => {
  const existingNode = await nodeService.getNodeById(req.params.nodeId);
  const previousUsers = new Set(
    (existingNode?.users || []).map((userRef) => String(userRef))
  );
  const requestedUsers = new Set((req.body.userIds || []).map((id) => String(id)));

  const updatedNode = await nodeService.assignUsersToNode(
    req.params.nodeId,
    req.body.userIds
  );
  await invalidateNodeResolverCache(req.user?.tenantId || updatedNode?.tenantId);

  const assignedUsers = [...requestedUsers].filter((id) => !previousUsers.has(id));
  const unassignedUsers = [...previousUsers].filter((id) => !requestedUsers.has(id));

  if (assignedUsers.length > 0) {
    await copilotActionService.recordExistingAction({
      tenantId: req.user.tenantId || existingNode?.tenantId,
      actorUserId: req.user._id || req.user.id,
      actionType: 'assign_user_to_node',
      entityType: 'node_user',
      entityId: String(req.params.nodeId),
      payload: {
        source: 'node.controller.assignUsersToNode',
        assignedUsers,
      },
      source: 'existing-service',
      priority: 6,
    });
  }

  if (unassignedUsers.length > 0) {
    await copilotActionService.recordExistingAction({
      tenantId: req.user.tenantId || existingNode?.tenantId,
      actorUserId: req.user._id || req.user.id,
      actionType: 'unassign_user_from_node',
      entityType: 'node_user',
      entityId: String(req.params.nodeId),
      payload: {
        source: 'node.controller.assignUsersToNode',
        unassignedUsers,
      },
      source: 'existing-service',
      priority: 6,
    });
  }

  res.send(nodeService.buildNodeResponse(updatedNode));
});

// Bulk import nodes
const bulkImportNodes = catchAsync(async (req, res) => {
  const nodes = await nodeService.bulkImportNodes(req.body.nodes);
  await invalidateNodeResolverCache(req.user?.tenantId);
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
