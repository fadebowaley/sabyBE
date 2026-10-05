const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');
const { User } = require('../models');
const aiTokenService = require('../services/aiToken.service');

/**
 * Script: seed_starter_ai_quotas.js
 *
 * Discovers all active tenant workspaces in MongoDB and ensures that every tenant
 * has at least the default starter balance (100,000 tokens) in copilot.tenant_ai_quotas.
 * Idempotent: Does not alter or reset tenants that already have a quota record.
 *
 * Usage:
 *   node src/scripts/seed_starter_ai_quotas.js
 */

const run = async () => {
  logger.info('🚀 Starting starter AI quota seed script...');

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info(' Connected to MongoDB');

    // Discover all distinct tenantIds from User documents
    const rawTenantIds = await User.distinct('tenantId', {
      tenantId: { $nin: [null, ''] },
    });
    const tenantIds = rawTenantIds.filter(Boolean);

    logger.info(
      `📋 Discovered ${tenantIds.length} distinct tenant(s) in MongoDB.`
    );

    let newlyProvisioned = 0;
    let alreadyConfigured = 0;

    await Promise.all(
      tenantIds.map(async (tenantId) => {
        try {
          const res = await postgresPool.query(
            `SELECT tenant_id, remaining_tokens, purchased_tokens, is_unlimited
             FROM copilot.tenant_ai_quotas
             WHERE tenant_id = $1 LIMIT 1;`,
            [String(tenantId)]
          );

          if (res.rows.length > 0) {
            alreadyConfigured += 1;
            return;
          }

          const provisioned = await aiTokenService.provisionStarterQuota({
            tenantId,
            reason: 'Backfill starter AI quota for existing workspace',
          });

          if (provisioned) {
            newlyProvisioned += 1;
            logger.info(
              `✨ Granted 100,000 starter tokens to existing tenant: ${tenantId}`
            );
          }
        } catch (err) {
          logger.error(
            `❌ Error checking/provisioning tenant ${tenantId}: ${err.message}`
          );
        }
      })
    );

    logger.info('===============================================');
    logger.info('✅ Starter AI Quota Seed Completed Successfully');
    logger.info(`   • Total tenants examined: ${tenantIds.length}`);
    logger.info(`   • Newly provisioned with 100k tokens: ${newlyProvisioned}`);
    logger.info(`   • Already had quota configured: ${alreadyConfigured}`);
    logger.info('===============================================');
  } catch (error) {
    logger.error(`Fatal error in seed script: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => null);
    await postgresPool.end().catch(() => null);
  }
};

if (require.main === module) {
  run().then(() => process.exit(process.exitCode || 0));
}

module.exports = run;
