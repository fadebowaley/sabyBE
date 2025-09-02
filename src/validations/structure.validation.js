const Joi = require('joi');


const createStructure = Joi.object({
  tempId: Joi.string().required(),
  name: Joi.string().trim().min(1).required(),
  code: Joi.string().trim().allow('', null), // optional, can be empty string or null
  description: Joi.string().allow('', null),
  levelRank: Joi.number().integer().min(0).required(),
  parentTempId: Joi.string().allow(null), // can be null for root nodes
  active: Joi.boolean().required(),
  special: Joi.boolean().required(),
});


const updateStructure = {
  params: Joi.object().keys({
    structureId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      type: Joi.string(),
      description: Joi.string().allow('', null),
      parentId: Joi.string().allow(null),
      metadata: Joi.object().allow(null),
      isActive: Joi.boolean(),
      position: Joi.number().integer().min(0),
    })
    .min(1),
};

const getStructure = {
  params: Joi.object().keys({
    structureId: Joi.string().required(),
  }),
};

const deleteStructure = {
  params: Joi.object().keys({
    structureId: Joi.string().required(),
  }),
};

const getStructures = {
  query: Joi.object().keys({
    name: Joi.string(),
    type: Joi.string(),
    parentId: Joi.string(),
    level: Joi.string(),
    tenantId: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const listStructures = {
  query: Joi.object().keys({
    name: Joi.string(),
    type: Joi.string(),
    parentId: Joi.string(),
    level: Joi.string(),
    tenantId: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const moveStructure = {
  params: Joi.object().keys({
    structureId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    newParentId: Joi.string().allow(null).required(),
    position: Joi.number().integer().min(0),
  }),
};

const getStructureTree = {
  query: Joi.object().keys({
    rootId: Joi.string(),
    depth: Joi.number().integer().min(1).max(10),
    includeInactive: Joi.boolean().default(false),
  }),
};

const duplicateStructure = {
  params: Joi.object().keys({
    structureId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    name: Joi.string(),
    includeChildren: Joi.boolean().default(true),
  }),
};

module.exports = {
  createStructure,
  updateStructure,
  getStructure,
  deleteStructure,
  getStructures,
  listStructures,
  moveStructure,
  getStructureTree,
  duplicateStructure,
};
