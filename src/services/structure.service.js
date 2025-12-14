const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { Structures, Level, Nodes } = require('../models');
const ApiError = require('../utils/ApiError');

const saveStructuresAndLevels = async (structures, tenantId, createdBy) => {
  if (!Array.isArray(structures)) {
    structures = [structures]; // wrap single object in array
  }
  const session = await mongoose.startSession();
  const useTransaction = !!session.supports?.transactions;

  console.log('[STRUCTURE SERVICE] saveStructuresAndLevels requested', {
    tenantId,
    createdBy,
    totalStructures: structures?.length || 0,
    useTransaction,
  });

  try {
    if (useTransaction) {
      console.log('[STRUCTURE SERVICE] Starting Mongo transaction');
      await session.startTransaction();
    } else {
      console.warn(
        '[STRUCTURE SERVICE] Transactions not supported in current Mongo topology. Continuing without transaction.'
      );
    }

    const tempIdToDbId = new Map();
    const levelCache = new Map();
    const sorted = [...structures].sort((a, b) => a.levelRank - b.levelRank);

    console.log('[STRUCTURE SERVICE] Structures sorted by levelRank', {
      order: sorted.map((item) => ({
        tempId: item.tempId,
        name: item.name,
        levelRank: item.levelRank,
        isSpecial: !!item.isSpecial,
      })),
    });

    const getOrCreateLevel = async (item) => {
      const cacheKey = `${item.levelRank}::${
        item.isSpecial ? 'special' : 'normal'
      }`;
      if (levelCache.has(cacheKey)) {
        console.log('[STRUCTURE SERVICE] Level cache hit', {
          cacheKey,
          levelId: levelCache.get(cacheKey),
        });
        return levelCache.get(cacheKey);
      }

      if (item.isSpecial) {
        console.log('[STRUCTURE SERVICE] Creating special level', {
          name: item.name,
          levelRank: item.levelRank,
        });

        const specialLevelDocs = await Level.create(
          [
            {
              tenantId,
              name: item.name,
              rank: item.levelRank,
              isSpecial: true,
              isActive: true,
            },
          ],
          { session: useTransaction ? session : null }
        );

        const specialLevelId = specialLevelDocs[0]._id;
        levelCache.set(cacheKey, specialLevelId);
        return specialLevelId;
      }

      console.log('[STRUCTURE SERVICE] Looking up normal level', {
        tenantId,
        levelRank: item.levelRank,
      });

      let level = await Level.findOne({
        tenantId,
        rank: item.levelRank,
      }).session(useTransaction ? session : null);

      if (!level) {
        const levelName =
          sorted.find((s) => s.levelRank === item.levelRank && !s.isSpecial)
            ?.name || `Level ${item.levelRank}`;

        console.log('[STRUCTURE SERVICE] Creating level because none exists', {
          tenantId,
          levelRank: item.levelRank,
          levelName,
        });

        const newLevelDocs = await Level.create(
          [
            {
              tenantId,
              name: levelName,
              rank: item.levelRank,
              isSpecial: false,
              isActive: true,
            },
          ],
          { session: useTransaction ? session : null }
        );
        level = newLevelDocs[0];
      }

      levelCache.set(cacheKey, level._id);
      return level._id;
    };

    const resolveParent = (item) => {
      if (!item.parentTempId) {
        return null;
      }
      const parentId = tempIdToDbId.get(item.parentTempId) || item.parentTempId;
      console.log('[STRUCTURE SERVICE] Resolved parent', {
        tempId: item.tempId,
        parentTempId: item.parentTempId,
        resolvedParentId: parentId,
      });
      return parentId;
    };

    for (const item of sorted) {
      console.log('[STRUCTURE SERVICE] Processing structure', {
        tempId: item.tempId,
        name: item.name,
        levelRank: item.levelRank,
        isSpecial: !!item.isSpecial,
        isSpecialRaw: item.isSpecial, // Log raw value
        isActive: item.isActive !== undefined ? item.isActive : true,
        isActiveRaw: item.isActive, // Log raw value
        allItemKeys: Object.keys(item), // Log all keys to debug
      });

      const levelId = await getOrCreateLevel(item);
      console.log('[STRUCTURE SERVICE] Level ID resolved for structure', {
        tempId: item.tempId,
        levelId,
      });

      const structureData = {
        tenantId,
        name: item.name,
        code: item.code || '',
        description: item.description || '',
        level: levelId,
        parent: resolveParent(item),
        isSpecial: !!item.isSpecial,
        isActive: item.isActive !== undefined ? item.isActive : true,
        type: item.type || 'administrative',
        position: item.position || { x: 0, y: 0 },
        createdBy,
      };

      console.log(
        '[STRUCTURE SERVICE] Creating structure document',
        structureData
      );

      const [structure] = await Structures.create([structureData], {
        session: useTransaction ? session : null,
      });

      tempIdToDbId.set(item.tempId, structure._id);
      console.log('[STRUCTURE SERVICE] Structure created', {
        tempId: item.tempId,
        structureId: structure._id,
      });
    }

    if (useTransaction) {
      await session.commitTransaction();
      console.log('[STRUCTURE SERVICE] Transaction committed');
    }

    console.log('[STRUCTURE SERVICE] Completed saveStructuresAndLevels');
    return [...tempIdToDbId.values()];
  } catch (err) {
    console.error('[STRUCTURE SERVICE] Error saving structures/levels', err);
    if (useTransaction) {
      await session.abortTransaction();
      console.log('[STRUCTURE SERVICE] Transaction aborted due to error');
    }
    throw err;
  } finally {
    session.endSession();
    console.log('[STRUCTURE SERVICE] Mongo session closed');
  }
};

