const mockProjectFormService = {
  createProjectForm: jest.fn(),
  publishProjectForm: jest.fn(),
  getProjectSchemaProfile: jest.fn(),
};

jest.mock('../services/projectForm.service', () => mockProjectFormService);

const wizardService = require('../services/copilotProjectWizard.service');

describe('copilotProjectWizard.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('generates draft from prompt with inferred fields', async () => {
    const result = await wizardService.generateProjectWizardDraft({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      prompt: 'create a payment collection module fields: payer name, amount, payment method, transaction date',
      options: { capabilities: { experience: { workflow: { enabled: true } } } },
    });

    expect(result.summary.inferredDomain).toBe('finance');
    expect(result.draft.identity.name).toBeTruthy();
    expect(Array.isArray(result.draft.elements)).toBe(true);
    expect(result.draft.elements.length).toBeGreaterThan(3);
    expect(result.draft.capabilities.experience.workflow.workflows.length).toBeGreaterThan(0);
  });

  test('finalizes draft and publishes when requested', async () => {
    const draft = {
      identity: {
        name: 'Finance Module',
        description: '',
        category: 'standard',
        tags: ['financial'],
        status: 'draft',
      },
      elements: [
        { id: 'payer_name_01', type: 'text', properties: { label: 'Payer Name' } },
      ],
      layout: {
        style: 'default',
        wizardMode: true,
        grid: { columns: 12, columnSpans: {} },
        builder: {},
      },
      capabilities: {
        experience: {
          security: {
            mode: 'private',
            publicSecureMode: 'off',
            access: {},
            authentication: { requireLogin: true, allowAnonymous: false, requireOtp: false },
            submissionProtection: {
              preventDuplicateSubmission: false,
              duplicateCheckField: null,
              rateLimitEnabled: false,
              maxSubmissionsPerUser: null,
            },
            channels: ['api'],
          },
          behavior: {},
          distribution: {},
          notifications: {},
          compliance: { enabled: false },
          workflow: { enabled: false, approvalMode: 'none', triggerOn: 'submission', workflows: [] },
        },
        transaction: { payment: {}, remittance: {}, invoice: {} },
        automation: { rules: [], connectedActions: [], operationalVisibility: {} },
      },
      smartMappings: { enabled: true, autoDetect: true, allowManualOverride: true, fields: {} },
      analytics: { profile: {} },
      ui: {},
      metadata: {
        schemaVersion: '2.0.0',
        elementsCount: 1,
        hasValidation: true,
        batchMode: 'single_prompt',
        integrations: ['api'],
        enabledCapabilities: [],
      },
    };

    mockProjectFormService.createProjectForm.mockResolvedValue({
      _id: 'mongo-id-1',
      projectId: 'proj_finance-k3k9h2',
      status: 'inactive',
      metadata: { deploymentStatus: 'draft' },
      configuration: { projectName: 'Finance Module' },
    });
    mockProjectFormService.publishProjectForm.mockResolvedValue({
      _id: 'mongo-id-1',
      projectId: 'proj_finance-k3k9h2',
      status: 'active',
      metadata: { deploymentStatus: 'published' },
      configuration: { projectName: 'Finance Module' },
    });
    mockProjectFormService.getProjectSchemaProfile.mockResolvedValue({
      projectId: 'proj_finance-k3k9h2',
      formFieldCount: 1,
    });

    const result = await wizardService.finalizeProjectWizardDraft({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      draft,
      publish: true,
      publishOptions: {},
    });

    expect(mockProjectFormService.createProjectForm).toHaveBeenCalled();
    expect(mockProjectFormService.publishProjectForm).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        projectId: 'proj_finance-k3k9h2',
        published: true,
      })
    );
  });
});
