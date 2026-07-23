const express = require('express');
const request = require('supertest');

const mockProjectFormService = {
  getPublicProjectFormByReference: jest.fn(),
  getPublicProjectFormByShortCode: jest.fn(),
  buildPublicQrContext: jest.fn(),
  incrementProjectViews: jest.fn(),
  getProjectFormByProjectId: jest.fn(),
};

const mockProjectFormWorkspaceService = {
  assertWorkspaceAccess: jest.fn(),
};

const mockPublicAccessService = {
  issueAccessLink: jest.fn(),
  consumeAccessLink: jest.fn(),
  submitWithAccess: jest.fn(),
  verifyAccessGateCode: jest.fn(),
  getProjectPublicAccessMetrics: jest.fn(),
  requestFieldVerificationCode: jest.fn(),
  verifyFieldVerificationCode: jest.fn(),
  generateFormFieldId: jest.fn(),
};

jest.mock('../middlewares/auth', () => () => (req, res, next) => {
  req.user = { _id: 'user-1', tenantId: 'tenant-1' };
  next();
});

jest.mock('../middlewares/publicFormRateLimiter', () => ({
  publicFormReadLimiter: (req, res, next) => next(),
  publicFormSubmitLimiter: (req, res, next) => next(),
}));

jest.mock('../services', () => ({
  projectFormService: mockProjectFormService,
  projectFormWorkspaceService: mockProjectFormWorkspaceService,
}));

jest.mock('../services/projectFormPublicAccess.service', () => mockPublicAccessService);

jest.mock('../services/copilotEntityResolver.service', () => ({
  invalidateTenantEntityCaches: jest.fn().mockResolvedValue(undefined),
}));

const projectFormRouter = require('../routes/v1/projectForm.route');

const app = express();
app.use(express.json());
app.use('/v1/project-forms', projectFormRouter);

