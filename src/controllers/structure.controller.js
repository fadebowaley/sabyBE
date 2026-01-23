const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { structureService } = require('../services');

// Create a new structure
const createStructure = catchAsync(async (req, res) => {
  try {
    const { tenantId } = req.user;
    const createdBy = req.user._id;
    const result = await structureService.saveStructuresAndLevels(
      req.body.structures,
      tenantId,
      createdBy
    );
    res.status(httpStatus.CREATED).send(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Get structure by ID
const getStructure = catchAsync(async (req, res) => {
  console.log(
    '[STRUCTURE CONTROLLER - GET] Structure ID:',
    req.params.structureId,
    'Tenant:',
    req.user.tenantId
  );
  const structure = await structureService.getStructureById(
    req.params.structureId
  );
  if (!structure) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Structure not found');
  }
  // SECURITY: Verify structure belongs to user's tenant
  if (structure.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - structure belongs to different tenant'
    );
  }
  res.send(structure);
});

// Get structure by name
const getStructureByName = catchAsync(async (req, res) => {
  const structure = await structureService.getStructureByName(req.params.name);
  if (!structure) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Structure not found');
  }
  res.send(structure);
});

// Update structure
const updateStructure = catchAsync(async (req, res) => {
  console.log(
    '[STRUCTURE CONTROLLER - UPDATE] Structure ID:',
    req.params.structureId,
    'Tenant:',
    req.user.tenantId
  );
  console.log('[STRUCTURE CONTROLLER - UPDATE] Request body:', req.body);

  const structure = await structureService.getStructureById(
    req.params.structureId
  );
  // SECURITY: Verify structure belongs to user's tenant
  if (structure.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - structure belongs to different tenant'
    );
  }

  // Convert parentId to parent for database (API uses parentId, DB uses parent)
  const updateData = { ...req.body };
  if ('parentId' in updateData) {
    updateData.parent = updateData.parentId;
    delete updateData.parentId;
    console.log(
      '[STRUCTURE CONTROLLER - UPDATE] Converted parentId to parent:',
      updateData.parent
    );
  }

  console.log('[STRUCTURE CONTROLLER - UPDATE] Final update data:', updateData);

  const updated = await structureService.updateStructureById(
    req.params.structureId,
    updateData
  );
  res.send(updated);
});

// Delete structure
const deleteStructure = catchAsync(async (req, res) => {
  console.log(
    '[STRUCTURE CONTROLLER - DELETE] Structure ID:',
    req.params.structureId,
    'Tenant:',
    req.user.tenantId
  );
  const structure = await structureService.getStructureById(
    req.params.structureId
  );
  // SECURITY: Verify structure belongs to user's tenant
  if (structure.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - structure belongs to different tenant'
    );
  }
  await structureService.deleteStructureById(req.params.structureId);
  res.status(httpStatus.NO_CONTENT).send();
});

// Query structures
const getStructures = catchAsync(async (req, res) => {
  console.log('[STRUCTURE CONTROLLER - QUERY] Query params:', req.query);
  console.log(
    '[STRUCTURE CONTROLLER - QUERY] User tenant ID:',
    req.user?.tenantId
  );

  // CRITICAL: Always filter by the authenticated user's tenantId for security
  const filter = pick(req.query, ['type', 'isActive', 'level']);
  filter.tenantId = req.user.tenantId; // Force tenant isolation

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  // Add populate option to include level and parent data
  options.populate = 'level,parent';

  console.log('[STRUCTURE CONTROLLER - QUERY] Filter with tenantId:', filter);
  console.log(
    '[STRUCTURE CONTROLLER - QUERY] Populate options:',
    options.populate
  );
  const result = await structureService.queryStructures(filter, options);
  console.log(
    '[STRUCTURE CONTROLLER - QUERY] Found',
    result.results?.length || 0,
    'structures for tenant:',
    filter.tenantId
  );
  console.log(
    '[STRUCTURE CONTROLLER - QUERY] Returning structures:',
    result.results
  );
  res.send(result);
});

// Get structures by type
const getStructuresByType = catchAsync(async (req, res) => {
  const structures = await structureService.getStructuresByType(
    req.params.type
  );
  res.send(structures);
});

// Get parent structure
const getParentStructure = catchAsync(async (req, res) => {
  const parent = await structureService.getParentStructure(
    req.params.structureId
  );
  res.send(parent);
});

// Get child structures
const getChildStructures = catchAsync(async (req, res) => {
  const children = await structureService.getChildStructures(
    req.params.structureId
  );
  res.send(children);
});

// Move structure to a new parent
const moveStructureToParent = catchAsync(async (req, res) => {
  const result = await structureService.moveStructureToParent(
    req.params.structureId,
    req.body.parentId
  );
  res.send(result);
});

// Get full structure path
const getStructurePath = catchAsync(async (req, res) => {
  const path = await structureService.getStructurePath(req.params.structureId);
  res.send(path);
});

// Get hierarchy
const getStructureHierarchy = catchAsync(async (req, res) => {
  const hierarchy = await structureService.getStructureHierarchy(
    req.params.structureId
  );
  res.send(hierarchy);
});

// Activate a structure
const activateStructure = catchAsync(async (req, res) => {
  const result = await structureService.activateStructure(
    req.params.structureId
  );
  res.send(result);
});

// Deactivate a structure
const deactivateStructure = catchAsync(async (req, res) => {
  const result = await structureService.deactivateStructure(
    req.params.structureId
  );
  res.send(result);
});

module.exports = {
  createStructure,
  getStructure,
  getStructureByName,
  updateStructure,
  deleteStructure,
  getStructures,
  getStructuresByType,
  getParentStructure,
  getChildStructures,
  moveStructureToParent,
  getStructurePath,
  getStructureHierarchy,
  activateStructure,
  deactivateStructure,
};
