/**
 * Incremental Baseline Updates Service
 *
 * Performs incremental updates to network baselines instead of full recomputation
 * Critical for 1 billion node scale - avoids reprocessing entire network for small changes
 */

const logger = require('../config/logger');
const { BaselineIntelligence, Nodes, User } = require('../models');

// ============================================================================
// INCREMENTAL UPDATE STRATEGIES
// ============================================================================

/**
 * Incrementally update user metrics in network baseline
 * @param {string} tenantId - Tenant ID
 * @param {Object} delta - Changes to apply
 * @returns {Promise<Object>} Updated baseline
 */
const incrementallyUpdateUserMetrics = async (tenantId, delta) => {
  try {
    const baseline = await BaselineIntelligence.findOne({
      tenantId,
      type: 'network',
    });

    if (!baseline || !baseline.metrics || !baseline.metrics.users) {
      logger.warn(
        `[Incremental] No baseline found for tenant ${tenantId}, skipping incremental update`
      );
      return null;
    }

    const userMetrics = baseline.metrics.users;

    // Apply delta changes
    if (delta.total !== undefined) userMetrics.total += delta.total;
    if (delta.active !== undefined) userMetrics.active += delta.active;
    if (delta.inactive !== undefined) userMetrics.inactive += delta.inactive;

    // Update gender distribution
    if (delta.gender) {
      for (const [gender, count] of Object.entries(delta.gender)) {
        userMetrics.demographics.gender[gender] =
          (userMetrics.demographics.gender[gender] || 0) + count;
      }
    }

    // Update verification stats
    if (delta.verification) {
      if (delta.verification.email !== undefined) {
        userMetrics.verification.email += delta.verification.email;
      }
      if (delta.verification.phone !== undefined) {
        userMetrics.verification.phone += delta.verification.phone;
      }

      // Recalculate rates
      if (userMetrics.total > 0) {
        userMetrics.verification.emailRate = Math.round(
          (userMetrics.verification.email / userMetrics.total) * 100
        );
        userMetrics.verification.phoneRate = Math.round(
          (userMetrics.verification.phone / userMetrics.total) * 100
        );
      }
    }

    // Save updated baseline
    baseline.markModified('metrics');
    await baseline.save();

    logger.info(`[Incremental] Updated user metrics for tenant ${tenantId}`);

    return baseline;
  } catch (error) {
    logger.error('[Incremental] Error updating user metrics:', error);
    throw error;
  }
};

/**
 * Incrementally update network metrics (attendance/income)
 * @param {string} tenantId - Tenant ID
 * @param {Object} delta - Changes to apply
 * @returns {Promise<Object>} Updated baseline
 */
const incrementallyUpdateNetworkMetrics = async (tenantId, delta) => {
  try {
    const baseline = await BaselineIntelligence.findOne({
      tenantId,
      type: 'network',
    });

    if (!baseline || !baseline.metrics || !baseline.metrics.network) {
      logger.warn(
        `[Incremental] No network baseline found for tenant ${tenantId}`
      );
      return null;
    }

    const networkMetrics = baseline.metrics.network;

    // Update node counts
    if (delta.totalNodes !== undefined) {
      networkMetrics.totalNodes += delta.totalNodes;
    }
    if (delta.activeNodes !== undefined) {
      networkMetrics.activeNodes += delta.activeNodes;
    }
    if (delta.inactiveNodes !== undefined) {
      networkMetrics.inactiveNodes += delta.inactiveNodes;
    }

    // Update attendance metrics
    if (delta.attendance) {
      if (delta.attendance.total !== undefined) {
        networkMetrics.attendance.total += delta.attendance.total;
      }

      // Recalculate average
      if (networkMetrics.totalNodes > 0) {
        networkMetrics.attendance.average = Math.round(
          networkMetrics.attendance.total / networkMetrics.totalNodes
        );
      }
    }

    // Update income metrics
    if (delta.income) {
      if (delta.income.total !== undefined) {
        networkMetrics.income.total += delta.income.total;
      }

      // Recalculate average
      if (networkMetrics.totalNodes > 0) {
        networkMetrics.income.average = Math.round(
          networkMetrics.income.total / networkMetrics.totalNodes
        );
      }
    }

    // Save updated baseline
    baseline.markModified('metrics');
    await baseline.save();

    logger.info(`[Incremental] Updated network metrics for tenant ${tenantId}`);

    return baseline;
  } catch (error) {
    logger.error('[Incremental] Error updating network metrics:', error);
    throw error;
  }
};

/**
 * Calculate delta for user change
 * @param {Object} oldUser - User before change
 * @param {Object} newUser - User after change
 * @returns {Object} Delta object
 */
