const { PaymentSettlement } = require('../models');
const paymentFlowService = require('./paymentFlow.service');

const buildSettlementIdempotencyKey = ({ payment, destination }) =>
  [
    'payment-settlement',
    String(payment.tenantId || ''),
    String(payment._id || payment.id || ''),
    String(destination?.type || 'tenant_global'),
    String(destination?.nodeId || 'tenant'),
  ].join(':');

const buildSettlementFromPayment = (payment) => {
  const metadata = payment?.metadata || {};
  const remittancePlan = metadata.remittancePlan || {};
  const destination = remittancePlan.destination || {};
  const collectionPlan = metadata.collectionPlan || {};
  const amount = Number(payment.total || payment.amount || 0);

  return {
    tenantId: payment.tenantId,
    paymentId: payment._id,
    paymentReference: payment.reference,
    projectFormId: metadata.projectFormId || null,
    submissionId: payment.submissionId || metadata.submissionDraftId || null,
    provider: collectionPlan.paymentMethod || payment.paymentMethod,
    currency: payment.currency,
    amount,
    fee: 0,
    netAmount: amount,
    status: 'pending',
    availabilityStatus: 'unknown',
    fundingStatus: 'provider_verified',
    guardrailStatus: 'none',
    sourceType: 'saby_balance',
    destinationType: destination.type || remittancePlan.accountSource || 'tenant_global',
    destinationNodeId: destination.nodeId || null,
    destinationNodeReference: destination.nodeReference || null,
    destinationNodeName: destination.nodeName || null,
    sourceNodeId: destination.sourceNodeId || null,
    sourceNodeReference: destination.sourceNodeReference || null,
    sourceNodeName: destination.sourceNodeName || null,
    targetLevelId: destination.targetLevelId || remittancePlan?.destination?.targetLevelId || null,
    destinationAccount: destination.account || {},
    idempotencyKey: buildSettlementIdempotencyKey({ payment, destination }),
    metadata: {
      remittancePlan,
      collectionPlan,
      invoiceSnapshot: metadata.invoiceSnapshot || null,
    },
  };
};

const createOrGetSettlementForPayment = async (payment) => {
  const payload = buildSettlementFromPayment(payment);
  const existing = await PaymentSettlement.findOne({
    tenantId: payload.tenantId,
    idempotencyKey: payload.idempotencyKey,
  });
  if (existing) {
    return { settlement: existing, created: false };
  }

  try {
    const settlement = await PaymentSettlement.create(payload);

    await paymentFlowService.upsertPaymentFlow(
      paymentFlowService.fromSettlement(settlement)
    );

    return { settlement, created: true };
  } catch (error) {
    if (error?.code === 11000) {
      const settlement = await PaymentSettlement.findOne({
        tenantId: payload.tenantId,
        idempotencyKey: payload.idempotencyKey,
      });
      if (settlement) return { settlement, created: false };
    }
    throw error;
  }
};

const markSettlementAvailability = async ({ settlement, availability }) => {
  const isAvailable = availability?.available === true;
  settlement.availabilityStatus = isAvailable
    ? 'available_for_payout'
    : 'awaiting_provider_settlement';
  settlement.availabilityCheckedAt = new Date();
  if (typeof availability?.availableBalance === 'number') {
    settlement.availableBalance = availability.availableBalance;
  }
  settlement.metadata = {
    ...(settlement.metadata || {}),
    availability: {
      ...(settlement.metadata?.availability || {}),
      ...availability,
      checkedAt: new Date().toISOString(),
    },
  };
  await settlement.save();
  return settlement;
};

const markSettlementAwaitingProviderSettlement = async ({
  settlement,
  reason,
  availability = null,
}) => {
  settlement.availabilityStatus = 'awaiting_provider_settlement';
  if (settlement.fundingStatus !== 'blocked_guardrail') {
    settlement.fundingStatus = settlement.fundingStatus || 'provider_verified';
  }
  settlement.availabilityCheckedAt = new Date();
  if (typeof availability?.availableBalance === 'number') {
    settlement.availableBalance = availability.availableBalance;
  }
  settlement.metadata = {
    ...(settlement.metadata || {}),
    funding: {
      ...(settlement.metadata?.funding || {}),
      reason,
      availability,
      checkedAt: new Date().toISOString(),
    },
  };
  await settlement.save();
  return settlement;
};

const markSettlementProviderSettled = async ({
  settlement,
  providerSettlementId = null,
  providerSettledAt = null,
  metadata = {},
}) => {
  settlement.fundingStatus = 'provider_settled';
  settlement.providerSettlementId = providerSettlementId || settlement.providerSettlementId || null;
  settlement.providerSettledAt = providerSettledAt
    ? new Date(providerSettledAt)
    : new Date();
  settlement.metadata = {
    ...(settlement.metadata || {}),
    providerSettlement: {
      ...(settlement.metadata?.providerSettlement || {}),
      ...metadata,
      providerSettlementId: settlement.providerSettlementId,
      providerSettledAt: settlement.providerSettledAt.toISOString(),
    },
  };
  await settlement.save();

  await paymentFlowService.upsertPaymentFlow(
    paymentFlowService.fromSettlement(settlement)
  );

  return settlement;
};

const markSettlementProcessing = async ({ settlement, transferResult = null }) => {
  settlement.status = 'processing';
  settlement.availabilityStatus = 'transfer_processing';
  settlement.fundingStatus = 'funded';
  settlement.attempts = Number(settlement.attempts || 0) + 1;
  if (transferResult?.providerTransferId) {
    settlement.providerTransferId = transferResult.providerTransferId;
  }
  if (transferResult?.providerReference) {
    settlement.providerReference = transferResult.providerReference;
  }
  settlement.failureReason = null;
  settlement.metadata = {
    ...(settlement.metadata || {}),
    providerTransfer: transferResult || null,
    processingAt: new Date().toISOString(),
  };
  await settlement.save();
  return settlement;
};

const markSettlementSuccessful = async ({ settlement, transferResult = null }) => {
  settlement.status = 'successful';
  settlement.availabilityStatus = 'settled';
  settlement.fundingStatus = 'funded';
  if (transferResult?.providerTransferId) {
    settlement.providerTransferId = transferResult.providerTransferId;
  }
  if (transferResult?.providerReference) {
    settlement.providerReference = transferResult.providerReference;
  }
  settlement.failureReason = null;
  settlement.metadata = {
    ...(settlement.metadata || {}),
    providerTransfer: transferResult || settlement.metadata?.providerTransfer || null,
    successfulAt: new Date().toISOString(),
  };
  await settlement.save();
  return settlement;
};

const markSettlementFailed = async ({ settlement, error, transferResult = null }) => {
  settlement.status = 'failed';
  settlement.availabilityStatus = 'failed';
  settlement.attempts = Number(settlement.attempts || 0) + 1;
  settlement.failureReason = error?.message || String(error || 'Settlement transfer failed');
  settlement.metadata = {
    ...(settlement.metadata || {}),
    providerTransfer: transferResult || settlement.metadata?.providerTransfer || null,
    failedAt: new Date().toISOString(),
    failure: {
      message: settlement.failureReason,
      statusCode: error?.statusCode || null,
    },
  };
  await settlement.save();
  return settlement;
};

module.exports = {
  buildSettlementFromPayment,
  createOrGetSettlementForPayment,
  markSettlementAvailability,
  markSettlementAwaitingProviderSettlement,
  markSettlementProviderSettled,
  markSettlementProcessing,
  markSettlementSuccessful,
  markSettlementFailed,
};
