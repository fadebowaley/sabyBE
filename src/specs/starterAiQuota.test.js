const aiTokenService = require('../services/aiToken.service');
const { postgresPool } = require('../config/postgres');

jest.mock('../config/postgres', () => ({
  postgresPool: {
    query: jest.fn(),
  },
}));

describe('Starter AI Token Quota Policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('DEFAULT_STARTER_TOKENS is configured to exactly 100,000 tokens', () => {
    expect(aiTokenService.DEFAULT_STARTER_TOKENS).toBe(100000);
  });

  test('returns infinite balance for isSaby superuser', async () => {
    const balance = await aiTokenService.getTenantAiBalance({
      tenantId: 'tenant-saby',
      isSaby: true,
    });
    expect(balance.isSaby).toBe(true);
    expect(balance.remainingTokens).toBe(Infinity);
    expect(balance.isUnlimited).toBe(true);
    expect(postgresPool.query).not.toHaveBeenCalled();
  });

  test('auto-provisions 100,000 starter tokens when tenant has no prior quota row', async () => {
    // 1. ensureTable query
    postgresPool.query.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT purchased_tokens')) {
        // First lookup: no row exists
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO copilot.tenant_ai_quotas')) {
        // Auto-provision insert returns the newly created 100,000 row
        return {
          rows: [
            {
              tenant_id: params[0],
              purchased_tokens: '100000',
              used_tokens: '0',
              remaining_tokens: '100000',
              is_unlimited: false,
              last_purchase_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const balance = await aiTokenService.getTenantAiBalance({
      tenantId: 'tenant-new-owner',
      isSaby: false,
    });

    expect(balance.tenantId).toBe('tenant-new-owner');
    expect(balance.remainingTokens).toBe(100000);
    expect(balance.purchasedTokens).toBe(100000);
    expect(balance.usedTokens).toBe(0);
    expect(balance.isUnlimited).toBe(false);
  });

  test('returns existing balance and does not overwrite if tenant row exists', async () => {
    postgresPool.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT purchased_tokens')) {
        return {
          rows: [
            {
              purchased_tokens: '500000',
              used_tokens: '12000',
              remaining_tokens: '488000',
              is_unlimited: false,
              last_purchase_at: new Date('2026-03-01'),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const balance = await aiTokenService.getTenantAiBalance({
      tenantId: 'tenant-existing',
      isSaby: false,
    });

    expect(balance.purchasedTokens).toBe(500000);
    expect(balance.usedTokens).toBe(12000);
    expect(balance.remainingTokens).toBe(488000);
    expect(balance.isUnlimited).toBe(false);
  });
});
