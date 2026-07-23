const crypto = require('crypto');
const httpStatus = require('http-status');
const config = require('../config/config');
const logger = require('../config/logger');
const { PaymentWebhookEvent } = require('../models');
const paymentService = require('./payment.service');
const paymentProviderService = require('./paymentProvider.service');
const paymentEventService = require('./paymentEvent.service');
const paymentSubmissionSyncService = require('./paymentSubmissionSync.service');
const subscriptionService = require('./subscription.service');
const ApiError = require('../utils/ApiError');

const SUPPORTED_PROVIDER_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'refunded',
];

const toUnixSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  if (parsed > 1e12) {
    return Math.floor(parsed / 1000);
  }
  return Math.floor(parsed);
};

const parseWebhookTimestamp = (req) => {
  const headerTimestamp =
    req.get('x-payment-timestamp') ||
    req.get('x-webhook-timestamp') ||
    req.get('x-signature-timestamp');
  return toUnixSeconds(headerTimestamp);
};

const extractProvider = (req, body) =>
  (
    req.get('x-payment-provider') ||
    req.get('x-provider') ||
    body?.provider ||
    (body?.event && body?.data?.tx_ref ? 'flutterwave' : null) ||
    'unknown'
  )
    .toString()
    .trim()
    .toLowerCase();

const extractEventId = (req, body) =>
  (
    req.get('x-event-id') ||
    req.get('x-webhook-id') ||
    body?.eventId ||
    body?.id ||
    ''
  )
    .toString()
    .trim();

const extractSignature = (req) =>
  (
    req.get('verif-hash') ||
    req.get('flutterwave-signature') ||
    req.get('x-payment-signature') ||
    req.get('x-signature') ||
    ''
  )
    .toString()
    .trim();

const constantTimeEquals = (provided, expected) => {
  const providedBuffer = Buffer.from(provided || '', 'utf8');
  const expectedBuffer = Buffer.from(expected || '', 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const verifyWebhookSignature = (timestamp, signature, rawBody) => {
  const webhookSecret = config.payment?.webhookSecret;
  if (!webhookSecret) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Payment webhook secret is not configured'
    );
  }

  if (!timestamp) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing webhook timestamp');
  }
  if (!signature) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing webhook signature');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const toleranceSec = Number(config.payment?.webhookToleranceSec) || 300;
  if (Math.abs(nowSec - timestamp) > toleranceSec) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Webhook timestamp out of range'
    );
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');
  if (!constantTimeEquals(signature, expectedSignature)) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid webhook signature');
  }
};

const verifyProviderWebhookSignature = ({ provider, timestamp, signature, rawBody }) => {
  if (provider === 'flutterwave') {
    const webhookSecret = String(
      config.payment?.providers?.flutterwave?.webhookSecret ||
        config.payment?.webhookSecret ||
        ''
    ).trim();
    if (!webhookSecret) {
      throw new ApiError(
        httpStatus.SERVICE_UNAVAILABLE,
        'Flutterwave webhook secret is not configured'
      );
    }
    if (!signature) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Missing Flutterwave webhook signature');
    }
    if (!constantTimeEquals(signature, webhookSecret)) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid Flutterwave webhook signature');
    }
    return;
  }

  verifyWebhookSignature(timestamp, signature, rawBody);
};

const normalizeWebhookPayload = (payload) => {
  if (payload?.data?.tx_ref || payload?.tx_ref) {
    const data = payload?.data || payload || {};
    const status = String(data.status || payload.status || '')
      .trim()
      .toLowerCase();
    return {
      paymentReference: data.tx_ref || payload.tx_ref || null,
      providerRef: data.id ? String(data.id) : null,
      status:
        status === 'successful' || status === 'success'
          ? 'completed'
          : status === 'failed'
            ? 'failed'
            : status === 'cancelled'
              ? 'cancelled'
              : status === 'pending'
                ? 'processing'
                : null,
      payload,
    };
  }

  const data = payload?.data || payload?.payment || {};
  const paymentReference =
    payload?.reference ||
    payload?.paymentReference ||
    data.reference ||
    data.paymentReference ||
    payload?.metadata?.reference ||
    null;
  const providerRef =
    payload?.providerRef ||
    data.providerRef ||
    data.transactionId ||
    data.processorReference ||
    null;
  const rawStatus =
    payload?.status ||
    payload?.paymentStatus ||
    payload?.event ||
    payload?.type;
  const normalizedStatus = rawStatus
    ? rawStatus.toString().trim().toLowerCase()
    : null;

  return {
    paymentReference,
    providerRef,
    status: SUPPORTED_PROVIDER_STATUSES.includes(normalizedStatus)
      ? normalizedStatus
      : null,
    payload,
  };
};

