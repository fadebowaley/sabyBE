const mockWorkspaceService = {
  DEFAULT_WORKSPACE_ID: 'workspace-default',
};

jest.mock('../models', () => ({
  ProjectForm: {},
  StorageFolder: {},
  User: {},
  Role: {},
  Nodes: {},
}));

jest.mock('../config/postgres', () => ({
  postgresPool: {
    query: jest.fn(),
  },
}));

jest.mock('../config/config', () => ({
  publicForm: {
    qrContextSecret: 'test-secret',
  },
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../services/fieldCatalog.service', () => ({}));
jest.mock('../services/user.service', () => ({}));
jest.mock('../services/node.service', () => ({}));
jest.mock('../services/projectFormWorkspace.service', () => mockWorkspaceService);

const projectFormService = require('../services/projectForm.service');

describe('projectForm.service normalizeProjectFormRuntimeConfig security matrix', () => {
  test('defaults missing security configuration to open access', () => {
    const result = projectFormService.normalizeProjectFormRuntimeConfig({
      identity: {
        name: 'New Form',
        category: 'standard',
        tags: [],
        status: 'draft',
      },
      capabilities: {
        experience: {},
      },
    });

    expect(result.capabilities.experience.security.enabled).toBe(false);
    expect(result.capabilities.experience.security.audience).toBe('public');
    expect(result.capabilities.experience.security.publicSecureMode).toBe('off');
    expect(result.capabilities.experience.security.authentication).toEqual({
      method: 'none',
      requireLogin: false,
      allowAnonymous: true,
      requireOtp: false,
    });
  });

  test('forces OTP for authenticated audiences', () => {
    const result = projectFormService.normalizeProjectFormRuntimeConfig({
      identity: {
        name: 'Secure Form',
        category: 'standard',
        tags: [],
        status: 'published',
      },
      capabilities: {
        experience: {
          security: {
            mode: 'public',
            publicSecureMode: 'off',
            access: {
              whoCanAccess: 'authenticated_users',
            },
          },
        },
      },
    });

    expect(result.capabilities.experience.security.publicSecureMode).toBe('otp');
    expect(result.capabilities.experience.security.authentication).toEqual({
      method: 'otp',
      requireLogin: true,
      allowAnonymous: false,
      requireOtp: true,
    });
  });

  test('normalizes access-code forms to public access and clears role/user gates', () => {
    const result = projectFormService.normalizeProjectFormRuntimeConfig({
      identity: {
        name: 'Role Locked Form',
        category: 'standard',
        tags: [],
        status: 'published',
      },
      capabilities: {
        experience: {
          security: {
            mode: 'restricted',
            publicSecureMode: 'access_code',
            access: {
              whoCanAccess: 'selected_roles',
              allowedRoles: ['admin', 'owner'],
              allowedUsers: ['ada@example.com'],
            },
          },
        },
      },
    });

    expect(result.capabilities.experience.security.audience).toBe('public');
    expect(result.capabilities.experience.security.publicSecureMode).toBe('access_code');
    expect(result.capabilities.experience.security.access.whoCanAccess).toBe('anyone');
    expect(result.capabilities.experience.security.access.allowedRoles).toEqual([]);
    expect(result.capabilities.experience.security.access.allowedUsers).toEqual([]);
    expect(result.capabilities.experience.security.authentication).toEqual({
      method: 'access_code',
      requireLogin: false,
      allowAnonymous: true,
      requireOtp: false,
    });
  });

  test('keeps open public forms anonymous', () => {
    const result = projectFormService.normalizeProjectFormRuntimeConfig({
      identity: {
        name: 'Open Form',
        category: 'standard',
        tags: [],
        status: 'published',
      },
      capabilities: {
        experience: {
          security: {
            mode: 'public',
            publicSecureMode: 'off',
            access: {
              whoCanAccess: 'anyone',
            },
          },
        },
      },
    });

    expect(result.capabilities.experience.security.publicSecureMode).toBe('off');
    expect(result.capabilities.experience.security.authentication).toEqual({
      method: 'none',
      requireLogin: false,
      allowAnonymous: true,
      requireOtp: false,
    });
  });

  test('keeps access-code forms anonymous and provisions the access code config', () => {
    const result = projectFormService.normalizeProjectFormRuntimeConfig({
      identity: {
        name: 'Access Code Form',
        category: 'standard',
        tags: [],
        status: 'published',
      },
      capabilities: {
        experience: {
          security: {
            mode: 'public',
            publicSecureMode: 'access_code',
            access: {
              whoCanAccess: 'anyone',
            },
            accessCode: {
              code: ' member24 ',
              hint: 'Ask the organizer',
              maxAttempts: 4,
              lockoutMinutes: 30,
            },
          },
        },
      },
    });

    expect(result.capabilities.experience.security.publicSecureMode).toBe('access_code');
    expect(result.capabilities.experience.security.authentication).toEqual({
      method: 'access_code',
      requireLogin: false,
      allowAnonymous: true,
      requireOtp: false,
    });
    expect(result.capabilities.experience.security.accessCode).toEqual({
      code: 'MEMBER24',
      hint: 'Ask the organizer',
      maxAttempts: 4,
      lockoutMinutes: 30,
    });
  });
});

describe('projectForm.service normalizeProjectFormRuntimeConfig workflow normalization', () => {
  test('derives root workflow trigger from the primary workflow and normalizes assignee roles', () => {
    const result = projectFormService.normalizeProjectFormRuntimeConfig({
      identity: {
        name: 'Workflow Form',
        category: 'standard',
        tags: [],
        status: 'published',
      },
      capabilities: {
        experience: {
          workflow: {
            enabled: true,
            approvalMode: 'custom',
            triggerOn: 'manual',
            workflows: [
              {
                id: 'workflow-1',
                name: 'Primary workflow',
                enabled: true,
                triggerOn: 'submit',
                steps: [
                  {
                    id: 'step-1',
                    name: 'Approval',
                    actionType: 'APPROVE',
                    assigneeRole: 'ops_manager',
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(result.capabilities.experience.workflow.triggerOn).toBe('submission');
    expect(result.capabilities.experience.workflow.workflows[0].triggerOn).toBe('submission');
    expect(result.capabilities.experience.workflow.workflows[0].steps[0].assigneeRole).toBe(
      'ops_manager'
    );
    expect(result.capabilities.experience.workflow.workflows[0].steps[0].assigneeRoles).toEqual([
      'ops_manager',
    ]);
  });
});
