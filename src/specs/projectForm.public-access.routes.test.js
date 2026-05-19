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
  getProjectPublicAccessMetrics: jest.fn(),
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
      metadata: body.metadata,
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
