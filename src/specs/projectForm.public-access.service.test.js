const mockJwt = {
  verify: jest.fn(),
  sign: jest.fn(() => 'signed-access-token'),
};

const mockConfig = {
  publicForm: {
    qrContextSecret: 'test-secret',
  },
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockPublicFormAccess = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
};

const mockUser = {
  findById: jest.fn(),
  findOne: jest.fn(),
};

const mockNodes = {
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
};

const mockProjectForm = {
  findOne: jest.fn(),
};

const mockProjectFormService = {
  incrementProjectSubmissions: jest.fn(),
  submitSystemFormByPublicRef: jest.fn(),
  normalizeProjectFormRuntimeConfig: jest.fn((value) => value),
  buildPublicQrContext: jest.fn((value) => ({
    secureMode:
      value?.capabilities?.experience?.security?.publicSecureMode || 'otp',
    pipelineTarget: 'postgres_unified',
    schemaVersion: value?.schemaVersion || '2.0.0',
    schemaHash: 'schema-hash',
    qrVersion: 'v1',
  })),
  getPublicProjectFormByReference: jest.fn(),
};

const mockCounter = {
  getNextSequence: jest.fn(),
};

const mockEmailService = {
  sendOtpEmail: jest.fn(),
  sendSabyEmail: jest.fn(),
};

const mockSmsService = {
  hasSmsConfig: true,
  sendOtpSms: jest.fn(),
};

const mockSubmissionService = {
  queueSubmission: jest.fn(),
};

const mockIdempotency = {
  buildDeterministicIdempotencyKey: jest.fn(() => 'idem-123'),
};
const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('jsonwebtoken', () => mockJwt);
jest.mock('../config/config', () => mockConfig);
jest.mock('../config/logger', () => mockLogger);
jest.mock('../models', () => ({
  ProjectForm: mockProjectForm,
  PublicFormAccess: mockPublicFormAccess,
  User: mockUser,
  Nodes: mockNodes,
  Counter: mockCounter,
}));
jest.mock('../services/projectForm.service', () => mockProjectFormService);
jest.mock('../services/submission.service', () => mockSubmissionService);
jest.mock('../services/email.service', () => mockEmailService);
jest.mock('../services/sms.service', () => mockSmsService);
jest.mock('../utils/idempotency', () => mockIdempotency);
jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const service = require('../services/projectFormPublicAccess.service');

