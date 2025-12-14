const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Level, Structures, Nodes } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a new level
 * @param {Object} levelBody
 * @returns {Promise<Level>}
 */
const createLevel = async (levelBody) => {
  console.log('='.repeat(80));
  console.log('[LEVEL SERVICE - createLevel] ===== CREATING LEVEL =====');
  console.log(
    '[LEVEL SERVICE - createLevel] Level body received:',
    JSON.stringify(levelBody, null, 2)
  );
  console.log('[LEVEL SERVICE - createLevel] Level name:', levelBody.name);
  console.log('[LEVEL SERVICE - createLevel] Level rank:', levelBody.rank);
  console.log(
    '[LEVEL SERVICE - createLevel] Level description:',
    levelBody.description
  );
  console.log(
    '[LEVEL SERVICE - createLevel] Level tenantId:',
    levelBody.tenantId
  );

  // Check if Level.createLevel is a static method or if we should use Level.create
  if (typeof Level.createLevel === 'function') {
    console.log(
      '[LEVEL SERVICE - createLevel] Using Level.createLevel static method'
    );
    const level = await Level.createLevel(levelBody);
    console.log(
      '[LEVEL SERVICE - createLevel] Level created via static method:',
      JSON.stringify(level, null, 2)
    );
    console.log(
      '[LEVEL SERVICE - createLevel] Created level name:',
      level.name
    );
    return level;
  } else {
    console.log(
      '[LEVEL SERVICE - createLevel] Using Level.create (mongoose default)'
    );
    const level = await Level.create(levelBody);
    console.log(
      '[LEVEL SERVICE - createLevel] Level created via mongoose create:',
      JSON.stringify(level, null, 2)
    );
    console.log(
      '[LEVEL SERVICE - createLevel] Created level name:',
      level.name
    );
    return level;
  }
};

/**
 * Get level by id
 * @param {ObjectId} id
 * @returns {Promise<Level>}
 */

const getLevelById = async (id) => {
  const level = await Level.findById(id);
  if (!level) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Level not found');
  }
  return level;
};

/**
 * Get level by name
 * @param {string} name
 * @returns {Promise<Level>}
 */
const getLevelByName = async (name) => {
  const level = await Level.findOne({ name });
  if (!level) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Level not found');
  }
  return level;
};

/**
 * Update level by id
 * @param {ObjectId} levelId
 * @param {Object} updateBody
 * @returns {Promise<Level>}
 */

const updateLevelById = async (levelId, updateBody) => {
  // Require tenantId in updateBody for this operation
  const { tenantId } = updateBody;
  if (!tenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'tenantId is required to update a level'
    );
  }

  // Find the level by both tenantId and _id (levelId)
  const level = await Level.findOne({ _id: levelId, tenantId });
  if (!level) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Level not found for the given tenant'
    );
  }

  // If updating rank or isSpecial
  const isSpecial =
    updateBody.isSpecial !== undefined ? updateBody.isSpecial : level.isSpecial;
  const rank = updateBody.rank !== undefined ? updateBody.rank : level.rank;

  if (!isSpecial) {
    const existing = await Level.findOne({
      _id: { $ne: levelId },
      tenantId,
      rank,
      isSpecial: false,
      deletedAt: null, // optionally ignore soft-deleted ones
    });

    if (existing) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Another non-special level with the same rank already exists for this tenant.'
      );
    }
  }

  Object.assign(level, updateBody);
  await level.save();
  return level;
};

/**
 * Delete level by id
 * Also deletes associated structures and nodes if they exist
 * @param {ObjectId} levelId
 * @returns {Promise<Level>}
 */
