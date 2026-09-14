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
const assertQuota = async ({ tenantId, isSaby = false, byokHeaderKey = null }) => {
  const byokProvider = byokHeaderKey
    ? await isByokExempt({ tenantId, headerKey: byokHeaderKey })
    : false;

  let balance = null;
  if (!isSaby && !byokProvider) {
    balance = await aiTokenService.getTenantAiBalance({ tenantId, isSaby });
  }

  const decision = evaluateParity({
    isSaby,
    byokExempt: Boolean(byokProvider),
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

  return { ...decision, byokProvider: byokProvider || null, balance: balance || null };
};

module.exports = {
  evaluateParity,
  isByokExempt,
  assertQuota,
};