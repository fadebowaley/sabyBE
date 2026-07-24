const express = require('express');
const request = require('supertest');


const mockAuthService = {
  assertMainAppAccess: jest.fn(),
};

const mockUserService = {
  getUserByEmail: jest.fn(),
  createUser: jest.fn(),
  updateUserById: jest.fn(),
  getUserById: jest.fn(),
};
const mockTokenService = {
  generateAuthTokens: jest.fn(),
};

jest.mock('../middlewares/rateLimiter', () => ({
  loginLimiter: (req, res, next) => next(),
}));

jest.mock('../config/config', () => ({
  socialAuth: {
    sharedSecret: 'test-social-secret',
  },
  jwt: {
    secret: 'test-jwt-secret',
  },
  postgres: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'saby_test',
    ssl: false,
  },
  sms: {
    sms_api_key: '',
    sms_base_url: '',
    sms_sender_id: '',
  },
}));

jest.mock('../services', () => ({
  authService: mockAuthService,
  userService: mockUserService,
  tokenService: mockTokenService,
  emailService: {},
  apiKeyService: {},
  tenantOnboardingService: {},
}));

const authRouter = require('../routes/v1/auth.route');

const app = express();
app.use(express.json());
app.use('/v1/auth', authRouter);

const buildUserDoc = (overrides = {}) => ({
  id: overrides.id || 'user-1',
  _id: overrides._id || 'user-1',
  userId: overrides.userId || 'USR-1',
  haloId: overrides.haloId || 'HL-00001',
  tenantId: overrides.tenantId || 'tenant-1',
  firstname: overrides.firstname || 'Test',
  lastname: overrides.lastname || 'User',
  email: overrides.email || 'test@example.com',
  phoneNumber: overrides.phoneNumber || null,
  avatar: overrides.avatar || null,
  isOwner: overrides.isOwner !== undefined ? overrides.isOwner : true,
  isSuper: overrides.isSuper !== undefined ? overrides.isSuper : true,
  isSaby: false,
  isAdmin: false,
  isAgreed: true,
  isEmailVerified:
    overrides.isEmailVerified !== undefined ? overrides.isEmailVerified : true,
  isPhoneVerified:
    overrides.isPhoneVerified !== undefined ? overrides.isPhoneVerified : false,
  otpVerified: overrides.otpVerified !== undefined ? overrides.otpVerified : true,
  status: overrides.status !== undefined ? overrides.status : true,
  createdAt: new Date(),
  roles: [],
  permissions: undefined,
  socialAuth: overrides.socialAuth || null,
  deletedAt: overrides.deletedAt || null,
  markModified: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined),
});

describe('auth social-login route', () => {

  beforeEach(() => {
  jest.clearAllMocks();

  mockAuthService.assertMainAppAccess.mockResolvedValue(true);

  mockTokenService.generateAuthTokens.mockResolvedValue({
    access: {
      token: 'access-token',
      expires: new Date().toISOString(),
    },
    refresh: {
      token: 'refresh-token',
      expires: new Date().toISOString(),
    },
  });
});


  test('creates a user on first Google social sign-in', async () => {
    const createdUser = buildUserDoc({
      id: 'new-user-id',
      _id: 'new-user-id',
      email: 'new.user@example.com',
      firstname: 'New',
      lastname: 'User',
    });
    const refreshedUser = buildUserDoc({
      id: 'new-user-id',
      _id: 'new-user-id',
      email: 'new.user@example.com',
      firstname: 'New',
      lastname: 'User',
    });

    mockUserService.getUserByEmail.mockResolvedValue(null);
    mockUserService.createUser.mockResolvedValue(createdUser);
    mockUserService.getUserById.mockResolvedValue(refreshedUser);

    const res = await request(app)
      .post('/v1/auth/social-login')
      .set('x-social-auth-secret', 'test-social-secret')
      .send({
        provider: 'google',
        email: 'new.user@example.com',
        firstname: 'New',
        lastname: 'User',
        name: 'New User',
        emailVerified: true,
      });

    console.log('SIGNUP ERROR:', res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body?.auth).toEqual({
      provider: 'google',
      mode: 'signup',
    });


    expect(mockUserService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new.user@example.com',
        isOwner: true,
        isAgreed: true,
        otpVerified: true,
        isEmailVerified: true,
        status: true,
      })
    );
    expect(createdUser.save).toHaveBeenCalledTimes(1);
  });

  test('logs in existing user and normalizes auth flags', async () => {
    const existingUser = buildUserDoc({
      id: 'existing-user-id',
      _id: 'existing-user-id',
      email: 'existing.user@example.com',
      isEmailVerified: false,
      otpVerified: false,
      status: false,
    });
    const refreshedUser = buildUserDoc({
      id: 'existing-user-id',
      _id: 'existing-user-id',
      email: 'existing.user@example.com',
      isEmailVerified: true,
      otpVerified: true,
      status: true,
    });

    mockUserService.getUserByEmail.mockResolvedValue(existingUser);
    mockUserService.getUserById.mockResolvedValue(refreshedUser);

    const res = await request(app)
      .post('/v1/auth/social-login')
      .set('x-social-auth-secret', 'test-social-secret')
      .send({
        provider: 'google',
        email: 'existing.user@example.com',
        emailVerified: true,
      });

    console.log('LOGIN ERROR:', res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body?.auth).toEqual({
      provider: 'google',
      mode: 'login',
    });
    expect(mockUserService.updateUserById).toHaveBeenCalledWith(
      'existing-user-id',
      expect.objectContaining({
        otpVerified: true,
        isEmailVerified: true,
        status: true,
      })
    );
    expect(existingUser.save).toHaveBeenCalledTimes(1);
  });

  test('rejects social login for soft-deleted account', async () => {
    mockUserService.getUserByEmail.mockResolvedValue(
      buildUserDoc({
        id: 'deleted-user-id',
        _id: 'deleted-user-id',
        email: 'deleted.user@example.com',
        deletedAt: new Date(),
      })
    );

    const res = await request(app)
      .post('/v1/auth/social-login')
      .set('x-social-auth-secret', 'test-social-secret')
      .send({
        provider: 'google',
        email: 'deleted.user@example.com',
        emailVerified: true,
      });

    expect(res.status).toBe(403);
  });

  test('rejects Google social login when provider email is unverified', async () => {
    const res = await request(app)
      .post('/v1/auth/social-login')
      .set('x-social-auth-secret', 'test-social-secret')
      .send({
        provider: 'google',
        email: 'unverified@example.com',
        emailVerified: false,
      });

    expect(res.status).toBe(400);
    expect(mockUserService.getUserByEmail).not.toHaveBeenCalled();
  });
});
