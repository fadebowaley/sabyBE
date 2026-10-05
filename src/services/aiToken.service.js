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

      CREATE TABLE IF NOT EXISTS copilot.user_token_logs (
        id BIGSERIAL PRIMARY KEY,
        run_id VARCHAR(128),
        tenant_id VARCHAR(128) NOT NULL,
        user_id VARCHAR(128) NOT NULL,
        thread_id VARCHAR(64),
        model VARCHAR(128),
        tokens_consumed BIGINT NOT NULL DEFAULT 0,
        input_tokens BIGINT NOT NULL DEFAULT 0,
        output_tokens BIGINT NOT NULL DEFAULT 0,
        balance_before BIGINT,
        balance_after BIGINT,
        action VARCHAR(64) NOT NULL DEFAULT 'agent_chat',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_user_token_logs_tenant ON copilot.user_token_logs (tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_token_logs_user ON copilot.user_token_logs (tenant_id, user_id, created_at DESC);
    `);
    _tableEnsured = true;
  } catch (error) {
    logger.warn(
      `[AiTokenService] Could not verify tenant_ai_quotas table: ${error.message}`
    );
  }
};

const DEFAULT_STARTER_TOKENS = 100000;

/**
 * Returns available AI token packs.
 */
const getAiTokenPacks = () => Object.values(AI_TOKEN_PACKS);

/**
 * Auto-provisions the default starter quota (100,000 tokens) for a tenant workspace.
 * Idempotent: uses ON CONFLICT (tenant_id) DO NOTHING so it never overwrites existing balances.
 */
const provisionStarterQuota = async ({
  tenantId,
  reason = 'Default starter token grant for tenant workspace',
}) => {
  if (!tenantId) return null;
  await ensureTenantQuotaTable();
  try {
    const res = await postgresPool.query(
      `INSERT INTO copilot.tenant_ai_quotas (
         tenant_id, purchased_tokens, used_tokens, remaining_tokens, is_unlimited, metadata, created_at, updated_at
       ) VALUES ($1, $2, 0, $2, false, $3::jsonb, now(), now())
       ON CONFLICT (tenant_id) DO NOTHING
       RETURNING purchased_tokens, used_tokens, remaining_tokens, is_unlimited, last_purchase_at;`,
      [
        String(tenantId),
        DEFAULT_STARTER_TOKENS,
        JSON.stringify({
          reason,
          initialGrant: DEFAULT_STARTER_TOKENS,
          grantedAt: new Date().toISOString(),
        }),
      ]
    );

    if (res.rows.length > 0) {
      logger.info(
        `🎁 [AiTokenService] Provisioned default starter quota (${DEFAULT_STARTER_TOKENS.toLocaleString()} tokens) for tenant ${tenantId}`
      );
      return res.rows[0];
    }
  } catch (error) {
    logger.warn(
      `[AiTokenService] Could not auto-provision starter quota for tenant ${tenantId}: ${error.message}`
    );
  }
  return null;
};

/**
 * Retrieves the current AI token balance for a tenant.
 * If the tenant has no existing record, automatically provisions the default
 * starter quota (100,000 tokens) so tenant owners can immediately use the agent.
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

  if (!tenantId) {
    return {
      tenantId: null,
      isSaby: false,
      purchasedTokens: 0,
      usedTokens: 0,
      remainingTokens: 0,
      isUnlimited: false,
      lastPurchaseAt: null,
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

    // Auto-provision starter quota (100,000 tokens) for new or uninitialized tenant
    const provisioned = await provisionStarterQuota({
      tenantId,
      reason: 'Auto-provisioned default starter quota on initial balance check',
    });

    if (provisioned) {
      return {
        tenantId,
        isSaby: false,
        purchasedTokens: Number(
          provisioned.purchased_tokens || DEFAULT_STARTER_TOKENS
        ),
        usedTokens: Number(provisioned.used_tokens || 0),
        remainingTokens: Number(
          provisioned.remaining_tokens || DEFAULT_STARTER_TOKENS
        ),
        isUnlimited: Boolean(provisioned.is_unlimited),
        lastPurchaseAt: provisioned.last_purchase_at,
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

/**
 * Deducts consumed AI tokens from a tenant's quota after an agent run,
 * and records an auditable log entry into copilot.user_token_logs.
 * Never drives the balance below zero; isSaby/unlimited tenants are exempt.
 */
const deductAiUsage = async ({
  tenantId,
  userId = null,
  runId = null,
  threadId = null,
  model = null,
  tokens = 0,
  inputTokens = 0,
  outputTokens = 0,
  action = 'agent_chat',
  isUnlimited = false,
}) => {
  const consumed = Math.max(0, Math.round(Number(tokens) || 0));
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required.');
  }

  await ensureTenantQuotaTable();

  // If unlimited or zero tokens consumed, still record user token log if userId is provided
  if (isUnlimited || consumed === 0) {
    if (userId) {
      try {
        await postgresPool.query(
          `INSERT INTO copilot.user_token_logs (
             run_id, tenant_id, user_id, thread_id, model,
             tokens_consumed, input_tokens, output_tokens,
             balance_before, balance_after, action, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb);`,
          [
            runId ? String(runId) : null,
            String(tenantId),
            String(userId),
            threadId ? String(threadId) : null,
            model || null,
            consumed,
            Math.max(0, Number(inputTokens) || 0),
            Math.max(0, Number(outputTokens) || 0),
            null,
            null,
            action || 'agent_chat',
            JSON.stringify({ isUnlimited: Boolean(isUnlimited) }),
          ]
        );
      } catch (logErr) {
        logger.warn(
          `[AiTokenService] Failed to record user token log: ${logErr.message}`
        );
      }
    }
    return {
      tenantId,
      userId,
      isUnlimited,
      deducted: consumed,
      remainingTokens: Infinity,
    };
  }

  // Fetch current remaining tokens before deduction
  let balanceBefore = null;
  try {
    const currentRes = await postgresPool.query(
      `SELECT remaining_tokens FROM copilot.tenant_ai_quotas WHERE tenant_id = $1 LIMIT 1;`,
      [String(tenantId)]
    );
    if (currentRes.rows.length > 0) {
      balanceBefore = Number(currentRes.rows[0].remaining_tokens || 0);
    }
  } catch (err) {
    logger.warn(
      `[AiTokenService] Failed reading balance before deduction: ${err.message}`
    );
  }

  const res = await postgresPool.query(
    `UPDATE copilot.tenant_ai_quotas
     SET used_tokens = copilot.tenant_ai_quotas.used_tokens + $2,
         remaining_tokens = GREATEST(copilot.tenant_ai_quotas.remaining_tokens - $2, 0),
         last_deduction_at = now(),
         updated_at = now()
     WHERE tenant_id = $1
     RETURNING used_tokens, remaining_tokens;`,
    [String(tenantId), consumed]
  );

  const row = res.rows[0];
  const balanceAfter = row ? Number(row.remaining_tokens) : 0;

  if (userId) {
    try {
      await postgresPool.query(
        `INSERT INTO copilot.user_token_logs (
           run_id, tenant_id, user_id, thread_id, model,
           tokens_consumed, input_tokens, output_tokens,
           balance_before, balance_after, action, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb);`,
        [
          runId ? String(runId) : null,
          String(tenantId),
          String(userId),
          threadId ? String(threadId) : null,
          model || null,
          consumed,
          Math.max(0, Number(inputTokens) || 0),
          Math.max(0, Number(outputTokens) || 0),
          balanceBefore,
          balanceAfter,
          action || 'agent_chat',
          JSON.stringify({ isUnlimited: Boolean(isUnlimited) }),
        ]
      );
    } catch (logErr) {
      logger.warn(
        `[AiTokenService] Failed to record user token log: ${logErr.message}`
      );
    }
  }

  if (!row) {
    return {
      tenantId,
      userId,
      isUnlimited: false,
      deducted: 0,
      remainingTokens: 0,
      noQuota: true,
    };
  }

  return {
    tenantId,
    userId,
    isUnlimited: false,
    deducted: consumed,
    usedTokens: Number(row.used_tokens),
    remainingTokens: balanceAfter,
  };
};

/**
 * Lists token consumption logs for a tenant, optionally filtered by userId.
 */
const listUserTokenLogs = async ({
  tenantId,
  userId = null,
  page = 1,
  limit = 25,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required.');
  }
  await ensureTenantQuotaTable();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
  const offset = (safePage - 1) * safeLimit;

  const params = [String(tenantId)];
  let where = 'WHERE tenant_id = $1';
  if (userId) {
    params.push(String(userId));
    where += ` AND user_id = $${params.length}`;
  }

  const queryText = `
    SELECT id, run_id, tenant_id, user_id, thread_id, model,
           tokens_consumed, input_tokens, output_tokens,
           balance_before, balance_after, action, metadata, created_at
    FROM copilot.user_token_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2};
  `;
  params.push(safeLimit, offset);

  const res = await postgresPool.query(queryText, params);

  const countParams = params.slice(0, userId ? 2 : 1);
  const countRes = await postgresPool.query(
    `SELECT count(*)::int as total FROM copilot.user_token_logs ${where};`,
    countParams
  );
  const total = Number(countRes.rows[0]?.total || 0);

  return {
    items: res.rows.map((row) => ({
      id: String(row.id),
      runId: row.run_id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      threadId: row.thread_id,
      model: row.model,
      tokensConsumed: Number(row.tokens_consumed),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      balanceBefore:
        row.balance_before != null ? Number(row.balance_before) : null,
      balanceAfter:
        row.balance_after != null ? Number(row.balance_after) : null,
      action: row.action,
      metadata: row.metadata || {},
      createdAt: row.created_at,
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
  DEFAULT_STARTER_TOKENS,
  AI_TOKEN_PACKS,
  getAiTokenPacks,
  provisionStarterQuota,
  getTenantAiBalance,
  initializeAiTokenCheckout,
  creditTokensFromPayment,
  allocateTokensManually,
  listAllTenantQuotas,
  deductAiUsage,
  listUserTokenLogs,
};
