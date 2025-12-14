const mongoose = require('mongoose');
const Nodes = require('../models/node.model');
const logger = require('../config/logger');
const config = require('../config/config');
const { postgresPool } = require('../config/postgres');

let changeStream;
let isInitialized = false;
let restartTimeout;
let restartAttempts = 0;
let shuttingDown = false;

const STRUCTURE_MODEL = 'Structures';
const LEVEL_MODEL = 'Level';

const normalizeId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (value._id) {
    return value._id.toString();
  }

  if (typeof value.toString === 'function') {
    return value.toString();
  }

  return null;
};

const ensureReferencePopulated = async (value, modelName) => {
  if (!value) {
    return null;
  }

  if (value.name) {
    return value;
  }

  const id = normalizeId(value);
  if (!id) {
    return null;
  }

  try {
    const model = mongoose.model(modelName);
    return await model
      .findById(id)
      .select('name _id')
      .lean({ virtuals: false });
  } catch (error) {
    logger.warn(
      `[NodeSync] Failed to populate ${modelName} reference ${id}: ${error.message}`
    );
    return null;
  }
};

const fetchAncestors = async (ancestorIds = []) => {
  if (!ancestorIds.length) {
    return [];
  }

  const uniqueIds = ancestorIds.map((id) => id.toString());
  const docs = await Nodes.find({ _id: { $in: uniqueIds } })
    .select('_id nodeId name')
    .populate([
      { path: 'level', select: 'name _id', model: LEVEL_MODEL },
      { path: 'structure', select: 'name _id', model: STRUCTURE_MODEL },
    ])
    .lean({ virtuals: false });

  const docMap = new Map(docs.map((doc) => [doc._id.toString(), doc]));
  return uniqueIds
    .map((id) => docMap.get(id))
    .filter(Boolean)
    .map((doc) => ({
      id: doc._id.toString(),
      code: doc.nodeId || null,
      name: doc.name || null,
      reference: doc.nodeId || null,
    }));
};

const mapNodeToDimension = async (nodeDoc) => {
  if (!nodeDoc) {
    return null;
  }

  await nodeDoc.populate([
    { path: 'level', select: 'name _id', model: LEVEL_MODEL },
    { path: 'structure', select: 'name _id', model: STRUCTURE_MODEL },
  ]);

  const [levelDoc, structureDoc] = await Promise.all([
    ensureReferencePopulated(nodeDoc.level, LEVEL_MODEL),
    ensureReferencePopulated(nodeDoc.structure, STRUCTURE_MODEL),
  ]);

  const tenantId = nodeDoc.tenantId || null;
  const nodeId = nodeDoc._id.toString();
  const nodeCode = nodeDoc.nodeId || null;

  const ancestorIds = (nodeDoc.identity || []).map((id) => id.toString());
  const ancestors = await fetchAncestors(ancestorIds);

  const levelId = normalizeId(levelDoc || nodeDoc.level);
  const structureId = normalizeId(structureDoc || nodeDoc.structure);

  return {
    node_id: nodeId,
    node_code: nodeCode,
    tenant_id: tenantId,
    node_name: nodeDoc.name || null,
    node_reference: nodeDoc.nodeId || null,
    structure_id: structureId,
    structure_name:
      structureDoc?.name ||
      nodeDoc.structure?.name ||
      nodeDoc.structureName ||
      null,
    level_id: levelId,
    level_name:
      levelDoc?.name || nodeDoc.level?.name || nodeDoc.levelName || null,
    parent_node_id: nodeDoc.parent ? nodeDoc.parent.toString() : null,
    lineage_ids: ancestors.map((ancestor) => ancestor.id),
    lineage_codes: ancestors.map((ancestor) => ancestor.code),
    lineage_names: ancestors.map((ancestor) => ancestor.name),
    lineage_refs: ancestors.map((ancestor) => ancestor.reference),
    depth: ancestorIds.length,
    is_active:
      nodeDoc.isActive !== undefined ? Boolean(nodeDoc.isActive) : null,
    is_main: nodeDoc.isMain !== undefined ? Boolean(nodeDoc.isMain) : null,
  };
};

const upsertNodeDimension = async (nodeDoc) => {
  try {
    const payload = await mapNodeToDimension(nodeDoc);
    if (!payload) {
      logger.warn(`[NodeSync] No payload generated for node ${nodeDoc?._id || 'unknown'}`);
      return;
    }

    const columns = [
      'node_id',
      'node_code',
      'tenant_id',
      'node_name',
      'node_reference',
      'structure_id',
      'structure_name',
      'level_id',
      'level_name',
      'parent_node_id',
      'lineage_ids',
      'lineage_codes',
      'lineage_names',
      'lineage_refs',
      'depth',
      'is_active',
      'is_main',
      'updated_at',
    ];

    const values = columns.map((column) => {
      if (column === 'updated_at') {
        return new Date();
      }
      return payload[column];
    });

    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const updateAssignments = columns
      .filter((column) => column !== 'node_id')
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(', ');

    const sql = `
      INSERT INTO node_dimension (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (node_id)
      DO UPDATE SET ${updateAssignments}
    `;

    await postgresPool.query(sql, values);
  } catch (error) {
    // Log detailed error information but don't crash
    logger.error(`[NodeSync] Failed to upsert node dimension: ${error.message}`);
    logger.error(`[NodeSync] Node ID: ${nodeDoc?._id || 'unknown'}`);
    logger.error(`[NodeSync] Error stack: ${error.stack}`);
    
    // If it's a connection error, it will be handled by the pool error handler
    // For other errors (constraints, etc.), we log and continue
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      logger.error('[NodeSync] Postgres connection error - check database connectivity');
    }
    
    // Re-throw only critical errors that should stop processing
    // For now, we catch all errors to prevent nodeSync from crashing
    // The change stream will continue processing other nodes
  }
};

