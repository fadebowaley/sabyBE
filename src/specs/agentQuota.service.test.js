jest.mock('../services/aiToken.service', () => ({
  getTenantAiBalance: jest.fn(),
}));
jest.mock('../services/byok.service', () => ({
  SUPPORTED_PROVIDERS: ['openai', 'gemini'],
  getDecryptedKeyForTenant: jest.fn(),
}));

const aiTokenService = require('../services/aiToken.service');
const byokService = require('../services/byok.service');
const agentQuota = require('../services/agentQuota.service');

describe('agentQuota.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateParity', () => {
    test('isSaby is always exempt with infinite balance', () => {
      const decision = agentQuota.evaluateParity({ isSaby: true, byokExempt: false, balance: null });
      expect(decision).toEqual({
        allowed: true,
        mode: 'saby',
        reason: 'isSaby exempt',
        remainingTokens: Infinity,
      });
    });

    test('BYOK is exempt', () => {
      const decision = agentQuota.evaluateParity({ isSaby: false, byokExempt: true, balance: null });
      expect(decision.allowed).toBe(true);
      expect(decision.mode).toBe('byok');
    });

    test('unlimited plan is exempt', () => {
      const decision = agentQuota.evaluateParity({
        isSaby: false,
        byokExempt: false,
        balance: { isUnlimited: true },
      });
      expect(decision.allowed).toBe(true);
      expect(decision.mode).toBe('unlimited');
    });

    test('regular quota passes when tokens remain', () => {
      const decision = agentQuota.evaluateParity({
        isSaby: false,
        byokExempt: false,
        balance: { isUnlimited: false, remainingTokens: 12 },
      });
      expect(decision.allowed).toBe(true);
      expect(decision.mode).toBe('regular');
      expect(decision.remainingTokens).toBe(12);
    });

    test('depleted quota fails closed', () => {
      const decision = agentQuota.evaluateParity({
        isSaby: false,
        byokExempt: false,
        balance: { isUnlimited: false, remainingTokens: 0 },
      });
      expect(decision).toEqual({
        allowed: false,
        mode: 'depleted',
        reason: 'insufficient_quota',
        remainingTokens: 0,
        code: 402,
      });
    });
  });

  describe('isByokExempt', () => {
    test('rejects missing/short header keys', async () => {
      await expect(agentQuota.isByokExempt({ tenantId: 't-1', headerKey: null })).resolves.toBe(false);
      await expect(agentQuota.isByokExempt({ tenantId: 't-1', headerKey: 'short' })).resolves.toBe(false);
      expect(byokService.getDecryptedKeyForTenant).not.toHaveBeenCalled();
    });

    test('returns the provider when the header matches a stored key', async () => {
      byokService.getDecryptedKeyForTenant.mockImplementation(async ({ provider }) =>
        provider === 'openai' ? { apiKey: 'sk-valid-key-123' } : null
      );
      await expect(agentQuota.isByokExempt({ tenantId: 't-1', headerKey: 'sk-valid-key-123' })).resolves.toBe(
        'openai'
      );
    });

    test('returns false when nothing matches', async () => {
      byokService.getDecryptedKeyForTenant.mockResolvedValue(null);
      await expect(agentQuota.isByokExempt({ tenantId: 't-1', headerKey: 'sk-wrong-999' })).resolves.toBe(false);
    });
  });

  describe('assertQuota', () => {
    test('skips balance lookup for isSaby', async () => {
      const result = await agentQuota.assertQuota({ tenantId: 't-1', isSaby: true });
      expect(result.mode).toBe('saby');
      expect(aiTokenService.getTenantAiBalance).not.toHaveBeenCalled();
    });

    test('skips balance lookup for BYOK', async () => {
      byokService.getDecryptedKeyForTenant.mockImplementation(async () => ({ apiKey: 'sk-byok-key' }));
      const result = await agentQuota.assertQuota({ tenantId: 't-1', byokHeaderKey: 'sk-byok-key' });
      expect(result.mode).toBe('byok');
      expect(aiTokenService.getTenantAiBalance).not.toHaveBeenCalled();
    });

    test('allows regular tenants through the balance', async () => {
      aiTokenService.getTenantAiBalance.mockResolvedValue({
        isUnlimited: false,
        remainingTokens: 500,
      });
      const result = await agentQuota.assertQuota({ tenantId: 't-1' });
      expect(result.mode).toBe('regular');
      expect(result.allowed).toBe(true);
    });

    test('throws 402 when deprecated', async () => {
      aiTokenService.getTenantAiBalance.mockResolvedValue({
        isUnlimited: false,
        remainingTokens: 0,
      });
      await expect(agentQuota.assertQuota({ tenantId: 't-1' })).rejects.toMatchObject({
        statusCode: 402,
        details: { reason: 'insufficient_quota' },
      });
    });
  });
});