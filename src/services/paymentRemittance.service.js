const logger = require('../config/logger');
const config = require('../config/config');
const { Payment } = require('../models');
const {
  queueRemittance,
  PAYMENT_REMITTANCE_QUEUE_NAME,
} = require('../queues/paymentRemittance.queue');
const paymentEventService = require('./paymentEvent.service');
const paymentSettlementService = require('./paymentSettlement.service');
const settlementProviderService = require('./settlementProvider.service');
const dlqService = require('./dlq.service');

const isRemittanceEligible = (payment) =>
  !!payment &&
  payment.status === 'completed' &&
  payment.purpose === 'collection' &&
  payment.beneficiaryType === 'tenant' &&
  !!payment.remittanceConfigId;

const getGuardrailThreshold = (currency) => {
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  return Number(config.payment?.settlementGuardrails?.thresholds?.[normalizedCurrency] || 0);
};

const requiresGuardrailReview = (settlement) => {
  const threshold = getGuardrailThreshold(settlement.currency);
  const amount = Number(settlement.netAmount || settlement.amount || 0);
  return threshold > 0 && amount >= threshold;
};

const enqueueIfEligible = async (payment, context = {}) => {
  if (!isRemittanceEligible(payment)) {
    return { queued: false, reason: 'not_eligible' };
  }

  const payload = {
    paymentId: String(payment._id || payment.id),
    tenantId: payment.tenantId,
    reference: payment.reference,
    remittanceConfigId: payment.remittanceConfigId,
    amount: payment.total,
    currency: payment.currency,
    purpose: payment.purpose,
    triggeredBy: context.trigger || 'payment_completion',
    requestedAt: new Date().toISOString(),
  };

  const job = await queueRemittance(payload, {
    jobId: context.jobId || `payment-remittance-${payload.paymentId}`,
  });

  logger.info(
    `[Payment Remittance] Queued remittance job ${job.id} for payment ${payload.reference}`
  );

  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'remittance_queued',
    fromStatus: payment.status,
    toStatus: payment.status,
    userId: payment.userId,
    source: context.trigger || 'payment_completion',
    sourceRef: String(job.id),
    dedupeKey: `remittance-queued:${payload.paymentId}`,
    metadata: {
      remittanceConfigId: payment.remittanceConfigId,
      amount: payment.total,
      currency: payment.currency,
    },
  });

  return { queued: true, jobId: String(job.id) };
};

const T_PLUS_ONE_HOURS = Number(config.payment?.remittance?.tPlusOneHours || 24);

