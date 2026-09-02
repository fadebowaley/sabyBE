const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

const COLUMNS = [
  'tenant_id',
  'user_id',
  'user_name',
  'user_email',
  'payment_id',
  'payment_reference',
  'provider',
  'amount',
  'currency',
  'purpose',
  'beneficiary',
  'payment_status',
  'payment_created_at',
  'payment_processed_at',
  'payment_completed_at',
  'payment_failed_at',
  'failure_reason',
  'settlement_id',
  'settlement_status',
  'funding_status',
  'availability_status',
  'provider_settlement_id',
  'provider_settled_at',
  'settlement_fee',
  'service_fee',
  'provider_fee',
  'provider_app_fee',
  'provider_merchant_fee',
  'net_amount',
  'destination_type',
  'destination_node',
  'destination_account_number',
  'destination_account_name',
  'destination_bank_name',
  'destination_bank_code',
  'reconciliation_status',
  'last_reconciled_at',
  'remittance_queued',
  'updated_at',
];

const ALLOWED_SORT = new Set([
  'payment_created_at',
  'amount',
  'payment_status',
  'provider',
  'updated_at',
]);

/**
 * Upsert a payment_flow row. Pass only the fields that changed.
 * Missing fields keep their existing values.
 */
const upsertPaymentFlow = async (fields) => {
  if (!fields.payment_id || !fields.tenant_id) {
    logger.warn(
      '[PaymentFlow] upsert skipped — missing payment_id or tenant_id'
    );
    return;
  }

  try {
    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const col of COLUMNS) {
      if (col === 'payment_id' || col === 'updated_at') continue;
      if (fields[col] === undefined) continue;

      setClauses.push(`${col} = $${idx++}`);
      values.push(fields[col]);
    }

    if (!setClauses.length) return;

    // Always bump updated_at
    setClauses.push(`updated_at = NOW()`);

    const insertCols = [
      'payment_id',
      ...Object.keys(fields).filter((k) => k !== 'payment_id'),
    ];
    const insertPlaceholders = insertCols.map((_, i) => `$${idx + i}`);
    const insertValues = insertCols.map((k) => fields[k]);

    const sql = `
      INSERT INTO public.payment_flow (${insertCols.join(', ')})
      VALUES (${insertPlaceholders.join(', ')})
      ON CONFLICT (payment_id) DO UPDATE SET
        ${setClauses.join(',\n        ')}
    `;

    await postgresPool.query(sql, [...values, ...insertValues]);
  } catch (error) {
    if (error.code === '42P01') {
      // Table doesn't exist — migration hasn't run
    } else {
      logger.error(`[PaymentFlow] Upsert failed: ${error.message}`);
    }
  }
};

/**
 * Build a payment flow row from a MongoDB Payment document.
 * Call this after Payment.save() or on key lifecycle events.
 */
const fromPayment = (payment) => {
  const respondent = payment.metadata?.respondentContext || {};
  return {
    tenant_id: payment.tenantId,
    user_id: payment.userId,
    user_name: respondent.fullName || respondent.name || null,
    user_email: respondent.email || null,
    payment_id: String(payment._id),
    payment_reference: payment.reference,
    provider: payment.paymentMethod,
    amount: Number(payment.total || payment.amount || 0),
    currency: payment.currency,
    purpose: payment.purpose,
    beneficiary: payment.beneficiaryType,
    payment_status: payment.status,
    payment_created_at: payment.createdAt || payment.paymentDate,
    payment_processed_at: payment.processedAt,
    payment_completed_at: payment.completedAt,
    payment_failed_at: payment.failedAt,
    failure_reason: payment.failureReason,
  };
};

/**
 * Build from a MongoDB PaymentSettlement document.
 * Merge with an existing payment_flow row (only sets settlement fields).
 */
const fromSettlement = (settlement) => {
  const destAccount = settlement.destinationAccount || {};
  return {
    tenant_id: settlement.tenantId,
    payment_id: String(settlement.paymentId),
    settlement_id: String(settlement._id),
    settlement_status: settlement.status,
    funding_status: settlement.fundingStatus,
    availability_status: settlement.availabilityStatus,
    provider_settlement_id: settlement.providerSettlementId,
    provider_settled_at: settlement.providerSettledAt,
    settlement_fee: Number(settlement.fee || 0),
    service_fee: Number(settlement.serviceFee || 0),
    provider_fee: Number(settlement.providerFee || 0),
    provider_app_fee: Number(settlement.providerAppFee || 0),
    provider_merchant_fee: Number(settlement.providerMerchantFee || 0),
    net_amount: Number(settlement.netAmount || 0),
    destination_type: settlement.destinationType,
    destination_node:
      settlement.destinationNodeName || settlement.destinationNodeReference,
    destination_account_number: destAccount.accountNumber || null,
    destination_account_name:
      destAccount.accountName || destAccount.label || null,
    destination_bank_name: destAccount.bankName || null,
    destination_bank_code: destAccount.bankCode || null,
  };
};

/**
 * Query payment flow with filters.
 */
const queryPaymentFlow = async ({
  tenantId,
  userId,
  provider,
  paymentStatus,
  fundingStatus,
  reconciliationStatus,
  from,
  to,
  search,
  sortBy = 'payment_created_at',
  order = 'desc',
  page = 1,
  limit = 25,
}) => {
  if (!ALLOWED_SORT.has(sortBy)) sortBy = 'payment_created_at';

  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (tenantId) {
    conditions.push(`tenant_id = $${idx++}`);
    params.push(tenantId);
  }
  if (userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(userId);
  }
  if (provider) {
    conditions.push(`provider = $${idx++}`);
    params.push(provider);
  }
  if (paymentStatus) {
    conditions.push(`payment_status = $${idx++}`);
    params.push(paymentStatus);
  }
  if (fundingStatus) {
    conditions.push(`funding_status = $${idx++}`);
    params.push(fundingStatus);
  }
  if (reconciliationStatus) {
    conditions.push(`reconciliation_status = $${idx++}`);
    params.push(reconciliationStatus);
  }
  if (from) {
    conditions.push(`payment_created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`payment_created_at <= $${idx++}`);
    params.push(to);
  }
  if (search) {
    conditions.push(
      `(payment_reference ILIKE $${idx} OR user_name ILIKE $${idx} OR user_email ILIKE $${idx})`
    );
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [{ rows: countRows }] = await Promise.all([
    postgresPool.query(
      `SELECT COUNT(*)::int AS total FROM public.payment_flow WHERE ${where}`,
      params
    ),
  ]);

  const { rows } = await postgresPool.query(
    `SELECT * FROM public.payment_flow
     WHERE ${where}
     ORDER BY ${sortBy} ${order === 'asc' ? 'ASC' : 'DESC'}
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const total = countRows[0]?.total || 0;

  return {
    results: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

module.exports = {
  upsertPaymentFlow,
  fromPayment,
  fromSettlement,
  queryPaymentFlow,
};
