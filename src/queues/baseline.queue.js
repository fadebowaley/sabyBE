/**
 * Baseline Intelligence Queue System
 *
 * Handles background processing of baseline computations using Bull/BullMQ
 * For scale: 1,000,000,000 nodes across multiple tenants
 */

const { Queue } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');

// ============================================================================
// QUEUE DEFINITIONS
// ============================================================================

/**
 * Node Baseline Queue
 * Processes individual node baseline computations
 * Concurrency: 10 (process 10 nodes simultaneously)
 */
const nodeBaselineQueue = new Queue('baseline-node', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 3, // Retry 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5s, then 10s, then 20s
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
      count: 5000, // Keep last 5000 failed jobs
    },
  },
});

/**
 * Network Baseline Queue
 * Processes network-wide baseline computations
 * Concurrency: 1 (one network at a time to prevent resource exhaustion)
 */
const networkBaselineQueue = new Queue('baseline-network', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000, // Start with 10s
    },
    removeOnComplete: {
      age: 3600,
      count: 100,
    },
    removeOnFail: {
      age: 86400,
      count: 500,
    },
  },
});

/**
 * Batch Change Queue
 * Processes batched user/node changes
 * Concurrency: 5
 */
const batchChangeQueue = new Queue('baseline-batch', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 3000,
    },
    removeOnComplete: {
      age: 1800, // 30 minutes
      count: 500,
    },
    removeOnFail: {
      age: 7200, // 2 hours
      count: 1000,
    },
  },
});

// ============================================================================
// JOB SCHEDULING FUNCTIONS
// ============================================================================

/**
 * Queue node baseline computation
 * @param {Object} params
 * @param {string} params.nodeId - Node ID
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.triggeredBy - What triggered the computation
 * @param {Object} params.metadata - Additional metadata
 * @returns {Promise<Object>} Job information
 */
const queueNodeComputation = async ({
  nodeId,
  tenantId,
  triggeredBy,
  metadata = {},
}) => {
  try {
    const job = await nodeBaselineQueue.add(
      'compute',
      {
        nodeId,
        tenantId,
        triggeredBy,
        metadata,
        queuedAt: new Date().toISOString(),
      },
      {
        jobId: `node-${tenantId}-${nodeId}`, // Deduplicate by nodeId
      }
    );

    logger.info(
      `[Queue] Node baseline computation queued: ${nodeId} (Job: ${job.id})`
    );

    return {
      jobId: job.id,
      nodeId,
      tenantId,
      status: 'queued',
    };
  } catch (error) {
    logger.error(`[Queue] Error queuing node baseline for ${nodeId}:`, error);
    throw error;
  }
};

/**
 * Queue network baseline computation (debounced by jobId)
 * @param {Object} params
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.triggeredBy - What triggered the computation
 * @param {number} params.delay - Delay before processing (ms, default: 30000)
 * @returns {Promise<Object>} Job information
 */
const queueNetworkComputation = async ({
  tenantId,
  triggeredBy,
  delay = 30000,
}) => {
  try {
    const job = await networkBaselineQueue.add(
      'compute',
      {
        tenantId,
        triggeredBy,
        queuedAt: new Date().toISOString(),
      },
      {
        jobId: `network-${tenantId}`, // Deduplicate by tenantId
        delay, // Debounce: wait before processing
      }
    );

    logger.info(
      `[Queue] Network baseline computation queued: ${tenantId} (delay: ${delay}ms, Job: ${job.id})`
    );

    return {
      jobId: job.id,
      tenantId,
      status: 'delayed',
      delay,
    };
  } catch (error) {
    logger.error(
      `[Queue] Error queuing network baseline for ${tenantId}:`,
      error
    );
    throw error;
  }
};

/**
 * Queue batch of changes for processing
 * @param {Object} params
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.changeType - 'user' or 'node'
 * @param {Array} params.changes - Array of change objects
 * @returns {Promise<Object>} Job information
 */
const queueBatchChanges = async ({ tenantId, changeType, changes }) => {
  try {
    const job = await batchChangeQueue.add(
      'process-batch',
      {
        tenantId,
        changeType,
        changes,
        batchSize: changes.length,
        queuedAt: new Date().toISOString(),
      },
      {
        jobId: `batch-${tenantId}-${changeType}-${Date.now()}`,
      }
    );

    logger.info(
      `[Queue] Batch changes queued: ${changeType} (${changes.length} items, Job: ${job.id})`
    );

    return {
      jobId: job.id,
      tenantId,
      changeType,
      batchSize: changes.length,
      status: 'queued',
    };
  } catch (error) {
    logger.error(`[Queue] Error queuing batch changes:`, error);
    throw error;
  }
};

