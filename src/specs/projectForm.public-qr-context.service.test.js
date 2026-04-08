const jwt = require('jsonwebtoken');
const config = require('../config/config');
const projectFormService = require('../services/projectForm.service');

describe('projectFormService.buildPublicQrContext', () => {
  test('returns signed QR context contract with secure mode metadata', () => {
    const projectForm = {
      _id: '67f1f6f8d8f53a7c8f8a1201',
      tenantId: 'tenant-alpha',
      projectId: 'proj_alpha-report-1',
      publicRef: 'frm_alpha-report-ab12cd34',
      shareRef: '471fc434-5ebe-4adb-ac8d-367a91eaebd0',
      shareCode: 'fqiyFQHL',
      status: 'active',
      configuration: {
        security: 'public',
        publicSecureMode: 'single_qr_passwordless',
      },
      metadata: {
        deploymentStatus: 'published',
        version: '2.1.0',
      },
      updatedAt: new Date('2026-04-06T10:00:00.000Z'),
      elements: [
        { id: 'field_1', type: 'text', properties: { label: 'Name' } },
      ],
    };

    const context = projectFormService.buildPublicQrContext(projectForm, {
      resolvedBy: 'shareCode',
    });

    expect(context.secureMode).toBe('single_qr_passwordless');
    expect(context.requiresIdentityChallenge).toBe(true);
    expect(context.pipelineTarget).toBe('postgres_unified');
    expect(context.schemaVersion).toBe('2.1.0');
    expect(context.qrContextToken).toBeTruthy();
    expect(context.schemaHash).toMatch(/^[a-f0-9]{64}$/);

    const decoded = jwt.verify(
      context.qrContextToken,
      config.publicForm.qrContextSecret,
      {
        algorithms: ['HS256'],
        issuer: 'saby-public-form',
        audience: 'saby-public-form-entry',
      }
    );

    expect(decoded.typ).toBe('public_qr_context');
    expect(decoded.tenantId).toBe('tenant-alpha');
    expect(decoded.projectId).toBe('proj_alpha-report-1');
    expect(decoded.shareCode).toBe('fqiyFQHL');
    expect(decoded.publicSecureMode).toBe('single_qr_passwordless');
    expect(decoded.pipelineTarget).toBe('postgres_unified');
    expect(decoded.resolvedBy).toBe('shareCode');
  });
});
