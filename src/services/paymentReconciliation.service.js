const config = require('../config/config');
const logger = require('../config/logger');
const { Payment, PaymentSettlement } = require('../models');
const paymentEventService = require('./paymentEvent.service');
const paymentRemittanceService = require('./paymentRemittance.service');
const paymentSettlementService = require('./paymentSettlement.service');
const flutterwaveSettlementService = require('./flutterwaveSettlement.service');
const paymentFlowService = require('./paymentFlow.service');

const toIsoDate = (date) => new Date(date).toISOString().slice(0, 10);

const canRetryFailedSettlement = (settlement) =>
  settlement.status === 'failed' &&
  !settlement.providerTransferId &&
  settlement.guardrailStatus !== 'rejected' &&
  !settlement.metadata?.failure?.aggregationRequired &&
  !/amount is below minimum limit/i.test(String(settlement.failureReason || ''));

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
      userId:       payment.userId,
      source: 'reconciliation-worker',
      dedupeKey: `recon-failed:${payment.id}:${new Date().toISOString().slice(0, 16)}`,
      metadata: { stuckMinutes },
    });

    await paymentFlowService.upsertPaymentFlow({
      ...paymentFlowService.fromPayment(payment),
      reconciliation_status: 'stuck_recovered',
      last_reconciled_at: new Date().toISOString(),
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
  let providerSettled = 0;
  let recoveredSettlements = 0;
  for (const payment of remittanceCandidates) {
    const result = await paymentRemittanceService.enqueueIfEligible(payment, {
      trigger: 'payment.reconciliation.sweep',
      jobId: `payment-remittance-${payment._id || payment.id}-reconcile-${Date.now()}`,
    });
    if (result?.queued) {
      remittanceQueued += 1;
    }

    await paymentFlowService.upsertPaymentFlow({
      ...paymentFlowService.fromPayment(payment),
      reconciliation_status: 'clean',
      last_reconciled_at: new Date().toISOString(),
      remittance_queued: result?.queued || false,
    });
  }

  const settlementLookbackDays =
    Number(config.payment?.settlementGuardrails?.lookbackDays) || 7;
  const settlementMaxPages =
    Number(config.payment?.settlementGuardrails?.maxPages) || 5;
  const pendingSettlements = await PaymentSettlement.find({
    provider: 'flutterwave',
    fundingStatus: { $in: ['provider_verified', 'unconfirmed', 'blocked_guardrail'] },
    status: { $in: ['pending', 'queued', 'failed'] },
  })
    .sort({ createdAt: -1 })
    .limit(batchSize);

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

    const payment = await Payment.findById(settlement.paymentId);
    if (!payment || payment.status !== 'completed') {
      continue;
    }

    const baseDate = payment.completedAt || payment.createdAt || settlement.createdAt;
    const from = toIsoDate(
      new Date(new Date(baseDate).getTime() - settlementLookbackDays * 86400000)
    );
    const to = toIsoDate(new Date());
    const match = await flutterwaveSettlementService.findSettledTransaction({
      payment,
      settlement,
      from,
      to,
      maxPages: settlementMaxPages,
    });

    if (!match?.matched) {
      continue;
    }

    await paymentSettlementService.markSettlementProviderSettled({
      settlement,
      providerSettlementId: match.providerSettlementId,
      providerSettledAt: match.providerSettledAt || new Date(),
      metadata: {
        transaction: match.transaction,
        settlementBatch: match.settlementBatch,
      },
    });

    await paymentEventService.appendPaymentEvent({
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

    const result = await paymentRemittanceService.enqueueIfEligible(payment, {
      trigger: 'payment.reconciliation.provider-settled',
      jobId: `payment-remittance-${payment._id || payment.id}-provider-settled-${Date.now()}`,
    });
    if (result?.queued) {
      remittanceQueued += 1;
    }

    await paymentFlowService.upsertPaymentFlow({
      ...paymentFlowService.fromPayment(payment),
      ...paymentFlowService.fromSettlement(settlement),
      reconciliation_status: 'clean',
      last_reconciled_at: new Date().toISOString(),
      remittance_queued: result?.queued || false,
    });

    providerSettled += 1;
  }

  logger.info(
    `[Payment Reconciliation] Sweep done. failed=${failedCount}, remittanceQueued=${remittanceQueued}, providerSettled=${providerSettled}, recoveredSettlements=${recoveredSettlements}, scanned=${stuckPayments.length}`
  );

  return {
    failedCount,
    remittanceQueued,
    providerSettled,
    recoveredSettlements,
    scannedStuck: stuckPayments.length,
    cutoff: cutoff.toISOString(),
  };
};

module.exports = {
  runReconciliationSweep,
};
