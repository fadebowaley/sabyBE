const mockTenantKnowledgeArtifact = {
  findOne: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  updateMany: jest.fn(),
};
const mockExecutiveIntelligenceAuditEvent = {
  create: jest.fn(),
  find: jest.fn(),
};
const mockProjectForm = { find: jest.fn() };
const mockUser = { find: jest.fn() };
const mockRole = { find: jest.fn() };
const mockPermission = { find: jest.fn() };
const mockNodes = { find: jest.fn() };
const mockLevel = { find: jest.fn() };
const mockStructures = { find: jest.fn() };
const mockTenantConfig = { find: jest.fn() };
const mockWorkspaceInvitation = { find: jest.fn() };
const mockTenantOnboarding = { findOne: jest.fn() };
const mockExecutiveSemanticMemory = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
};
const mockSubmissionReportService = {
  getModuleReportTable: jest.fn(),
  getModuleReportAggregation: jest.fn(),
  getModuleReportTrend: jest.fn(),
  getModuleReportPeriodComparison: jest.fn(),
};
const mockExecutiveReportExportService = {
  persistRenderedReportExports: jest.fn(),
  getExportDownload: jest.fn(),
};
const mockExecutiveGeneratedSqlExecutor = {
  executeGeneratedSql: jest.fn(),
  getGeneratedSqlExecutionCapabilities: jest.fn(),
};
const mockExecutiveSandboxRunner = {
  requestSandboxExecution: jest.fn(),
  getSandboxCapabilities: jest.fn(),
};

jest.mock('../models/tenantKnowledgeArtifact.model', () => mockTenantKnowledgeArtifact);
jest.mock('../models/executiveIntelligenceAuditEvent.model', () => mockExecutiveIntelligenceAuditEvent);
jest.mock('../models/projectForm.model', () => mockProjectForm);
jest.mock('../models/user.model', () => mockUser);
jest.mock('../models/role.model', () => mockRole);
jest.mock('../models/permission.model', () => mockPermission);
jest.mock('../models/node.model', () => mockNodes);
jest.mock('../models/level.model', () => mockLevel);
jest.mock('../models/structure.model', () => mockStructures);
jest.mock('../models/tenantConfig.model', () => mockTenantConfig);
jest.mock('../models/workspaceInvitation.model', () => mockWorkspaceInvitation);
jest.mock('../models/tenantOnboarding.model', () => mockTenantOnboarding);
jest.mock('../models/executiveSemanticMemory.model', () => mockExecutiveSemanticMemory);
jest.mock('../services/submissionReport.service', () => mockSubmissionReportService);
jest.mock('../services/executiveReportExport.service', () => mockExecutiveReportExportService);
jest.mock('../services/executiveGeneratedSqlExecutor.service', () => mockExecutiveGeneratedSqlExecutor);
jest.mock('../services/executiveSandboxRunner.service', () => mockExecutiveSandboxRunner);

const executiveIntelligenceService = require('../services/executiveIntelligence.service');

const findChain = (result) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(result),
  })),
});

const latestArtifactChain = (result) => ({
  sort: jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(result),
    })),
  })),
});

const activeArtifactChain = (result) => ({
  sort: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(result),
  })),
});

const sourceData = () => ({
  forms: [
    {
      _id: 'form-doc-1',
      tenantId: 'tenant-1',
      projectId: 'project-sales',
      formId: 'form-sales',
      workspaceId: 'workspace-main',
      status: 'active',
      identity: {
        name: 'Monthly Sales',
        description: 'Sales submitted by branches',
        category: 'operations',
      },
      capabilities: {
        experience: {
          security: {
            enabled: true,
            mode: 'restricted',
            audience: 'selected_roles',
            profile: 'restricted_team',
            publicSecureMode: 'otp',
            access: {
              allowedRoles: ['role-owner'],
              allowedUsers: ['user-owner'],
              requireNodeAccess: true,
            },
            authentication: {
              requireLogin: true,
              method: 'otp',
            },
          },
          workflow: {
            enabled: true,
            steps: [{ name: 'Review' }],
          },
        },
        transaction: {
          payment: { enabled: false },
        },
      },
      analytics: {
        profile: {
          domain: 'sales',
          primaryTimeField: 'submitted_at',
        },
      },
      elements: [
        {
          id: 'amount',
          type: 'number',
          required: true,
          properties: {
            label: 'Amount',
            numberType: 'currency',
          },
        },
        {
          id: 'branch',
          type: 'text',
          required: true,
          properties: {
            label: 'Branch',
          },
        },
        {
          id: 'submitted_at',
          type: 'date',
          required: false,
          properties: {
            label: 'Submitted at',
          },
        },
      ],
      updatedAt: new Date('2026-07-17T10:00:00.000Z'),
      createdAt: new Date('2026-07-17T09:00:00.000Z'),
    },
  ],
  users: [
    {
      _id: 'user-owner',
      userId: 'HLU-OWNER',
      tenantId: 'tenant-1',
      email: 'owner@saby.test',
      firstname: 'Owner',
      lastname: 'User',
      roles: ['role-owner'],
      isOwner: true,
      isSuper: false,
      isAdmin: false,
      isSaby: false,
      status: true,
    },
    {
      _id: 'user-submit',
      userId: 'HLU-SUBMIT',
      tenantId: 'tenant-1',
      email: 'submitter@saby.test',
      firstname: 'Submitter',
      lastname: 'Only',
      roles: [],
      isOwner: false,
      isSuper: false,
      isAdmin: false,
      isSaby: false,
      status: true,
    },
  ],
  roles: [
    {
      _id: 'role-owner',
      tenantId: 'tenant-1',
      name: 'Owner',
      permissions: ['perm-workspace-read', 'perm-submission-read'],
      isActive: true,
    },
  ],
  permissions: [
    {
      _id: 'perm-workspace-read',
      name: 'workspace:read',
      resource: 'workspace',
      action: 'read',
      isWildcard: false,
      isAdminLevel: false,
    },
    {
      _id: 'perm-submission-read',
      name: 'submission:read',
      resource: 'submission',
      action: 'read',
      path: '/v1/submission-reports/module-table',
      method: 'GET',
      isWildcard: false,
      isAdminLevel: false,
    },
  ],
  levels: [
    {
      _id: 'level-region',
      tenantId: 'tenant-1',
      name: 'Region',
      rank: 1,
      isActive: true,
    },
  ],
  structures: [
    {
      _id: 'structure-region',
      tenantId: 'tenant-1',
      name: 'Region Structure',
      code: 'REG',
      level: 'level-region',
      type: 'region',
      parent: null,
      path: 'root/region',
      isActive: true,
    },
  ],
  nodes: [
    {
      _id: 'node-region-1',
      nodeId: 'HLN-REGION-1',
      tenantId: 'tenant-1',
      name: 'Region 1',
      parent: null,
      path: 'region-1',
      isMain: true,
      isActive: true,
      level: 'level-region',
      structure: 'structure-region',
      users: ['user-owner', 'user-submit'],
    },
  ],
  tenantConfigs: [
    {
      _id: 'config-1',
      tenantId: 'tenant-1',
      entityType: 'reporting',
      version: 3,
      fields: [{ key: 'currency', value: 'NGN' }],
    },
  ],
  acceptedInvitations: [],
  tenantOnboarding: {
    _id: 'onboarding-1',
    tenantId: 'tenant-1',
    ownerUserId: 'user-owner',
    workspaces: [
      {
        workspaceId: 'workspace-main',
        isDeleted: false,
        members: [{ userId: 'user-owner', role: 'owner', status: 'active' }],
      },
    ],
  },
});

const mockBuilderSources = ({ latest = null, semanticMemory = [] } = {}) => {
  const data = sourceData();
  mockTenantKnowledgeArtifact.findOne.mockReturnValue(latestArtifactChain(latest));
  mockProjectForm.find.mockReturnValue(findChain(data.forms));
  mockUser.find.mockReturnValue(findChain(data.users));
  mockRole.find.mockReturnValue(findChain(data.roles));
  mockPermission.find.mockReturnValue(findChain(data.permissions));
  mockNodes.find.mockReturnValue(findChain(data.nodes));
  mockLevel.find.mockReturnValue(findChain(data.levels));
  mockStructures.find.mockReturnValue(findChain(data.structures));
  mockTenantConfig.find.mockReturnValue(findChain(data.tenantConfigs));
  mockWorkspaceInvitation.find.mockReturnValue(findChain(data.acceptedInvitations));
  mockTenantOnboarding.findOne.mockReturnValue(findChain(data.tenantOnboarding));
  mockExecutiveSemanticMemory.find.mockReturnValue(findChain(semanticMemory));
  return data;
};

