const express = require('express');
const request = require('supertest');

const mockTenantOnboardingService = {
  getOnboardingStatus: jest.fn(),
  completeOnboarding: jest.fn(),
};

jest.mock('../middlewares/auth', () => () => (req, res, next) => {
  const mode = String(req.headers['x-test-user'] || 'owner').toLowerCase();
  if (mode === 'staff') {
    req.user = { id: 'user-staff', tenantId: 'tenant-1' };
  } else {
    req.user = { id: 'user-owner', tenantId: 'tenant-1' };
  }
  next();
});

jest.mock('../middlewares/rateLimiter', () => ({
  loginLimiter: (req, res, next) => next(),
}));

jest.mock('../services', () => ({
  authService: {},
  userService: {},
  tokenService: {},
  emailService: {},
  apiKeyService: {},
  tenantOnboardingService: mockTenantOnboardingService,
}));

const authRouter = require('../routes/v1/auth.route');

const app = express();
app.use(express.json());
app.use('/v1/auth', authRouter);

describe('auth onboarding profile routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /v1/auth/onboarding/profile returns owner onboarding state', async () => {
    mockTenantOnboardingService.getOnboardingStatus.mockResolvedValue({
      requiresOnboarding: true,
      completed: false,
      profile: {
        company: { name: 'Acme Ltd' },
      },
    });

    const res = await request(app).get('/v1/auth/onboarding/profile');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        requiresOnboarding: true,
        completed: false,
      })
    );
    expect(mockTenantOnboardingService.getOnboardingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-owner' })
    );
  });

  test('GET /v1/auth/onboarding/profile returns owner-only shortcut for non-owner', async () => {
    mockTenantOnboardingService.getOnboardingStatus.mockResolvedValue({
      requiresOnboarding: false,
      completed: true,
      reason: 'owner_only',
      profile: null,
    });

    const res = await request(app)
      .get('/v1/auth/onboarding/profile')
      .set('x-test-user', 'staff');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        requiresOnboarding: false,
        completed: true,
        reason: 'owner_only',
      })
    );
    expect(mockTenantOnboardingService.getOnboardingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-staff' })
    );
  });

  test('POST /v1/auth/onboarding/profile rejects invalid payload', async () => {
    const res = await request(app).post('/v1/auth/onboarding/profile').send({
      owner: { phoneNumber: '+2348000000000' },
      company: { timezone: 'Africa/Lagos' },
      node: {},
    });

    expect(res.status).toBe(400);
    expect(mockTenantOnboardingService.completeOnboarding).not.toHaveBeenCalled();
  });

  test('POST /v1/auth/onboarding/profile supports idempotent re-submit', async () => {
    const payload = {
      owner: {
        phoneNumber: '+2348000000000',
        roleTitle: 'Owner',
      },
      company: {
        name: 'Acme Ltd',
        email: 'ops@acme.com',
        phone: '+2348000000001',
        industry: 'Non-Profit & Faith-Based',
        size: '11-50',
        timezone: 'Africa/Lagos',
        country: 'Nigeria',
        state: 'Oyo',
        city: 'Ibadan',
        address: 'Challenge, Ibadan',
      },
      node: {
        rootNodeName: 'Acme HQ',
        rootLevelName: 'Headquarters',
        rootNodeAddress: 'Challenge, Ibadan',
      },
    };

    const stableResponse = {
      tenantId: 'tenant-1',
      completed: true,
      companyName: 'Acme Ltd',
      rootNode: {
        id: 'node-root-1',
        name: 'Acme HQ',
        levelName: 'Headquarters',
      },
    };
    mockTenantOnboardingService.completeOnboarding.mockResolvedValue(stableResponse);

    const first = await request(app)
      .post('/v1/auth/onboarding/profile')
      .send(payload);
    const second = await request(app)
      .post('/v1/auth/onboarding/profile')
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body).toEqual(stableResponse);
    expect(second.body).toEqual(stableResponse);
    expect(mockTenantOnboardingService.completeOnboarding).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userId: 'user-owner', payload })
    );
    expect(mockTenantOnboardingService.completeOnboarding).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId: 'user-owner', payload })
    );
  });
});