/**
 * Queue full tenant recomputation
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Job information
 */
const queueFullRecomputation = async (tenantId) => {
  try {
    const job = await networkBaselineQueue.add(
      'full-recompute',
      {
        tenantId,
        triggeredBy: 'manual',
        queuedAt: new Date().toISOString(),
      },
      {
        jobId: `full-${tenantId}-${Date.now()}`,
        priority: 1, // High priority
      }
    );

    logger.info(
      `[Queue] Full recomputation queued for tenant: ${tenantId} (Job: ${job.id})`
    );

    return {
      jobId: job.id,
      tenantId,
      status: 'queued',
      priority: 'high',
    };
  } catch (error) {
    logger.error(
      `[Queue] Error queuing full recomputation for ${tenantId}:`,
      error
    );
    throw error;
  }
};

// ============================================================================
// QUEUE MONITORING
// ============================================================================

/**
 * Get queue statistics
 * @param {string} queueType - 'node' | 'network' | 'batch' | 'all'
 * @returns {Promise<Object>} Queue stats
 */
const getQueueStats = async (queueType = 'all') => {
  try {
    const stats = {};

    if (queueType === 'all' || queueType === 'node') {
      stats.node = {
        waiting: await nodeBaselineQueue.getWaitingCount(),
        active: await nodeBaselineQueue.getActiveCount(),
        completed: await nodeBaselineQueue.getCompletedCount(),
        failed: await nodeBaselineQueue.getFailedCount(),
        delayed: await nodeBaselineQueue.getDelayedCount(),
      };
    }

    if (queueType === 'all' || queueType === 'network') {
      stats.network = {
        waiting: await networkBaselineQueue.getWaitingCount(),
        active: await networkBaselineQueue.getActiveCount(),
        completed: await networkBaselineQueue.getCompletedCount(),
        failed: await networkBaselineQueue.getFailedCount(),
        delayed: await networkBaselineQueue.getDelayedCount(),
      };
    }

    if (queueType === 'all' || queueType === 'batch') {
      stats.batch = {
        waiting: await batchChangeQueue.getWaitingCount(),
        active: await batchChangeQueue.getActiveCount(),
        completed: await batchChangeQueue.getCompletedCount(),
        failed: await batchChangeQueue.getFailedCount(),
        delayed: await batchChangeQueue.getDelayedCount(),
      };
    }

    return stats;
  } catch (error) {
    logger.error('[Queue] Error getting queue stats:', error);
    throw error;
  }
};

/**
 * Get job by ID
 * @param {string} jobId - Job ID
 * @param {string} queueType - 'node' | 'network' | 'batch'
 * @returns {Promise<Object>} Job details
 */
const getJob = async (jobId, queueType) => {
  try {
    let queue;
    switch (queueType) {
      case 'node':
        queue = nodeBaselineQueue;
        break;
      case 'network':
        queue = networkBaselineQueue;
        break;
      case 'batch':
        queue = batchChangeQueue;
        break;
      default:
        throw new Error(`Invalid queue type: ${queueType}`);
    }

    const job = await queue.getJob(jobId);

    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      attemptsMade: job.attemptsMade,
      attemptsMax: job.opts.attempts,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  } catch (error) {
    logger.error(`[Queue] Error getting job ${jobId}:`, error);
    throw error;
  }
};

/**
 * Clear completed jobs
 * @param {string} queueType - 'node' | 'network' | 'batch' | 'all'
 * @returns {Promise<Object>} Cleanup summary
 */
const clearCompletedJobs = async (queueType = 'all') => {
  try {
    const summary = {};

    if (queueType === 'all' || queueType === 'node') {
      await nodeBaselineQueue.clean(3600000, 1000, 'completed'); // Clean jobs older than 1 hour
      summary.node = 'cleaned';
    }

    if (queueType === 'all' || queueType === 'network') {
      await networkBaselineQueue.clean(3600000, 100, 'completed');
      summary.network = 'cleaned';
    }

    if (queueType === 'all' || queueType === 'batch') {
      await batchChangeQueue.clean(1800000, 500, 'completed'); // Clean jobs older than 30 min
      summary.batch = 'cleaned';
    }

    logger.info(`[Queue] Completed jobs cleaned:`, summary);
    return summary;
  } catch (error) {
    logger.error('[Queue] Error cleaning jobs:', error);
    throw error;
  }
};

module.exports = {
  // Queues
  nodeBaselineQueue,
  networkBaselineQueue,
  batchChangeQueue,

  // Job scheduling
  queueNodeComputation,
  queueNetworkComputation,
  queueBatchChanges,
  queueFullRecomputation,

  // Monitoring
  getQueueStats,
  getJob,
  clearCompletedJobs,
};
