const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { Structures, Level } = require('../models');
const ApiError = require('../utils/ApiError');


const saveStructuresAndLevels = async (structures, tenantId, createdBy) => {
  const session = await mongoose.startSession();
  let useTransaction = false;
  try {
    console.log('Starting session and checking transaction support...', structures);
    // Check if transactions are supported (replica set or mongos)
    useTransaction = session.supports && session.supports.transactions;
    if (useTransaction) {
      console.log('Transaction supported, starting transaction...');
      session.startTransaction();
    }
    const levelMap = new Map();
    const tempIdToStructureId = new Map();
    console.log('Processing unique ranks...');
    const uniqueRanks = [...new Set(structures.filter((s) => !s.isSpecial).map((s) => s.levelRank))];
    for (const rank of uniqueRanks) {
      console.log(`Processing rank: ${rank}`);
      let level = await Level.findOne({ tenantId, rank }).session(useTransaction ? session : null);
      if (!level) {
        console.log(`Level not found for rank ${rank}, creating new level...`);
        const levels = await Level.create([{ tenantId, name: `Level ${rank}`, rank }], {
          session: useTransaction ? session : null,
        });
        level = levels[0];
      }
      levelMap.set(rank, level._id);
    }
    console.log('Processing structures...');
    for (const item of structures) {
      console.log(`Processing structure: ${item.name}`);
      let levelId;
      if (item.isSpecial) {
        console.log(`Structure ${item.name} is special, creating special level...`);
        const levels = await Level.create([{ tenantId, name: `Special-${item.name}`, rank: item.levelRank }], {
          session: useTransaction ? session : null,
        });
        levelId = levels[0]._id;
      } else {
        levelId = levelMap.get(item.levelRank);
      }
      const parentId = item.parentTempId ? tempIdToStructureId.get(item.parentTempId) : null;
      console.log(`Creating structure: ${item.name}`);
      const [structure] = await Structures.create(
        [
          {
            tenantId,
            name: item.name,
            code: item.code || '',
            description: item.description || '',
            level: levelId,
            parent: parentId,
            isSpecial: !!item.isSpecial,
            isActive: item.isActive !== undefined ? item.isActive : true,
            type: item.type || 'administrative',
            createdBy,
          },
        ],
        { session: useTransaction ? session : null }
      );

      tempIdToStructureId.set(item.tempId, structure._id);
    }

    if (useTransaction) {
      console.log('Committing transaction...');
      await session.commitTransaction();
    }
    session.endSession();
    console.log('Session ended successfully.');

    return Array.from(tempIdToStructureId.values());
  } catch (error) {
    console.error('Error occurred, aborting transaction if applicable...');
    if (useTransaction) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error('Session ended with error:', error);
    throw error;
  }
};



const createStructure = async (structureBody) => {
  return Structures.createStructure(structureBody);
};

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
  const structure = await getStructureById(structureId);
  Object.assign(structure, updateBody);
  await structure.save();
  return structure;
};

/**
 * Delete structure by id
 * @param {ObjectId} structureId
 * @returns {Promise<Structure>}
 */
const deleteStructureById = async (structureId) => {
  const structure = await getStructureById(structureId);
  await structure.remove();
  return structure;
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
const getStructuresByType = async (type) => {
  return Structures.find({ type });
};

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
const getChildStructures = async (structureId) => {
  return Structure.find({ parentId: structureId });
};

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