describe('project form public secure routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectFormWorkspaceService.assertWorkspaceAccess.mockResolvedValue(undefined);
  });

  test('GET /v1/project-forms/public/ref/:reference returns QR context contract', async () => {
    mockProjectFormService.getPublicProjectFormByReference.mockResolvedValue({
      form: {
        publicRef: 'frm_alpha-abcd1234',
        configuration: { projectName: 'Medical Consultation', security: 'public' },
      },
      canonicalRef: '471fc434-5ebe-4adb-ac8d-367a91eaebd0',
      legacyResolved: false,
      resolvedBy: 'shareRef',
      projectForm: {
        projectId: 'proj_medical-consultation-form-oez66l',
      },
    });
    mockProjectFormService.buildPublicQrContext.mockReturnValue({
      secureMode: 'single_qr_passwordless',
      requiresIdentityChallenge: true,
      qrContextToken: 'signed-token',
      qrContextExpiresAt: '2026-04-06T11:00:00.000Z',
      qrVersion: 'v1',
      schemaVersion: '1.0.0',
      schemaHash: 'abcd',
      pipelineTarget: 'postgres_unified',
    });
    mockProjectFormService.incrementProjectViews.mockResolvedValue(undefined);

    const res = await request(app).get(
      '/v1/project-forms/public/ref/471fc434-5ebe-4adb-ac8d-367a91eaebd0'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        canonicalRef: '471fc434-5ebe-4adb-ac8d-367a91eaebd0',
        secureMode: 'single_qr_passwordless',
        requiresIdentityChallenge: true,
        qrContextToken: 'signed-token',
        pipelineTarget: 'postgres_unified',
      })
    );
  });

  test('POST /v1/project-forms/public/access/request-link validates input', async () => {
    const res = await request(app)
      .post('/v1/project-forms/public/access/request-link')
      .send({ reference: '471fc434-5ebe-4adb-ac8d-367a91eaebd0' });

    expect(res.status).toBe(400);
    expect(mockPublicAccessService.issueAccessLink).not.toHaveBeenCalled();
  });

  test('POST /v1/project-forms/public/access/request-link requests secure link', async () => {
    mockPublicAccessService.issueAccessLink.mockResolvedValue({
      success: true,
      requiresIdentityChallenge: true,
      secureMode: 'single_qr_passwordless',
    });

    const body = {
      reference: '471fc434-5ebe-4adb-ac8d-367a91eaebd0',
      identifier: 'isreal@sotsm.org',
      qrContextToken: 'signed-qr-token',
    };

    const res = await request(app)
      .post('/v1/project-forms/public/access/request-link')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        secureMode: 'single_qr_passwordless',
      })
    );
    expect(mockPublicAccessService.issueAccessLink).toHaveBeenCalledWith({
      reference: body.reference,
      identifier: body.identifier,
      qrContextToken: body.qrContextToken,
    });
  });

  test('GET /v1/project-forms/public/access/consume-link returns node context', async () => {
    mockPublicAccessService.consumeAccessLink.mockResolvedValue({
      success: true,
      accessContext: {
        requiresNodeSelection: true,
      },
      nodes: [{ id: 'node-1', name: 'National Headquarters' }],
    });

    const res = await request(app).get(
      '/v1/project-forms/public/access/consume-link?accessToken=test-access-token'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
      })
    );
    expect(mockPublicAccessService.consumeAccessLink).toHaveBeenCalledWith({
      accessToken: 'test-access-token',
    });
  });

  test('POST /v1/project-forms/public/access/verify-access-code forwards access gate verification', async () => {
    mockPublicAccessService.verifyAccessGateCode.mockResolvedValue({
      success: true,
      accessToken: 'secure-token',
      nodes: [],
      user: null,
    });

    const body = {
      reference: '471fc434-5ebe-4adb-ac8d-367a91eaebd0',
      accessCode: 'MEMBER24',
      qrContextToken: 'signed-qr-token',
    };

    const res = await request(app)
      .post('/v1/project-forms/public/access/verify-access-code')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        accessToken: 'secure-token',
      })
    );
    expect(mockPublicAccessService.verifyAccessGateCode).toHaveBeenCalledWith({
      reference: body.reference,
      accessCode: body.accessCode,
      qrContextToken: body.qrContextToken,
      requestContext: {
        ip: expect.any(String),
        userAgent: null,
      },
    });
  });

  test('POST /v1/project-forms/public/access/submit forwards secure submit', async () => {
    mockPublicAccessService.submitWithAccess.mockResolvedValue({
      success: true,
      status: 'queued',
      jobId: 'job-001',
    });

    const body = {
      accessToken: 'test-access-token',
      nodeId: 'HLN-000EP',
      submissionData: {
        serviceType: 'consultation',
      },
      metadata: {
        source: 'public_secure_qr',
      },
    };

    const res = await request(app)
      .post('/v1/project-forms/public/access/submit')
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        status: 'queued',
      })
    );
    expect(mockPublicAccessService.submitWithAccess).toHaveBeenCalledWith({
      accessToken: body.accessToken,
      nodeId: body.nodeId,
      submissionData: body.submissionData,
      submittedAt: null,
      eventDate: null,
      submissionDate: null,
      month: null,
      year: null,
      metadata: body.metadata,
      requestContext: {
        ip: expect.any(String),
        userAgent: null,
      },
    });
  });

  test('POST /v1/project-forms/public/access/submit accepts optional reference in body', async () => {
    mockPublicAccessService.submitWithAccess.mockResolvedValue({
      success: true,
      status: 'completed',
      mode: 'system_direct_update',
      projectId: 'proj_user-profile-uknebs',
      systemTarget: 'user_profile',
      node: null,
      result: { updated: true },
    });

    const body = {
      accessToken: 'test-access-token',
      reference: 'frm_user-profile-iezfk6pa',
      submissionData: {
        firstname: 'Ada',
        lastname: 'Lovelace',
      },
      metadata: {
        source: 'public_secure_qr',
      },
    };

    const res = await request(app)
      .post('/v1/project-forms/public/access/submit')
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        mode: 'system_direct_update',
      })
    );
    expect(mockPublicAccessService.submitWithAccess).toHaveBeenCalledWith({
      accessToken: body.accessToken,
      nodeId: undefined,
      submissionData: body.submissionData,
      submittedAt: null,
      eventDate: null,
      submissionDate: null,
      month: null,
      year: null,
      metadata: body.metadata,
      requestContext: {
        ip: expect.any(String),
        userAgent: null,
      },
    });
  });

  test('POST /v1/project-forms/public/access/submit returns replay-safe prior receipt', async () => {
    mockPublicAccessService.submitWithAccess.mockResolvedValue({
      success: true,
      alreadySubmitted: true,
      status: 'queued',
      jobId: 'job-001',
      projectId: 'proj_medical-consultation-form-oez66l',
      submittedAt: '2026-06-07T19:42:42.497Z',
      node: {
        id: 'node-1',
        nodeId: null,
        name: '',
      },
    });

    const res = await request(app)
      .post('/v1/project-forms/public/access/submit')
      .send({
        accessToken: 'test-access-token',
        nodeId: 'HLN-000EP',
        submissionData: {
          serviceType: 'consultation',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        alreadySubmitted: true,
        jobId: 'job-001',
      })
    );
  });

  test('POST /v1/project-forms/public/access/submit returns processing state for concurrent duplicate', async () => {
    mockPublicAccessService.submitWithAccess.mockResolvedValue({
      success: true,
      processing: true,
      status: 'submitting',
      jobId: 'job-001',
      projectId: 'proj_medical-consultation-form-oez66l',
      submittedAt: null,
      node: null,
    });

    const res = await request(app)
      .post('/v1/project-forms/public/access/submit')
      .send({
        accessToken: 'test-access-token',
        submissionData: {
          serviceType: 'consultation',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        processing: true,
        status: 'submitting',
      })
    );
  });

  test('POST /v1/project-forms/verification/phone/send-otp uses shared field verification service', async () => {
    mockPublicAccessService.requestFieldVerificationCode.mockResolvedValue({
      success: true,
      challengeId: 'challenge-1',
      channel: 'phone',
      fieldKey: 'membership_phone',
    });

    const res = await request(app)
      .post('/v1/project-forms/verification/phone/send-otp')
      .send({
        formId: 'form-001',
        fieldKey: 'membership_phone',
        channel: 'phone',
        identifier: '+2348012345678',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        challengeId: 'challenge-1',
      })
    );
    expect(mockPublicAccessService.requestFieldVerificationCode).toHaveBeenCalledWith({
      formId: 'form-001',
      fieldKey: 'membership_phone',
      channel: 'phone',
      identifier: '+2348012345678',
      submissionId: null,
      accessToken: null,
    });
  });

  test('POST /v1/project-forms/verification/email/verify-otp verifies field OTP', async () => {
    mockPublicAccessService.verifyFieldVerificationCode.mockResolvedValue({
      success: true,
      verified: true,
      fieldKey: 'membership_email',
      challengeId: 'challenge-1',
    });

    const res = await request(app)
      .post('/v1/project-forms/verification/email/verify-otp')
      .send({
        challengeId: 'challenge-1',
        otp: '123456',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        verified: true,
      })
    );
    expect(mockPublicAccessService.verifyFieldVerificationCode).toHaveBeenCalledWith({
      challengeId: 'challenge-1',
      otp: '123456',
    });
  });

  test('POST /v1/project-forms/:formId/generate-id returns backend-generated membership IDs', async () => {
    mockPublicAccessService.generateFormFieldId.mockResolvedValue({
      success: true,
      formId: 'form-001',
      fieldKey: 'membership_id',
      value: 'MEM-000042',
      sequence: 42,
    });

    const res = await request(app)
      .post('/v1/project-forms/form-001/generate-id')
      .send({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        fieldKey: 'membership_id',
        prefix: 'MEM',
        separator: '-',
        length: 6,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        value: 'MEM-000042',
      })
    );
    expect(mockPublicAccessService.generateFormFieldId).toHaveBeenCalledWith({
      formId: 'form-001',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      fieldKey: 'membership_id',
      prefix: 'MEM',
      separator: '-',
      length: 6,
    });
  });

  test('GET /v1/project-forms/project/:projectId/public-access-metrics returns metrics', async () => {
    mockProjectFormService.getProjectFormByProjectId.mockResolvedValue({
      projectId: 'proj_medical',
      tenantId: 'tenant-1',
      workspaceId: 'ws_default',
    });
    mockPublicAccessService.getProjectPublicAccessMetrics.mockResolvedValue({
      linkRequests: 4,
      linksConsumed: 3,
      submitSuccess: 2,
      submitFailed: 1,
      replayFailures: 0,
    });

    const res = await request(app).get(
      '/v1/project-forms/project/proj_medical/public-access-metrics?windowHours=12'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        linkRequests: 4,
        linksConsumed: 3,
      })
    );
    expect(
      mockPublicAccessService.getProjectPublicAccessMetrics
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      projectId: 'proj_medical',
      recentWindowHours: 12,
    });
    expect(mockProjectFormWorkspaceService.assertWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        workspaceId: 'ws_default',
        userId: 'user-1',
      })
    );
  });
});
