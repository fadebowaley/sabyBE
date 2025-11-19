const Joi = require('joi');
const { objectId, nodeIdentifier } = require('./custom.validation');

// Validation schema for creating a new node
const createNode = {
  body: Joi.object().keys({
    tenantId: Joi.string()
      .required()
      .pattern(/^[a-zA-Z0-9\-_]+$/),
    level: Joi.string().custom(objectId).required(),
    structure: Joi.string().custom(objectId).required(),
    parent: Joi.string().custom(objectId).allow('', null),
    isMain: Joi.boolean().default(true),
    isOwner: Joi.boolean().default(false),
    name: Joi.string().required().trim(),
    address: Joi.string().required().trim(),
    city: Joi.string().required().trim(),
    state: Joi.string().required().trim(),
    country: Joi.string().required().trim(),
    postalCode: Joi.string(),
    dateOfEstablishment: Joi.date(),
    users: Joi.array().items(Joi.string().custom(objectId)),
    customFields: Joi.object(),
  }),
};

// Validation schema for querying nodes
const queryNodes = {
  query: Joi.object().keys({
    tenantId: Joi.string().pattern(/^[a-zA-Z0-9\-_]+$/),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    status: Joi.string().valid('active', 'archived', 'all').default('active'),
  }),
};

// Validation schema for getting a node by ID
const getNodeById = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
};

// Validation schema for updating a node by ID
const updateNodeById = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
  body: Joi.object()
    .keys({
      // Node table fields
      level: Joi.string().custom(objectId),
      parent: Joi.alternatives()
        .try(Joi.string().custom(objectId), Joi.valid(null))
        .optional(),
      structure: Joi.string().custom(objectId),
      isMain: Joi.boolean(),
      isOwner: Joi.boolean(),
      name: Joi.string().trim(),
      address: Joi.string().trim(),
      city: Joi.string().trim(),
      state: Joi.string().trim(),
      country: Joi.string().trim(),
      postalCode: Joi.string(),
      users: Joi.array().items(Joi.string().custom(objectId)),
      isActive: Joi.boolean(),
      // NodeProfile table fields (auto-routed to profile)
      dateOfEstablishment: Joi.date(),
      propertyStatus: Joi.string().valid('Owned', 'Rented', 'Leased', 'Other'),
      estimatedValue: Joi.number(),
      buildingType: Joi.string(),
      status: Joi.string().valid('Active', 'Inactive', 'Under Construction'),

      // ✨ NEW: Support nested profile object structure
      profile: Joi.object().keys({
        propertyStatus: Joi.string().valid(
          'Owned',
          'Rented',
          'Leased',
          'Other'
        ),
        estimatedValue: Joi.number(),
        buildingType: Joi.string(),
        facilityStatus: Joi.string().valid(
          'Active',
          'Inactive',
          'Under Construction'
        ),
      }),
      customFields: Joi.object(),
    })
    .min(1),
};

// Validation schema for deleting a node by ID
const deleteNodeById = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
};

// Validation schema for getting nodes by type (e.g., main, owner)
const getNodesByType = {
  query: Joi.object().keys({
    type: Joi.string().valid('main', 'owner').required(),
  }),
};

// Validation schema for fetching the parent node
const getParentNode = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
};

// Validation schema for fetching the child nodes
const getChildNodes = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
};

// Validation schema for moving a node to a parent node
const moveNodeToParent = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
  body: Joi.object().keys({
    parentId: Joi.alternatives()
      .try(Joi.string().custom(objectId), Joi.valid(null))
      .required(),
  }),
};

// Validation schema for getting the node path (parent hierarchy)
const getNodePath = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
};

// Validation schema for activating a node
const activateNode = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
};

// Validation schema for deactivating a node
const deactivateNode = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
};

// Validation schema for assigning users to a node
const assignUsersToNode = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
  body: Joi.object().keys({
    userIds: Joi.array().items(Joi.string().custom(objectId)).required(),
  }),
};

const restoreNodeById = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
  body: Joi.object()
    .keys({
      parent: Joi.alternatives()
        .try(Joi.string().custom(objectId), Joi.valid(null))
        .optional(),
      level: Joi.string().custom(objectId).optional(),
    })
    .optional(),
};

const hardDeleteNodeById = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(nodeIdentifier).required(),
  }),
};

// Validation schema for bulk importing nodes
const bulkImportNodes = {
  body: Joi.object().keys({
    nodes: Joi.array()
      .items(
        Joi.object().keys({
          tenantId: Joi.string().required().alphanum(),
          level: Joi.string().custom(objectId).required(),
          parent: Joi.string().custom(objectId),
          isMain: Joi.boolean().default(true),
          isOwner: Joi.boolean().default(false),
          name: Joi.string().required().trim(),
          address: Joi.string().required().trim(),
          city: Joi.string().required().trim(),
          state: Joi.string().required().trim(),
          country: Joi.string().required().trim(),
          postalCode: Joi.string(),
          dateOfEstablishment: Joi.date(),
          users: Joi.array().items(Joi.string().custom(objectId)),
        })
      )
      .min(1)
      .required(),
  }),
};

module.exports = {
  createNode,
  queryNodes,
  getNodeById,
  updateNodeById,
  deleteNodeById,
  restoreNodeById,
  hardDeleteNodeById,
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
