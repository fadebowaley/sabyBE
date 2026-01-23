const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { levelService } = require('../services');

// Create a new level
const createLevel = catchAsync(async (req, res) => {
  console.log('='.repeat(80));
  console.log('[LEVEL CONTROLLER - CREATE] ===== LEVEL CREATION REQUEST =====');
  console.log('[LEVEL CONTROLLER - CREATE] Tenant ID:', req.user.tenantId);
  console.log(
    '[LEVEL CONTROLLER - CREATE] Request Body (raw):',
    JSON.stringify(req.body, null, 2)
  );
  console.log(
    '[LEVEL CONTROLLER - CREATE] Request Body keys:',
    Object.keys(req.body)
  );
  console.log(
    '[LEVEL CONTROLLER - CREATE] Level name from payload:',
    req.body.name
  );
  console.log(
    '[LEVEL CONTROLLER - CREATE] Level rank from payload:',
    req.body.rank
  );
  console.log(
    '[LEVEL CONTROLLER - CREATE] Level description from payload:',
    req.body.description
  );
  console.log('='.repeat(80));

  // SECURITY: Add tenantId from authenticated user
  req.body.tenantId = req.user.tenantId;

  console.log(
    '[LEVEL CONTROLLER - CREATE] Body after adding tenantId:',
    JSON.stringify(req.body, null, 2)
  );

  const level = await levelService.createLevel(req.body);

  console.log(
    '[LEVEL CONTROLLER - CREATE] Created level result:',
    JSON.stringify(level, null, 2)
  );
  console.log('[LEVEL CONTROLLER - CREATE] Created level name:', level.name);
  console.log('[LEVEL CONTROLLER - CREATE] Created level rank:', level.rank);
  console.log('='.repeat(80));

  res.status(httpStatus.CREATED).send(level);
});

// Get level by ID
const getLevelById = catchAsync(async (req, res) => {
  const level = await levelService.getLevelById(req.params.levelId);
  if (!level) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Level not found');
  }
  // SECURITY: Verify level belongs to user's tenant
  if (level.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - level belongs to different tenant'
    );
  }
  res.send(level);
});

// Get level by name
const getLevelByName = catchAsync(async (req, res) => {
  const level = await levelService.getLevelByName(req.params.levelName);
  if (!level) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Level not found');
  }
  res.send(level);
});

// Update level by ID
const updateLevelById = catchAsync(async (req, res) => {
  console.log(
    '[LEVEL CONTROLLER - UPDATE] Level ID:',
    req.params.levelId,
    'Tenant:',
    req.user.tenantId
  );
  const level = await levelService.getLevelById(req.params.levelId);
  // SECURITY: Verify level belongs to user's tenant
  if (level.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - level belongs to different tenant'
    );
  }
  // SECURITY: Ensure tenantId cannot be changed
  req.body.tenantId = req.user.tenantId;
  const updatedLevel = await levelService.updateLevelById(
    req.params.levelId,
    req.body
  );
  res.send(updatedLevel);
});

// Delete level by ID
const deleteLevelById = catchAsync(async (req, res) => {
  console.log(
    '[LEVEL CONTROLLER - DELETE] Level ID:',
    req.params.levelId,
    'Tenant:',
    req.user.tenantId
  );
  const level = await levelService.getLevelById(req.params.levelId);
  // SECURITY: Verify level belongs to user's tenant
  if (level.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - level belongs to different tenant'
    );
  }
  await levelService.deleteLevelById(req.params.levelId);
  res.status(httpStatus.NO_CONTENT).send();
});

// Query levels with filters and pagination
const queryLevels = catchAsync(async (req, res) => {
  console.log(
    '[LEVEL CONTROLLER - QUERY] Query params:',
    req.query,
    'Tenant:',
    req.user.tenantId
  );
  // SECURITY: Always filter by authenticated user's tenantId
  const filter = pick(req.query, ['type', 'parent']);
  filter.tenantId = req.user.tenantId;
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  // Support filtering levels by active structures
  // If onlyWithStructures=true, only return levels that have at least one active structure
  if (req.query.onlyWithStructures === 'true' || req.query.onlyWithStructures === true) {
    options.onlyWithStructures = true;
    console.log('[LEVEL CONTROLLER - QUERY] Filtering levels to only those with active structures');
  }
  
  console.log('[LEVEL CONTROLLER - QUERY] Filter with tenantId:', filter);
  console.log('[LEVEL CONTROLLER - QUERY] Options:', options);
  const result = await levelService.queryLevels(filter, options);
  console.log(
    '[LEVEL CONTROLLER - QUERY] Found',
    result.results?.length || 0,
    'levels for tenant:',
    filter.tenantId
  );
  console.log('[LEVEL CONTROLLER - QUERY] Result structure:', {
    hasResults: !!result.results,
    resultsLength: result.results?.length || 0,
    totalPages: result.totalPages,
    totalResults: result.totalResults,
    firstLevelSample: result.results?.[0]
      ? {
          id: result.results[0].id,
          _id: result.results[0]._id,
          name: result.results[0].name,
          rank: result.results[0].rank,
          tenantId: result.results[0].tenantId,
          allKeys: Object.keys(result.results[0]),
        }
      : null,
  });
  console.log(
    '[LEVEL CONTROLLER - QUERY] Full result:',
    JSON.stringify(result, null, 2)
  );
  res.send(result);
});

// Get levels by hierarchy
const getLevelsByHierarchy = catchAsync(async (req, res) => {
  const hierarchy = await levelService.getLevelsByHierarchy();
  res.send(hierarchy);
});

// Get parent level
const getParentLevel = catchAsync(async (req, res) => {
  const parentLevel = await levelService.getParentLevel(req.params.levelId);
  res.send(parentLevel);
});

// Get child levels
const getChildLevels = catchAsync(async (req, res) => {
  const childLevels = await levelService.getChildLevels(req.params.levelId);
  res.send(childLevels);
});

// Move level to a new parent
const moveLevelToParent = catchAsync(async (req, res) => {
  const updatedLevel = await levelService.moveLevelToParent(
    req.params.levelId,
    req.body.parentId
  );
  res.send(updatedLevel);
});

// Activate a level
const activateLevel = catchAsync(async (req, res) => {
  const updatedLevel = await levelService.activateLevel(req.params.levelId);
  res.send(updatedLevel);
});

// Deactivate a level
const deactivateLevel = catchAsync(async (req, res) => {
  const updatedLevel = await levelService.deactivateLevel(req.params.levelId);
  res.send(updatedLevel);
});

// Get next level in hierarchy
const getNextLevel = catchAsync(async (req, res) => {
  const { currentRank, tenantId } = req.query;

  if (!currentRank || !tenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'currentRank and tenantId are required'
    );
  }

  const nextLevel = await levelService.getNextLevel(
    parseInt(currentRank),
    tenantId
  );
  res.send(nextLevel);
});

// Get previous level in hierarchy
const getPreviousLevel = catchAsync(async (req, res) => {
  const { currentRank, tenantId } = req.query;

  if (!currentRank || !tenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'currentRank and tenantId are required'
    );
  }

  const previousLevel = await levelService.getPreviousLevel(
    parseInt(currentRank),
    tenantId
  );
  res.send(previousLevel);
});

module.exports = {
  createLevel,
  getLevelById,
  getLevelByName,
  updateLevelById,
  deleteLevelById,
  queryLevels,
  getLevelsByHierarchy,
  getParentLevel,
  getChildLevels,
  moveLevelToParent,
  activateLevel,
  deactivateLevel,
  getNextLevel,
  getPreviousLevel,
};