const processRemittanceJob = async (job) => {
  const { paymentId, remittanceConfigId, requestedAt, reference } = job.data || {};
  if (!paymentId) {
    throw new Error('paymentId is required in remittance job payload');
  }

  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new Error(`Payment not found: ${paymentId}`);
  }

  if (!isRemittanceEligible(payment)) {
    logger.warn(
      `[Payment Remittance] Skipping ineligible payment ${reference || payment.reference}`
    );
    return { skipped: true, reason: 'not_eligible' };
  }

  // T+1 CHECK: Skip if payment completed less than T_PLUS_ONE_HOURS ago
  const paymentCompletedAt = payment.completedAt || payment.processedAt || payment.updatedAt;
  if (paymentCompletedAt) {
    const hoursSinceCompletion = (Date.now() - new Date(paymentCompletedAt).getTime()) / 36e5;
    if (hoursSinceCompletion < T_PLUS_ONE_HOURS) {
      logger.info(
        `[Payment Remittance] Skipping ${payment.reference} - only ${hoursSinceCompletion.toFixed(1)}h since completion (T+${T_PLUS_ONE_HOURS}h required)`
      );
      return {
        success: true,
        waiting: true,
        reason: 't_plus_one_pending',
        paymentId: String(payment._id),
        reference: payment.reference,
      };
    }
  }

  const { settlement, created } =
    await paymentSettlementService.createOrGetSettlementForPayment(payment);
  if (settlement.status === 'successful') {
    return {
      success: true,
      skipped: true,
      reason: 'settlement_already_successful',
      paymentId: String(payment._id),
      reference: payment.reference,
      settlementId: String(settlement._id || settlement.id),
    };
  }
  if (settlement.status === 'pending') {
    settlement.status = 'queued';
    await settlement.save();
  }

  payment.metadata = payment.metadata || {};
  payment.metadata.remittance = {
    status: 'queued_for_settlement',
    queueJobId: String(job.id),
    remittanceConfigId,
    settlementId: String(settlement._id || settlement.id),
    requestedAt,
    processedAt: new Date().toISOString(),
  };

  await payment.save();

  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'settlement_queued',
    fromStatus: payment.status,
    toStatus: payment.status,
    userId: payment.userId,
    source: 'payment-remittance-worker',
    sourceRef: String(job.id),
    dedupeKey: `settlement-queued:${settlement.id}`,
    metadata: {
      settlementId: String(settlement._id || settlement.id),
      created,
      amount: settlement.amount,
      currency: settlement.currency,
      destinationType: settlement.destinationType,
      destinationNodeId: settlement.destinationNodeId,
      sourceNodeId: settlement.sourceNodeId,
    },
  });

  let transferResult = null;
  try {
    if (requiresGuardrailReview(settlement) && settlement.guardrailStatus !== 'approved') {
      settlement.guardrailStatus = 'review_required';
      settlement.guardrailReason = 'high_value_settlement_threshold';
      if (settlement.fundingStatus !== 'provider_settled') {
        settlement.fundingStatus = 'blocked_guardrail';
      }
      await settlement.save();

      payment.metadata.remittance = {
        ...(payment.metadata.remittance || {}),
        status: 'awaiting_guardrail_review',
        guardrailStatus: settlement.guardrailStatus,
        guardrailReason: settlement.guardrailReason,
        updatedAt: new Date().toISOString(),
      };
      await payment.save();

      await paymentEventService.appendPaymentEvent({
        tenantId: payment.tenantId,
        payment,
        eventType: 'settlement_awaiting_provider_settlement',
        fromStatus: payment.status,
        toStatus: payment.status,
        userId: payment.userId,
        source: 'payment-remittance-worker',
        sourceRef: String(job.id),
        dedupeKey: `settlement-guardrail:${settlement.id}:${settlement.guardrailStatus}`,
        metadata: {
          settlementId: String(settlement._id || settlement.id),
          reason: settlement.guardrailReason,
          amount: settlement.amount,
          currency: settlement.currency,
          threshold: getGuardrailThreshold(settlement.currency),
        },
      });

      return {
        success: true,
        waiting: true,
        reason: 'high_value_settlement_guardrail',
        paymentId: String(payment._id),
        reference: payment.reference,
        settlementId: String(settlement._id || settlement.id),
      };
    }

    if (!settlement.providerTransferId && settlement.fundingStatus !== 'provider_settled') {
      const availability = await settlementProviderService.checkSettlementAvailability({
        settlement,
      });
      await paymentSettlementService.markSettlementAwaitingProviderSettlement({
        settlement,
        reason: 'specific_transaction_not_provider_settled',
        availability,
      });

      payment.metadata.remittance = {
        ...(payment.metadata.remittance || {}),
        status: 'awaiting_provider_settlement',
        availabilityStatus: 'awaiting_provider_settlement',
        fundingStatus: settlement.fundingStatus,
        availableBalance: availability.availableBalance,
        requiredAmount: availability.requiredAmount,
        availabilityReason: 'specific_transaction_not_provider_settled',
        updatedAt: new Date().toISOString(),
      };
      await payment.save();

      await paymentEventService.appendPaymentEvent({
        tenantId: payment.tenantId,
        payment,
        eventType: 'settlement_awaiting_provider_settlement',
        fromStatus: payment.status,
        toStatus: payment.status,
        userId: payment.userId,
        source: 'payment-remittance-worker',
        sourceRef: String(job.id),
        dedupeKey: `settlement-awaiting-provider-settled:${settlement.id}:${Date.now()}`,
        metadata: {
          settlementId: String(settlement._id || settlement.id),
          reason: 'specific_transaction_not_provider_settled',
          availableBalance: availability.availableBalance,
          requiredAmount: availability.requiredAmount,
          currency: availability.currency,
          fundingStatus: settlement.fundingStatus,
        },
      });

      return {
        success: true,
        waiting: true,
        reason: 'specific_transaction_not_provider_settled',
        paymentId: String(payment._id),
        reference: payment.reference,
        settlementId: String(settlement._id || settlement.id),
      };
    }

    if (!settlement.providerTransferId) {
      const availability =
        await settlementProviderService.checkSettlementAvailability({
          settlement,
        });
      await paymentSettlementService.markSettlementAvailability({
        settlement,
        availability,
      });

      if (availability.available !== true) {
        payment.metadata.remittance = {
          ...(payment.metadata.remittance || {}),
          status: 'awaiting_provider_settlement',
          availabilityStatus: 'awaiting_provider_settlement',
          availableBalance: availability.availableBalance,
          requiredAmount: availability.requiredAmount,
          availabilityReason: availability.reason,
          updatedAt: new Date().toISOString(),
        };
        await payment.save();

        await paymentEventService.appendPaymentEvent({
          tenantId: payment.tenantId,
          payment,
          eventType: 'settlement_awaiting_provider_settlement',
          fromStatus: payment.status,
          toStatus: payment.status,
          userId: payment.userId,
          source: 'payment-remittance-worker',
          sourceRef: String(job.id),
          dedupeKey: `settlement-awaiting-provider:${settlement.id}:${settlement.availabilityCheckedAt?.getTime?.() || Date.now()}`,
          metadata: {
            settlementId: String(settlement._id || settlement.id),
            reason: availability.reason,
            availableBalance: availability.availableBalance,
            requiredAmount: availability.requiredAmount,
            currency: availability.currency,
          },
        });

        return {
          success: true,
          waiting: true,
          reason: availability.reason,
          paymentId: String(payment._id),
          reference: payment.reference,
          settlementId: String(settlement._id || settlement.id),
        };
      }
    }

    transferResult = settlement.providerTransferId
      ? await settlementProviderService.getSettlementTransferStatus({
          provider: settlement.provider,
          transferId: settlement.providerTransferId,
        })
      : await settlementProviderService.initiateSettlementTransfer({
          settlement,
        });

    const processingSettlement =
      await paymentSettlementService.markSettlementProcessing({
        settlement,
        transferResult,
      });

    await paymentEventService.appendPaymentEvent({
      tenantId: payment.tenantId,
      payment,
      eventType: 'settlement_processing',
      fromStatus: payment.status,
      toStatus: payment.status,
      userId: payment.userId,
      source: 'payment-remittance-worker',
      sourceRef: String(job.id),
      dedupeKey: `settlement-processing:${processingSettlement.id}:${processingSettlement.attempts}`,
      metadata: {
        settlementId: String(processingSettlement._id || processingSettlement.id),
        providerTransferId: processingSettlement.providerTransferId,
        providerReference: processingSettlement.providerReference,
        transferStatus: transferResult.status,
      },
    });

    const finalProviderStatus = String(transferResult.status || '').toLowerCase();
    const successfulStatuses = new Set(['successful', 'success', 'completed']);
    if (successfulStatuses.has(finalProviderStatus)) {
      const successfulSettlement =
        await paymentSettlementService.markSettlementSuccessful({
          settlement: processingSettlement,
          transferResult,
        });
      await paymentEventService.appendPaymentEvent({
        tenantId: payment.tenantId,
        payment,
        eventType: 'settlement_successful',
        fromStatus: payment.status,
        toStatus: payment.status,
        userId: payment.userId,
        source: 'payment-remittance-worker',
        sourceRef: String(job.id),
        dedupeKey: `settlement-successful:${successfulSettlement.id}`,
        metadata: {
          settlementId: String(successfulSettlement._id || successfulSettlement.id),
          providerTransferId: successfulSettlement.providerTransferId,
          providerReference: successfulSettlement.providerReference,
          transferStatus: transferResult.status,
        },
      });
    }

    payment.metadata.remittance = {
      ...(payment.metadata.remittance || {}),
      status: successfulStatuses.has(finalProviderStatus)
        ? 'settled'
        : 'processing_settlement',
      providerTransferId: transferResult.providerTransferId || null,
      providerReference: transferResult.providerReference || null,
      transferStatus: transferResult.status || null,
      updatedAt: new Date().toISOString(),
    };
    await payment.save();
  } catch (error) {
    // Handle T+1 pending - requeue without counting as failure
    if (error.code === 'T_PLUS_ONE_PENDING') {
      logger.info(
        `[Payment Remittance] Requeueing ${payment.reference} for T+1 (${(Date.now() - new Date(payment.completedAt || payment.processedAt || payment.updatedAt).getTime()) / 36e5}h elapsed)`
      );
      return {
        success: true,
        skipped: true,
        reason: 't_plus_one_pending',
        paymentId: String(payment._id),
        reference: payment.reference,
        settlementId: String(settlement._id || settlement.id),
      };
    }

    const failedSettlement = await paymentSettlementService.markSettlementFailed({
      settlement,
      error,
      transferResult,
    });
    await paymentEventService.appendPaymentEvent({
      tenantId: payment.tenantId,
      payment,
      eventType: 'settlement_failed',
      fromStatus: payment.status,
      toStatus: payment.status,
      userId: payment.userId,
      source: 'payment-remittance-worker',
      sourceRef: String(job.id),
      dedupeKey: `settlement-failed:${failedSettlement.id}:${failedSettlement.attempts}:${Date.now()}`,
      metadata: {
        settlementId: String(failedSettlement._id || failedSettlement.id),
        error: error?.message || String(error),
        providerTransferId: failedSettlement.providerTransferId,
        providerReference: failedSettlement.providerReference,
      },
    });
    throw error;
  }

  return {
    success: true,
    paymentId: String(payment._id),
    reference: payment.reference,
    settlementId: String(settlement._id || settlement.id),
  };
};

