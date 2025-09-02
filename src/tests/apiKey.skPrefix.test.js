const request = require('supertest');
const app = require('../app'); // Adjust path if needed
const { ApiKey } = require('../models');
const { createApiKey } = require('../services/apiKey.service');

describe('API Key sk_ Prefix', () => {
  let tenantId = 'testTenantId';
  let rawKey, apiKeyDoc;

  beforeAll(async () => {
    // Create a key for testing
    const result = await createApiKey(
      {
        label: 'Test Key',
        environment: 'production',
        permissions: ['read'],
        scope: 'api',
        rateLimit: 1000,
      },
      tenantId
    );
    rawKey = result.rawKey;
    apiKeyDoc = result.apiKey;
  });

  it('should generate a key starting with sk_live_', () => {
    expect(rawKey.startsWith('sk_live_')).toBe(true);
    expect(rawKey.length).toBeGreaterThan(10);
  });

  it('should authenticate with the sk_ key', async () => {
    // Replace with a real endpoint that requires API key auth
    const res = await request(app)
      .get('/api/v1/api-keys') // Example protected endpoint
      .set('x-api-key', rawKey);
    expect(res.statusCode).not.toBe(401);
  });

  it('should reject a key if the prefix is missing', async () => {
    const res = await request(app)
      .get('/api/v1/api-keys')
      .set('x-api-key', rawKey.replace(/^sk_live_/, ''));
    expect(res.statusCode).toBe(401);
  });
});
