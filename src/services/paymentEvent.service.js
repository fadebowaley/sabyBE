const { PaymentEvent } = require('../models');

const appendPaymentEvent = async ({
  tenantId,
  payment,
  eventType,
  fromStatus = null,
  toStatus = null,
  userId = null,
  source = 'api',
  sourceRef = null,
  dedupeKey = null,
  metadata = {},
}) => {
  if (!tenantId || !payment || !eventType) {
    return null;
  }

  try {
    const doc = {
      tenantId,
      paymentId: payment._id,
      paymentReference: payment.reference,
      userId: userId || payment.userId || null,
      eventType,
      source,
      sourceRef,
      dedupeKey,
      metadata,
    };

    if (fromStatus) {
      doc.fromStatus = fromStatus;
    }
    if (toStatus) {
      doc.toStatus = toStatus;
    }

    return await PaymentEvent.create(doc);
  } catch (error) {
    if (error?.code === 11000 && dedupeKey) {
      return PaymentEvent.findOne({ tenantId, dedupeKey });
    }
    throw error;
  }
};

module.exports = {
  appendPaymentEvent,
};