const makeAccessDoc = (overrides = {}) => ({
  _id: 'access-doc-1',
  jti: 'access-jti-1',
  tokenType: 'public_form_access',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  projectFormId: 'form-doc-1',
  secureMode: 'otp',
  shareRef: 'share-ref-1',
  publicRef: 'public-ref-1',
  status: 'verified',
  expiresAt: new Date(Date.now() + 60 * 1000),
  consumedAt: null,
  submittedAt: null,
  selectedNodeId: null,
  metadata: {},
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeUserDoc = (overrides = {}) => ({
  _id: 'user-1',
  tenantId: 'tenant-1',
  firstname: 'Ada',
  lastname: 'Lovelace',
  email: 'ada@example.com',
  phoneNumber: '+2348000000000',
  status: true,
  deletedAt: null,
  toObject() {
    return { ...this };
  },
  ...overrides,
});

const makeNodeQuery = (result) => ({
  populate: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(result),
});

describe('projectFormPublicAccess.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJwt.verify.mockReturnValue({
      typ: 'public_form_access',
      jti: 'access-jti-1',
      sub: 'user-1',
      accessContextType: 'identity',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      projectFormId: 'form-doc-1',
      publicRef: 'public-ref-1',
      shareRef: 'share-ref-1',
    });
    mockProjectFormService.incrementProjectSubmissions.mockResolvedValue(undefined);
    mockPublicFormAccess.create.mockResolvedValue(undefined);
    mockPublicFormAccess.updateMany.mockResolvedValue(undefined);
    mockCounter.getNextSequence.mockResolvedValue(42);
    mockEmailService.sendOtpEmail.mockResolvedValue(undefined);
    mockEmailService.sendSabyEmail.mockResolvedValue(undefined);
    mockSmsService.sendOtpSms.mockResolvedValue(undefined);
    mockPostgresPool.query.mockResolvedValue({ rows: [] });
    mockUser.findOne.mockResolvedValue(makeUserDoc());
    mockProjectForm.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'form-doc-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        shareRef: 'share-ref-1',
        schemaVersion: '2.0.0',
        capabilities: {
          experience: {
            security: {
              publicSecureMode: 'otp',
              access: {
                whoCanAccess: 'authenticated_users',
              },
            },
          },
        },
      }),
    });
    mockProjectFormService.getPublicProjectFormByReference.mockResolvedValue({
      projectForm: {
        _id: 'form-doc-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        shareRef: 'share-ref-1',
        shareCode: 'share-001',
        schemaVersion: '2.0.0',
        capabilities: {
          experience: {
            security: {
              publicSecureMode: 'otp',
              access: {
                whoCanAccess: 'authenticated_users',
                allowedRoles: [],
                allowedUsers: [],
                restrictByLocation: false,
              },
              authentication: {
                requireLogin: true,
                allowAnonymous: false,
              },
            },
          },
        },
      },
      canonicalRef: 'share-ref-1',
      resolvedBy: 'shareRef',
    });
  });

  test('consumeAccessLink returns access context for verified token without mutating token state', async () => {
    const accessDoc = makeAccessDoc({ status: 'verified' });
    mockPublicFormAccess.findOne.mockResolvedValue(accessDoc);
    mockUser.findById.mockResolvedValue(makeUserDoc());
    mockNodes.find.mockReturnValue(
      makeNodeQuery([{ _id: 'node-1', nodeId: 'ND-001', name: 'HQ', level: null, parent: null }])
    );

    const result = await service.consumeAccessLink({ accessToken: 'token-1' });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        accessContext: expect.objectContaining({
          tenantId: 'tenant-1',
          projectId: 'project-1',
          status: 'verified',
          autoNodeId: 'node-1',
        }),
      })
    );
    expect(accessDoc.save).not.toHaveBeenCalled();
  });

  test('submitWithAccess atomically claims verified token and stores submission receipt', async () => {
    const accessDoc = makeAccessDoc({ status: 'verified' });
    const claimedDoc = makeAccessDoc({
      status: 'submitting',
      consumedAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: { submissionClaimedAt: '2026-01-01T00:00:00.000Z' },
    });
    mockPublicFormAccess.findOne.mockResolvedValue(accessDoc);
    mockPublicFormAccess.findOneAndUpdate.mockResolvedValue(claimedDoc);
    mockUser.findById.mockResolvedValue(makeUserDoc());
    mockProjectForm.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'form-doc-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        formId: 'form-001',
        formReference: 'ref-001',
        identity: { name: 'Profile Form', tags: ['user'] },
        metadata: { formCategory: 'standard' },
        capabilities: {},
      }),
    });
    mockNodes.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: 'node-1', nodeId: 'ND-001', name: 'HQ' }),
    });
    mockSubmissionService.queueSubmission.mockResolvedValue({
      jobId: 'job-123',
      status: 'queued',
    });

    const result = await service.submitWithAccess({
      accessToken: 'token-1',
      nodeId: 'node-1',
      submissionData: { field_1: 'value' },
      submittedAt: '2026-06-07T19:42:42.000Z',
      metadata: { source: 'test' },
    });

    expect(mockPublicFormAccess.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'access-doc-1',
        status: { $in: ['verified', 'consumed'] },
        submittedAt: null,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'submitting',
        }),
      }),
      { new: true }
    );
    expect(mockSubmissionService.queueSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        nodeId: 'node-1',
        userId: 'user-1',
        source: 'public_secure_qr',
      })
    );
    expect(claimedDoc.save).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        status: 'queued',
        jobId: 'job-123',
      })
    );
  });

  test('submitWithAccess returns prior receipt when token was already submitted', async () => {
    const accessDoc = makeAccessDoc({
      status: 'submitted',
      submittedAt: new Date('2026-06-07T19:42:42.000Z'),
      selectedNodeId: 'node-1',
      metadata: {
        submissionJobId: 'job-123',
        submissionStatus: 'queued',
      },
    });
    mockPublicFormAccess.findOne.mockResolvedValue(accessDoc);

    const result = await service.submitWithAccess({
      accessToken: 'token-1',
      nodeId: 'node-1',
      submissionData: { field_1: 'value' },
    });

    expect(result).toEqual({
      success: true,
      alreadySubmitted: true,
      status: 'queued',
      jobId: 'job-123',
      projectId: 'project-1',
      submittedAt: accessDoc.submittedAt,
      node: {
        id: 'node-1',
        nodeId: null,
        name: '',
      },
    });
  });

  test('requestFieldVerificationCode creates a shared OTP challenge for field verification', async () => {
    mockProjectForm.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'form-doc-1',
        formId: 'form-001',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        shareRef: 'share-ref-1',
        shareCode: 'share-001',
        schemaVersion: '2.0.0',
        capabilities: {
          experience: {
            security: {
              publicSecureMode: 'otp',
            },
          },
        },
      }),
    });

    const result = await service.requestFieldVerificationCode({
      formId: 'form-doc-1',
      fieldKey: 'membership_phone',
      channel: 'phone',
      identifier: '+2348012345678',
    });

    expect(mockPublicFormAccess.updateMany).toHaveBeenCalled();
    expect(mockSmsService.sendOtpSms).toHaveBeenCalled();
    expect(mockPublicFormAccess.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'public_form_otp',
        challengeChannel: 'phone',
        identifierType: 'phone',
        identifier: '+2348012345678',
        metadata: expect.objectContaining({
          kind: 'field_verification',
          fieldKey: 'membership_phone',
          verified: false,
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        channel: 'phone',
        fieldKey: 'membership_phone',
      })
    );
  });

  test('verifyFieldVerificationCode marks field challenge as verified', async () => {
    const challengeDoc = {
      _id: 'challenge-doc-1',
      jti: 'challenge-jti-1',
      tokenType: 'public_form_otp',
      challengeChannel: 'email',
      identifierType: 'email',
      identifier: 'user@example.com',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      status: 'issued',
      expiresAt: new Date(Date.now() + 60 * 1000),
      otpHash: 'expected-hash',
      otpAttempts: 0,
      otpMaxAttempts: 5,
      metadata: {
        kind: 'field_verification',
        fieldKey: 'membership_email',
      },
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockPublicFormAccess.findOne.mockResolvedValue(challengeDoc);

    const crypto = require('crypto');
    challengeDoc.otpHash = crypto
      .createHash('sha256')
      .update('test-secret:challenge-jti-1:123456')
      .digest('hex');

    const result = await service.verifyFieldVerificationCode({
      challengeId: 'challenge-jti-1',
      otp: '123456',
    });

    expect(challengeDoc.save).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        verified: true,
        fieldKey: 'membership_email',
      })
    );
  });

  test('generateFormFieldId returns backend-owned unique formatted values', async () => {
    mockProjectForm.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'form-doc-1',
        formId: 'form-001',
        tenantId: 'tenant-1',
        projectId: 'project-1',
      }),
    });

    const result = await service.generateFormFieldId({
      formId: 'form-doc-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      fieldKey: 'membership_id',
      prefix: 'MEM',
      separator: '-',
      length: 6,
    });

    expect(mockCounter.getNextSequence).toHaveBeenCalledWith(
      'membership:tenant-1:project-1:form-doc-1:membership_id'
    );
    expect(result).toEqual({
      success: true,
      formId: 'form-doc-1',
      fieldKey: 'membership_id',
      value: 'MEM-000042',
      sequence: 42,
    });
  });

  test('requestAccessCode rejects link-only secure forms', async () => {
    mockProjectFormService.getPublicProjectFormByReference.mockResolvedValue({
      projectForm: {
        _id: 'form-doc-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        shareRef: 'share-ref-1',
        shareCode: 'share-001',
        schemaVersion: '2.0.0',
        capabilities: {
          experience: {
            security: {
              publicSecureMode: 'link_only',
              access: {
                whoCanAccess: 'authenticated_users',
                allowedRoles: [],
                allowedUsers: [],
                restrictByLocation: false,
              },
              authentication: {
                requireLogin: true,
                allowAnonymous: false,
              },
            },
          },
        },
      },
      canonicalRef: 'share-ref-1',
      resolvedBy: 'shareRef',
    });

    await expect(
      service.requestAccessCode({
        reference: 'share-ref-1',
        channel: 'email',
        identifier: 'ada@example.com',
      })
    ).rejects.toMatchObject({
      message:
        'This secure form uses a different public access gate and cannot send OTP codes.',
    });
  });

  test('verifyAccessGateCode accepts configured access code and issues anonymous secure session', async () => {
    mockProjectFormService.getPublicProjectFormByReference.mockResolvedValue({
      projectForm: {
        _id: 'form-doc-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        shareRef: 'share-ref-1',
        shareCode: 'share-001',
        schemaVersion: '2.0.0',
        capabilities: {
          experience: {
            security: {
              publicSecureMode: 'access_code',
              access: {
                whoCanAccess: 'anyone',
                allowedRoles: [],
                allowedUsers: [],
                restrictByLocation: false,
              },
              accessCode: {
                code: 'MEMBER24',
                hint: 'Provided by admin',
                maxAttempts: 4,
                lockoutMinutes: 10,
              },
            },
          },
        },
      },
      canonicalRef: 'share-ref-1',
      resolvedBy: 'shareRef',
    });
    mockPublicFormAccess.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        makeAccessDoc({
          identifierType: 'access_code',
          identifier: 'access_code',
          userId: null,
          status: 'verified',
          metadata: {
            accessMethod: 'access_code',
            accessContextType: 'anonymous',
          },
        })
      );
    mockJwt.verify.mockReturnValueOnce({
      typ: 'public_form_access',
      jti: 'access-jti-1',
      accessContextType: 'anonymous',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      projectFormId: 'form-doc-1',
      publicRef: 'public-ref-1',
      shareRef: 'share-ref-1',
    });

    const result = await service.verifyAccessGateCode({
      reference: 'share-ref-1',
      accessCode: 'member24',
      requestContext: {
        ip: '127.0.0.1',
      },
    });

    expect(mockPublicFormAccess.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenType: 'public_form_access',
        identifierType: 'access_code',
        identifier: 'access_code',
        userId: null,
        metadata: expect.objectContaining({
          accessMethod: 'access_code',
          accessContextType: 'anonymous',
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        accessToken: expect.any(String),
        nodes: [],
        user: null,
      })
    );
  });

  test('consumeAccessLink revokes stale sessions when the form security mode changes', async () => {
    const accessDoc = makeAccessDoc({
      secureMode: 'access_code',
      identifierType: 'access_code',
      identifier: 'access_code',
      userId: null,
      status: 'verified',
      metadata: {
        accessMethod: 'access_code',
        accessContextType: 'anonymous',
      },
    });
    mockPublicFormAccess.findOne.mockResolvedValue(accessDoc);
    mockProjectForm.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'form-doc-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        shareRef: 'share-ref-1',
        schemaVersion: '2.0.0',
        capabilities: {
          experience: {
            security: {
              publicSecureMode: 'otp',
              access: {
                whoCanAccess: 'authenticated_users',
              },
            },
          },
        },
      }),
    });
    mockJwt.verify.mockReturnValueOnce({
      typ: 'public_form_access',
      jti: 'access-jti-1',
      accessContextType: 'anonymous',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      projectFormId: 'form-doc-1',
      publicRef: 'public-ref-1',
      shareRef: 'share-ref-1',
    });

    await expect(
      service.consumeAccessLink({ accessToken: 'token-1' })
    ).rejects.toMatchObject({
      message: 'This secure session is no longer valid. Please authenticate again.',
    });

    expect(accessDoc.status).toBe('revoked');
    expect(accessDoc.save).toHaveBeenCalled();
  });

  test('submitWithAccess queues anonymous access-code submissions without node binding', async () => {
    const accessDoc = makeAccessDoc({
      secureMode: 'access_code',
      identifierType: 'access_code',
      identifier: 'access_code',
      userId: null,
      status: 'verified',
      metadata: {
        accessMethod: 'access_code',
        accessContextType: 'anonymous',
      },
    });
    const claimedDoc = makeAccessDoc({
      secureMode: 'access_code',
      identifierType: 'access_code',
      identifier: 'access_code',
      userId: null,
      status: 'submitting',
      metadata: {
        accessMethod: 'access_code',
        accessContextType: 'anonymous',
        submissionClaimedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    mockPublicFormAccess.findOne.mockResolvedValue(accessDoc);
    mockPublicFormAccess.findOneAndUpdate.mockResolvedValue(claimedDoc);
    mockJwt.verify.mockReturnValueOnce({
      typ: 'public_form_access',
      jti: 'access-jti-1',
      accessContextType: 'anonymous',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      projectFormId: 'form-doc-1',
      publicRef: 'public-ref-1',
      shareRef: 'share-ref-1',
    });
    mockProjectForm.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'form-doc-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        formId: 'form-001',
        formReference: 'ref-001',
        identity: { name: 'Membership Form', tags: ['membership'] },
        metadata: { formCategory: 'standard' },
        capabilities: {
          experience: {
            security: {
              publicSecureMode: 'access_code',
              access: { whoCanAccess: 'anyone' },
            },
          },
        },
      }),
    });
    mockSubmissionService.queueSubmission.mockResolvedValue({
      jobId: 'job-321',
      status: 'queued',
    });

    const result = await service.submitWithAccess({
      accessToken: 'token-1',
      submissionData: { first_name: 'Ada' },
      metadata: { source: 'test' },
      requestContext: { ip: '127.0.0.1' },
    });

    expect(mockSubmissionService.queueSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: null,
        source: 'public_secure_access_code',
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        status: 'queued',
        jobId: 'job-321',
        node: null,
      })
    );
  });

  test('issueAccessLink rejects accounts outside selected secure users', async () => {
    mockProjectFormService.getPublicProjectFormByReference.mockResolvedValue({
      projectForm: {
        _id: 'form-doc-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        publicRef: 'public-ref-1',
        shareRef: 'share-ref-1',
        shareCode: 'share-001',
        schemaVersion: '2.0.0',
        capabilities: {
          experience: {
            security: {
              publicSecureMode: 'link_only',
              access: {
                whoCanAccess: 'selected_users',
                allowedRoles: [],
                allowedUsers: ['approved@example.com'],
                restrictByLocation: false,
              },
              authentication: {
                requireLogin: true,
                allowAnonymous: false,
              },
            },
          },
        },
      },
      canonicalRef: 'share-ref-1',
      resolvedBy: 'shareRef',
    });
    mockUser.findOne.mockResolvedValue(makeUserDoc({ email: 'denied@example.com' }));

    await expect(
      service.issueAccessLink({
        reference: 'share-ref-1',
        identifier: 'denied@example.com',
      })
    ).rejects.toMatchObject({
      message: 'This account is not permitted to access this secure form.',
    });
  });
});
