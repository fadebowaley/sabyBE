const config = require('../config/config');
const logger = require('../config/logger');
const { PaymentSettlement } = require('../models');
const settlementProviderService = require('../services/settlementProvider.service');
const paymentSettlementService = require('../services/paymentSettlement.service');
const paymentRemittanceService = require('../services/paymentRemittance.service');
const paymentEventService = require('../services/paymentEvent.service');
const paymentFlowService = require('../services/paymentFlow.service');

const RECONCILIATION_CRON = config.payment?.reconciliation?.cron || '0 6 * * *'; // Daily at 06:00 UTC
const RECONCILIATION_LOOKBACK_DAYS = Number(config.payment?.reconciliation?.lookbackDays || 7);
const RECONCILIATION_MAX_PAGES = Number(config.payment?.reconciliation?.maxPages || 5);
const BATCH_SIZE = Number(config.payment?.reconciliation?.batchSize || 100);

const toIsoDate = (date) => new Date(date).toISOString().slice(0, 10);

const canRetryFailedSettlement = (settlement) =>
  settlement.status === 'failed' &&
  !settlement.providerTransferId &&
  settlement.guardrailStatus !== 'rejected' &&
  !settlement.metadata?.failure?.aggregationRequired &&
  !/amount is below minimum limit/i.test(String(settlement.failureReason || ''));