const deleteNodeDimension = async (nodeId) => {
  try {
    await postgresPool.query('DELETE FROM node_dimension WHERE node_id = $1', [
      nodeId,
    ]);
  } catch (error) {
    logger.error(`[NodeSync] Failed to delete node dimension ${nodeId}: ${error.message}`);
    // Don't re-throw - allow processing to continue
  }
};

const handleChangeEvent = async (change) => {
  try {
    if (change.operationType === 'delete') {
      const nodeId = change.documentKey?._id?.toString();
      if (nodeId) {
        await deleteNodeDimension(nodeId);
        logger.info(`[NodeSync] Deleted node ${nodeId} from dimension table`);
      } else {
        logger.warn('[NodeSync] Delete event received but no node ID found');
      }
      return;
    }

    const nodeId = change.documentKey?._id?.toString();
    if (!nodeId) {
      logger.warn('[NodeSync] Change event received but no node ID found');
      return;
    }

    const doc =
      change.fullDocument ||
      (await Nodes.findById(change.documentKey._id)
        .populate([
          { path: 'level', select: 'name _id', model: LEVEL_MODEL },
          { path: 'structure', select: 'name _id', model: STRUCTURE_MODEL },
        ])
        .lean({ virtuals: false }));

    if (!doc) {
      logger.warn(`[NodeSync] Node ${nodeId} not found in database - skipping sync`);
      return;
    }

    // Check if node is deleted (soft delete)
    if (doc.deletedAt) {
      logger.info(`[NodeSync] Node ${nodeId} is soft-deleted - removing from dimension table`);
      await deleteNodeDimension(nodeId);
      return;
    }

    await upsertNodeDimension(Nodes.hydrate(doc));
    logger.info(`[NodeSync] Upserted node ${nodeId} into dimension table`);
  } catch (error) {
    logger.error(`[NodeSync] Failed to process change event: ${error.message}`);
    logger.error(`[NodeSync] Change event: ${JSON.stringify(change, null, 2)}`);
    if (error.stack) {
      logger.error(`[NodeSync] Error stack: ${error.stack}`);
    }
    // Don't re-throw - allow change stream to continue processing other events
  }
};

const clearRestartTimer = () => {
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
};

const scheduleRestart = (reason) => {
  if (restartTimeout) {
    return;
  }

  if (shuttingDown) {
    return;
  }

  if (!config.nodeSync?.enabled) {
    logger.warn(
      `[NodeSync] Change stream ${reason}, but node sync is disabled. Restart skipped.`
    );
    return;
  }

  restartAttempts += 1;
  const delay = Math.min(30000, 1000 * restartAttempts);
  logger.warn(
    `[NodeSync] Change stream ${reason}. Attempting restart #${restartAttempts} in ${delay}ms`
  );

  restartTimeout = setTimeout(async () => {
    restartTimeout = null;
    await startNodeSync({ force: true });
  }, delay);
};

const handleStreamFailure = (type, error) => {
  const message = error?.message || 'unknown reason';
  logger.error(`[NodeSync] Change stream ${type}: ${message}`);

  if (changeStream) {
    changeStream.removeAllListeners();
    changeStream = null;
  }

  isInitialized = false;
  scheduleRestart(type);
};

const startNodeSync = async ({ force = false } = {}) => {
  if (isInitialized && !force) {
    return;
  }

  if (!config.nodeSync?.enabled) {
    logger.info('[NodeSync] Node sync is disabled via configuration');
    return;
  }

  try {
    if (changeStream) {
      await changeStream.close();
      changeStream = null;
    }

    const collection = mongoose.connection.collection('nodes');
    changeStream = collection.watch([], { fullDocument: 'updateLookup' });
    changeStream.on('change', handleChangeEvent);
    changeStream.on('error', (error) => handleStreamFailure('error', error));
    changeStream.on('close', () => handleStreamFailure('close'));

    clearRestartTimer();
    restartAttempts = 0;
    isInitialized = true;
    logger.info('[NodeSync] Change stream initialized');
  } catch (error) {
    isInitialized = false;
    handleStreamFailure('error', error);
  }
};

const stopNodeSync = async () => {
  clearRestartTimer();
  restartAttempts = 0;
  shuttingDown = true;

  if (changeStream) {
    await changeStream.close();
    changeStream = null;
    isInitialized = false;
    logger.info('[NodeSync] Change stream stopped');
  }

  shuttingDown = false;
};

module.exports = {
  startNodeSync,
  stopNodeSync,
  upsertNodeDimension,
};