const handleRemittanceFailure = async (job, err) => {
  // Don't treat T+1 pending as a failure
  if (err?.code === 'T_PLUS_ONE_PENDING') {
    logger.info(
      `[Payment Remittance] Job ${job?.id} T+1 pending - not counting as failure`
    );
    return { dlqSaved: false, willRetry: true, reason: 't_plus_one_pending' };
  }

  const attempts = Number(job?.attemptsMade || 0);
  const maxAttempts = Number(job?.opts?.attempts || 3);
  const remaining = Math.max(maxAttempts - attempts, 0);

  if (attempts < maxAttempts) {
    logger.warn(
      `[Payment Remittance] Job ${job?.id} will retry (${remaining} attempts remaining)`
    );
    return { dlqSaved: false, willRetry: true };
  }

  logger.error(
    `[Payment Remittance] Job ${job?.id} permanently failed after ${attempts} attempts`
  );

  try {
    await dlqService.saveToDLQ({
      jobId: String(job?.id || ''),
      queueName: PAYMENT_REMITTANCE_QUEUE_NAME,
      jobData: job?.data || {},
      error: err?.message || 'Unknown remittance worker error',
      stack: err?.stack || null,
      attempts,
      failedAt: new Date(),
      tenantId: job?.data?.tenantId || null,
      projectId: job?.data?.projectId || null,
      userId: job?.data?.userId || null,
    });

    await dlqService.sendAdminAlert({
      level: 'CRITICAL',
      type: 'payment_remittance_permanent_failure',
      message: `Payment remittance permanently failed after ${attempts} attempts: ${job?.id}`,
      error: err?.message || null,
      tenantId: job?.data?.tenantId || null,
      projectId: job?.data?.projectId || null,
    });

    return { dlqSaved: true, willRetry: false };
  } catch (saveError) {
    logger.error(
      `[Payment Remittance] Failed to persist DLQ for job ${job?.id}: ${saveError.message}`
    );
    return { dlqSaved: false, willRetry: false, saveError: saveError.message };
  }
};

module.exports = {
  isRemittanceEligible,
  enqueueIfEligible,
  processRemittanceJob,
  handleRemittanceFailure,
};
