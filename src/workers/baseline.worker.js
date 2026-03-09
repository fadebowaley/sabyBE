/**
 * Baseline Intelligence Worker
 *
 * Processes baseline computation jobs from Bull queues
 * Designed for scale: 1,000,000,000 nodes across multiple tenants
 */

const { Worker } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const { baselineIntelligenceService } = require('../services');
const { Nodes } = require('../models');
const { getIO } = require('../config/socket');
const logger = require('../config/logger');

// ============================================================================
// NODE BASELINE WORKER
// Concurrency: 10 (process 10 nodes simultaneously)
// ============================================================================

const createNodeBaselineWorker = () => {
  const worker = new Worker(
    'baseline-node',
    async (job) => {
      const { nodeId, tenantId, triggeredBy } = job.data;
      const startTime = Date.now();

      try {
        logger.info(
          `[Worker] Processing node baseline: ${nodeId} (Job: ${job.id})`
        );

        // Update job progress
        await job.updateProgress(10);

        // Compute baseline
        const baselineData =
          await baselineIntelligenceService.computeNodeBaseline(
            nodeId,
            tenantId
          );

        await job.updateProgress(70);

        // Save baseline
        await baselineIntelligenceService.saveBaseline(baselineData);

        await job.updateProgress(90);

        // Invalidate cache
        await baselineIntelligenceService.invalidateCache(tenantId, nodeId);

        await job.updateProgress(100);

        const duration = Date.now() - startTime;

        logger.info(
          `[Worker] Node baseline completed: ${nodeId} in ${duration}ms`
        );

        // Emit Socket.io event for real-time updates
        try {
          const io = getIO();
          io.to(`tenant:${tenantId}`).emit('baseline:node:computed', {
            nodeId,
            tenantId,
            duration,
            triggeredBy,
            jobId: job.id,
          });
        } catch (socketError) {
          // Socket.io not critical, log but don't fail
          logger.warn('[Worker] Socket.io emit failed:', socketError.message);
        }

        return {
          success: true,
          nodeId,
          tenantId,
          duration,
          triggeredBy,
        };
      } catch (error) {
        logger.error(
          `[Worker] Error processing node baseline ${nodeId}:`,
          error
        );

        // Emit failure event
        try {
          const io = getIO();
          io.to(`tenant:${tenantId}`).emit('baseline:node:failed', {
            nodeId,
            tenantId,
            error: error.message,
            jobId: job.id,
          });
        } catch (socketError) {
          // Ignore socket errors
        }

        throw error; // Re-throw to trigger retry
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 10, // Process 10 jobs concurrently
      limiter: {
        max: 100, // Max 100 jobs
        duration: 60000, // Per minute
      },
    }
  );

  // Event listeners
  worker.on('completed', (job, result) => {
    logger.info(`[Worker] Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`[Worker] Job ${job.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    logger.error('[Worker] Worker error:', error);
  });

  return worker;
};

// ============================================================================
// NETWORK BASELINE WORKER
// Concurrency: 1 (one network at a time to prevent resource exhaustion)
// ============================================================================

const createNetworkBaselineWorker = () => {
  const worker = new Worker(
    'baseline-network',
    async (job) => {
      const { tenantId, triggeredBy } = job.data;
      const startTime = Date.now();

      try {
        logger.info(
          `[Worker] Processing network baseline: ${tenantId} (Job: ${job.id})`
        );

        await job.updateProgress(10);

        // Compute network baseline
        const baselineData =
          await baselineIntelligenceService.computeNetworkBaseline(tenantId);

        await job.updateProgress(80);

        // Save baseline
        await baselineIntelligenceService.saveBaseline(baselineData);

        await job.updateProgress(95);

        // Invalidate cache
        await baselineIntelligenceService.invalidateCache(tenantId, null);

        await job.updateProgress(100);

        const duration = Date.now() - startTime;

        logger.info(
          `[Worker] Network baseline completed: ${tenantId} in ${duration}ms`
        );

        // Emit Socket.io event
        try {
          const io = getIO();
          io.to(`tenant:${tenantId}`).emit('baseline:network:computed', {
            tenantId,
            duration,
            triggeredBy,
            jobId: job.id,
          });
        } catch (socketError) {
          logger.warn('[Worker] Socket.io emit failed:', socketError.message);
        }

        return {
          success: true,
          tenantId,
          duration,
          triggeredBy,
        };
      } catch (error) {
        logger.error(
          `[Worker] Error processing network baseline ${tenantId}:`,
          error
        );

        // Emit failure event
        try {
          const io = getIO();
          io.to(`tenant:${tenantId}`).emit('baseline:network:failed', {
            tenantId,
            error: error.message,
            jobId: job.id,
          });
        } catch (socketError) {
          // Ignore
        }

        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 1, // Only 1 network computation at a time
      limiter: {
        max: 10, // Max 10 per minute (prevent overload)
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(`[Worker] Network job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`[Worker] Network job ${job.id} failed:`, error.message);
  });

  return worker;
};

// ============================================================================
// BATCH CHANGE WORKER
// Concurrency: 5 (process 5 batches concurrently)
// ============================================================================

const createBatchChangeWorker = () => {
  const worker = new Worker(
    'baseline-batch',
    async (job) => {
      const { tenantId, changeType, changes, batchSize } = job.data;
      const startTime = Date.now();

      try {
        logger.info(
          `[Worker] Processing batch: ${changeType} (${batchSize} changes, Job: ${job.id})`
        );

        await job.updateProgress(10);

        const affectedNodeIds = new Set();

        if (changeType === 'user') {
          // Process user changes
          for (const change of changes) {
            const userId = change.userId || change._id;
            const nodes = await Nodes.find({
              users: userId,
              tenantId,
            })
              .select('nodeId')
              .lean();

            nodes.forEach((n) => affectedNodeIds.add(n.nodeId));
          }

          await job.updateProgress(40);

          // Recompute affected nodes in parallel
          const nodeIds = Array.from(affectedNodeIds);
          const BATCH_SIZE = 10;

          for (let i = 0; i < nodeIds.length; i += BATCH_SIZE) {
            const batch = nodeIds.slice(i, i + BATCH_SIZE);

            await Promise.all(
              batch.map(async (nodeId) => {
                const baselineData =
                  await baselineIntelligenceService.computeNodeBaseline(
                    nodeId,
                    tenantId
                  );
                await baselineIntelligenceService.saveBaseline(baselineData);
              })
            );

            const progress = 40 + ((i + BATCH_SIZE) / nodeIds.length) * 50;
            await job.updateProgress(Math.min(progress, 90));
          }
        } else if (changeType === 'node') {
          // Process node changes
          await job.updateProgress(40);

          const BATCH_SIZE = 10;
          for (let i = 0; i < changes.length; i += BATCH_SIZE) {
            const batch = changes.slice(i, i + BATCH_SIZE);

            await Promise.all(
              batch.map(async (change) => {
                const nodeId = change.nodeId;
                const baselineData =
                  await baselineIntelligenceService.computeNodeBaseline(
                    nodeId,
                    tenantId
                  );
                await baselineIntelligenceService.saveBaseline(baselineData);
              })
            );

            const progress = 40 + ((i + BATCH_SIZE) / changes.length) * 50;
            await job.updateProgress(Math.min(progress, 90));
          }
        }

        await job.updateProgress(95);

        // Schedule network recomputation (debounced)
        baselineIntelligenceService.scheduleNetworkRecompute(tenantId, 30000);

        await job.updateProgress(100);

        const duration = Date.now() - startTime;

        logger.info(
          `[Worker] Batch processing completed: ${batchSize} ${changeType} changes in ${duration}ms`
        );

        // Emit completion event
        try {
          const io = getIO();
          io.to(`tenant:${tenantId}`).emit('baseline:batch:completed', {
            tenantId,
            changeType,
            batchSize,
            affectedNodes: affectedNodeIds.size,
            duration,
            jobId: job.id,
          });
        } catch (socketError) {
          logger.warn('[Worker] Socket.io emit failed:', socketError.message);
        }

        return {
          success: true,
          tenantId,
          changeType,
          batchSize,
          affectedNodes: affectedNodeIds.size,
          duration,
        };
      } catch (error) {
        logger.error(`[Worker] Error processing batch:`, error);
        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5, // Process 5 batches concurrently
      limiter: {
        max: 50,
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(`[Worker] Batch job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`[Worker] Batch job ${job.id} failed:`, error.message);
  });

  return worker;
};

// ============================================================================
// WORKER INITIALIZATION
// ============================================================================

let nodeWorker = null;
let networkWorker = null;
let batchWorker = null;

const initializeBaselineWorkers = async () => {
  try {
    logger.info('🔧 Initializing baseline workers...');

    nodeWorker = createNodeBaselineWorker();
    logger.info('✅ Node baseline worker started (concurrency: 10)');

    networkWorker = createNetworkBaselineWorker();
    logger.info('✅ Network baseline worker started (concurrency: 1)');

    batchWorker = createBatchChangeWorker();
    logger.info('✅ Batch change worker started (concurrency: 5)');

    logger.info('🎉 All baseline workers initialized successfully');
  } catch (error) {
    logger.error('❌ Error initializing baseline workers:', error);
    throw error;
  }
};

const shutdownBaselineWorkers = async () => {
  try {
    logger.info('🛑 Shutting down baseline workers...');

    if (nodeWorker) {
      await nodeWorker.close();
      logger.info('✅ Node worker closed');
    }

    if (networkWorker) {
      await networkWorker.close();
      logger.info('✅ Network worker closed');
    }

    if (batchWorker) {
      await batchWorker.close();
      logger.info('✅ Batch worker closed');
    }

    logger.info('👋 All baseline workers shut down');
  } catch (error) {
    logger.error('❌ Error shutting down baseline workers:', error);
  }
};

module.exports = {
  createNodeBaselineWorker,
  createNetworkBaselineWorker,
  createBatchChangeWorker,
  initializeBaselineWorkers,
  shutdownBaselineWorkers,
};