const deleteLevelById = async (levelId) => {
  console.log('[LEVEL SERVICE - DELETE] Deleting level:', levelId);
  const session = await mongoose.startSession();
  const useTransaction = !!session.supports?.transactions;

  try {
    if (useTransaction) {
      console.log('[LEVEL SERVICE - DELETE] Starting Mongo transaction');
      await session.startTransaction();
    } else {
      console.warn(
        '[LEVEL SERVICE - DELETE] Transactions not supported in current Mongo topology. Continuing without transaction.'
      );
    }

    // Get the level within transaction
    const level = await Level.findById(levelId).session(
      useTransaction ? session : null
    );
  if (!level) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Level not found');
  }

    // Check if any structures reference this level
    const structuresUsingLevel = await Structures.countDocuments({
      level: levelId,
    }).session(useTransaction ? session : null);

    // Check if any nodes reference this level
    const nodesUsingLevel = await Nodes.countDocuments({
      level: levelId,
    }).session(useTransaction ? session : null);

    console.log('[LEVEL SERVICE - DELETE] Level usage check:', {
      levelId,
      structuresUsingLevel,
      nodesUsingLevel,
    });

    // If structures or nodes use this level, delete them first (cascade delete)
    if (structuresUsingLevel > 0) {
      console.log(
        '[LEVEL SERVICE - DELETE] Deleting',
        structuresUsingLevel,
        'structures associated with level'
      );
      await Structures.deleteMany(
        { level: levelId },
        { session: useTransaction ? session : null }
      );
    }

    if (nodesUsingLevel > 0) {
      console.log(
        '[LEVEL SERVICE - DELETE] Deleting',
        nodesUsingLevel,
        'nodes associated with level'
      );
      await Nodes.deleteMany(
        { level: levelId },
        { session: useTransaction ? session : null }
      );
    }

    // Delete the level
    await Level.deleteOne(
      { _id: levelId },
      { session: useTransaction ? session : null }
    );

    console.log('[LEVEL SERVICE - DELETE] Level deleted successfully', {
    levelId: level._id?.toString(),
    tenantId: level.tenantId,
    name: level.name,
    rank: level.rank,
      deletedStructures: structuresUsingLevel,
      deletedNodes: nodesUsingLevel,
  });

    if (useTransaction) {
      await session.commitTransaction();
      console.log('[LEVEL SERVICE - DELETE] Transaction committed');
    }

  return level;
  } catch (err) {
    console.error('[LEVEL SERVICE - DELETE] Error deleting level:', err);
    if (useTransaction) {
      await session.abortTransaction();
      console.log('[LEVEL SERVICE - DELETE] Transaction aborted due to error');
    }
    throw err;
  } finally {
    session.endSession();
    console.log('[LEVEL SERVICE - DELETE] Mongo session closed');
  }
};

/**
 * Query for levels
 * @param {Object} filter - Mongoose filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {boolean} [options.onlyWithStructures] - If true, only return levels that have active structures
 * @returns {Promise<QueryResult>}
 */

