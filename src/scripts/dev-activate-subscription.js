/**
 * Quick script to manually activate a subscription for a tenant in development.
 * Usage: node sabyBackend/src/scripts/dev-activate-subscription.js <tenantId> [planId]
 * Example: node sabyBackend/src/scripts/dev-activate-subscription.js 8SnqteS03y pro
 *
 * NOTE: This connects to the Docker MongoDB at mongodb://admin:local_prod_mongo_2026@localhost:27017/halo-staging?authSource=admin
 * Adjust the MONGODB_URL below to match your running backend's database.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const MONGO_URL = process.env.MONGODB_URL || 'mongodb://admin:local_prod_mongo_2026@localhost:27017/halo-staging?authSource=admin';

async function main() {
  const tenantId = process.argv[2];
  const planId = process.argv[3] || 'pro';

  if (!tenantId) {
    console.error('Usage: node dev-activate-subscription.js <tenantId> [planId]');
    console.error('Example: node dev-activate-subscription.js 8SnqteS03y pro');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URL);
  const { Subscription } = require('../models');
  const subscriptionEntitlementService = require('../services/subscriptionEntitlement.service');

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const entitlements = subscriptionEntitlementService.buildEffectiveEntitlements({
    planId,
    addonIds: [],
    featureOverrides: {},
  });

  const planNames = { starter: 'Starter', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };

  const sub = await Subscription.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        planId,
        planName: planNames[planId] || planId,
        status: 'active',
        billingPeriod: 'monthly',
        currency: 'NGN',
        addOns: [],
        pricingSnapshot: { amount: 31500, total: 31500, currency: 'NGN' },
        paymentProvider: 'flutterwave',
        paymentReference: 'DEV-MANUAL-ACTIVATION',
        startedAt: now,
        lastPaymentAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        renewalAt: periodEnd,
        entitlementsSnapshot: entitlements,
        providerMetadata: { provider: 'development', source: 'manual-activation' },
        metadata: { source: 'dev-activate-subscription-script', activatedAt: now.toISOString() },
      },
      $setOnInsert: {
        featureOverrides: {},
        usageCounters: {},
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('Subscription activated:', JSON.stringify({
    tenantId: sub.tenantId,
    planId: sub.planId,
    planName: sub.planName,
    status: sub.status,
    billingPeriod: sub.billingPeriod,
    currency: sub.currency,
    currentPeriodEnd: sub.currentPeriodEnd,
    capabilities: Object.keys(sub.entitlementsSnapshot?.capabilities || {}),
  }, null, 2));

  await mongoose.disconnect();
  console.log('\nDone. The tenant should now have studio access.');
}

main().catch(err => { console.error(err); process.exit(1); });
