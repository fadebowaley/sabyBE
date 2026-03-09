const config = require('../config/config');
const logger = require('../config/logger');
const { Payment } = require('../models');
const paymentEventService = require('./paymentEvent.service');
const paymentRemittanceService = require('./paymentRemittance.service');

const runReconciliationSweep = async () => {
  const stuckMinutes = Number(config.payment?.reconciliation?.stuckMinutes) || 45;
  const batchSize = Number(config.payment?.reconciliation?.batchSize) || 200;
  const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000);

  const stuckPayments = await Payment.find({
    status: 'processing',
    processedAt: { $lte: cutoff },
  })
    .sort({ processedAt: 1 })
    .limit(batchSize);

  let failedCount = 0;
  for (const payment of stuckPayments) {
    const fromStatus = payment.status;
    payment.status = 'failed';
    payment.failedAt = new Date();
    payment.failureReason =
      payment.failureReason ||
      `Marked failed by reconciliation sweep after ${stuckMinutes} minutes in processing`;
    payment.metadata = {
      ...(payment.metadata || {}),
      reconciliation: {
        ...(payment.metadata?.reconciliation || {}),
        lastSweepAt: new Date().toISOString(),
        markedFailed: true,
      },
    };
    await payment.save();

    await paymentEventService.appendPaymentEvent({
      tenantId: payment.tenantId,
      payment,
      eventType: 'reconciliation_marked_failed',
      fromStatus,
      toStatus: payment.status,
      userId: payment.userId,
      source: 'reconciliation-worker',
      dedupeKey: `recon-failed:${payment.id}:${new Date().toISOString().slice(0, 16)}`,
      metadata: {
        stuckMinutes,
      },
    });

    failedCount += 1;
  }

  const remittanceCandidates = await Payment.find({
    status: 'completed',
    purpose: 'collection',
    beneficiaryType: 'tenant',
    remittanceConfigId: { $exists: true, $ne: null },
  })
    .sort({ completedAt: -1 })
    .limit(batchSize);

  let remittanceQueued = 0;
  for (const payment of remittanceCandidates) {
    const result = await paymentRemittanceService.enqueueIfEligible(payment, {
      trigger: 'payment.reconciliation.sweep',
    });
    if (result?.queued) {
      remittanceQueued += 1;
    }
  }

  logger.info(
    `[Payment Reconciliation] Sweep done. failed=${failedCount}, remittanceQueued=${remittanceQueued}, scanned=${stuckPayments.length}`
  );

  return {
    failedCount,
    remittanceQueued,
    scannedStuck: stuckPayments.length,
    cutoff: cutoff.toISOString(),
  };
};

module.exports = {
  runReconciliationSweep,
};