const queryLevels = async (filter, options) => {
  console.log(
    '[LEVEL SERVICE - queryLevels] Filter:',
    JSON.stringify(filter, null, 2)
  );
  console.log(
    '[LEVEL SERVICE - queryLevels] Options:',
    JSON.stringify(options, null, 2)
  );

  // If onlyWithStructures is true, filter levels to only those with active structures
  if (options?.onlyWithStructures) {
    console.log('[LEVEL SERVICE - queryLevels] Filtering levels by active structures');
    
    // Get all active structures for the tenant
    const activeStructures = await Structures.find({
      tenantId: filter.tenantId,
      isActive: true,
    }).select('level').lean();

    // Extract unique level IDs from active structures
    // Convert to ObjectIds for proper MongoDB query
    const levelIdsWithStructures = [...new Set(
      activeStructures
        .map(s => s.level)
        .filter(Boolean)
        .map(id => {
          // If already ObjectId, use it; otherwise convert string to ObjectId
          return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);
        })
    )];

    console.log('[LEVEL SERVICE - queryLevels] Level IDs with active structures:', levelIdsWithStructures.map(id => id.toString()));

    // Add level ID filter to only include levels that have active structures
    if (levelIdsWithStructures.length > 0) {
      filter._id = { $in: levelIdsWithStructures };
    } else {
      // If no active structures exist, return empty result
      console.log('[LEVEL SERVICE - queryLevels] No active structures found, returning empty result');
      return {
        results: [],
        page: options?.page || 1,
        limit: options?.limit || 10,
        totalPages: 0,
        totalResults: 0,
      };
    }
  }

  const result = await Level.paginate(filter, options);
  console.log('[LEVEL SERVICE - queryLevels] Result from paginate:', {
    hasResults: !!result.results,
    resultsLength: result.results?.length || 0,
    totalPages: result.totalPages,
    totalResults: result.totalResults,
    firstLevelKeys: result.results?.[0] ? Object.keys(result.results[0]) : null,
    firstLevelId: result.results?.[0]?._id?.toString(),
    firstLevelIdField: result.results?.[0]?.id,
    firstLevelName: result.results?.[0]?.name,
  });
  if (result.results && result.results.length > 0) {
    console.log(
      '[LEVEL SERVICE - queryLevels] First level full object:',
      JSON.stringify(
        result.results[0].toObject
          ? result.results[0].toObject()
          : result.results[0],
        null,
        2
      )
    );
  }
  return result;
};

/**
 * Get levels by hierarchy
 * @param {number} hierarchy - Hierarchy level
 * @returns {Promise<Array<Level>>}
 */
const getLevelsByHierarchy = async (tenantId, hierarchy) =>
  Level.getLevelsByHierarchy(tenantId, hierarchy);

/**
 * Get parent level
 * @param {ObjectId} levelId
 * @returns {Promise<Level>}
 */
const getParentLevel = async (levelId) => {
  const level = await getLevelById(levelId);
  if (!level.parentId) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Parent level not found');
  }
  return getLevelById(level.parentId);
};

/**
 * Get child levels
 * @param {ObjectId} levelId
 * @returns {Promise<Array<Level>>}
 */
const getChildLevels = async (levelId) => Level.find({ parentId: levelId });

/**
 * Move level to new parent
 * @param {ObjectId} levelId
 * @param {ObjectId} newParentId
 * @returns {Promise<Level>}
 */
const moveLevelToParent = async (levelId, newParentId) => {
  const level = await getLevelById(levelId);
  const newParent = await getLevelById(newParentId);

  level.parentId = newParentId;
  level.hierarchy = newParent.hierarchy + 1;

  await level.save();
  return level;
};

/**
 * Activate level
 * @param {ObjectId} levelId
 * @returns {Promise<Level>}
 */
const activateLevel = async (levelId) => {
  const level = await getLevelById(levelId);
  level.isActive = true;
  await level.save();
  return level;
};

/**
 * Deactivate level
 * @param {ObjectId} levelId
 * @returns {Promise<Level>}
 */
const deactivateLevel = async (levelId) => {
  const level = await getLevelById(levelId);
  level.isActive = false;
  await level.save();
  return level;
};

/**
 * Get next level in hierarchy
 * @param {number} currentRank - Current level rank
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Level>}
 */
const getNextLevel = async (currentRank, tenantId) => {
  // Find the next level with rank = currentRank + 1
  const nextLevel = await Level.findOne({
    tenantId,
    rank: currentRank + 1,
    deletedAt: null,
  });

  if (!nextLevel) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Next level not found in hierarchy'
    );
  }

  return nextLevel;
};

/**
 * Get previous level in hierarchy
 * @param {number} currentRank - Current level rank
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Level>}
 */
const getPreviousLevel = async (currentRank, tenantId) => {
  // Find the previous level with rank = currentRank - 1
  const previousLevel = await Level.findOne({
    tenantId,
    rank: currentRank - 1,
    deletedAt: null,
  });

  if (!previousLevel) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Previous level not found in hierarchy'
    );
  }

  return previousLevel;
};

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