const assertVerifiedTransactionMatchesPayment = ({ payment, verified }) => {
  if (!payment || !verified) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment verification payload is incomplete.');
  }

  if (String(verified.txRef || '') !== String(payment.reference || '')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Verified payment reference does not match local payment.');
  }

  if (String(verified.currency || '').toUpperCase() !== String(payment.currency || '').toUpperCase()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Verified payment currency does not match local payment.');
  }

  const expectedAmount = Number(payment.total || payment.amount || 0);
  const verifiedAmount = Number(verified.amount || 0);
  if (!Number.isFinite(verifiedAmount) || verifiedAmount + 0.000001 < expectedAmount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Verified payment amount is less than local payment total.');
  }
};

const completeVerifiedProviderPayment = async ({
  payment,
  verified,
  source,
  sourceRef = null,
  dedupeKeyPrefix,
}) => {
  assertVerifiedTransactionMatchesPayment({ payment, verified });

  if (verified.status !== 'successful' && verified.status !== 'completed') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Verified payment is not successful: ${verified.status || 'unknown'}`
    );
  }

  if (payment.status === 'completed') {
    return payment;
  }

  let currentPayment = payment;
  if (currentPayment.status === 'pending') {
    currentPayment = await paymentService.processPayment(
      currentPayment._id,
      {
        providerRef: verified.providerRef,
        paymentDetails: {
          provider: verified.provider,
          paymentType: verified.paymentType,
          verifiedAt: new Date().toISOString(),
          raw: verified.raw,
        },
      },
      currentPayment.tenantId,
      {
        source,
        sourceRef,
        dedupeKey: `${dedupeKeyPrefix}:processing`,
      }
    );
  }

  if (currentPayment.status === 'processing') {
    currentPayment = await paymentService.completePayment(
      currentPayment._id,
      {
        providerRef: verified.providerRef,
        completionDetails: {
          provider: verified.provider,
          paymentType: verified.paymentType,
          verifiedAt: new Date().toISOString(),
          raw: verified.raw,
        },
        metadata: {
          providerVerification: {
            provider: verified.provider,
            providerRef: verified.providerRef,
            verifiedAt: new Date().toISOString(),
            status: verified.status,
          },
        },
      },
      currentPayment.tenantId,
      {
        source,
        sourceRef,
        dedupeKey: `${dedupeKeyPrefix}:completed`,
      }
    );
  }

  try {
    if (currentPayment.purpose === 'subscription') {
      await subscriptionService.activateSubscriptionFromPayment(currentPayment, {
        source,
        sourceRef,
      });
    } else {
      await paymentSubmissionSyncService.syncPaymentToSubmissions(currentPayment);
    }
  } catch (error) {
    logger.error(
      `[PaymentCompletionEffects] Failed to apply post-completion effects for ${currentPayment.reference}: ${error.message}`
    );
  }

  await paymentEventService.appendPaymentEvent({
    tenantId: currentPayment.tenantId,
    payment: currentPayment,
    eventType: 'provider_verification_succeeded',
    fromStatus: currentPayment.status,
    toStatus: currentPayment.status,
    userId: currentPayment.userId,
    source,
    sourceRef,
    dedupeKey: `${dedupeKeyPrefix}:provider-verification-succeeded`,
    metadata: {
      provider: verified.provider,
      providerRef: verified.providerRef,
      txRef: verified.txRef,
      amount: verified.amount,
      currency: verified.currency,
      paymentType: verified.paymentType,
    },
  });

  return currentPayment;
};

const verifyAndCompleteProviderPayment = async ({
  provider,
  paymentReference,
  transactionId = null,
  source = 'provider-return',
  sourceRef = null,
}) => {
  const payment = await paymentService.getPaymentByReference(paymentReference);
  const verified = await paymentProviderService.verifyTransaction({
    provider,
    transactionId,
    txRef: paymentReference,
  });

  return completeVerifiedProviderPayment({
    payment,
    verified,
    source,
    sourceRef,
    dedupeKeyPrefix: `${source}:${provider}:${payment.reference}:${verified.providerRef || transactionId || 'ref'}`,
  });
};

const createReplayKey = ({
  provider,
  eventId,
  signatureTimestamp,
  signature,
  payloadHash,
}) =>
  crypto
    .createHash('sha256')
    .update(
      `${provider}|${
        eventId || ''
      }|${signatureTimestamp}|${signature}|${payloadHash}`
    )
    .digest('hex');

const storeReceivedWebhookEvent = async ({
  provider,
  eventId,
  signature,
  signatureTimestamp,
  payload,
  paymentReference,
  payloadHash,
}) => {
  const replayKey = createReplayKey({
    provider,
    eventId,
    signatureTimestamp,
    signature,
    payloadHash,
  });

  try {
    const event = await PaymentWebhookEvent.create({
      provider,
      eventId: eventId || undefined,
      signature,
      signatureTimestamp,
      replayKey,
      payloadHash,
      paymentReference: paymentReference || undefined,
      payload,
      webhookStatus: 'received',
    });
    return { event, duplicate: false };
  } catch (error) {
    if (error?.code === 11000) {
      return { event: null, duplicate: true };
    }
    throw error;
  }
};

const markEventOutcome = async (eventId, outcome) => {
  if (!eventId) {
    return;
  }
  await PaymentWebhookEvent.findByIdAndUpdate(eventId, outcome, { new: false });
};

const processWebhookEvent = async (req) => {
  const payload =
    req.body && typeof req.body === 'object' ? req.body : { raw: req.body };
  const rawBody = req.rawBody || JSON.stringify(payload || {});
  const signatureTimestamp = parseWebhookTimestamp(req);
  const effectiveSignatureTimestamp =
    signatureTimestamp || Math.floor(Date.now() / 1000);
  const signature = extractSignature(req);
  const provider = extractProvider(req, payload);
  const eventId = extractEventId(req, payload);

  verifyProviderWebhookSignature({
    provider,
    timestamp: effectiveSignatureTimestamp,
    signature,
    rawBody,
  });

  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const normalized = normalizeWebhookPayload(payload);

  const receivedEvent = await storeReceivedWebhookEvent({
    provider,
    eventId,
    signature,
    signatureTimestamp: effectiveSignatureTimestamp,
    payload,
    paymentReference: normalized.paymentReference,
    payloadHash,
  });

  if (receivedEvent.duplicate) {
    return { duplicate: true, processed: false };
  }

  const webhookEvent = receivedEvent.event;

  if (!normalized.paymentReference || !normalized.status) {
    await markEventOutcome(webhookEvent._id, {
      webhookStatus: 'ignored',
      failureReason: 'Missing payment reference or unsupported status',
    });
    return { duplicate: false, processed: false, ignored: true };
  }

  try {
    const payment = await paymentService.getPaymentByReference(
      normalized.paymentReference
    );

    if (normalized.providerRef) {
      payment.providerRef = normalized.providerRef;
      await payment.save();
    }

    await paymentEventService.appendPaymentEvent({
      tenantId: payment.tenantId,
      payment,
      eventType: 'provider_webhook_received',
      fromStatus: payment.status,
      toStatus: payment.status,
      userId: payment.userId,
      source: 'provider-webhook',
      sourceRef: webhookEvent._id?.toString(),
      dedupeKey: `webhook:${webhookEvent._id}:received`,
      metadata: {
        provider,
        providerRef: normalized.providerRef,
        paymentReference: normalized.paymentReference,
      },
    });

    if (provider === 'flutterwave' && normalized.status === 'completed') {
      const verified = await paymentProviderService.verifyTransaction({
        provider: 'flutterwave',
        transactionId: normalized.providerRef,
        txRef: normalized.paymentReference,
      });
      const completedPayment = await completeVerifiedProviderPayment({
        payment,
        verified,
        source: 'flutterwave-webhook',
        sourceRef: webhookEvent._id?.toString(),
        dedupeKeyPrefix: `webhook:${webhookEvent._id}:flutterwave`,
      });

      await markEventOutcome(webhookEvent._id, {
        webhookStatus: 'processed',
        paymentId: completedPayment._id,
        paymentReference: completedPayment.reference,
        failureReason: null,
      });

      return {
        duplicate: false,
        processed: true,
        ignored: false,
        paymentId: completedPayment._id.toString(),
        paymentReference: completedPayment.reference,
        status: 'completed',
      };
    }

    if (normalized.status === 'processing') {
      await paymentService.processPayment(
        payment._id,
        {
          providerRef: normalized.providerRef,
          paymentDetails: normalized.payload,
        },
        payment.tenantId,
        {
          source: 'provider-webhook',
          sourceRef: webhookEvent._id?.toString(),
          dedupeKey: `webhook:${webhookEvent._id}:processing`,
        }
      );
    } else if (normalized.status === 'completed') {
      const completedPayment = await paymentService.completePayment(
        payment._id,
        {
          providerRef: normalized.providerRef,
          completionDetails: normalized.payload,
        },
        payment.tenantId,
        {
          source: 'provider-webhook',
          sourceRef: webhookEvent._id?.toString(),
          dedupeKey: `webhook:${webhookEvent._id}:completed`,
        }
      );

      try {
        if (completedPayment.purpose === 'subscription') {
          await subscriptionService.activateSubscriptionFromPayment(
            completedPayment,
            {
              source: 'provider-webhook',
              sourceRef: webhookEvent._id?.toString(),
            }
          );
        } else {
          await paymentSubmissionSyncService.syncPaymentToSubmissions(
            completedPayment
          );
        }
      } catch (postCompletionError) {
        logger.error(
          `[PaymentCompletionEffects] Failed to apply post-completion effects for ${completedPayment.reference}: ${postCompletionError.message}`
        );
      }
    } else if (normalized.status === 'cancelled') {
      await paymentService.cancelPayment(
        payment._id,
        normalized.payload?.reason || 'Cancelled by provider webhook',
        payment.tenantId,
        {
          source: 'provider-webhook',
          sourceRef: webhookEvent._id?.toString(),
          dedupeKey: `webhook:${webhookEvent._id}:cancelled`,
        }
      );
    } else if (normalized.status === 'refunded') {
      await paymentService.refundPayment(
        payment._id,
        {
          amount: payment.total,
          reason: normalized.payload?.reason || 'Refunded by provider webhook',
          refundDetails: normalized.payload,
        },
        payment.tenantId,
        {
          source: 'provider-webhook',
          sourceRef: webhookEvent._id?.toString(),
          dedupeKey: `webhook:${webhookEvent._id}:refunded`,
        }
      );
    } else if (normalized.status === 'failed') {
      await paymentService.updatePaymentById(
        payment._id,
        {
          status: 'failed',
          failureReason:
            normalized.payload?.reason ||
            normalized.payload?.message ||
            'Provider marked payment as failed',
          metadata: {
            ...payment.metadata,
            webhookFailurePayload: normalized.payload,
          },
        },
        payment.tenantId,
        {
          source: 'provider-webhook',
          sourceRef: webhookEvent._id?.toString(),
          dedupeKey: `webhook:${webhookEvent._id}:failed`,
          reason:
            normalized.payload?.reason ||
            normalized.payload?.message ||
            'Provider marked payment as failed',
        }
      );
    }

    await markEventOutcome(webhookEvent._id, {
      webhookStatus: 'processed',
      paymentId: payment._id,
      paymentReference: payment.reference,
      failureReason: null,
    });

    return {
      duplicate: false,
      processed: true,
      ignored: false,
      paymentId: payment._id.toString(),
      paymentReference: payment.reference,
      status: normalized.status,
    };
  } catch (error) {
    if (
      error?.statusCode === httpStatus.BAD_REQUEST &&
      error?.message &&
      error.message.includes('Invalid payment status transition')
    ) {
      await markEventOutcome(webhookEvent._id, {
        webhookStatus: 'ignored',
        failureReason: error.message,
      });
      return { duplicate: false, processed: false, ignored: true };
    }

    await markEventOutcome(webhookEvent._id, {
      webhookStatus: 'failed',
      failureReason: error.message,
    });
    throw error;
  }
};

module.exports = {
  processWebhookEvent,
  verifyAndCompleteProviderPayment,
};