// Keep your helper
const createStructure = async (structureBody) =>
  Structures.createStructure(structureBody);

/**
 * Get structure by id
 * @param {ObjectId} id
 * @returns {Promise<Structure>}
 */
const getStructureById = async (id) => {
  const structure = await Structures.findById(id);
  if (!structure) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Structure not found');
  }
  return structure;
};

/**
 * Get structure by name
 * @param {string} name
 * @returns {Promise<Structure>}
 */
const getStructureByName = async (name) => {
  const structure = await Structures.findOne({ name });
  if (!structure) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Structure not found');
  }
  return structure;
};

/**
 * Update structure by id
 * @param {ObjectId} structureId
 * @param {Object} updateBody
 * @returns {Promise<Structure>}
 */
const updateStructureById = async (structureId, updateBody) => {
  console.log(
    '[STRUCTURE SERVICE - UPDATE] Updating structure:',
    structureId,
    'with data:',
    JSON.stringify(updateBody, null, 2)
  );
  const structure = await getStructureById(structureId);
  Object.assign(structure, updateBody);
  await structure.save();
  console.log('[STRUCTURE SERVICE - UPDATE] Structure updated successfully');
  return structure;
};

/**
 * Delete structure by id
 * Also deletes the associated level if no other structures or nodes reference it
 * @param {ObjectId} structureId
 * @returns {Promise<Structure>}
 */
const deleteStructureById = async (structureId) => {
  console.log('[STRUCTURE SERVICE - DELETE] Deleting structure:', structureId);
  const session = await mongoose.startSession();
  const useTransaction = !!session.supports?.transactions;

  try {
    if (useTransaction) {
      console.log('[STRUCTURE SERVICE - DELETE] Starting Mongo transaction');
      await session.startTransaction();
    } else {
      console.warn(
        '[STRUCTURE SERVICE - DELETE] Transactions not supported in current Mongo topology. Continuing without transaction.'
      );
    }

    // Get the structure and its level ID before deletion (within transaction)
    const structure = await Structures.findById(structureId).session(
      useTransaction ? session : null
    );
    if (!structure) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Structure not found');
    }
    const levelId = structure.level;

    console.log('[STRUCTURE SERVICE - DELETE] Structure level ID:', levelId);

    // Delete the structure
    await Structures.deleteOne(
      { _id: structureId },
      { session: useTransaction ? session : null }
    );
    console.log('[STRUCTURE SERVICE - DELETE] Structure deleted successfully');

    // Check if any other structures or nodes reference this level
    const otherStructures = await Structures.countDocuments({
      level: levelId,
      _id: { $ne: structureId },
    }).session(useTransaction ? session : null);

    const nodesUsingLevel = await Nodes.countDocuments({
      level: levelId,
    }).session(useTransaction ? session : null);

    console.log('[STRUCTURE SERVICE - DELETE] Level usage check:', {
      levelId,
      otherStructures,
      nodesUsingLevel,
    });

    // If no other structures or nodes use this level, delete it
    if (otherStructures === 0 && nodesUsingLevel === 0) {
      await Level.deleteOne(
        { _id: levelId },
        { session: useTransaction ? session : null }
      );
      console.log(
        '[STRUCTURE SERVICE - DELETE] Orphaned level deleted:',
        levelId
      );
    } else {
      console.log(
        '[STRUCTURE SERVICE - DELETE] Level kept (still in use):',
        levelId
      );
    }

    if (useTransaction) {
      await session.commitTransaction();
      console.log('[STRUCTURE SERVICE - DELETE] Transaction committed');
    }

    return structure;
  } catch (err) {
    console.error(
      '[STRUCTURE SERVICE - DELETE] Error deleting structure:',
      err
    );
    if (useTransaction) {
      await session.abortTransaction();
      console.log(
        '[STRUCTURE SERVICE - DELETE] Transaction aborted due to error'
      );
    }
    throw err;
  } finally {
    session.endSession();
    console.log('[STRUCTURE SERVICE - DELETE] Mongo session closed');
  }
};

