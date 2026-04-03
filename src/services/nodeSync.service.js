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
let nodeDimensionTableReady = false;
let nodeDimensionSyncStateReady = false;

const STRUCTURE_MODEL = 'Structures';
const LEVEL_MODEL = 'Level';
const DEFAULT_BACKFILL_BATCH_SIZE = 250;
const STARTUP_LOCK_KEY_A = 62031;
const STARTUP_LOCK_KEY_B = 90117;
const STARTUP_INCREMENTAL_OVERLAP_MS = 2 * 60 * 1000;
const STARTUP_SYNC_SCOPE = 'global';

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensureNodeDimensionTable = async () => {
  if (nodeDimensionTableReady) {
    return;
  }

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS node_dimension (
      node_id VARCHAR(64) PRIMARY KEY,
      node_code VARCHAR(64),
      tenant_id VARCHAR(64),
      node_name TEXT,
      node_reference VARCHAR(128),
      structure_id VARCHAR(64),
      structure_name TEXT,
      level_id VARCHAR(64),
      level_name TEXT,
      parent_node_id VARCHAR(64),
      lineage_ids TEXT[] NOT NULL DEFAULT '{}',
      lineage_codes TEXT[] NOT NULL DEFAULT '{}',
      lineage_names TEXT[] NOT NULL DEFAULT '{}',
      lineage_refs TEXT[] NOT NULL DEFAULT '{}',
      depth INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN,
      is_main BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await postgresPool.query(
    `CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_id ON node_dimension (tenant_id)`
  );
  await postgresPool.query(
    `CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_node_reference ON node_dimension (tenant_id, node_reference)`
  );
  await postgresPool.query(
    `CREATE INDEX IF NOT EXISTS idx_node_dimension_parent_node_id ON node_dimension (parent_node_id)`
  );
  await postgresPool.query(
    `CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_level_name ON node_dimension (tenant_id, level_name)`
  );
  await postgresPool.query(
    `CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_depth ON node_dimension (tenant_id, depth)`
  );
  await postgresPool.query(
    `CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_lineage_refs ON node_dimension USING GIN (lineage_refs)`
  );

  nodeDimensionTableReady = true;
};

const ensureNodeDimensionSyncStateTable = async () => {
  if (nodeDimensionSyncStateReady) {
    return;
  }

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS node_dimension_sync_state (
      scope VARCHAR(64) PRIMARY KEY,
      last_full_backfill_at TIMESTAMPTZ,
      last_incremental_sync_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  nodeDimensionSyncStateReady = true;
};

const withStartupSyncLock = async (fn) => {
  const client = await postgresPool.connect();
  let lockAcquired = false;
  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1, $2) AS locked',
      [STARTUP_LOCK_KEY_A, STARTUP_LOCK_KEY_B]
    );
    lockAcquired = Boolean(lockResult.rows[0]?.locked);
    if (!lockAcquired) {
      return {
        lockAcquired: false,
        skipped: true,
        reason: 'startup_sync_lock_not_acquired',
      };
    }
    const output = await fn(client);
    return {
      lockAcquired: true,
      ...(output || {}),
    };
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        STARTUP_LOCK_KEY_A,
        STARTUP_LOCK_KEY_B,
      ]);
    }
    client.release();
  }
};

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
    await ensureNodeDimensionTable();
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
    await ensureNodeDimensionTable();
    await postgresPool.query('DELETE FROM node_dimension WHERE node_id = $1', [
      nodeId,
    ]);
  } catch (error) {
    logger.error(`[NodeSync] Failed to delete node dimension ${nodeId}: ${error.message}`);
    // Don't re-throw - allow processing to continue
  }
};

const backfillMissingNodeDimensions = async ({
  tenantId = null,
  batchSize = DEFAULT_BACKFILL_BATCH_SIZE,
} = {}) => {
  await ensureNodeDimensionTable();

  const safeBatchSize = Math.max(Number(batchSize) || DEFAULT_BACKFILL_BATCH_SIZE, 1);
  const existingDimensionIds = new Set();
  const existingValues = [];
  let existingSql = 'SELECT node_id FROM node_dimension';
  if (tenantId) {
    existingSql += ' WHERE tenant_id = $1';
    existingValues.push(tenantId);
  }
  const existingRows = await postgresPool.query(existingSql, existingValues);
  existingRows.rows.forEach((row) => {
    if (row.node_id) {
      existingDimensionIds.add(String(row.node_id));
    }
  });

  const nodeFilter = { deletedAt: null };
  if (tenantId) {
    nodeFilter.tenantId = tenantId;
  }

  const missingNodeIds = [];
  const nodeCursor = Nodes.find(nodeFilter).select('_id').lean().cursor();
  for await (const node of nodeCursor) {
    const nodeId = node?._id ? String(node._id) : null;
    if (!nodeId) continue;
    if (!existingDimensionIds.has(nodeId)) {
      missingNodeIds.push(nodeId);
    }
  }

  let synced = 0;
  for (let index = 0; index < missingNodeIds.length; index += safeBatchSize) {
    const batchIds = missingNodeIds.slice(index, index + safeBatchSize);
    const docs = await Nodes.find({
      _id: { $in: batchIds },
      deletedAt: null,
    })
      .populate([
        { path: 'level', select: 'name _id', model: LEVEL_MODEL },
        { path: 'structure', select: 'name _id', model: STRUCTURE_MODEL },
      ])
      .lean({ virtuals: false });

    for (const doc of docs) {
      await upsertNodeDimension(Nodes.hydrate(doc));
      synced += 1;
    }
  }

  return {
    mode: 'full_backfill',
    tenantId: tenantId || null,
    existingDimensions: existingDimensionIds.size,
    missingDimensions: missingNodeIds.length,
    synced,
  };
};