const activeArtifactRecord = (overrides = {}) => {
  const artifact = {
    tenant_id: 'tenant-1',
    artifact_version: 4,
    schema_version: '1.0',
    status: 'active',
    organization: {
      nodes: [
        {
          node_ref: 'node-region-1',
          node_id: 'HLN-REGION-1',
          tenant_id: 'tenant-1',
          name: 'Region 1',
          level_ref: 'level-region',
          structure_ref: 'structure-region',
          parent_node_ref: null,
          is_active: true,
        },
        {
          node_ref: 'node-branch-1',
          node_id: 'HLN-BRANCH-1',
          tenant_id: 'tenant-1',
          name: 'Branch 1',
          level_ref: 'level-branch',
          structure_ref: 'structure-region',
          parent_node_ref: 'node-region-1',
          is_active: true,
        },
        {
          node_ref: 'node-region-2',
          node_id: 'HLN-REGION-2',
          tenant_id: 'tenant-1',
          name: 'Region 2',
          level_ref: 'level-region',
          structure_ref: 'structure-region',
          parent_node_ref: null,
          is_active: true,
        },
      ],
      user_node_assignments: [
        {
          user_ref: 'user-owner',
          node_ref: 'node-region-1',
          tenant_id: 'tenant-1',
          assignment_source: 'Nodes.users',
          is_active: true,
        },
        {
          user_ref: 'user-submit',
          node_ref: 'node-region-1',
          tenant_id: 'tenant-1',
          assignment_source: 'Nodes.users',
          is_active: true,
        },
      ],
    },
    security: {
      users: [
        {
          user_ref: 'user-owner',
          user_id: 'HLU-OWNER',
          tenant_id: 'tenant-1',
          display_name: 'Owner User',
          email_hash: 'sha256:unused',
          access_profile: {
            workspace_actor: true,
            submitter: true,
            main_app_login_allowed: true,
            intelligence_allowed: true,
            submission_allowed: true,
          },
          flags: {
            is_owner: true,
            is_super: false,
            is_admin: false,
            is_saby: false,
          },
          role_refs: ['role-owner'],
          assigned_node_refs: ['node-region-1'],
        },
        {
          user_ref: 'user-submit',
          user_id: 'HLU-SUBMIT',
          tenant_id: 'tenant-1',
          display_name: 'Submitter Only',
          email_hash: 'sha256:unused',
          access_profile: {
            workspace_actor: false,
            submitter: true,
            main_app_login_allowed: false,
            intelligence_allowed: false,
            submission_allowed: true,
          },
          flags: {
            is_owner: false,
            is_super: false,
            is_admin: false,
            is_saby: false,
          },
          role_refs: [],
          assigned_node_refs: ['node-region-1'],
        },
        {
          user_ref: 'user-team',
          user_id: 'HLU-TEAM',
          tenant_id: 'tenant-1',
          display_name: 'Team Member',
          email_hash: 'sha256:unused',
          access_profile: {
            workspace_actor: true,
            submitter: true,
            main_app_login_allowed: true,
            intelligence_allowed: true,
            submission_allowed: true,
          },
          flags: {
            is_owner: false,
            is_super: false,
            is_admin: false,
            is_saby: false,
          },
          role_refs: [],
          assigned_node_refs: ['node-region-1'],
        },
      ],
      roles: [
        {
          role_ref: 'role-owner',
          tenant_id: 'tenant-1',
          name: 'Owner',
          is_active: true,
          permission_refs: ['perm-submission-read'],
        },
      ],
      permissions: [
        {
          permission_ref: 'perm-submission-read',
          name: 'submission:read',
          resource: 'submission',
          action: 'read',
          is_wildcard: false,
          is_admin_level: false,
        },
      ],
      user_roles: [
        {
          tenant_id: 'tenant-1',
          user_ref: 'user-owner',
          role_ref: 'role-owner',
          source: 'User.roles',
        },
      ],
      role_permissions: [
        {
          tenant_id: 'tenant-1',
          role_ref: 'role-owner',
          permission_ref: 'perm-submission-read',
          source: 'Role.permissions',
        },
      ],
    },
    projects: [
      {
        project_id: 'project-sales',
        tenant_id: 'tenant-1',
        workspace_id: 'workspace-main',
        name: 'Monthly Sales',
        status: 'active',
        scope: {
          primary_scope: 'tenant',
          tenant_id: 'tenant-1',
          workspace_id: 'workspace-main',
          access_model: 'restricted',
          audience: 'selected_roles',
          security_profile: 'restricted_team',
          public_access: false,
          secure_access: true,
          public_secure_mode: 'otp',
          node_restrictions: ['requester_assigned_nodes'],
          user_restrictions: ['user-owner'],
          role_restrictions: ['role-owner'],
          restriction_source: 'ProjectForm.capabilities.experience.security',
        },
        settings: {},
        dataset_ref: 'project_form:project-sales',
      },
    ],
    forms: [
      {
        project_id: 'project-sales',
        form_id: 'form-sales',
        tenant_id: 'tenant-1',
        workspace_id: 'workspace-main',
        name: 'Monthly Sales',
        status: 'active',
        scope: {
          primary_scope: 'tenant',
          tenant_id: 'tenant-1',
          workspace_id: 'workspace-main',
          node_restrictions: ['requester_assigned_nodes'],
          user_restrictions: ['user-owner'],
          role_restrictions: ['role-owner'],
        },
        dataset_ref: 'project_form:project-sales',
        project_intelligence_profile: {
          project_id: 'project-sales',
          profile_status: 'ready',
          default_measure_field_refs: ['project-sales:amount'],
          default_dimension_field_refs: ['project-sales:branch'],
          primary_time_field_ref: 'project-sales:submitted_at',
          status_field_refs: [],
          reporting_caveats: [],
        },
      },
    ],
    form_fields: [
      {
        field_ref: 'project-sales:amount',
        project_id: 'project-sales',
        field_id: 'amount',
        label: 'Amount',
        field_type: 'number',
        intelligence_role: 'measure',
        value_type: 'currency',
        allowed_operations: ['sum', 'avg', 'min', 'max', 'rank', 'trend'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: ['revenue', 'sales', 'expense'],
        semantic: { aliases: ['money collected'] },
      },
      {
        field_ref: 'project-sales:branch',
        project_id: 'project-sales',
        field_id: 'branch',
        label: 'Branch',
        field_type: 'text',
        intelligence_role: 'dimension',
        value_type: 'text',
        allowed_operations: ['count', 'count_distinct', 'filter', 'group'],
        allowed_as_filter: true,
        allowed_as_dimension: true,
        aliases: ['location'],
        semantic: {},
      },
      {
        field_ref: 'project-sales:submitted_at',
        project_id: 'project-sales',
        field_id: 'submitted_at',
        label: 'Submitted at',
        field_type: 'date',
        intelligence_role: 'time',
        value_type: 'date',
        allowed_operations: ['filter', 'trend', 'period_compare'],
        allowed_as_filter: true,
        allowed_as_dimension: true,
        aliases: ['date', 'month'],
        semantic: {},
      },
    ],
    datasets: [
      {
        dataset_ref: 'project_form:project-sales',
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        form_id: 'form-sales',
        type: 'project_form_submissions',
        read_tool: 'getProjectFormReport',
        source_endpoint: '/v1/submission-reports/module-table',
        embedded_in_artifact: false,
        required_permissions: ['submission:read'],
        scope_required: true,
      },
    ],
    metrics: [
      {
        metric_key: 'project-sales:amount',
        display_name: 'Amount',
        data_type: 'currency',
        aggregation: 'sum',
        source: {
          dataset: 'project_form:project-sales',
          field: 'amount',
        },
      },
    ],
    dimensions: [
      {
        dimension_key: 'project-sales:branch',
        display_name: 'Branch',
        data_type: 'text',
        role: 'dimension',
        source: {
          dataset: 'project_form:project-sales',
          field: 'branch',
        },
      },
    ],
  };

  return {
    _id: 'artifact-active',
    tenantId: 'tenant-1',
    artifactVersion: 4,
    schemaVersion: '1.0',
    status: 'active',
    artifact: {
      ...artifact,
      ...(overrides.artifact || {}),
    },
    sourceVersions: {},
    buildMetadata: {},
  };
};

const multiProjectArtifactRecord = ({ compatible = true } = {}) => {
  const record = activeArtifactRecord();
  const artifact = record.artifact;
  const secondMetricLabel = compatible ? 'Amount' : 'Cost';
  const secondDimensionLabel = compatible ? 'Branch' : 'Category';

  artifact.projects = [
    ...artifact.projects,
    {
      project_id: 'project-budget',
      tenant_id: 'tenant-1',
      workspace_id: 'workspace-main',
      name: 'Budget Allocation',
      status: 'active',
      scope: {
        primary_scope: 'tenant',
        tenant_id: 'tenant-1',
        workspace_id: 'workspace-main',
        access_model: 'restricted',
        audience: 'selected_roles',
        security_profile: 'restricted_team',
        public_access: false,
        secure_access: true,
        node_restrictions: ['requester_assigned_nodes'],
        user_restrictions: ['user-owner'],
        role_restrictions: ['role-owner'],
      },
      settings: {},
      dataset_ref: 'project_form:project-budget',
    },
  ];
  artifact.forms = [
    ...artifact.forms,
    {
      project_id: 'project-budget',
      form_id: 'form-budget',
      tenant_id: 'tenant-1',
      workspace_id: 'workspace-main',
      name: 'Budget Allocation',
      status: 'active',
      scope: {
        primary_scope: 'tenant',
        tenant_id: 'tenant-1',
        workspace_id: 'workspace-main',
        node_restrictions: ['requester_assigned_nodes'],
        user_restrictions: ['user-owner'],
        role_restrictions: ['role-owner'],
      },
      dataset_ref: 'project_form:project-budget',
      project_intelligence_profile: {
        project_id: 'project-budget',
        profile_status: 'ready',
        default_measure_field_refs: ['project-budget:budget_amount'],
        default_dimension_field_refs: ['project-budget:budget_branch'],
        primary_time_field_ref: 'project-budget:budget_date',
        status_field_refs: [],
        reporting_caveats: [],
      },
    },
  ];
  artifact.form_fields = [
    ...artifact.form_fields,
    {
      field_ref: 'project-budget:budget_amount',
      project_id: 'project-budget',
      field_id: 'budget_amount',
      label: secondMetricLabel,
      field_type: 'number',
      intelligence_role: 'measure',
      value_type: 'currency',
      allowed_operations: ['sum', 'avg', 'min', 'max', 'rank', 'trend'],
      allowed_as_filter: true,
      allowed_as_dimension: false,
      aliases: compatible ? ['budget amount', 'revenue', 'sales'] : ['budget spent'],
      semantic: {},
    },
    {
      field_ref: 'project-budget:budget_branch',
      project_id: 'project-budget',
      field_id: 'budget_branch',
      label: secondDimensionLabel,
      field_type: 'text',
      intelligence_role: 'dimension',
      value_type: 'text',
      allowed_operations: ['count', 'count_distinct', 'filter', 'group'],
      allowed_as_filter: true,
      allowed_as_dimension: true,
      aliases: compatible ? ['location'] : ['budget category'],
      semantic: {},
    },
    {
      field_ref: 'project-budget:budget_date',
      project_id: 'project-budget',
      field_id: 'budget_date',
      label: 'Submitted at',
      field_type: 'date',
      intelligence_role: 'time',
      value_type: 'date',
      allowed_operations: ['filter', 'trend', 'period_compare'],
      allowed_as_filter: true,
      allowed_as_dimension: true,
      aliases: ['date', 'month'],
      semantic: {},
    },
  ];
  artifact.datasets = [
    ...artifact.datasets,
    {
      dataset_ref: 'project_form:project-budget',
      tenant_id: 'tenant-1',
      project_id: 'project-budget',
      form_id: 'form-budget',
      type: 'project_form_submissions',
      read_tool: 'getProjectFormReport',
      source_endpoint: '/v1/submission-reports/module-table',
      embedded_in_artifact: false,
      required_permissions: ['submission:read'],
      scope_required: true,
    },
  ];
  artifact.metrics = [
    ...artifact.metrics,
    {
      metric_key: 'project-budget:budget_amount',
      display_name: secondMetricLabel,
      data_type: 'currency',
      aggregation: 'sum',
      source: {
        dataset: 'project_form:project-budget',
        field: 'budget_amount',
      },
    },
  ];
  artifact.dimensions = [
    ...artifact.dimensions,
    {
      dimension_key: 'project-budget:budget_branch',
      display_name: secondDimensionLabel,
      data_type: 'text',
      role: 'dimension',
      source: {
        dataset: 'project_form:project-budget',
        field: 'budget_branch',
      },
    },
  ];

  return record;
};

describe('executiveIntelligence.service artifact builder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecutiveIntelligenceAuditEvent.create.mockResolvedValue({});
    mockTenantKnowledgeArtifact.updateMany.mockResolvedValue({ modifiedCount: 1 });
    mockExecutiveGeneratedSqlExecutor.getGeneratedSqlExecutionCapabilities.mockReturnValue({
      enabled: false,
      rawClientSqlAllowed: false,
      generatedSqlExecutionAllowed: false,
      requiresAstValidation: true,
      readOnlyTransaction: true,
      maxRows: 1000,
    });
    mockExecutiveGeneratedSqlExecutor.executeGeneratedSql.mockResolvedValue({
      status: 'blocked',
      reason: 'SQL_EXECUTION_DISABLED',
      queryFingerprint: 'sha256:disabled',
      validation: { ok: true, readOnly: true, astValidated: true },
      rawSqlReturned: false,
      rawClientSqlAllowed: false,
      readOnly: true,
    });
    mockExecutiveSandboxRunner.getSandboxCapabilities.mockReturnValue({
      enabled: true,
      provider: 'external_http',
      supportedRuntimes: ['python'],
    });
    mockExecutiveSandboxRunner.requestSandboxExecution.mockResolvedValue({
      sandboxExecutionId: 'sandbox_default',
      status: 'completed',
      runtime: 'python',
      sandboxProvider: 'external_http',
      validationResult: { ok: true, language: 'python', sandboxRequired: true },
      inputManifest: {},
      outputManifest: { result: { ok: true }, stdout: '', destroyed: true },
      codeFingerprint: 'python-default-fingerprint',
      codeBytes: 16,
    });
  });

  test('builds a complete tenant graph artifact without embedding operational submissions', async () => {
    mockBuilderSources();
    let createdRecord;

    mockTenantKnowledgeArtifact.create.mockImplementation(async (payload) => {
      createdRecord = { _id: 'artifact-1', ...payload };
      return createdRecord;
    });
    mockTenantKnowledgeArtifact.findByIdAndUpdate.mockImplementation(async (_id, update) => ({
      ...createdRecord,
      status: update.$set.status,
      activatedAt: update.$set.activatedAt,
      artifact: {
        ...createdRecord.artifact,
        status: update.$set['artifact.status'],
      },
    }));

    const record = await executiveIntelligenceService.buildTenantArtifact({
      tenantId: 'tenant-1',
      builtBy: 'user-owner',
      activate: true,
    });

    expect(record.status).toBe('active');
    expect(mockTenantKnowledgeArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        artifactVersion: 1,
        status: 'building',
        artifact: expect.objectContaining({ status: 'building' }),
      })
    );

    const artifact = record.artifact;
    expect(artifact.organization.levels).toHaveLength(1);
    expect(artifact.organization.structures).toHaveLength(1);
    expect(artifact.organization.nodes).toHaveLength(1);
    expect(artifact.organization.user_node_assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_ref: 'user-owner', node_ref: 'node-region-1' }),
        expect.objectContaining({ user_ref: 'user-submit', node_ref: 'node-region-1' }),
      ])
    );
    expect(artifact.organization.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edge_type: 'node_level' }),
        expect.objectContaining({ edge_type: 'node_structure' }),
        expect.objectContaining({ edge_type: 'user_node' }),
        expect.objectContaining({ edge_type: 'role_permission' }),
        expect.objectContaining({ edge_type: 'project_form_workspace' }),
      ])
    );

    const owner = artifact.security.users.find((user) => user.user_ref === 'user-owner');
    const submitter = artifact.security.users.find((user) => user.user_ref === 'user-submit');
    expect(owner.access_profile).toEqual(
      expect.objectContaining({
        workspace_actor: true,
        submitter: true,
        main_app_login_allowed: true,
        intelligence_allowed: true,
      })
    );
    expect(submitter.access_profile).toEqual(
      expect.objectContaining({
        workspace_actor: false,
        submitter: true,
        main_app_login_allowed: false,
        intelligence_allowed: false,
      })
    );

    expect(artifact.projects[0].scope).toEqual(
      expect.objectContaining({
        primary_scope: 'tenant',
        tenant_id: 'tenant-1',
        workspace_id: 'workspace-main',
        node_restrictions: ['requester_assigned_nodes'],
        user_restrictions: ['user-owner'],
        role_restrictions: ['role-owner'],
      })
    );
    expect(artifact.datasets[0]).toEqual(
      expect.objectContaining({
        read_tool: 'getProjectFormReport',
        embedded_in_artifact: false,
        required_permissions: ['submission:read'],
      })
    );
    expect(artifact).not.toHaveProperty('submissions');
    expect(artifact.business_glossary).toEqual([]);
    expect(artifact.synonyms).toEqual([]);
    expect(record.buildMetadata.counts).toEqual(
      expect.objectContaining({
        workspaceActors: 1,
        submitters: 2,
        workspaceSubmitters: 1,
        submitterOnly: 1,
        relationships: 9,
        forms: 1,
        fields: 3,
      })
    );
  });

  test('compiles approved semantic memory into tenant artifacts', async () => {
    mockBuilderSources({
      semanticMemory: [
        {
          memoryId: 'sem_glossary',
          type: 'glossary_term',
          term: 'Collections',
          normalizedTerm: 'collections',
          definition: 'Money collected through approved form payments.',
          aliases: ['payments received'],
          targetType: 'metric',
          targetRef: 'project-sales:amount',
          confidence: 1,
          evidence: [{ type: 'admin_note', value: 'Finance glossary' }],
          approvalStatus: 'approved',
          status: 'active',
          reviewedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          memoryId: 'sem_synonym',
          type: 'synonym',
          term: 'outlet',
          normalizedTerm: 'outlet',
          aliases: ['branch'],
          targetType: 'dimension',
          targetRef: 'project-sales:branch',
          targetLabel: 'Branch',
          confidence: 0.9,
          evidence: [],
          approvalStatus: 'approved',
          status: 'active',
          reviewedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          memoryId: 'sem_pending',
          type: 'synonym',
          term: 'unsafe pending',
          normalizedTerm: 'unsafe pending',
          aliases: ['should not compile'],
          approvalStatus: 'pending',
          status: 'active',
        },
      ],
    });
    let createdRecord;
    mockTenantKnowledgeArtifact.create.mockImplementation(async (payload) => {
      createdRecord = { _id: 'artifact-1', ...payload };
      return createdRecord;
    });
    mockTenantKnowledgeArtifact.findByIdAndUpdate.mockImplementation(async (_id, update) => ({
      ...createdRecord,
      status: update.$set.status,
      activatedAt: update.$set.activatedAt,
      artifact: {
        ...createdRecord.artifact,
        status: update.$set['artifact.status'],
      },
    }));

    const record = await executiveIntelligenceService.buildTenantArtifact({
      tenantId: 'tenant-1',
      builtBy: 'user-owner',
      activate: true,
    });

    expect(record.artifact.business_glossary).toEqual([
      expect.objectContaining({
        memory_id: 'sem_glossary',
        term: 'Collections',
        aliases: ['payments received'],
        target_ref: 'project-sales:amount',
      }),
    ]);
    expect(record.artifact.synonyms).toEqual([
      expect.objectContaining({
        memory_id: 'sem_synonym',
        term: 'outlet',
        aliases: ['branch'],
        target_ref: 'project-sales:branch',
      }),
    ]);
    expect(record.artifact.semantic_memory.counts).toEqual(
      expect.objectContaining({
        approved: 2,
        glossary: 1,
        synonyms: 1,
      })
    );
  });

  test('promotes the new artifact before superseding older active versions', async () => {
    mockBuilderSources({ latest: { artifactVersion: 4 } });
    let createdRecord;

    mockTenantKnowledgeArtifact.create.mockImplementation(async (payload) => {
      createdRecord = { _id: 'artifact-5', ...payload };
      return createdRecord;
    });
    mockTenantKnowledgeArtifact.findByIdAndUpdate.mockImplementation(async (_id, update) => ({
      ...createdRecord,
      status: update.$set.status,
      activatedAt: update.$set.activatedAt,
      artifact: {
        ...createdRecord.artifact,
        status: update.$set['artifact.status'],
      },
    }));

    await executiveIntelligenceService.buildTenantArtifact({
      tenantId: 'tenant-1',
      builtBy: 'user-owner',
      activate: true,
    });

    expect(mockTenantKnowledgeArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactVersion: 5,
        status: 'building',
      })
    );
    expect(mockTenantKnowledgeArtifact.findByIdAndUpdate).toHaveBeenCalledWith(
      'artifact-5',
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'active',
          'artifact.status': 'active',
        }),
      }),
      { new: true }
    );
    expect(mockTenantKnowledgeArtifact.updateMany).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        status: 'active',
        _id: { $ne: 'artifact-5' },
        artifactVersion: { $lt: 5 },
      },
      {
        $set: {
          status: 'superseded',
          'artifact.status': 'superseded',
        },
      }
    );
    expect(mockTenantKnowledgeArtifact.findByIdAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockTenantKnowledgeArtifact.updateMany.mock.invocationCallOrder[0]
    );
  });

  test('creates semantic memory with pending approval and audit trail', async () => {
    mockExecutiveSemanticMemory.create.mockImplementation(async (payload) => ({
      ...payload,
      toJSON: () => payload,
    }));

    const record = await executiveIntelligenceService.createSemanticMemory({
      tenantId: 'tenant-1',
      userId: 'user-owner',
      body: {
        type: 'synonym',
        term: 'Outlet',
        aliases: ['branch'],
        targetType: 'dimension',
        targetRef: 'project-sales:branch',
        confidence: 0.8,
        evidence: [{ type: 'admin_note', value: 'Used by regional managers' }],
      },
    });

    expect(record).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        type: 'synonym',
        term: 'Outlet',
        normalizedTerm: 'outlet',
        approvalStatus: 'pending',
        createdBy: 'user-owner',
      })
    );
    expect(record.memoryId).toMatch(/^sem_/);
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'semantic_memory',
        action: 'semantic_memory_created',
        status: 'completed',
      })
    );
  });

  test('reviews semantic memory with approval decision and rebuild signal', async () => {
    mockExecutiveSemanticMemory.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        memoryId: 'sem_review123',
        tenantId: 'tenant-1',
        approvalStatus: 'approved',
        targetType: 'metric',
        targetRef: 'project-sales:amount',
      }),
    });

    const record = await executiveIntelligenceService.reviewSemanticMemory({
      tenantId: 'tenant-1',
      userId: 'user-owner',
      memoryId: 'sem_review123',
      body: {
        approvalStatus: 'approved',
        reviewNote: 'Matches finance language',
      },
    });

    expect(record.approvalStatus).toBe('approved');
    expect(mockExecutiveSemanticMemory.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', memoryId: 'sem_review123' },
      expect.objectContaining({
        $set: expect.objectContaining({
          approvalStatus: 'approved',
          reviewedBy: 'user-owner',
          reviewNote: 'Matches finance language',
        }),
      }),
      { new: true }
    );
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'semantic_memory',
        action: 'semantic_memory_reviewed',
        policyDecision: expect.objectContaining({
          artifact_rebuild_required: true,
        }),
      })
    );
  });
});