/**
 * Query for structures
 * @param {Object} filter - Mongoose filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */

const queryStructures = async (filter, options) => {
  const structure = await Structures.paginate(filter, options);
  return structure;
};

/**
 * Get structures by type
 * @param {string} type - Structure type
 * @returns {Promise<Array<Structure>>}
 */
const getStructuresByType = async (type) => Structures.find({ type });

/**
 * Get parent structure
 * @param {ObjectId} structureId
 * @returns {Promise<Structure>}
 */
const getParentStructure = async (structureId) => {
  const structure = await getStructureById(structureId);
  if (!structure.parentId) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Parent structure not found');
  }
  return getStructureById(structure.parentId);
};

/**
 * Get child structures
 * @param {ObjectId} structureId
 * @returns {Promise<Array<Structure>>}
 */
const getChildStructures = async (structureId) =>
  Structure.find({ parentId: structureId });

/**
 * Move structure to new parent
 * @param {ObjectId} structureId
 * @param {ObjectId} newParentId
 * @returns {Promise<Structure>}
 */
const moveStructureToParent = async (structureId, newParentId) => {
  const structure = await getStructureById(structureId);
  const newParent = await getStructureById(newParentId);

  structure.parentId = newParentId;
  structure.path = `${newParent.path}/${structure.name}`;

  await structure.save();
  return structure;
};

/**
 * Get structure path
 * @param {ObjectId} structureId
 * @returns {Promise<string>}
 */
const getStructurePath = async (structureId) => {
  const structure = await getStructureById(structureId);
  return structure.path;
};

/**
 * Get structure hierarchy
 * @param {ObjectId} structureId
 * @returns {Promise<Array<Structure>>}
 */
const getStructureHierarchy = async (structureId) => {
  const structure = await getStructureById(structureId);
  const hierarchy = [structure];

  let currentStructure = structure;
  while (currentStructure.parentId) {
    currentStructure = await getStructureById(currentStructure.parentId);
    hierarchy.unshift(currentStructure);
  }

  return hierarchy;
};

/**
 * Activate structure
 * @param {ObjectId} structureId
 * @returns {Promise<Structure>}
 */
const activateStructure = async (structureId) => {
  const structure = await getStructureById(structureId);
  structure.isActive = true;
  await structure.save();
  return structure;
};

/**
 * Deactivate structure
 * @param {ObjectId} structureId
 * @returns {Promise<Structure>}
 */
const deactivateStructure = async (structureId) => {
  const structure = await getStructureById(structureId);
  structure.isActive = false;
  await structure.save();
  return structure;
};

module.exports = {
  createStructure,
  getStructureById,
  getStructureByName,
  updateStructureById,
  deleteStructureById,
  queryStructures,
  getStructuresByType,
  getParentStructure,
  getChildStructures,
  moveStructureToParent,
  getStructurePath,
  getStructureHierarchy,
  activateStructure,
  deactivateStructure,
  saveStructuresAndLevels,
};
