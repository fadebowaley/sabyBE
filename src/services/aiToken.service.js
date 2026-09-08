const crypto = require('crypto');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');
const { Payment } = require('../models');
const paymentProviderService = require('./paymentProvider.service');

const AI_TOKEN_PACKS = {
  starter: {
    id: 'starter',
    name: 'Starter AI Pack',
    tokens: 500000,
    pricing: { USD: 10, NGN: 15000 },
    description:
      '500,000 AI compute tokens — ideal for ~250–500 operational workflows',
    popular: false,
  },
  growth: {
    id: 'growth',
    name: 'Growth AI Pack',
    tokens: 1500000,
    pricing: { USD: 25, NGN: 37500 },
    description:
      '1,500,000 AI compute tokens — ideal for ~750–1,500 operational workflows',
    popular: true,
  },
  power: {
    id: 'power',
    name: 'Power AI Pack',
    tokens: 3500000,
    pricing: { USD: 50, NGN: 75000 },
    description:
      '3,500,000 AI compute tokens — ideal for ~1,750–3,500 operational workflows',
    popular: false,
  },
};

let _tableEnsured = false;

/**
 * Ensures the tenant_ai_quotas table exists in Postgres.
 */
const ensureTenantQuotaTable = async () => {
  if (_tableEnsured) return;
  try {
    await postgresPool.query(`CREATE SCHEMA IF NOT EXISTS copilot;`);
    await postgresPool.query(`
      CREATE TABLE IF NOT EXISTS copilot.tenant_ai_quotas (
        tenant_id VARCHAR(128) PRIMARY KEY,
        purchased_tokens BIGINT NOT NULL DEFAULT 0,
        used_tokens BIGINT NOT NULL DEFAULT 0,
        remaining_tokens BIGINT NOT NULL DEFAULT 0,
        is_unlimited BOOLEAN NOT NULL DEFAULT false,
        last_purchase_at TIMESTAMPTZ,
        last_deduction_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    _tableEnsured = true;
  } catch (error) {
    logger.warn(
      `[AiTokenService] Could not verify tenant_ai_quotas table: ${error.message}`
    );
  }
};

/**
 * Returns available AI token packs.
 */
const getAiTokenPacks = () => Object.values(AI_TOKEN_PACKS);

/**
 * Retrieves the current AI token balance for a tenant.
 */
const getTenantAiBalance = async ({ tenantId, isSaby = false }) => {
  if (isSaby) {
    return {
      tenantId,
      isSaby: true,
      purchasedTokens: Infinity,
      usedTokens: 0,
      remainingTokens: Infinity,
      isUnlimited: true,
    };
  }

  await ensureTenantQuotaTable();
  try {
    const res = await postgresPool.query(
      `SELECT purchased_tokens, used_tokens, remaining_tokens, is_unlimited, last_purchase_at
       FROM copilot.tenant_ai_quotas
       WHERE tenant_id = $1 LIMIT 1;`,
      [String(tenantId)]
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        tenantId,
        isSaby: false,
        purchasedTokens: Number(row.purchased_tokens || 0),
        usedTokens: Number(row.used_tokens || 0),
        remainingTokens: Number(row.remaining_tokens || 0),
        isUnlimited: Boolean(row.is_unlimited),
        lastPurchaseAt: row.last_purchase_at,
      };
    }
  } catch (error) {
    logger.warn(
      `[AiTokenService] Error fetching tenant quota for ${tenantId}: ${error.message}`
    );
  }

  return {
    tenantId,
    isSaby: false,
    purchasedTokens: 0,
    usedTokens: 0,
    remainingTokens: 0,
    isUnlimited: false,
    lastPurchaseAt: null,
  };
};

/**
 * Initializes a checkout session for purchasing an AI token package.
 */
const initializeAiTokenCheckout = async ({
  user,
  packId,
  currency = 'NGN',
  provider = 'flutterwave',
  returnUrl = null,
}) => {
  const tenantId = user?.tenantId;
  const userId = user?.id || user?._id;
  if (!tenantId || !userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Authenticated user and tenant required.'
    );
  }

  const pack = AI_TOKEN_PACKS[packId];
  if (!pack) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid token pack. Available packs: ${Object.keys(AI_TOKEN_PACKS).join(
        ', '
      )}`
    );
  }

  const normalizedCurrency = String(currency || 'NGN').toUpperCase();
  const priceAmount = pack.pricing[normalizedCurrency];
  if (!priceAmount || priceAmount <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Currency ${normalizedCurrency} is not supported for AI token purchases.`
    );
  }

  const normalizedProvider = String(provider || 'flutterwave').toLowerCase();
  const reference = `aitoken_${tenantId.slice(0, 8)}_${Date.now()}_${crypto
    .randomBytes(3)
    .toString('hex')}`;

  const payment = await Payment.create({
    tenantId,
    userId: String(userId),
    amount: priceAmount,
    total: priceAmount,
    currency: normalizedCurrency,
    purpose: 'ai_tokens',
    beneficiaryType: 'saby',
    paymentMethod: normalizedProvider,
    reference,
    paymentDetails: {
      packId: pack.id,
      packName: pack.name,
      tokens: pack.tokens,
      returnUrl,
    },
    metadata: {
      type: 'ai_tokens',
      packId: pack.id,
      tokens: pack.tokens,
      tenantId,
      userId: String(userId),
      userEmail: user.email,
    },
  });

  const checkout = await paymentProviderService.initializeHostedCheckout({
    payment,
    customer: {
      email: user.email,
      name:
        `${user.firstname || ''} ${user.lastname || ''}`.trim() || user.email,
      phone: user.phoneNumber || null,
    },
    invoiceSnapshot: {
      title: `${pack.name} (${pack.tokens.toLocaleString()} Tokens)`,
      description: pack.description,
      amount: priceAmount,
      currency: normalizedCurrency,
      lineItems: [
        {
          label: `${
            pack.name
          } (${pack.tokens.toLocaleString()} Saby Copilot Tokens)`,
          amount: priceAmount,
        },
      ],
    },
    respondentContext: {
      returnUrl,
    },
  });

  if (checkout?.providerRef) {
    payment.providerRef = checkout.providerRef;
    await payment.save();
  }

  return {
    payment,
    pack,
    checkout,
  };
};

/**
 * Credits tokens to a tenant upon successful payment completion.
 * Called by paymentWebhook.service.js when currentPayment.purpose === 'ai_tokens'.
 */
const creditTokensFromPayment = async (payment) => {
  const { tenantId } = payment;
  const tokens = Number(
    payment.metadata?.tokens ||
      payment.paymentDetails?.tokens ||
      AI_TOKEN_PACKS[payment.metadata?.packId]?.tokens ||
      0
  );

  if (!tenantId || tokens <= 0) {
    logger.warn(
      `[AiTokenService] Skipping credit: invalid tenant (${tenantId}) or tokens (${tokens}) for payment ${payment.reference}`
    );
    return null;
  }

  await ensureTenantQuotaTable();
  try {
    const res = await postgresPool.query(
      `INSERT INTO copilot.tenant_ai_quotas (
         tenant_id, purchased_tokens, remaining_tokens, last_purchase_at, metadata, updated_at
       ) VALUES ($1, $2, $2, now(), $3::jsonb, now())
       ON CONFLICT (tenant_id) DO UPDATE
       SET purchased_tokens = copilot.tenant_ai_quotas.purchased_tokens + EXCLUDED.purchased_tokens,
           remaining_tokens = copilot.tenant_ai_quotas.remaining_tokens + EXCLUDED.purchased_tokens,
           last_purchase_at = now(),
           updated_at = now()
       RETURNING purchased_tokens, remaining_tokens, used_tokens;`,
      [
        String(tenantId),
        tokens,
        JSON.stringify({
          paymentReference: payment.reference,
          amount: payment.amount,
          currency: payment.currency,
          packId: payment.metadata?.packId,
        }),
      ]
    );

    logger.info(
      `✅ [AiTokenService] Successfully credited ${tokens} AI tokens to tenant ${tenantId}. New balance: ${res.rows[0]?.remaining_tokens}`
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error(
      `[AiTokenService] Failed to credit tokens to tenant ${tenantId}: ${error.message}`
    );
    throw error;
  }
};

/**
 * Manual token allocation by a Saby superuser.
 * Restricted to users with isSaby: true or isSuper: true.
 */
const allocateTokensManually = async ({
  actorUser,
  targetTenantId,
  tokens = 0,
  isUnlimited = false,
  reason = 'Admin manual allocation',
}) => {
  const isSuperUser = Boolean(
    actorUser?.isSaby || actorUser?.isSuper || actorUser?.isOwner
  );

  if (!isSuperUser) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only Saby superusers can allocate AI tokens manually.'
    );
  }

  if (!targetTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'targetTenantId is required.');
  }

  const tokenAmount = Math.max(0, Math.round(Number(tokens) || 0));

  await ensureTenantQuotaTable();
  try {
    const res = await postgresPool.query(
      `INSERT INTO copilot.tenant_ai_quotas (
         tenant_id, purchased_tokens, remaining_tokens, is_unlimited, metadata, updated_at
       ) VALUES ($1, $2, $2, $3, $4::jsonb, now())
       ON CONFLICT (tenant_id) DO UPDATE
       SET purchased_tokens = copilot.tenant_ai_quotas.purchased_tokens + EXCLUDED.purchased_tokens,
           remaining_tokens = copilot.tenant_ai_quotas.remaining_tokens + EXCLUDED.purchased_tokens,
           is_unlimited = CASE WHEN EXCLUDED.is_unlimited = true THEN true ELSE copilot.tenant_ai_quotas.is_unlimited END,
           updated_at = now()
       RETURNING purchased_tokens, remaining_tokens, used_tokens, is_unlimited;`,
      [
        String(targetTenantId),
        tokenAmount,
        Boolean(isUnlimited),
        JSON.stringify({
          allocatedBy: actorUser.email || actorUser.id,
          reason,
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    logger.info(
      `🎖️ [AiTokenService] Admin ${actorUser.email} manually allocated ${tokenAmount} tokens to ${targetTenantId}. Unlimited=${isUnlimited}`
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error(
      `[AiTokenService] Manual allocation failed for ${targetTenantId}: ${error.message}`
    );
    throw error;
  }
};

/**
 * Lists all tenant quotas for the isSaby Superadmin Console.
 */
const listAllTenantQuotas = async ({ page = 1, limit = 25, search = '' }) => {
  await ensureTenantQuotaTable();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
  const offset = (safePage - 1) * safeLimit;

  let queryText = `
    SELECT tenant_id, purchased_tokens, used_tokens, remaining_tokens, is_unlimited, last_purchase_at, last_deduction_at, created_at, updated_at
    FROM copilot.tenant_ai_quotas
  `;
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    queryText += ` WHERE tenant_id ILIKE $1`;
  }

  queryText += ` ORDER BY remaining_tokens ASC, updated_at DESC LIMIT $${
    params.length + 1
  } OFFSET $${params.length + 2};`;
  params.push(safeLimit, offset);

  const res = await postgresPool.query(queryText, params);

  const countRes = await postgresPool.query(
    `SELECT count(*)::int as total FROM copilot.tenant_ai_quotas;`
  );
  const total = Number(countRes.rows[0]?.total || 0);

  return {
    items: res.rows.map((row) => ({
      tenantId: row.tenant_id,
      purchasedTokens: Number(row.purchased_tokens),
      usedTokens: Number(row.used_tokens),
      remainingTokens: Number(row.remaining_tokens),
      isUnlimited: Boolean(row.is_unlimited),
      lastPurchaseAt: row.last_purchase_at,
      lastDeductionAt: row.last_deduction_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
};

module.exports = {
  AI_TOKEN_PACKS,
  getAiTokenPacks,
  getTenantAiBalance,
  initializeAiTokenCheckout,
  creditTokensFromPayment,
  allocateTokensManually,
  listAllTenantQuotas,
};