const runReconciliationSweep = async () => {
  const startTime = Date.now();
  logger.info('[Payment Reconciliation] Starting daily reconciliation sweep');

  let failedCount = 0;
  let remittanceQueued = 0;
  let providerSettled = 0;
  let recoveredSettlements = 0;
  let scannedStuck = 0;

  try {
    // 1. STUCK PAYMENTS: Find payments stuck in 'processing' > threshold
    const stuckMinutes = Number(config.payment?.reconciliation?.stuckMinutes || 45);
    const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000);

    const stuckPayments = await (require('../models').Payment).find({
      status: 'processing',
      processedAt: { $lte: cutoff },
    })
      .sort({ processedAt: 1 })
      .limit(BATCH_SIZE);

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

      await (require('../services/paymentEvent.service')).appendPaymentEvent({
        tenantId: payment.tenantId,
        payment,
        eventType: 'reconciliation_marked_failed',
        fromStatus,
        toStatus: payment.status,
        userId: payment.userId,
        source: 'reconciliation-worker',
        dedupeKey: `recon-failed:${payment.id}:${new Date().toISOString().slice(0, 16)}`,
        metadata: { stuckMinutes },
      });

      await (require('../services/paymentFlow.service')).upsertPaymentFlow({
        ...(require('../services/paymentFlow.service')).fromPayment(payment),
        reconciliation_status: 'stuck_recovered',
        last_reconciled_at: new Date().toISOString(),
      });

      failedCount += 1;
    }

    // 2. ELIGIBLE REMITTANCES: Find completed payments needing remittance
    const remittanceCandidates = await (require('../models').Payment).find({
      status: 'completed',
      purpose: 'collection',
      beneficiaryType: 'tenant',
      remittanceConfigId: { $exists: true, $ne: null },
    })
      .sort({ completedAt: -1 })
      .limit(BATCH_SIZE);

    for (const payment of remittanceCandidates) {
      const result = await require('../services/paymentRemittance.service').enqueueIfEligible(payment, {
        trigger: 'payment.reconciliation.sweep',
        jobId: `payment-remittance-${payment._id || payment.id}-reconcile-${Date.now()}`,
      });
      if (result?.queued) {
        remittanceQueued += 1;
      }

      await (require('../services/paymentFlow.service')).upsertPaymentFlow({
        ...(require('../services/paymentFlow.service')).fromPayment(payment),
        reconciliation_status: 'clean',
        last_reconciled_at: new Date().toISOString(),
        remittance_queued: result?.queued || false,
      });
    }

    // 3. PROVIDER SETTLEMENT CHECK: Check Flutterwave for settled transactions
    const from = toIsoDate(
      new Date(new Date().getTime() - RECONCILIATION_LOOKBACK_DAYS * 86400000)
    );
    const to = toIsoDate(new Date());

    const pendingSettlements = await (require('../models').PaymentSettlement).find({
      provider: 'flutterwave',
      fundingStatus: { $in: ['provider_verified', 'unconfirmed', 'blocked_guardrail'] },
      status: { $in: ['pending', 'queued', 'processing', 'failed'] },
    })
      .sort({ createdAt: -1 })
      .limit(BATCH_SIZE);

    for (const settlement of pendingSettlements) {
      if (settlement.status === 'failed') {
        if (!canRetryFailedSettlement(settlement)) {
          continue;
        }
        settlement.status = 'pending';
        settlement.availabilityStatus = 'awaiting_provider_settlement';
        settlement.failureReason = null;
        settlement.metadata = {
          ...(settlement.metadata || {}),
          reconciliation: {
            ...(settlement.metadata?.reconciliation || {}),
            recoveredForProviderSettlementCheckAt: new Date().toISOString(),
          },
        };
        await settlement.save();
        recoveredSettlements += 1;
      }

      const payment = await (require('../models').Payment).findById(settlement.paymentId);
      if (!payment || payment.status !== 'completed') {
        continue;
      }

      const baseDate = payment.completedAt || payment.createdAt || settlement.createdAt;
      const from = toIsoDate(
        new Date(new Date(baseDate).getTime() - RECONCILIATION_LOOKBACK_DAYS * 86400000)
      );
      const to = toIsoDate(new Date());

      const match = await require('../services/flutterwaveSettlement.service').findSettledTransaction({
        payment,
        settlement,
        from,
        to,
        maxPages: RECONCILIATION_MAX_PAGES,
      });

      if (!match?.matched) {
        continue;
      }

      await require('../services/paymentSettlement.service').markSettlementProviderSettled({
        settlement,
        providerSettlementId: match.providerSettlementId,
        providerSettledAt: match.providerSettledAt || new Date(),
        metadata: {
          transaction: match.transaction,
          settlementBatch: match.settlementBatch,
        },
      });

      await (require('../services/paymentEvent.service')).appendPaymentEvent({
        tenantId: payment.tenantId,
        payment,
        eventType: 'provider_settlement_confirmed',
        fromStatus: payment.status,
        toStatus: payment.status,
        userId: payment.userId,
        source: 'payment.reconciliation.sweep',
        sourceRef: String(settlement._id || settlement.id),
        dedupeKey: `provider-settlement-confirmed:${settlement.id}:${match.providerSettlementId}`,
        metadata: {
          settlementId: String(settlement._id || settlement.id),
          providerSettlementId: match.providerSettlementId,
          providerSettledAt: match.providerSettledAt,
          paymentReference: payment.reference,
        },
      });

      const result = await require('../services/paymentRemittance.service').enqueueIfEligible(payment, {
        trigger: 'payment.reconciliation.provider-settled',
        jobId: `payment-remittance-${payment._id || payment.id}-provider-settled-${Date.now()}`,
      });
      if (result?.queued) {
        remittanceQueued += 1;
      }

      await (require('../services/paymentFlow.service')).upsertPaymentFlow({
        ...(require('../services/paymentFlow.service')).fromPayment(payment),
        ...(require('../services/paymentFlow.service')).fromSettlement(settlement),
        reconciliation_status: 'clean',
        last_reconciled_at: new Date().toISOString(),
        remittance_queued: result?.queued || false,
      });

      providerSettled += 1;
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[Payment Reconciliation] Sweep done. failed=${failedCount}, remittanceQueued=${remittanceQueued}, providerSettled=${providerSettled}, recoveredSettlements=${recoveredSettlements}, scanned=${scannedStuck}, duration=${duration}ms`
    );

    return {
      failedCount,
      remittanceQueued,
      providerSettled,
      recoveredSettlements,
      scannedStuck: stuckPayments.length,
      cutoff: cutoff.toISOString(),
      durationMs: duration,
    };
  } catch (error) {
    logger.error(`[Payment Reconciliation] Sweep failed: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

const startReconciliationCron = () => {
  const cron = require('node-cron');
  cron.schedule(RECONCILIATION_CRON, async () => {
    try {
      await runReconciliationSweep();
    } catch (error) {
      logger.error(`[Payment Reconciliation Cron] Error: ${error.message}`, { stack: error.stack });
    }
  });

  logger.info(`[Payment Reconciliation Cron] Scheduled: ${RECONCILIATION_CRON}`);
  return cron;
};

module.exports = {
  runReconciliationSweep,
  startReconciliationCron,
};