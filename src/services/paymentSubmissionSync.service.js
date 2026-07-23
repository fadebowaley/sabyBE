const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');
const { buildFlatFinancialFields } = require('./submissionFinancialFields.service');

const asObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const buildPaymentSubmissionSnapshot = (payment) => {
  if (!payment) return null;
  const invoiceSnapshot = asObject(payment.metadata?.invoiceSnapshot);
  const completionDetails = asObject(payment.completionDetails);
  const providerVerification = asObject(payment.metadata?.providerVerification);

  return {
    reference: payment.reference || null,
    paymentId: payment._id ? String(payment._id) : payment.id ? String(payment.id) : null,
    status: payment.status || null,
    amountPaid: Number(payment.total ?? payment.amount ?? 0),
    amount: Number(payment.amount ?? payment.total ?? 0),
    total: Number(payment.total ?? payment.amount ?? 0),
    currency: payment.currency || invoiceSnapshot.currency || null,
    paymentMethod: payment.paymentMethod || null,
    providerRef: payment.providerRef || null,
    provider: providerVerification.provider || payment.paymentDetails?.provider || payment.paymentMethod || null,
    paymentType: completionDetails.paymentType || payment.paymentDetails?.paymentType || null,
    tax: invoiceSnapshot.tax || null,
    discount: invoiceSnapshot.discount || null,
    subtotal: invoiceSnapshot.subtotal ?? null,
    taxableBase: invoiceSnapshot.taxableBase ?? null,
    lineItems: Array.isArray(invoiceSnapshot.lineItems) ? invoiceSnapshot.lineItems : [],
    invoice: invoiceSnapshot && Object.keys(invoiceSnapshot).length ? invoiceSnapshot : null,
    completedAt: payment.completedAt || null,
    updatedAt: payment.updatedAt || new Date(),
  };
};

const syncPaymentToSubmissions = async (payment, options = {}) => {
  if (String(payment?.purpose || '').trim().toLowerCase() === 'subscription') {
    return { updated: 0, reason: 'subscription_payment' };
  }

  const reference = String(payment?.reference || '').trim();
  const tenantId = String(payment?.tenantId || '').trim();
  if (!reference || !tenantId) {
    return { updated: 0, reason: 'missing_reference_or_tenant' };
  }

  const snapshot = buildPaymentSubmissionSnapshot(payment);
  if (!snapshot) {
    return { updated: 0, reason: 'missing_snapshot' };
  }
  const projectedSubmissionData = {
    ...buildFlatFinancialFields({
      invoice: snapshot.invoice,
      payment: snapshot,
    }),
    ...(snapshot.invoice ? { __invoice: snapshot.invoice } : {}),
    __payment: snapshot,
  };

  const attempts = Math.max(1, Number(options.attempts || 6));
  const delayMs = Math.max(0, Number(options.delayMs || 500));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await postgresPool.query(
      `
        UPDATE form_submissions
        SET
          meta = jsonb_set(
            COALESCE(meta, '{}'::jsonb),
            '{transaction}',
            COALESCE(meta->'transaction', '{}'::jsonb) || $1::jsonb,
            true
          ),
          data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
        WHERE tenant_id = $3
          AND (
            meta #>> '{transaction,paymentIntentReference}' = $4
            OR meta #>> '{transaction,paymentReference}' = $4
            OR meta #>> '{transaction,reference}' = $4
            OR meta->>'paymentIntentReference' = $4
            OR meta->>'paymentReference' = $4
          )
        RETURNING id
      `,
      [
        JSON.stringify({
          paymentIntentReference: snapshot.reference,
          paymentReference: snapshot.reference,
          paymentIntentId: snapshot.paymentId,
          paymentId: snapshot.paymentId,
          paymentIntentStatus: snapshot.status,
          paymentStatus: snapshot.status,
          paymentMethod: snapshot.paymentMethod,
          provider: snapshot.provider,
          providerRef: snapshot.providerRef,
          amountPaid: snapshot.amountPaid,
          amount: snapshot.amount,
          total: snapshot.total,
          currency: snapshot.currency,
          tax: snapshot.tax,
          discount: snapshot.discount,
          subtotal: snapshot.subtotal,
          taxableBase: snapshot.taxableBase,
          invoiceSnapshot: snapshot.invoice,
          paidAt: snapshot.completedAt,
          syncedAt: new Date().toISOString(),
        }),
        JSON.stringify(projectedSubmissionData),
        tenantId,
        reference,
      ]
    );

    if (result.rowCount > 0 || attempt === attempts || delayMs === 0) {
      if (result.rowCount === 0) {
        logger.warn('[PaymentSubmissionSync] no submission found for payment reference', {
          tenantId,
          reference,
          attempts,
        });
      }
      return { updated: result.rowCount, submissionIds: result.rows.map((row) => row.id) };
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return { updated: 0 };
};

module.exports = {
  buildPaymentSubmissionSnapshot,
  syncPaymentToSubmissions,
};