const calculateUserDelta = (oldUser, newUser) => {
  const delta = {};

  // Status change
  if (oldUser && oldUser.status !== newUser.status) {
    if (newUser.status && !oldUser.status) {
      delta.active = 1;
      delta.inactive = -1;
    } else if (!newUser.status && oldUser.status) {
      delta.active = -1;
      delta.inactive = 1;
    }
  }

  // New user
  if (!oldUser && newUser) {
    delta.total = 1;
    delta.active = newUser.status ? 1 : 0;
    delta.inactive = newUser.status ? 0 : 1;

    // Gender
    if (newUser.profile?.gender) {
      delta.gender = { [newUser.profile.gender.toLowerCase()]: 1 };
    }

    // Verification
    delta.verification = {
      email: newUser.isEmailVerified ? 1 : 0,
      phone: newUser.isPhoneVerified ? 1 : 0,
    };
  }

  // User deleted
  if (oldUser && !newUser) {
    delta.total = -1;
    delta.active = oldUser.status ? -1 : 0;
    delta.inactive = oldUser.status ? 0 : -1;

    if (oldUser.profile?.gender) {
      delta.gender = { [oldUser.profile.gender.toLowerCase()]: -1 };
    }

    delta.verification = {
      email: oldUser.isEmailVerified ? -1 : 0,
      phone: oldUser.isPhoneVerified ? -1 : 0,
    };
  }

  return delta;
};

/**
 * Calculate delta for node change
 * @param {Object} oldNode - Node before change
 * @param {Object} newNode - Node after change
 * @returns {Object} Delta object
 */
const calculateNodeDelta = (oldNode, newNode) => {
  const delta = {};

  // Node count change
  if (!oldNode && newNode) {
    delta.totalNodes = 1;
    delta.activeNodes = newNode.isActive ? 1 : 0;
    delta.inactiveNodes = newNode.isActive ? 0 : 1;
  }

  if (oldNode && !newNode) {
    delta.totalNodes = -1;
    delta.activeNodes = oldNode.isActive ? -1 : 0;
    delta.inactiveNodes = oldNode.isActive ? 0 : -1;
  }

  // Attendance change
  if (oldNode && newNode) {
    const oldAtt = oldNode.profile?.averageAttendance || 0;
    const newAtt = newNode.profile?.averageAttendance || 0;

    if (oldAtt !== newAtt) {
      delta.attendance = { total: newAtt - oldAtt };
    }

    // Income change
    const oldIncome = oldNode.profile?.averageIncome || 0;
    const newIncome = newNode.profile?.averageIncome || 0;

    if (oldIncome !== newIncome) {
      delta.income = { total: newIncome - oldIncome };
    }
  }

  return delta;
};

/**
 * Decide if incremental update is appropriate or full recomputation needed
 * @param {string} tenantId - Tenant ID
 * @param {Object} change - Change object
 * @returns {Promise<string>} 'incremental' | 'full'
 */
const getUpdateStrategy = async (tenantId, change) => {
  try {
    // Get baseline age
    const baseline = await BaselineIntelligence.findOne({
      tenantId,
      type: 'network',
    }).select('lastComputed');

    if (!baseline) {
      return 'full'; // No baseline exists
    }

    const age = Date.now() - new Date(baseline.lastComputed).getTime();
    const ONE_HOUR = 3600000;

    // If baseline is older than 1 hour, do full recomputation
    if (age > ONE_HOUR) {
      logger.info(
        `[Incremental] Baseline is ${age}ms old, triggering full recomputation`
      );
      return 'full';
    }

    // For small changes, use incremental
    return 'incremental';
  } catch (error) {
    logger.error('[Incremental] Error determining strategy:', error);
    return 'full'; // Default to safe option
  }
};

/**
 * Apply incremental update or trigger full recomputation
 * @param {string} tenantId - Tenant ID
 * @param {Object} delta - Delta object
 * @param {string} changeType - 'user' | 'node'
 * @returns {Promise<Object>} Result
 */
const applyIncrementalUpdate = async (tenantId, delta, changeType) => {
  try {
    const strategy = await getUpdateStrategy(tenantId, delta);

    if (strategy === 'full') {
      // Queue full recomputation
      const { queueNetworkComputation } = require('../queues/baseline.queue');
      await queueNetworkComputation({
        tenantId,
        triggeredBy: `incremental-${changeType}-full-fallback`,
        delay: 30000,
      });

      return { strategy: 'full', queued: true };
    }

    // Apply incremental updates
    if (changeType === 'user') {
      await incrementallyUpdateUserMetrics(tenantId, delta);
    } else if (changeType === 'node') {
      await incrementallyUpdateNetworkMetrics(tenantId, delta);
    }

    return { strategy: 'incremental', applied: true };
  } catch (error) {
    logger.error('[Incremental] Error applying update:', error);

    // Fallback to full recomputation on error
    const { queueNetworkComputation } = require('../queues/baseline.queue');
    await queueNetworkComputation({
      tenantId,
      triggeredBy: `incremental-error-fallback`,
      delay: 30000,
    });

    return { strategy: 'full-fallback', error: error.message };
  }
};

module.exports = {
  // Incremental updates
  incrementallyUpdateUserMetrics,
  incrementallyUpdateNetworkMetrics,

  // Delta calculation
  calculateUserDelta,
  calculateNodeDelta,

  // Strategy
  getUpdateStrategy,
  applyIncrementalUpdate,
};
