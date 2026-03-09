const logger = require('../config/logger');
const { Payment } = require('../models');
const {
  queueRemittance,
  PAYMENT_REMITTANCE_QUEUE_NAME,
} = require('../queues/paymentRemittance.queue');
const paymentEventService = require('./paymentEvent.service');
const dlqService = require('./dlq.service');

const isRemittanceEligible = (payment) =>
  !!payment &&
  payment.status === 'completed' &&
  payment.purpose === 'collection' &&
  payment.beneficiaryType === 'tenant' &&
  !!payment.remittanceConfigId;

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
    jobId: `payment-remittance:${payload.paymentId}`,
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

  payment.metadata = payment.metadata || {};
  payment.metadata.remittance = {
    status: 'queued_for_settlement',
    queueJobId: String(job.id),
    remittanceConfigId,
    requestedAt,
    processedAt: new Date().toISOString(),
  };

  await payment.save();

  return {
    success: true,
    paymentId: String(payment._id),
    reference: payment.reference,
  };
};

const handleRemittanceFailure = async (job, err) => {
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