describe('executiveIntelligence.service request execution context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecutiveIntelligenceAuditEvent.create.mockResolvedValue({});
    mockExecutiveSemanticMemory.findOne.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(null),
      })),
    });
    mockExecutiveSemanticMemory.create.mockImplementation(async (payload) => ({
      ...payload,
      toJSON: () => payload,
    }));
    mockExecutiveReportExportService.persistRenderedReportExports.mockResolvedValue({
      csv: {
        export_id: 'ei_export_csv_test',
        format: 'csv',
        filename: 'monthly-sales-report.csv',
        content_type: 'text/csv; charset=utf-8',
        byte_size: 128,
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_csv_test/download',
        persisted: true,
      },
      xlsx: {
        export_id: 'ei_export_xlsx_test',
        format: 'xlsx',
        filename: 'monthly-sales-report.xlsx',
        content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        byte_size: 256,
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_xlsx_test/download',
        persisted: true,
      },
      html: {
        export_id: 'ei_export_html_test',
        format: 'html',
        filename: 'monthly-sales-report.html',
        content_type: 'text/html; charset=utf-8',
        byte_size: 512,
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_html_test/download',
        persisted: true,
      },
      pdf: {
        export_id: 'ei_export_pdf_test',
        format: 'pdf',
        filename: 'monthly-sales-report.pdf',
        content_type: 'application/pdf',
        byte_size: 768,
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_pdf_test/download',
        persisted: true,
      },
      docx: {
        export_id: 'ei_export_docx_test',
        format: 'docx',
        filename: 'monthly-sales-report.docx',
        content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        byte_size: 1024,
        download_endpoint: '/v1/executive-intelligence/exports/ei_export_docx_test/download',
        persisted: true,
      },
    });
    mockExecutiveGeneratedSqlExecutor.getGeneratedSqlExecutionCapabilities.mockReturnValue({
      enabled: false,
      rawClientSqlAllowed: false,
      generatedSqlExecutionAllowed: false,
      requiresAstValidation: true,
      readOnlyTransaction: true,
      maxRows: 1000,
    });
    mockExecutiveSandboxRunner.getSandboxCapabilities.mockReturnValue({
      enabled: true,
      provider: 'external_http',
      supportedRuntimes: ['python'],
    });
    mockExecutiveSandboxRunner.requestSandboxExecution.mockResolvedValue({
      sandboxExecutionId: 'sandbox_default',
      status: 'completed',
      runtime: 'python',
      sandboxProvider: 'external_http',
      validationResult: { ok: true, language: 'python', sandboxRequired: true },
      inputManifest: {},
      outputManifest: { result: { ok: true }, stdout: '', destroyed: true },
      codeFingerprint: 'python-default-fingerprint',
      codeBytes: 16,
    });
  });

  test('creates an executable context from the active artifact for a workspace actor', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        conversationId: 'conv-1',
        message: 'Generate a report for this form',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
            title: 'Client title should not be trusted',
          },
        ],
        outputFormats: ['chat', 'markdown'],
        timeRange: {
          start: '2026-07-01T00:00:00.000Z',
          end: '2026-07-31T23:59:59.000Z',
          timezone: 'Africa/Lagos',
        },
      },
    });

    expect(context.execution_allowed).toBe(true);
    expect(context.blocking_reasons).toEqual([]);
    expect(context.artifact_version).toBe(4);
    expect(context.user_access_profile).toEqual(
      expect.objectContaining({
        workspace_actor: true,
        intelligence_allowed: true,
      })
    );
    expect(context.user_roles).toEqual([
      expect.objectContaining({ role_ref: 'role-owner', name: 'Owner' }),
    ]);
    expect(context.user_permissions).toEqual([
      expect.objectContaining({ name: 'submission:read' }),
    ]);
    expect(context.scope_snapshot).toEqual(
      expect.objectContaining({
        scope_type: 'tenant_all_nodes',
        visible_node_ids: ['node-region-1', 'node-branch-1', 'node-region-2'],
        descendant_expansion: 'applied',
      })
    );
    expect(context.visible_nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_ref: 'node-region-1', name: 'Region 1' }),
        expect.objectContaining({ node_ref: 'node-branch-1', parent_node_ref: 'node-region-1' }),
      ])
    );
    expect(context.selected_project_ids).toEqual(['project-sales']);
    expect(context.selected_form_ids).toEqual(['form-sales']);
    expect(context.selected_references[0]).toEqual(
      expect.objectContaining({
        project_id: 'project-sales',
        project_form_id: 'form-sales',
        title: 'Monthly Sales',
        source: 'active_tenant_artifact',
      })
    );
    expect(context.requested_operation).toBe('GENERATE_REPORT');
    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'resolved',
        operation: 'GENERATE_REPORT',
        resolved_metrics: ['project-sales:amount'],
        resolved_dimensions: ['project-sales:branch'],
        llm_used: false,
        source: 'active_tenant_artifact',
      })
    );
    expect(context.semantic_resolution.assumptions).toEqual([
      'selected_project_defaults_used_when_message_did_not_name_specific_fields',
    ]);
    expect(context.policy_snapshot).toEqual(
      expect.objectContaining({
        rawSqlAllowed: false,
        generatedCodeAllowed: false,
        requireBackendReferenceValidation: true,
      })
    );
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request_context_created',
        status: 'completed',
        artifactVersion: 4,
      })
    );
  });

  test('recognizes compatible multi-project references and creates a fan-out comparison plan', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(multiProjectArtifactRecord({ compatible: true })));

    const body = {
      message: 'Compare amount by branch across these forms',
      references: [
        {
          type: 'project_form',
          projectId: 'project-sales',
          projectFormId: 'form-sales',
        },
        {
          type: 'project_form',
          projectId: 'project-budget',
          projectFormId: 'form-budget',
        },
      ],
    };

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body,
    });
    const plan = executiveIntelligenceService.buildExecutionPlanFromContext({
      context,
      body,
      executionMode: 'multi_project_comparison',
    });

    expect(context.execution_allowed).toBe(true);
    expect(context.selected_project_ids).toEqual(['project-sales', 'project-budget']);
    expect(context.multi_project_compatibility).toEqual(
      expect.objectContaining({
        status: 'compatible',
        compatible: true,
        project_count: 2,
      })
    );
    expect(context.multi_project_compatibility.common_metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Amount',
          field_refs: expect.arrayContaining(['project-sales:amount', 'project-budget:budget_amount']),
        }),
      ])
    );
    expect(context.multi_project_compatibility.common_dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Branch',
          field_refs: expect.arrayContaining(['project-sales:branch', 'project-budget:budget_branch']),
        }),
      ])
    );
    expect(plan.status).toBe('valid');
    expect(plan.validation.valid).toBe(true);
    expect(plan.execution_mode).toBe('multi_project_comparison');
    expect(plan.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool_key: 'get_multi_project_form_comparison',
          operation: 'fan_out_project_form_aggregation',
          inputs: expect.objectContaining({ project_id: 'project-sales' }),
        }),
        expect.objectContaining({
          tool_key: 'get_multi_project_form_comparison',
          operation: 'fan_out_project_form_aggregation',
          inputs: expect.objectContaining({ project_id: 'project-budget' }),
        }),
      ])
    );
  });

  test('executes compatible multi-project comparison through bounded fan-out aggregation', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(multiProjectArtifactRecord({ compatible: true })));
    mockSubmissionReportService.getModuleReportAggregation
      .mockResolvedValueOnce({
        total_groups: 1,
        limit: 25,
        offset: 0,
        rows: [
          {
            dimension_value: 'branch 1',
            aggregate_value: 3000,
            submission_count: 2,
            numeric_value_count: 2,
            sampled_submission_ids: ['sub-sales-1'],
          },
        ],
      })
      .mockResolvedValueOnce({
        total_groups: 1,
        limit: 25,
        offset: 0,
        rows: [
          {
            dimension_value: 'branch 1',
            aggregate_value: 5000,
            submission_count: 3,
            numeric_value_count: 3,
            sampled_submission_ids: ['sub-budget-1'],
          },
        ],
      });

    const result = await executiveIntelligenceService.executeMultiProjectFormComparison({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Compare amount by branch across these forms',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
            title: 'Monthly Sales',
          },
          {
            type: 'project_form',
            projectId: 'project-budget',
            projectFormId: 'form-budget',
            title: 'Budget Allocation',
          },
        ],
        requestedNodeIds: ['HLN-REGION-1'],
        aggregate: 'sum',
      },
    });

    expect(mockSubmissionReportService.getModuleReportAggregation).toHaveBeenCalledTimes(2);
    expect(mockSubmissionReportService.getModuleReportAggregation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        metric_field_key: 'amount',
        dimension_field_key: 'branch',
        aggregate: 'sum',
        node_filters: ['node-region-1', 'node-branch-1'],
      })
    );
    expect(mockSubmissionReportService.getModuleReportAggregation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-budget',
        metric_field_key: 'budget_amount',
        dimension_field_key: 'budget_branch',
        aggregate: 'sum',
        node_filters: ['node-region-1', 'node-branch-1'],
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'multi_project_comparison',
        validation: expect.objectContaining({ valid: true }),
      })
    );
    expect(result.comparison).toEqual(
      expect.objectContaining({
        comparison_type: 'multi_project_form_aggregation',
        project_count: 2,
        aggregate: 'sum',
        metric: expect.objectContaining({ label: 'Amount' }),
        dimension: expect.objectContaining({ label: 'Branch' }),
        data_access: expect.objectContaining({
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
          tool: 'get_multi_project_form_comparison',
        }),
      })
    );
    expect(result.comparison.combined_rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          project_id: 'project-sales',
          project_title: 'Monthly Sales',
          dimension_value: 'branch 1',
          aggregate_value: 3000,
        }),
        expect.objectContaining({
          project_id: 'project-budget',
          project_title: 'Budget Allocation',
          dimension_value: 'branch 1',
          aggregate_value: 5000,
        }),
      ])
    );
  });

  test('blocks incompatible multi-project references before data execution', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(multiProjectArtifactRecord({ compatible: false })));

    await expect(
      executiveIntelligenceService.createRequestContext({
        user: {
          _id: 'user-owner',
          userId: 'HLU-OWNER',
          tenantId: 'tenant-1',
          email: 'owner@saby.test',
        },
        body: {
          message: 'Compare amount by branch across these forms',
          references: [
            {
              type: 'project_form',
              projectId: 'project-sales',
              projectFormId: 'form-sales',
            },
            {
              type: 'project_form',
              projectId: 'project-budget',
              projectFormId: 'form-budget',
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'MULTI_PROJECT_REFERENCES_INCOMPATIBLE',
    });

    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request_context_blocked',
        status: 'blocked',
        errorCategory: 'MULTI_PROJECT_REFERENCES_INCOMPATIBLE',
        metadata: expect.objectContaining({
          multiProjectCompatibility: expect.objectContaining({
            status: 'incompatible',
            reasons: expect.arrayContaining(['no_common_metric_signature']),
          }),
        }),
      })
    );
  });

  test('executes generated SQL only after Intelligence context revalidation and audits fingerprint metadata', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockExecutiveGeneratedSqlExecutor.getGeneratedSqlExecutionCapabilities.mockReturnValue({
      enabled: true,
      rawClientSqlAllowed: false,
      generatedSqlExecutionAllowed: true,
      requiresAstValidation: true,
      readOnlyTransaction: true,
      maxRows: 1000,
    });
    mockExecutiveGeneratedSqlExecutor.executeGeneratedSql.mockResolvedValue({
      status: 'completed',
      queryFingerprint: 'sha256:generated-query',
      validation: {
        ok: true,
        readOnly: true,
        astValidated: true,
        sources: ['safe_project_form_facts'],
        limit: 50,
      },
      rawSqlReturned: false,
      rawClientSqlAllowed: false,
      readOnly: true,
      rowCount: 1,
      rows: [{ branch: 'Branch 1', total: '42' }],
      fields: [{ name: 'branch', dataTypeID: 25 }],
    });

    const result = await executiveIntelligenceService.executeGeneratedSqlTool({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show amount by branch',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
        sql: 'SELECT branch, SUM(amount) AS total FROM safe_project_form_facts GROUP BY branch LIMIT 50',
        maxRows: 50,
      },
    });

    expect(result.generated_sql_execution).toEqual(
      expect.objectContaining({
        status: 'completed',
        queryFingerprint: 'sha256:generated-query',
        rawSqlReturned: false,
        rawClientSqlAllowed: false,
      })
    );
    expect(mockExecutiveGeneratedSqlExecutor.executeGeneratedSql).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: 'SELECT branch, SUM(amount) AS total FROM safe_project_form_facts GROUP BY branch LIMIT 50',
        maxRows: 50,
        tenantId: 'tenant-1',
        userId: 'user-owner',
      })
    );
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'generated_sql_tool',
        action: 'generated_sql_execution_completed',
        status: 'completed',
        outputReferences: expect.objectContaining({
          queryFingerprint: 'sha256:generated-query',
          rowCount: 1,
        }),
      })
    );
    const generatedSqlAuditCall = mockExecutiveIntelligenceAuditEvent.create.mock.calls.find(
      ([payload]) => payload.component === 'generated_sql_tool'
    );
    expect(JSON.stringify(generatedSqlAuditCall[0])).not.toContain('SELECT branch');
  });

  test('blocks generated SQL tool when more than one project is selected', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(multiProjectArtifactRecord({ compatible: true })));

    await expect(
      executiveIntelligenceService.executeGeneratedSqlTool({
        user: {
          _id: 'user-owner',
          userId: 'HLU-OWNER',
          tenantId: 'tenant-1',
          email: 'owner@saby.test',
        },
        body: {
          message: 'Compare amount by branch across forms',
          references: [
            {
              type: 'project_form',
              projectId: 'project-sales',
              projectFormId: 'form-sales',
            },
            {
              type: 'project_form',
              projectId: 'project-budget',
              projectFormId: 'form-budget',
            },
          ],
          sql: 'SELECT branch, SUM(amount) AS total FROM safe_project_form_facts GROUP BY branch LIMIT 50',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(mockExecutiveGeneratedSqlExecutor.executeGeneratedSql).not.toHaveBeenCalled();
  });

  test('executes generated Python only through validated sandbox runner and audits fingerprint metadata', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockExecutiveSandboxRunner.requestSandboxExecution.mockResolvedValue({
      sandboxExecutionId: 'sandbox_live_test',
      status: 'completed',
      runtime: 'python',
      sandboxProvider: 'external_http',
      validationResult: { ok: true, language: 'python', sandboxRequired: true },
      inputManifest: {
        rows: 2,
        format: 'json',
        inputPayloadBytes: 20,
        selectedProjectIds: ['project-sales'],
        selectedFormIds: ['form-sales'],
        source: 'internal_generated_python_tool',
      },
      outputManifest: {
        result: { total: 42 },
        stdout: '',
        destroyed: true,
      },
      codeFingerprint: 'python-fingerprint',
      codeBytes: 41,
    });

    const result = await executiveIntelligenceService.executeGeneratedPythonTool({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Analyze amount by branch',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
        code: 'result = {"total": sum(dataset["values"])}',
        inputPayload: { values: [10, 32] },
        inputManifest: { rows: 2, format: 'json' },
      },
    });

    expect(mockExecutiveSandboxRunner.requestSandboxExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-owner',
        runtime: 'python',
        code: 'result = {"total": sum(dataset["values"])}',
        inputPayload: { values: [10, 32] },
        inputManifest: expect.objectContaining({
          rows: 2,
          format: 'json',
          selectedProjectIds: ['project-sales'],
          selectedFormIds: ['form-sales'],
          source: 'internal_generated_python_tool',
        }),
      })
    );
    expect(result.generated_python_execution).toEqual(
      expect.objectContaining({
        status: 'completed',
        sandboxExecutionId: 'sandbox_live_test',
        codeFingerprint: 'python-fingerprint',
        outputManifest: expect.objectContaining({
          result: { total: 42 },
          destroyed: true,
        }),
      })
    );
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'generated_python_tool',
        action: 'generated_python_execution_completed',
        status: 'completed',
        outputReferences: expect.objectContaining({
          sandboxExecutionId: 'sandbox_live_test',
          codeFingerprint: 'python-fingerprint',
        }),
      })
    );
    const generatedPythonAuditCall = mockExecutiveIntelligenceAuditEvent.create.mock.calls.find(
      ([payload]) => payload.component === 'generated_python_tool'
    );
    expect(JSON.stringify(generatedPythonAuditCall[0])).not.toContain('sum(dataset');
  });

  test('uses selected project semantic defaults when user wording does not name a field', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Give me an executive brief',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.execution_allowed).toBe(true);
    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'resolved',
        resolved_metrics: ['project-sales:amount'],
        resolved_dimensions: ['project-sales:branch'],
        assumptions: ['selected_project_defaults_used_when_message_did_not_name_specific_fields'],
      })
    );
  });

  test('matches explicit business terms to artifact metrics and dimensions', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show sales by branch this month',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'resolved',
        resolved_metrics: ['project-sales:amount'],
        resolved_dimensions: ['project-sales:branch'],
      })
    );
    expect(context.semantic_resolution.resolved_time_range).toEqual(
      expect.objectContaining({
        source: 'message:this_month',
      })
    );
    expect(context.semantic_resolution.resolved_time_fields).toEqual(['project-sales:submitted_at']);
    expect(context.semantic_resolution.caveats).toEqual([]);
    expect(context.semantic_resolution.matched_objects.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_ref: 'project-sales:amount',
          matched_terms: expect.arrayContaining(['sales']),
        }),
      ])
    );
    expect(context.semantic_resolution.matched_objects.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_ref: 'project-sales:branch',
          matched_terms: expect.arrayContaining(['branch']),
        }),
      ])
    );
  });

  test('uses approved artifact synonyms during semantic resolution', async () => {
    const artifact = activeArtifactRecord({
      artifact: {
        synonyms: [
          {
            memory_id: 'sem_outlet_branch',
            term: 'outlet',
            normalized_term: 'outlet',
            aliases: ['shop floor'],
            target_type: 'dimension',
            target_ref: 'project-sales:branch',
            target_label: 'Branch',
            confidence: 0.95,
          },
        ],
      },
    });
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(artifact));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show amount by outlet',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'resolved',
        resolved_metrics: ['project-sales:amount'],
        resolved_dimensions: ['project-sales:branch'],
      })
    );
    expect(context.semantic_resolution.assumptions).toEqual([]);
    expect(context.semantic_resolution.matched_objects.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_ref: 'project-sales:branch',
          matched_terms: ['outlet'],
        }),
      ])
    );
  });

  test('resolves exact custom form field labels for table-style aggregation prompts', async () => {
    const record = activeArtifactRecord();
    record.artifact.form_fields = [
      ...record.artifact.form_fields,
      {
        field_ref: 'project-sales:payment_total',
        project_id: 'project-sales',
        field_id: 'payment_total',
        label: 'Payment Total',
        field_type: 'number',
        intelligence_role: 'measure',
        value_type: 'currency',
        allowed_operations: ['sum', 'avg', 'min', 'max', 'rank', 'trend'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
      {
        field_ref: 'project-sales:membership_id',
        project_id: 'project-sales',
        field_id: 'membership_id',
        label: 'Membership ID',
        field_type: 'text',
        intelligence_role: 'label',
        value_type: 'text',
        allowed_operations: ['filter'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
    ];
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(record));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show Payment Total by Membership ID as a table.',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'resolved',
        resolved_metrics: ['project-sales:payment_total'],
        resolved_dimensions: ['project-sales:membership_id'],
      })
    );
    expect(context.semantic_resolution.unresolved_terms).not.toEqual(
      expect.arrayContaining(['payment', 'membership', 'payment total'])
    );
    expect(context.semantic_suggestions).toEqual([]);
  });

  test('resolves business amount synonyms for numeric measure fields', async () => {
    const record = activeArtifactRecord();
    record.artifact.form_fields = [
      ...record.artifact.form_fields,
      {
        field_ref: 'project-sales:entered_amount',
        project_id: 'project-sales',
        field_id: 'entered_amount',
        label: 'Enter a Amount',
        field_type: 'number',
        intelligence_role: 'measure',
        value_type: 'number',
        allowed_operations: ['sum', 'avg', 'min', 'max', 'rank', 'trend'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
      {
        field_ref: 'project-sales:membership_id',
        project_id: 'project-sales',
        field_id: 'membership_id',
        label: 'Membership ID',
        field_type: 'text',
        intelligence_role: 'label',
        value_type: 'text',
        allowed_operations: ['filter'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
    ];
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(record));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show Payment Total by Membership ID as a table.',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'resolved',
        resolved_metrics: ['project-sales:entered_amount'],
        resolved_dimensions: ['project-sales:membership_id'],
      })
    );
    expect(context.semantic_resolution.unresolved_terms).not.toEqual(
      expect.arrayContaining(['payment', 'total', 'payment total', 'payment total membership'])
    );
    expect(context.semantic_suggestions).toEqual([]);
  });

  test('does not treat generic id as ambiguous when a specific id phrase resolved', async () => {
    const record = activeArtifactRecord();
    record.artifact.form_fields = [
      ...record.artifact.form_fields,
      {
        field_ref: 'project-sales:entered_amount',
        project_id: 'project-sales',
        field_id: 'entered_amount',
        label: 'Enter a Amount',
        field_type: 'number',
        intelligence_role: 'measure',
        value_type: 'number',
        allowed_operations: ['sum', 'avg', 'min', 'max', 'rank', 'trend'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
      {
        field_ref: 'project-sales:membership_id',
        project_id: 'project-sales',
        field_id: 'membership_id',
        label: 'Membership ID',
        field_type: 'text',
        intelligence_role: 'label',
        value_type: 'text',
        allowed_operations: ['filter'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        field_ref: `project-sales:other_id_${index + 1}`,
        project_id: 'project-sales',
        field_id: `other_id_${index + 1}`,
        label: `Other ID ${index + 1}`,
        field_type: 'text',
        intelligence_role: 'label',
        value_type: 'text',
        allowed_operations: ['filter'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      })),
    ];
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(record));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show Payment Total by Membership ID as a table.',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'resolved',
        resolved_metrics: ['project-sales:entered_amount'],
        resolved_dimensions: ['project-sales:membership_id'],
        ambiguities: [],
      })
    );
  });

  test('does not use default metrics when user asks for unknown metric-like terms', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show quantum liquidity by branch',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.execution_allowed).toBe(true);
    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'unresolved',
        resolved_metrics: [],
        resolved_dimensions: ['project-sales:branch'],
        assumptions: [],
      })
    );
    expect(context.semantic_resolution.unresolved_terms).toEqual(
      expect.arrayContaining(['quantum', 'liquidity'])
    );
    expect(context.semantic_suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          term: 'quantum',
          approval_status: 'pending',
          source: 'system_suggestion',
        }),
        expect.objectContaining({
          term: 'liquidity',
          approval_status: 'pending',
          source: 'system_suggestion',
        }),
      ])
    );
    expect(mockExecutiveSemanticMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        type: 'synonym',
        term: 'quantum',
        normalizedTerm: 'quantum',
        approvalStatus: 'pending',
        source: 'system_suggestion',
        targetType: 'general',
        metadata: expect.objectContaining({
          requestId: context.request_id,
          semanticStatus: 'unresolved',
          requiresAdminTargetSelection: true,
        }),
      })
    );
    expect(mockExecutiveSemanticMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        term: 'liquidity',
        approvalStatus: 'pending',
        source: 'system_suggestion',
      })
    );
  });

  test('does not duplicate existing pending semantic suggestions', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockExecutiveSemanticMemory.findOne.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({ memoryId: 'sem_existing' }),
      })),
    });

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show quantum by branch',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.semantic_resolution.semantic_status).toBe('unresolved');
    expect(context.semantic_suggestions).toEqual([]);
    expect(mockExecutiveSemanticMemory.create).not.toHaveBeenCalled();
  });

  test('does not match sibling measures from shared technical field prefixes', async () => {
    const artifact = activeArtifactRecord();
    artifact.artifact.form_fields = [
      {
        field_ref: 'project-sales:budget-allocated',
        project_id: 'project-sales',
        field_id: 'budget-allocated',
        label: 'Allocated Budget',
        field_type: 'number',
        intelligence_role: 'measure',
        value_type: 'number',
        allowed_operations: ['sum', 'avg'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
      {
        field_ref: 'project-sales:budget-spent',
        project_id: 'project-sales',
        field_id: 'budget-spent',
        label: 'Amount Spent',
        field_type: 'number',
        intelligence_role: 'measure',
        value_type: 'currency',
        allowed_operations: ['sum', 'avg'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
      {
        field_ref: 'project-sales:budget-category',
        project_id: 'project-sales',
        field_id: 'budget-category',
        label: 'Expense Categories',
        field_type: 'select',
        intelligence_role: 'dimension',
        value_type: 'text',
        allowed_operations: ['group', 'filter'],
        allowed_as_filter: true,
        allowed_as_dimension: true,
        aliases: [],
        semantic: {},
      },
    ];
    artifact.artifact.metrics = [
      {
        metric_key: 'project-sales:budget-allocated',
        display_name: 'Allocated Budget',
        data_type: 'number',
        aggregation: 'sum',
        source: {
          dataset: 'project_form:project-sales',
          field: 'budget-allocated',
        },
      },
      {
        metric_key: 'project-sales:budget-spent',
        display_name: 'Amount Spent',
        data_type: 'currency',
        aggregation: 'sum',
        source: {
          dataset: 'project_form:project-sales',
          field: 'budget-spent',
        },
      },
    ];
    artifact.artifact.dimensions = [
      {
        dimension_key: 'project-sales:budget-category',
        display_name: 'Expense Categories',
        data_type: 'text',
        role: 'dimension',
        source: {
          dataset: 'project_form:project-sales',
          field: 'budget-category',
        },
      },
    ];

    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(artifact));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show allocated budget by expense categories',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.semantic_resolution).toEqual(
      expect.objectContaining({
        semantic_status: 'resolved',
        resolved_metrics: ['project-sales:budget-allocated'],
        resolved_dimensions: ['project-sales:budget-category'],
      })
    );
    expect(context.semantic_resolution.resolved_metrics).not.toContain('project-sales:budget-spent');
    expect(context.semantic_resolution.matched_objects.metrics).toHaveLength(1);
  });

  test('adds a caveat when a time range is requested but selected project has no time field', async () => {
    const artifact = activeArtifactRecord();
    artifact.artifact.form_fields = artifact.artifact.form_fields.filter(
      (field) => field.intelligence_role !== 'time'
    );
    artifact.artifact.forms[0].project_intelligence_profile.primary_time_field_ref = null;
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(artifact));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show sales by branch this month',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(context.semantic_resolution.resolved_time_range).toEqual(
      expect.objectContaining({ source: 'message:this_month' })
    );
    expect(context.semantic_resolution.resolved_time_fields).toEqual([]);
    expect(context.semantic_resolution.caveats).toEqual([
      'time_range_requested_but_no_project_time_field_detected',
    ]);
  });

  test('executes secure project-form report through resolved context and bounded node scope', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportTable.mockResolvedValue({
      total: 1,
      limit: 500,
      offset: 0,
      display_order: ['status', 'amount', 'receipt_file'],
      summary: { total_rows: 1, pending_count: 1 },
      report_context: { hide_identity_columns: false },
      columns: [
        { key: 'status', label: 'Status', field_type: 'text' },
        { key: 'amount', label: 'Amount', field_type: 'number' },
        { key: 'receipt_file', label: 'Receipt File', field_type: 'file' },
      ],
      rows: [
        {
          sn: 1,
          submission_id: 'sub-1',
          status: 'pending',
          amount: 1200,
          receipt_file: { url: 'https://example.s3.amazonaws.com/file.pdf' },
          __user_id: 'hidden',
        },
      ],
    });

    const result = await executiveIntelligenceService.executeProjectFormReport({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show sales by branch this month',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
        requestedNodeIds: ['HLN-REGION-1'],
        outputFormats: ['chat', 'json', 'csv', 'xlsx', 'html', 'pdf', 'docx'],
        limit: 500,
      },
    });

    expect(mockSubmissionReportService.getModuleReportTable).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        limit: 100,
        offset: 0,
        node_filters: ['node-region-1', 'node-branch-1'],
      })
    );
    expect(result.report.columns).toEqual([
      { key: 'status', label: 'Status', field_type: 'text' },
      { key: 'amount', label: 'Amount', field_type: 'number' },
    ]);
    expect(result.report.rows[0]).toEqual(
      expect.objectContaining({
        submission_id: 'sub-1',
        status: 'pending',
        amount: 1200,
      })
    );
    expect(result.report.rows[0]).not.toHaveProperty('receipt_file');
    expect(result.report.rows[0]).not.toHaveProperty('__user_id');
    expect(result.report.data_access).toEqual(
      expect.objectContaining({
        read_only: true,
        raw_sql_allowed: false,
        generated_code_allowed: false,
        semantic_status: 'resolved',
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'report',
        validation: expect.objectContaining({ valid: true }),
        stages: [
          expect.objectContaining({
            tool_key: 'get_project_form_report',
            read_only: true,
          }),
        ],
      })
    );
    expect(result.canonical_report).toEqual(
      expect.objectContaining({
        schema_version: '1.0',
        title: 'Monthly Sales report',
        audit: expect.objectContaining({
          request_id: expect.any(String),
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
          data_tool: 'get_project_form_report',
        }),
      })
    );
    expect(result.rendered_report).toEqual(
      expect.objectContaining({
        markdown: expect.stringContaining('# Monthly Sales report'),
        json: expect.objectContaining({
          report_id: result.canonical_report.report_id,
        }),
        csv: expect.objectContaining({
          format: 'csv',
          export_id: 'ei_export_csv_test',
          filename: expect.stringMatching(/\.csv$/),
          download_endpoint: '/v1/executive-intelligence/exports/ei_export_csv_test/download',
          persisted: true,
        }),
        xlsx: expect.objectContaining({
          format: 'xlsx',
          export_id: 'ei_export_xlsx_test',
          filename: expect.stringMatching(/\.xlsx$/),
          download_endpoint: '/v1/executive-intelligence/exports/ei_export_xlsx_test/download',
          persisted: true,
        }),
        html: expect.objectContaining({
          format: 'html',
          export_id: 'ei_export_html_test',
          filename: expect.stringMatching(/\.html$/),
          download_endpoint: '/v1/executive-intelligence/exports/ei_export_html_test/download',
          persisted: true,
        }),
        pdf: expect.objectContaining({
          format: 'pdf',
          export_id: 'ei_export_pdf_test',
          filename: expect.stringMatching(/\.pdf$/),
          download_endpoint: '/v1/executive-intelligence/exports/ei_export_pdf_test/download',
          persisted: true,
        }),
        docx: expect.objectContaining({
          format: 'docx',
          export_id: 'ei_export_docx_test',
          filename: expect.stringMatching(/\.docx$/),
          download_endpoint: '/v1/executive-intelligence/exports/ei_export_docx_test/download',
          persisted: true,
        }),
      })
    );
    expect(mockExecutiveReportExportService.persistRenderedReportExports).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-owner',
        requestId: expect.any(String),
        reportModel: expect.objectContaining({ report_id: result.canonical_report.report_id }),
        renderedReport: expect.objectContaining({
          csv: expect.objectContaining({ content: expect.any(String) }),
          xlsx: expect.objectContaining({ content_base64: expect.any(String) }),
          html: expect.objectContaining({ content: expect.any(String) }),
          pdf: expect.objectContaining({ content_base64: expect.any(String) }),
          docx: expect.objectContaining({ content_base64: expect.any(String) }),
        }),
      })
    );
  });

  test('blocks secure project-form report when semantic intent is unresolved', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    await expect(
      executiveIntelligenceService.executeProjectFormReport({
        user: {
          _id: 'user-owner',
          userId: 'HLU-OWNER',
          tenantId: 'tenant-1',
          email: 'owner@saby.test',
        },
        body: {
          message: 'Show quantum liquidity by branch',
          references: [
            {
              type: 'project_form',
              projectId: 'project-sales',
              projectFormId: 'form-sales',
            },
          ],
        },
      })
    ).rejects.toThrow('UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT');

    expect(mockSubmissionReportService.getModuleReportTable).not.toHaveBeenCalled();
  });

  test('executes deterministic project-form analysis with dataset profile and descriptive statistics', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportTable.mockResolvedValue({
      total: 2,
      limit: 75,
      offset: 0,
      display_order: ['status', 'amount', 'branch', 'submitted_at'],
      summary: {
        total_rows: 2,
        unique_nodes: 1,
        submitted_count: 1,
        approved_count: 1,
        pending_count: 0,
        rejected_count: 0,
        completed_count: 0,
        failed_count: 0,
        first_submission_at: '2026-07-01T00:00:00.000Z',
        latest_submission_at: '2026-07-02T00:00:00.000Z',
      },
      report_context: { hide_identity_columns: false },
      columns: [
        { key: 'status', label: 'Status', field_type: 'text' },
        { key: 'amount', label: 'Amount', field_type: 'number' },
        { key: 'branch', label: 'Branch', field_type: 'text' },
        { key: 'submitted_at', label: 'Submitted At', field_type: 'date' },
      ],
      rows: [
        {
          sn: 1,
          submission_id: 'sub-1',
          status: 'submitted',
          amount: 1000,
          branch: 'Branch 1',
          submitted_at: '2026-07-01T00:00:00.000Z',
        },
        {
          sn: 2,
          submission_id: 'sub-2',
          status: 'approved',
          amount: 2500,
          branch: 'Branch 1',
          submitted_at: '2026-07-02T00:00:00.000Z',
        },
      ],
    });

    const result = await executiveIntelligenceService.executeProjectFormAnalysis({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Give me an executive brief',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(mockSubmissionReportService.getModuleReportTable).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        limit: 75,
        offset: 0,
        node_filters: [],
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'analysis',
        validation: expect.objectContaining({ valid: true }),
        stages: [
          expect.objectContaining({
            tool_key: 'get_project_form_analysis',
            agent_type: 'ANALYTICS',
            read_only: true,
          }),
        ],
      })
    );
    expect(result.analysis.dataset_profile).toEqual(
      expect.objectContaining({
        total_rows: 2,
        sampled_rows: 2,
        numeric_column_count: 1,
        categorical_column_count: 2,
        date_column_count: 1,
      })
    );
    expect(result.analysis.descriptive_statistics.numeric).toEqual([
      expect.objectContaining({
        key: 'amount',
        label: 'Amount',
        count: 2,
        sum: 3500,
        avg: 1750,
        min: 1000,
        max: 2500,
      }),
    ]);
    expect(result.analysis.descriptive_statistics.categorical).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'branch',
          top_values: [expect.objectContaining({ value: 'Branch 1', count: 2 })],
        }),
      ])
    );
    expect(result.analysis.data_access).toEqual(
      expect.objectContaining({
        read_only: true,
        raw_sql_allowed: false,
        generated_code_allowed: false,
        sandbox_used: false,
        tool: 'get_project_form_analysis',
      })
    );
  });

  test('blocks deterministic project-form analysis when semantic intent is unresolved', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    await expect(
      executiveIntelligenceService.executeProjectFormAnalysis({
        user: {
          _id: 'user-owner',
          userId: 'HLU-OWNER',
          tenantId: 'tenant-1',
          email: 'owner@saby.test',
        },
        body: {
          message: 'Analyze quantum liquidity',
          references: [
            {
              type: 'project_form',
              projectId: 'project-sales',
              projectFormId: 'form-sales',
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      message: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      details: expect.objectContaining({
        type: 'semantic_clarification_required',
      }),
    });

    expect(mockSubmissionReportService.getModuleReportTable).not.toHaveBeenCalled();
  });

  test('executes secure project-form aggregation with artifact-derived field keys', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportAggregation.mockResolvedValue({
      total_groups: 2,
      limit: 25,
      offset: 0,
      aggregation: {
        aggregate: 'sum',
        metric_field_key: 'amount',
        dimension_field_key: 'branch',
      },
      rows: [
        {
          dimension_value: 'branch 1',
          aggregate_value: 3000,
          submission_count: 2,
          numeric_value_count: 2,
          sampled_submission_ids: ['sub-1', 'sub-2'],
        },
      ],
      query_context: {
        source_table: 'form_submission_facts',
        read_only: true,
      },
    });

    const result = await executiveIntelligenceService.executeProjectFormAggregation({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show sales by branch this month',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
        requestedNodeIds: ['HLN-REGION-1'],
        aggregate: 'sum',
      },
    });

    expect(mockSubmissionReportService.getModuleReportAggregation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        metric_field_key: 'amount',
        dimension_field_key: 'branch',
        aggregate: 'sum',
        limit: 25,
        offset: 0,
        node_filters: ['node-region-1', 'node-branch-1'],
      })
    );
    expect(result.aggregation).toEqual(
      expect.objectContaining({
        total_groups: 2,
        aggregation: expect.objectContaining({
          aggregate: 'sum',
          metric: expect.objectContaining({
            field_ref: 'project-sales:amount',
            field_key: 'amount',
            label: 'Amount',
          }),
          dimension: expect.objectContaining({
            field_ref: 'project-sales:branch',
            field_key: 'branch',
            label: 'Branch',
          }),
        }),
        data_access: expect.objectContaining({
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
          tool: 'get_project_form_aggregation',
        }),
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'aggregation',
        validation: expect.objectContaining({ valid: true }),
        stages: [
          expect.objectContaining({
            tool_key: 'get_project_form_aggregation',
            read_only: true,
          }),
        ],
      })
    );
  });

  test('executes secure aggregation for exact custom metric and reference labels', async () => {
    const record = activeArtifactRecord();
    record.artifact.form_fields = [
      ...record.artifact.form_fields,
      {
        field_ref: 'project-sales:payment_total',
        project_id: 'project-sales',
        field_id: 'payment_total',
        label: 'Payment Total',
        field_type: 'number',
        intelligence_role: 'measure',
        value_type: 'currency',
        allowed_operations: ['sum', 'avg', 'min', 'max', 'rank', 'trend'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
      {
        field_ref: 'project-sales:membership_id',
        project_id: 'project-sales',
        field_id: 'membership_id',
        label: 'Membership ID',
        field_type: 'text',
        intelligence_role: 'label',
        value_type: 'text',
        allowed_operations: ['filter'],
        allowed_as_filter: true,
        allowed_as_dimension: false,
        aliases: [],
        semantic: {},
      },
    ];
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(record));
    mockSubmissionReportService.getModuleReportAggregation.mockResolvedValue({
      total_groups: 1,
      limit: 25,
      offset: 0,
      aggregation: {
        aggregate: 'sum',
        metric_field_key: 'payment_total',
        dimension_field_key: 'membership_id',
      },
      rows: [
        {
          dimension_value: 'MEM-000003',
          aggregate_value: 81,
          submission_count: 1,
          numeric_value_count: 1,
          sampled_submission_ids: ['sub-1'],
        },
      ],
      query_context: {
        source_table: 'form_submission_facts',
        read_only: true,
      },
    });

    const result = await executiveIntelligenceService.executeProjectFormAggregation({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show Payment Total by Membership ID as a table.',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
        aggregate: 'sum',
      },
    });

    expect(mockSubmissionReportService.getModuleReportAggregation).toHaveBeenCalledWith(
      expect.objectContaining({
        metric_field_key: 'payment_total',
        dimension_field_key: 'membership_id',
        aggregate: 'sum',
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'aggregation',
      })
    );
    expect(result.aggregation.aggregation).toEqual(
      expect.objectContaining({
        metric: expect.objectContaining({
          field_key: 'payment_total',
          label: 'Payment Total',
        }),
        dimension: expect.objectContaining({
          field_key: 'membership_id',
          label: 'Membership ID',
        }),
      })
    );
  });

  test('executes deterministic project-form ranking with controlled ordering', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportAggregation.mockResolvedValue({
      total_groups: 2,
      limit: 10,
      offset: 0,
      aggregation: {
        aggregate: 'sum',
        metric_field_key: 'amount',
        dimension_field_key: 'branch',
      },
      rows: [
        {
          dimension_value: 'branch 1',
          aggregate_value: 3000,
          submission_count: 2,
          numeric_value_count: 2,
          sampled_submission_ids: ['sub-1', 'sub-2'],
        },
        {
          dimension_value: 'branch 2',
          aggregate_value: 1200,
          submission_count: 1,
          numeric_value_count: 1,
          sampled_submission_ids: ['sub-3'],
        },
      ],
      query_context: {
        source_table: 'form_submission_facts',
        read_only: true,
        order_direction: 'desc',
      },
    });

    const result = await executiveIntelligenceService.executeProjectFormRanking({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show top sales by branch',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
        limit: 10,
      },
    });

    expect(mockSubmissionReportService.getModuleReportAggregation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        metric_field_key: 'amount',
        dimension_field_key: 'branch',
        aggregate: 'sum',
        order_direction: 'desc',
        limit: 10,
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'ranking',
        validation: expect.objectContaining({ valid: true }),
        stages: [
          expect.objectContaining({
            tool_key: 'get_project_form_ranking',
            agent_type: 'ANALYTICS',
            read_only: true,
          }),
        ],
      })
    );
    expect(result.ranking).toEqual(
      expect.objectContaining({
        total_groups: 2,
        ranking: expect.objectContaining({
          direction: 'top',
          order_direction: 'desc',
          metric: expect.objectContaining({ label: 'Amount' }),
          dimension: expect.objectContaining({ label: 'Branch' }),
        }),
        rows: [
          expect.objectContaining({ rank: 1, dimension_value: 'branch 1', aggregate_value: 3000 }),
          expect.objectContaining({ rank: 2, dimension_value: 'branch 2', aggregate_value: 1200 }),
        ],
        data_access: expect.objectContaining({
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
          sandbox_used: false,
          tool: 'get_project_form_ranking',
        }),
      })
    );
  });

  test('executes deterministic project-form trend with period changes', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportTrend.mockResolvedValue({
      total_periods: 2,
      limit: 24,
      offset: 0,
      trend: {
        aggregate: 'sum',
        metric_field_key: 'amount',
        grain: 'month',
        time_source: 'form_submissions.created_at',
      },
      rows: [
        {
          period_start: '2026-06-01T00:00:00.000Z',
          aggregate_value: 1000,
          submission_count: 1,
          numeric_value_count: 1,
          sampled_submission_ids: ['sub-1'],
        },
        {
          period_start: '2026-07-01T00:00:00.000Z',
          aggregate_value: 1500,
          submission_count: 2,
          numeric_value_count: 2,
          sampled_submission_ids: ['sub-2', 'sub-3'],
        },
      ],
      query_context: {
        source_table: 'form_submission_facts',
        read_only: true,
        grain: 'month',
      },
    });

    const result = await executiveIntelligenceService.executeProjectFormTrend({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show sales trend monthly',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(mockSubmissionReportService.getModuleReportTrend).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        metric_field_key: 'amount',
        aggregate: 'sum',
        grain: 'month',
        limit: 24,
        offset: 0,
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'trend',
        validation: expect.objectContaining({ valid: true }),
        stages: [
          expect.objectContaining({
            tool_key: 'get_project_form_trend',
            agent_type: 'ANALYTICS',
            read_only: true,
          }),
        ],
      })
    );
    expect(result.trend).toEqual(
      expect.objectContaining({
        total_periods: 2,
        trend: expect.objectContaining({
          grain: 'month',
          aggregate: 'sum',
          metric: expect.objectContaining({ label: 'Amount' }),
        }),
        rows: [
          expect.objectContaining({
            sequence: 1,
            aggregate_value: 1000,
            change_from_previous: null,
          }),
          expect.objectContaining({
            sequence: 2,
            aggregate_value: 1500,
            change_from_previous: 500,
            percent_change_from_previous: 0.5,
          }),
        ],
        data_access: expect.objectContaining({
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
          sandbox_used: false,
          tool: 'get_project_form_trend',
        }),
      })
    );
  });

  test('executes deterministic project-form period comparison with controlled periods', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportPeriodComparison.mockResolvedValue({
      comparison: {
        aggregate: 'sum',
        metric_field_key: 'amount',
        time_source: 'form_submissions.created_at',
      },
      periods: [
        {
          label: 'current month',
          start: '2026-07-01T00:00:00.000Z',
          end: '2026-07-31T23:59:59.999Z',
          aggregate_value: 1500,
          submission_count: 2,
          numeric_value_count: 2,
          sampled_submission_ids: ['sub-2', 'sub-3'],
        },
        {
          label: 'previous month',
          start: '2026-06-01T00:00:00.000Z',
          end: '2026-06-30T23:59:59.999Z',
          aggregate_value: 1000,
          submission_count: 1,
          numeric_value_count: 1,
          sampled_submission_ids: ['sub-1'],
        },
      ],
      change: {
        absolute: 500,
        percent: 0.5,
        direction: 'increase',
      },
      query_context: {
        source_table: 'form_submission_facts',
        read_only: true,
        time_source: 'form_submissions.created_at',
      },
    });

    const result = await executiveIntelligenceService.executeProjectFormPeriodComparison({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Compare sales this month versus last month',
        comparisonGrain: 'month',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(mockSubmissionReportService.getModuleReportPeriodComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        metric_field_key: 'amount',
        aggregate: 'sum',
        periods: expect.arrayContaining([
          expect.objectContaining({ label: expect.stringContaining('current month') }),
          expect.objectContaining({ label: expect.stringContaining('previous month') }),
        ]),
        statuses: [],
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'comparison',
        validation: expect.objectContaining({ valid: true }),
        stages: [
          expect.objectContaining({
            tool_key: 'get_project_form_period_comparison',
            agent_type: 'ANALYTICS',
            read_only: true,
          }),
        ],
      })
    );
    expect(result.comparison).toEqual(
      expect.objectContaining({
        comparison: expect.objectContaining({
          grain: 'month',
          aggregate: 'sum',
          metric: expect.objectContaining({ label: 'Amount' }),
        }),
        change: expect.objectContaining({
          absolute: 500,
          percent: 0.5,
          direction: 'increase',
        }),
        data_access: expect.objectContaining({
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
          sandbox_used: false,
          tool: 'get_project_form_period_comparison',
        }),
      })
    );
  });

  test('executes deterministic project-form anomaly detection from bounded trend rows', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportTrend.mockResolvedValue({
      total_periods: 5,
      limit: 60,
      offset: 0,
      trend: {
        aggregate: 'sum',
        metric_field_key: 'amount',
        grain: 'month',
        time_source: 'form_submissions.created_at',
      },
      rows: [
        { period_start: '2026-03-01T00:00:00.000Z', aggregate_value: 100, submission_count: 1, numeric_value_count: 1, sampled_submission_ids: ['sub-1'] },
        { period_start: '2026-04-01T00:00:00.000Z', aggregate_value: 105, submission_count: 1, numeric_value_count: 1, sampled_submission_ids: ['sub-2'] },
        { period_start: '2026-05-01T00:00:00.000Z', aggregate_value: 98, submission_count: 1, numeric_value_count: 1, sampled_submission_ids: ['sub-3'] },
        { period_start: '2026-06-01T00:00:00.000Z', aggregate_value: 102, submission_count: 1, numeric_value_count: 1, sampled_submission_ids: ['sub-4'] },
        { period_start: '2026-07-01T00:00:00.000Z', aggregate_value: 500, submission_count: 1, numeric_value_count: 1, sampled_submission_ids: ['sub-5'] },
      ],
      query_context: {
        source_table: 'form_submission_facts',
        read_only: true,
        grain: 'month',
      },
    });

    const result = await executiveIntelligenceService.executeProjectFormAnomalies({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Detect sales spikes monthly',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(mockSubmissionReportService.getModuleReportTrend).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        project_id: 'project-sales',
        metric_field_key: 'amount',
        aggregate: 'sum',
        grain: 'month',
        limit: 60,
        offset: 0,
      })
    );
    expect(result.execution_plan).toEqual(
      expect.objectContaining({
        status: 'valid',
        execution_mode: 'anomaly',
        validation: expect.objectContaining({ valid: true }),
        stages: [
          expect.objectContaining({
            tool_key: 'get_project_form_anomalies',
            agent_type: 'ANALYTICS',
            read_only: true,
          }),
        ],
      })
    );
    expect(result.anomaly).toEqual(
      expect.objectContaining({
        total_periods: 5,
        total_anomalies: 1,
        anomaly_detection: expect.objectContaining({
          method: 'rolling_prior_period_baseline',
          metric: expect.objectContaining({ label: 'Amount' }),
        }),
        anomalies: [
          expect.objectContaining({
            period_start: '2026-07-01T00:00:00.000Z',
            direction: 'spike',
            severity: 'high',
          }),
        ],
        data_access: expect.objectContaining({
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
          sandbox_used: false,
          tool: 'get_project_form_anomalies',
        }),
      })
    );
  });

  test('creates a valid deterministic aggregation execution plan before data access', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    const result = await executiveIntelligenceService.createExecutionPlan({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show sales by branch',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(result.plan).toEqual(
      expect.objectContaining({
        operation: 'AGGREGATE',
        execution_mode: 'aggregation',
        status: 'valid',
        validation: expect.objectContaining({ valid: true, errors: [] }),
        policy: expect.objectContaining({
          read_only: true,
          raw_sql_allowed: false,
          generated_code_allowed: false,
          production_write_allowed: false,
        }),
        stages: [
          expect.objectContaining({
            stage_type: 'DATA_RETRIEVAL',
            agent_type: 'DATA_RETRIEVAL',
            tool_key: 'get_project_form_aggregation',
            read_only: true,
            inputs: expect.objectContaining({
              project_id: 'project-sales',
              semantic: expect.objectContaining({
                metrics: ['project-sales:amount'],
                dimensions: ['project-sales:branch'],
              }),
            }),
          }),
        ],
      })
    );
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'execution_planner',
        action: 'execution_plan_validated',
        status: 'completed',
      })
    );
  });

  test('rejects unsupported operations in the deterministic execution plan', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    const result = await executiveIntelligenceService.createExecutionPlan({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Export this report to PowerPoint',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
        outputFormats: ['pptx'],
      },
    });

    expect(result.plan).toEqual(
      expect.objectContaining({
        operation: 'EXPORT',
        execution_mode: 'unsupported',
        status: 'invalid',
        validation: expect.objectContaining({
          valid: false,
          errors: expect.arrayContaining([
            expect.objectContaining({ code: 'UNSUPPORTED_OPERATION_FOR_MVP' }),
          ]),
        }),
      })
    );
    expect(result.plan.policy).toEqual(
      expect.objectContaining({
        read_only: true,
        raw_sql_allowed: false,
        generated_code_allowed: false,
      })
    );
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'execution_planner',
        action: 'execution_plan_rejected',
        status: 'blocked',
        errorCategory: 'INVALID_EXECUTION_PLAN',
      })
    );
  });

  test('blocks secure project-form aggregation when semantic intent is unresolved', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    await expect(
      executiveIntelligenceService.executeProjectFormAggregation({
        user: {
          _id: 'user-owner',
          userId: 'HLU-OWNER',
          tenantId: 'tenant-1',
          email: 'owner@saby.test',
        },
        body: {
          message: 'Show quantum liquidity by branch',
          references: [
            {
              type: 'project_form',
              projectId: 'project-sales',
              projectFormId: 'form-sales',
            },
          ],
        },
      })
    ).rejects.toThrow('UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT');

    expect(mockSubmissionReportService.getModuleReportAggregation).not.toHaveBeenCalled();
  });

  test('executes count aggregation by resolved dimension without requiring a metric', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportAggregation.mockResolvedValue({
      total_groups: 1,
      limit: 25,
      offset: 0,
      aggregation: {
        aggregate: 'count',
        metric_field_key: null,
        dimension_field_key: 'branch',
      },
      rows: [
        {
          dimension_value: 'branch 1',
          aggregate_value: 4,
          submission_count: 4,
          numeric_value_count: 0,
          sampled_submission_ids: ['sub-1'],
        },
      ],
      query_context: {
        source_table: 'form_submission_facts',
        read_only: true,
      },
    });

    const result = await executiveIntelligenceService.executeProjectFormAggregation({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Count submissions by branch',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(mockSubmissionReportService.getModuleReportAggregation).toHaveBeenCalledWith(
      expect.objectContaining({
        metric_field_key: null,
        dimension_field_key: 'branch',
        aggregate: 'count',
      })
    );
    expect(result.aggregation.aggregation.metric).toBeNull();
    expect(result.aggregation.aggregation.aggregate).toBe('count');
  });

  test('passes resolved submission status filters into secure aggregation', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));
    mockSubmissionReportService.getModuleReportAggregation.mockResolvedValue({
      total_groups: 1,
      limit: 25,
      offset: 0,
      aggregation: {
        aggregate: 'sum',
        metric_field_key: 'amount',
        dimension_field_key: 'branch',
      },
      rows: [],
      query_context: {
        source_table: 'form_submission_facts',
        read_only: true,
      },
    });

    const result = await executiveIntelligenceService.executeProjectFormAggregation({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
        email: 'owner@saby.test',
      },
      body: {
        message: 'Show pending sales by branch',
        references: [
          {
            type: 'project_form',
            projectId: 'project-sales',
            projectFormId: 'form-sales',
          },
        ],
      },
    });

    expect(mockSubmissionReportService.getModuleReportAggregation).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ['pending'],
      })
    );
    expect(result.context.semantic_resolution.resolved_filters).toEqual([
      expect.objectContaining({
        type: 'submission_status',
        values: ['pending'],
        source: 'message',
      }),
    ]);
    expect(result.aggregation.data_access.resolved_filters).toEqual([
      expect.objectContaining({
        type: 'submission_status',
        values: ['pending'],
      }),
    ]);
  });

  test('returns clarification details when secure aggregation semantic intent is unresolved', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    await expect(
      executiveIntelligenceService.executeProjectFormAggregation({
        user: {
          _id: 'user-owner',
          userId: 'HLU-OWNER',
          tenantId: 'tenant-1',
          email: 'owner@saby.test',
        },
        body: {
          message: 'Show quantum liquidity by branch',
          references: [
            {
              type: 'project_form',
              projectId: 'project-sales',
              projectFormId: 'form-sales',
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      message: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      details: expect.objectContaining({
        type: 'semantic_clarification_required',
        unresolved_terms: expect.arrayContaining(['quantum', 'liquidity']),
        options: expect.objectContaining({
          dimensions: expect.arrayContaining([
            expect.objectContaining({ ref: 'project-sales:branch' }),
          ]),
        }),
      }),
    });

    expect(mockSubmissionReportService.getModuleReportAggregation).not.toHaveBeenCalled();
  });

  test('returns a blocked diagnostic context when no active artifact exists', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(null));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-owner',
        userId: 'HLU-OWNER',
        tenantId: 'tenant-1',
      },
      body: {
        message: 'Generate a report',
      },
    });

    expect(context.execution_allowed).toBe(false);
    expect(context.artifact_status).toBe('missing');
    expect(context.artifact_stale).toBe(true);
    expect(context.blocking_reasons).toEqual(['MISSING_ACTIVE_TENANT_ARTIFACT']);
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request_context_blocked',
        status: 'blocked',
        errorCategory: 'MISSING_ACTIVE_TENANT_ARTIFACT',
      })
    );
  });

  test('blocks submitter-only users from workspace Intelligence', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    await expect(
      executiveIntelligenceService.createRequestContext({
        user: {
          _id: 'user-submit',
          userId: 'HLU-SUBMIT',
          tenantId: 'tenant-1',
          email: 'submitter@saby.test',
        },
        body: {
          message: 'Generate a report',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'SUBMITTER_ONLY_USER_BLOCKED_FROM_INTELLIGENCE',
    });
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request_context_blocked',
        status: 'blocked',
        errorCategory: 'SUBMITTER_ONLY_USER_BLOCKED_FROM_INTELLIGENCE',
      })
    );
  });

  test('blocks unknown project form references before any model or tool execution', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    await expect(
      executiveIntelligenceService.createRequestContext({
        user: {
          _id: 'user-owner',
          userId: 'HLU-OWNER',
          tenantId: 'tenant-1',
          email: 'owner@saby.test',
        },
        body: {
          message: 'Generate a report',
          references: [
            {
              type: 'project_form',
              projectId: 'project-unknown',
              projectFormId: 'form-unknown',
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'DENIED_PROJECT_FORM_REFERENCES',
    });
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request_context_blocked',
        status: 'blocked',
        errorCategory: 'DENIED_PROJECT_FORM_REFERENCES',
        metadata: expect.objectContaining({
          deniedReferences: [
            expect.objectContaining({
              projectId: 'project-unknown',
              reason: 'reference_not_found_in_active_artifact',
            }),
          ],
        }),
      })
    );
  });

  test('limits non-privileged workspace actors to assigned nodes and descendants', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    const context = await executiveIntelligenceService.createRequestContext({
      user: {
        _id: 'user-team',
        userId: 'HLU-TEAM',
        tenantId: 'tenant-1',
        email: 'team@saby.test',
      },
      body: {
        message: 'Analyze this branch',
        requestedNodeIds: ['HLN-BRANCH-1'],
      },
    });

    expect(context.execution_allowed).toBe(true);
    expect(context.scope_snapshot).toEqual(
      expect.objectContaining({
        scope_status: 'resolved',
        scope_type: 'requested_assigned_nodes_with_descendants',
        visible_node_ids: ['node-branch-1'],
        allowed_requested_node_ids: ['node-branch-1'],
        denied_node_ids: [],
        descendant_expansion: 'applied',
      })
    );
    expect(context.scope_snapshot.applied_policies).toEqual(
      expect.arrayContaining([
        'non_privileged_users_limited_to_assigned_nodes',
        'requested_nodes_must_be_inside_assigned_scope',
      ])
    );
  });

  test('blocks non-privileged workspace actors from requested nodes outside their scope', async () => {
    mockTenantKnowledgeArtifact.findOne.mockReturnValue(activeArtifactChain(activeArtifactRecord()));

    await expect(
      executiveIntelligenceService.createRequestContext({
        user: {
          _id: 'user-team',
          userId: 'HLU-TEAM',
          tenantId: 'tenant-1',
          email: 'team@saby.test',
        },
        body: {
          message: 'Analyze another region',
          requestedNodeIds: ['HLN-REGION-2'],
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'DENIED_NODE_REFERENCES',
    });
    expect(mockExecutiveIntelligenceAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request_context_blocked',
        status: 'blocked',
        errorCategory: 'DENIED_NODE_REFERENCES',
        metadata: expect.objectContaining({
          deniedNodes: [
            expect.objectContaining({
              node_ref: 'node-region-2',
              reason: 'requested_node_outside_user_scope',
            }),
          ],
        }),
      })
    );
  });
});
