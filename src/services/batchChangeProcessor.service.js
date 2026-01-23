/**
 * Batch Change Processor Service
 *
 * Detects and groups rapid changes for efficient baseline recomputation
 * Critical for bulk operations (e.g., 100,000 user imports)
 */

const logger = require('../config/logger');
const { queueBatchChanges } = require('../queues/baseline.queue');

// ============================================================================
// BATCH ACCUMULATION
// ============================================================================

// Batch storage: Map<tenantId, Map<changeType, Array<changes>>>
const batchStorage = new Map();

// Timers: Map<tenantId, Map<changeType, timeoutId>>
const batchTimers = new Map();

// Configuration
const BATCH_DELAY = 5000; // 5 seconds - wait for more changes
const BATCH_SIZE_THRESHOLD = 10; // Auto-process when batch reaches 10 items
const MAX_BATCH_SIZE = 1000; // Max batch size before force processing

// ============================================================================
// BATCH MANAGEMENT
// ============================================================================

/**
 * Get or create batch storage for tenant+type
 */
const getBatch = (tenantId, changeType) => {
  if (!batchStorage.has(tenantId)) {
    batchStorage.set(tenantId, new Map());
  }

  const tenantBatches = batchStorage.get(tenantId);

  if (!tenantBatches.has(changeType)) {
    tenantBatches.set(changeType, []);
  }

  return tenantBatches.get(changeType);
};

/**
 * Get or create timer storage for tenant+type
 */
const getTimer = (tenantId, changeType) => {
  if (!batchTimers.has(tenantId)) {
    batchTimers.set(tenantId, new Map());
  }

  return batchTimers.get(tenantId);
};

/**
 * Clear batch and timer
 */
const clearBatch = (tenantId, changeType) => {
  if (batchStorage.has(tenantId)) {
    const tenantBatches = batchStorage.get(tenantId);
    tenantBatches.delete(changeType);

    if (tenantBatches.size === 0) {
      batchStorage.delete(tenantId);
    }
  }

  if (batchTimers.has(tenantId)) {
    const timers = batchTimers.get(tenantId);
    const timer = timers.get(changeType);

    if (timer) {
      clearTimeout(timer);
      timers.delete(changeType);
    }

    if (timers.size === 0) {
      batchTimers.delete(tenantId);
    }
  }
};

/**
 * Process a batch by queuing it
 */
const processBatch = async (tenantId, changeType) => {
  const batch = getBatch(tenantId, changeType);

  if (batch.length === 0) {
    logger.debug(`[Batch] No changes to process for ${tenantId}:${changeType}`);
    clearBatch(tenantId, changeType);
    return;
  }

  const batchToProcess = [...batch];
  clearBatch(tenantId, changeType);

  logger.info(
    `[Batch] Processing ${batchToProcess.length} ${changeType} changes for tenant ${tenantId}`
  );

  try {
    // Queue the batch for processing
    await queueBatchChanges({
      tenantId,
      changeType,
      changes: batchToProcess,
    });

    logger.info(`[Batch] Successfully queued ${batchToProcess.length} changes`);
  } catch (error) {
    logger.error(`[Batch] Error queuing batch:`, error);
    // Re-add to batch if queueing fails?
    // For now, just log - retries happen at queue level
  }
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Add user change to batch
 * @param {Object} user - User document
 */
const addUserChange = async (user) => {
  try {
    const tenantId = user.tenantId;
    const changeType = 'user';

    const batch = getBatch(tenantId, changeType);
    const timers = getTimer(tenantId, changeType);

    // Add change to batch
    batch.push({
      userId: user._id.toString(),
      email: user.email,
      changedFields: user.modifiedPaths?.() || [],
      timestamp: new Date(),
    });

    logger.debug(
      `[Batch] Added user change: ${user._id} (batch size: ${batch.length})`
    );

    // Check if batch size threshold reached
    if (batch.length >= BATCH_SIZE_THRESHOLD) {
      logger.info(
        `[Batch] Threshold reached (${batch.length}), processing immediately`
      );
      await processBatch(tenantId, changeType);
      return;
    }

    // Check max batch size
    if (batch.length >= MAX_BATCH_SIZE) {
      logger.warn(
        `[Batch] Max batch size reached (${batch.length}), force processing`
      );
      await processBatch(tenantId, changeType);
      return;
    }

    // Reset timer
    if (timers.has(changeType)) {
      clearTimeout(timers.get(changeType));
    }

    // Schedule processing
    const timeoutId = setTimeout(async () => {
      await processBatch(tenantId, changeType);
    }, BATCH_DELAY);

    timers.set(changeType, timeoutId);
  } catch (error) {
    logger.error('[Batch] Error adding user change:', error);
  }
};

/**
 * Add node change to batch
 * @param {Object} node - Node document
 */
const addNodeChange = async (node) => {
  try {
    const tenantId = node.tenantId;
    const changeType = 'node';

    const batch = getBatch(tenantId, changeType);
    const timers = getTimer(tenantId, changeType);

    // Add change to batch
    batch.push({
      nodeId: node.nodeId,
      name: node.name,
      changedFields: node.modifiedPaths?.() || [],
      timestamp: new Date(),
    });

    logger.debug(
      `[Batch] Added node change: ${node.nodeId} (batch size: ${batch.length})`
    );

    // Check thresholds
    if (batch.length >= BATCH_SIZE_THRESHOLD) {
      logger.info(
        `[Batch] Threshold reached (${batch.length}), processing immediately`
      );
      await processBatch(tenantId, changeType);
      return;
    }

    if (batch.length >= MAX_BATCH_SIZE) {
      logger.warn(
        `[Batch] Max batch size reached (${batch.length}), force processing`
      );
      await processBatch(tenantId, changeType);
      return;
    }

    // Reset timer
    if (timers.has(changeType)) {
      clearTimeout(timers.get(changeType));
    }

    // Schedule processing
    const timeoutId = setTimeout(async () => {
      await processBatch(tenantId, changeType);
    }, BATCH_DELAY);

    timers.set(changeType, timeoutId);
  } catch (error) {
    logger.error('[Batch] Error adding node change:', error);
  }
};

/**
 * Force process all pending batches (for graceful shutdown)
 */
const flushAllBatches = async () => {
  logger.info('[Batch] Flushing all pending batches...');

  const promises = [];

  for (const [tenantId, tenantBatches] of batchStorage.entries()) {
    for (const [changeType, batch] of tenantBatches.entries()) {
      if (batch.length > 0) {
        promises.push(processBatch(tenantId, changeType));
      }
    }
  }

  await Promise.all(promises);
  logger.info('[Batch] All batches flushed');
};

/**
 * Get current batch statistics
 */
const getBatchStats = () => {
  const stats = {
    totalTenants: batchStorage.size,
    batches: [],
  };

  for (const [tenantId, tenantBatches] of batchStorage.entries()) {
    for (const [changeType, batch] of tenantBatches.entries()) {
      stats.batches.push({
        tenantId,
        changeType,
        size: batch.length,
        oldestChange: batch.length > 0 ? batch[0].timestamp : null,
      });
    }
  }

  return stats;
};

module.exports = {
  addUserChange,
  addNodeChange,
  flushAllBatches,
  getBatchStats,

  // Configuration exports
  BATCH_DELAY,
  BATCH_SIZE_THRESHOLD,
  MAX_BATCH_SIZE,
};
