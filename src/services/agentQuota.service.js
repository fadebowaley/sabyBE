const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const aiTokenService = require('./aiToken.service');
const byokService = require('./byok.service');

/**
 * Agent gateway quota/BYOK parity (Phase 5).
 *
 * Quota resolution order matches the copilot contract:
 *   isSaby            → exempt (Infinity)
 *   valid BYOK key    → exempt (bring-your-own-key pays no quota)
 *   unlimited plan    → exempt
 *   regular           → remainingTokens > 0
 */

/**
 * Pure decision keeper — no I/O, fully unit-testable.
 */
const evaluateParity = ({ isSaby, byokExempt, balance }) => {
  if (isSaby) {
    return {
      allowed: true,
      mode: 'saby',
      reason: 'isSaby exempt',
      remainingTokens: Infinity,
    };
  }

  if (byokExempt) {
    return {
      allowed: true,
      mode: 'byok',
      reason: 'BYOK key exempt',
      remainingTokens: Infinity,
    };
  }

  if (balance?.isUnlimited) {
    return {
      allowed: true,
      mode: 'unlimited',
      reason: 'unlimited plan exempt',
      remainingTokens: Infinity,
    };
  }

  const remainingTokens = Number(balance?.remainingTokens || 0);
  if (remainingTokens > 0) {
    return {
      allowed: true,
      mode: 'regular',
      reason: 'quota available',
      remainingTokens,
    };
  }

  return {
    allowed: false,
    mode: 'depleted',
    reason: 'insufficient_quota',
    remainingTokens: 0,
    code: httpStatus.PAYMENT_REQUIRED,
  };
};

const mapModelToProvider = (model) => {
  if (!model || typeof model !== 'string') return null;
  const m = model.toLowerCase();
  if (m.includes('pickle') || m.includes('opencode') || m.includes('saby') || m.includes('go')) return 'opencode';
  if (m.includes('deepseek')) return 'deepseek';
  if (m.includes('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'openai';
  if (m.includes('claude') || m.includes('sonnet') || m.includes('haiku') || m.includes('opus')) return 'claude';
  if (m.includes('gemini') || m.includes('flash') || m.includes('google')) return 'gemini';
  return null;
};

/**
 * Resolves active BYOK configuration for a tenant.
 * Inspects header key if provided, or decrypts configured key for the requested
 * model/provider from the database.
 */
const resolveTenantByok = async ({ tenantId, model = null, headerKey = null }) => {
  if (!tenantId) return null;

  // 1. If explicit header key provided, verify against stored keys
  if (headerKey && typeof headerKey === 'string' && headerKey.trim().length >= 8) {
    const provider = await isByokExempt({ tenantId, headerKey });
    if (provider) {
      return { provider, apiKey: headerKey.trim(), defaultModel: model || null };
    }
  }

  // 2. Map model to provider if model is specified
  const targetProvider = mapModelToProvider(model);
  if (targetProvider) {
    const keyConfig = await byokService.getDecryptedKeyForTenant({ tenantId, provider: targetProvider });
    if (keyConfig?.apiKey) {
      return {
        provider: targetProvider,
        apiKey: keyConfig.apiKey,
        defaultModel: model || keyConfig.defaultModel || null,
      };
    }
  }

  // 3. Fallback: inspect any configured and enabled key for the tenant
  const tenantKeys = await byokService.getTenantByokKeys(tenantId);
  for (const provider of byokService.SUPPORTED_PROVIDERS) {
    if (tenantKeys[provider]?.enabled && tenantKeys[provider]?.hasKey) {
      const keyConfig = await byokService.getDecryptedKeyForTenant({ tenantId, provider });
      if (keyConfig?.apiKey) {
        return {
          provider,
          apiKey: keyConfig.apiKey,
          defaultModel: model || keyConfig.defaultModel || null,
        };
      }
    }
  }

  return null;
};

/**
 * True when the caller's `x-ai-api-key` header matches one of the tenant's
 * stored (decrypted) provider keys.
 */
const isByokExempt = async ({ tenantId, headerKey }) => {
  if (!tenantId || !headerKey || typeof headerKey !== 'string' || headerKey.trim().length < 8) {
    return false;
  }

  const normalizedHeader = headerKey.trim();
  for (const provider of byokService.SUPPORTED_PROVIDERS) {
    const stored = await byokService.getDecryptedKeyForTenant({ tenantId, provider });
    if (!stored?.apiKey) continue;
    if (stored.apiKey === normalizedHeader) {
      return provider;
    }
  }

  return false;
};

/**
 * Runs the full parity check for a gateway request.
 */
const assertQuota = async ({ tenantId, isSaby = false, byokHeaderKey = null, byokProvider = null, model = null }) => {
  let resolvedProvider = byokProvider;
  if (!resolvedProvider && byokHeaderKey) {
    resolvedProvider = await isByokExempt({ tenantId, headerKey: byokHeaderKey });
  }

  let balance = null;
  if (!isSaby && !resolvedProvider) {
    balance = await aiTokenService.getTenantAiBalance({ tenantId, isSaby });
  }

  const decision = evaluateParity({
    isSaby,
    byokExempt: Boolean(resolvedProvider),
    balance,
  });

  if (!decision.allowed) {
    throw new ApiError(
      decision.code || httpStatus.PAYMENT_REQUIRED,
      'Insufficient AI token quota. Please top up your AI token balance.',
      true,
      '',
      { reason: decision.reason, mode: decision.mode }
    );
  }

  return { ...decision, byokProvider: resolvedProvider || null, balance: balance || null };
};

module.exports = {
  evaluateParity,
  mapModelToProvider,
  resolveTenantByok,
  isByokExempt,
  assertQuota,
};