const runIncrementalDimensionSync = async ({
  since,
  tenantId = null,
  batchSize = DEFAULT_BACKFILL_BATCH_SIZE,
} = {}) => {
  await ensureNodeDimensionTable();
  const safeBatchSize = Math.max(Number(batchSize) || DEFAULT_BACKFILL_BATCH_SIZE, 1);
  const query = {};
  if (tenantId) {
    query.tenantId = tenantId;
  }

  if (since instanceof Date && !Number.isNaN(since.getTime())) {
    query.updatedAt = { $gte: since };
  }

  const totalChangedNodes = await Nodes.countDocuments(query);
  const cursor = Nodes.find(query)
    .populate([
      { path: 'level', select: 'name _id', model: LEVEL_MODEL },
      { path: 'structure', select: 'name _id', model: STRUCTURE_MODEL },
    ])
    .sort({ updatedAt: 1, _id: 1 })
    .lean({ virtuals: false })
    .cursor();

  let processed = 0;
  let upserted = 0;
  let removed = 0;
  let batch = [];

  const flushBatch = async () => {
    if (!batch.length) return;
    for (const doc of batch) {
      const nodeId = doc?._id ? String(doc._id) : null;
      if (!nodeId) {
        processed += 1;
        continue;
      }
      if (doc.deletedAt) {
        await deleteNodeDimension(nodeId);
        removed += 1;
      } else {
        await upsertNodeDimension(Nodes.hydrate(doc));
        upserted += 1;
      }
      processed += 1;
    }
    batch = [];
  };

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= safeBatchSize) {
      await flushBatch();
    }
  }
  await flushBatch();

  return {
    mode: 'incremental',
    tenantId: tenantId || null,
    totalChangedNodes,
    processed,
    upserted,
    removed,
    since: since || null,
  };
};

const syncNodeBranchDimensions = async ({ tenantId, rootPath } = {}) => {
  if (!rootPath) {
    return { synced: 0 };
  }
  await ensureNodeDimensionTable();

  const filter = {
    deletedAt: null,
    path: { $regex: `^${escapeRegex(rootPath)}` },
  };
  if (tenantId) {
    filter.tenantId = tenantId;
  }
  const docs = await Nodes.find(filter)
    .populate([
      { path: 'level', select: 'name _id', model: LEVEL_MODEL },
      { path: 'structure', select: 'name _id', model: STRUCTURE_MODEL },
    ])
    .lean({ virtuals: false });

  for (const doc of docs) {
    await upsertNodeDimension(Nodes.hydrate(doc));
  }

  return { synced: docs.length };
};

const syncNodeDimensionsAtStartup = async ({
  batchSize = DEFAULT_BACKFILL_BATCH_SIZE,
} = {}) => {
  await ensureNodeDimensionTable();
  await ensureNodeDimensionSyncStateTable();

  return withStartupSyncLock(async (client) => {
    const stateResult = await client.query(
      `
        SELECT scope, last_full_backfill_at, last_incremental_sync_at
        FROM node_dimension_sync_state
        WHERE scope = $1
        LIMIT 1
      `,
      [STARTUP_SYNC_SCOPE]
    );
    const state = stateResult.rows[0] || null;
    const now = new Date();
    let syncResult;

    if (!state?.last_full_backfill_at) {
      syncResult = await backfillMissingNodeDimensions({
        batchSize,
      });
      await client.query(
        `
          INSERT INTO node_dimension_sync_state (
            scope,
            last_full_backfill_at,
            last_incremental_sync_at,
            updated_at
          )
          VALUES ($1, $2, $2, NOW())
          ON CONFLICT (scope)
          DO UPDATE SET
            last_full_backfill_at = EXCLUDED.last_full_backfill_at,
            last_incremental_sync_at = EXCLUDED.last_incremental_sync_at,
            updated_at = NOW()
        `,
        [STARTUP_SYNC_SCOPE, now]
      );
      return {
        mode: 'full_backfill',
        ...syncResult,
        timestamp: now,
      };
    }

    const lastIncremental = state.last_incremental_sync_at
      ? new Date(state.last_incremental_sync_at)
      : new Date(state.last_full_backfill_at);
    const incrementalSince = new Date(
      Math.max(0, lastIncremental.getTime() - STARTUP_INCREMENTAL_OVERLAP_MS)
    );
    syncResult = await runIncrementalDimensionSync({
      since: incrementalSince,
      batchSize,
    });

    await client.query(
      `
        INSERT INTO node_dimension_sync_state (
          scope,
          last_full_backfill_at,
          last_incremental_sync_at,
          updated_at
        )
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (scope)
        DO UPDATE SET
          last_full_backfill_at = COALESCE(node_dimension_sync_state.last_full_backfill_at, EXCLUDED.last_full_backfill_at),
          last_incremental_sync_at = EXCLUDED.last_incremental_sync_at,
          updated_at = NOW()
      `,
      [STARTUP_SYNC_SCOPE, state.last_full_backfill_at || now, now]
    );

    return {
      mode: 'incremental',
      ...syncResult,
      timestamp: now,
    };
  });
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
    await ensureNodeDimensionTable();

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
  deleteNodeDimension,
  ensureNodeDimensionTable,
  ensureNodeDimensionSyncStateTable,
  backfillMissingNodeDimensions,
  runIncrementalDimensionSync,
  syncNodeBranchDimensions,
  syncNodeDimensionsAtStartup,
};
