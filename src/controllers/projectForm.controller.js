const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const {
  projectFormService,
  projectFormWorkspaceService,
} = require('../services');
const projectFormPublicAccessService = require('../services/projectFormPublicAccess.service');
const {
  invalidateTenantEntityCaches,
} = require('../services/copilotEntityResolver.service');

const invalidateProjectResolverCache = async (tenantId) => {
  if (!tenantId) return;
  try {
    await invalidateTenantEntityCaches({
      tenantId: String(tenantId),
      entityType: 'project',
    });
  } catch (_) {
    // non-blocking cache invalidation
  }
};

const resolveWorkspaceReadFilter = async ({
  tenantId,
  userId,
  workspaceId,
}) => {
  const requestedWorkspaceId = String(workspaceId || '').trim();
  if (requestedWorkspaceId) {
    await projectFormWorkspaceService.assertWorkspaceAccess({
      tenantId,
      workspaceId: requestedWorkspaceId,
      userId,
    });
    if (
      requestedWorkspaceId === projectFormWorkspaceService.DEFAULT_WORKSPACE_ID
    ) {
      return {
        $or: [
          { workspaceId: requestedWorkspaceId },
          { workspaceId: projectFormWorkspaceService.LEGACY_DEFAULT_WORKSPACE_ID },
          { workspaceId: { $exists: false } },
          { workspaceId: null },
          { workspaceId: '' },
        ],
      };
    }
    return { workspaceId: requestedWorkspaceId };
  }

  const accessibleWorkspaceIds =
    await projectFormWorkspaceService.getAccessibleWorkspaceIds({
      tenantId,
      userId,
    });

  if (!accessibleWorkspaceIds.length) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have access to any workspace'
    );
  }

  const normalizedWorkspaceIds = Array.from(new Set(accessibleWorkspaceIds));
  const includesDefaultWorkspace = normalizedWorkspaceIds.includes(
    projectFormWorkspaceService.DEFAULT_WORKSPACE_ID
  );

  if (includesDefaultWorkspace) {
    return {
      $or: [
        { workspaceId: { $in: normalizedWorkspaceIds } },
        { workspaceId: projectFormWorkspaceService.LEGACY_DEFAULT_WORKSPACE_ID },
        { workspaceId: { $exists: false } },
        { workspaceId: null },
        { workspaceId: '' },
      ],
    };
  }

  return { workspaceId: { $in: normalizedWorkspaceIds } };
};

const assertWorkspaceWriteAccessForProjectForm = async ({
  projectForm,
  userId,
}) => {
  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  const workspaceId = String(
    projectForm.workspaceId ||
      projectFormWorkspaceService.DEFAULT_WORKSPACE_ID
  ).trim();

  await projectFormWorkspaceService.assertWorkspaceAccess({
    tenantId: projectForm.tenantId,
    workspaceId:
      workspaceId || projectFormWorkspaceService.DEFAULT_WORKSPACE_ID,
    userId,
    allowedRoles: [
      projectFormWorkspaceService.WORKSPACE_ROLE_OWNER,
      projectFormWorkspaceService.WORKSPACE_ROLE_EDITOR,
    ],
  });
};

const assertWorkspaceReadAccessForProjectForm = async ({
  projectForm,
  userId,
}) => {
  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  const workspaceId = String(
    projectForm.workspaceId ||
      projectFormWorkspaceService.DEFAULT_WORKSPACE_ID
  ).trim();

  await projectFormWorkspaceService.assertWorkspaceAccess({
    tenantId: projectForm.tenantId,
    workspaceId:
      workspaceId || projectFormWorkspaceService.DEFAULT_WORKSPACE_ID,
    userId,
  });
};

/**
 * Create a project form
 */
const createProjectForm = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const createdBy = req.user._id;

  const projectForm = await projectFormService.createProjectForm(
    req.body,
    tenantId,
    createdBy,
    { actorUserId: createdBy }
  );
  await invalidateProjectResolverCache(tenantId || projectForm?.tenantId);
  console.log('🔍 [SERVER DATA] Module Created:', req.body);
  res.status(httpStatus.CREATED).send({
    message: 'Module created successfully',
    projectForm,
    formId: projectForm.projectId,
    publicRef: projectForm.publicRef,
    shareRef: projectForm.shareRef,
    shareCode: projectForm.shareCode,
  });
});

/**
 * Bootstrap tenant system forms (User Profile + Node Profile)
 */
const bootstrapSystemForms = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const createdBy = req.user._id;
  const { targets, force = false } = req.body || {};

  const result = await projectFormService.bootstrapSystemFormsForTenant({
    tenantId,
    createdBy,
    targets,
    force,
  });
  await invalidateProjectResolverCache(tenantId);

  res.status(httpStatus.OK).send({
    message: 'System forms bootstrap completed',
    ...result,
  });
});

/**
 * Submit a system form (direct DB update path).
 */
const submitSystemForm = catchAsync(async (req, res) => {
  const { publicRef } = req.params;
  const { targetId = null, submissionData = {} } = req.body || {};

  const result = await projectFormService.submitSystemFormByPublicRef({
    publicRef,
    actorUser: req.user,
    targetId,
    submissionData,
  });

  res.status(httpStatus.OK).send(result);
});

const applyDefaultStandardFormFilter = (filter = {}, query = {}) => {
  const requestedCategory = query?.['identity.category'];
  const requestedTarget = query?.['metadata.systemTarget'];

  if (requestedCategory || requestedTarget) {
    return filter;
  }

  return {
    ...filter,
    'identity.category': { $ne: 'system' },
  };
};

/**
 * Get the current tenant's canonical system form by target.
 */
const getSystemProjectForm = catchAsync(async (req, res) => {
  const { target } = req.params;
  const projectForm = await projectFormService.getSystemProjectFormForTenant({
    tenantId: req.user.tenantId,
    target,
    createdBy: req.user._id,
  });

  res.send(projectForm);
});

/**
 * Get all project forms
 */
const getProjectForms = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    'status',
    'workspaceId',
    'identity.name',
    'identity.tags',
    'capabilities.experience.security.mode',
    'identity.category',
    'metadata.systemTarget',
    'identity.status',
  ]);

  const { q, tenantId, workspaceId } = req.query;
  const workspaceFilter = await resolveWorkspaceReadFilter({
    tenantId: req.user.tenantId,
    userId: req.user._id,
    workspaceId,
  });
  const normalizedFilter = applyDefaultStandardFormFilter(filter, req.query);

  // If search query is provided, use search functionality
  if (q) {
    const searchFilter = tenantId
      ? { tenantId }
      : { tenantId: req.user.tenantId };
    Object.assign(searchFilter, workspaceFilter);
    Object.assign(searchFilter, applyDefaultStandardFormFilter({}, req.query));
    const options = pick(req.query, ['sortBy', 'limit', 'page']);
    const result = await projectFormService.searchProjectForms(
      q,
      searchFilter,
      options
    );
    return res.send(result);
  }

  // Apply tenant filter
  if (req.user.tenantId) {
    normalizedFilter.tenantId = req.user.tenantId;
  }
  Object.assign(normalizedFilter, workspaceFilter);

  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
  const result = await projectFormService.queryProjectForms(normalizedFilter, options);

  res.send(result);
});

/**
 * List workspaces for current tenant/user
 */
const listProjectWorkspaces = catchAsync(async (req, res) => {
  const { tenantId, _id: userId } = req.user;
  const result = await projectFormWorkspaceService.listWorkspaces({
    tenantId,
    userId,
  });
  console.log(
    '[ProjectForms][listWorkspaces]',
    JSON.stringify({
      email: req.user?.email || null,
      userId: String(userId || ''),
      tenantId: tenantId || null,
      defaultWorkspaceId: result?.defaultWorkspaceId || null,
      workspaceCount: Array.isArray(result?.workspaces)
        ? result.workspaces.length
        : 0,
      workspaces: Array.isArray(result?.workspaces)
        ? result.workspaces.map((workspace) => ({
            workspaceId: workspace.workspaceId,
            name: workspace.name,
            visibility: workspace.visibility,
            role: workspace.role,
            formCount: workspace.formCount,
          }))
        : [],
    })
  );
  res.send(result);
});

/**
 * Create workspace
 */
const createProjectWorkspace = catchAsync(async (req, res) => {
  const { tenantId, _id: userId } = req.user;
  const workspace = await projectFormWorkspaceService.createWorkspace({
    tenantId,
    actorUserId: userId,
    name: req.body?.name,
    visibility: req.body?.visibility,
  });
  res.status(httpStatus.CREATED).send({
    message: 'Workspace created successfully',
    workspace,
  });
});

/**
 * Rename workspace
 */
const renameProjectWorkspace = catchAsync(async (req, res) => {
  const { tenantId, _id: userId } = req.user;
  const { workspaceId } = req.params;
  const workspace = await projectFormWorkspaceService.renameWorkspace({
    tenantId,
    actorUserId: userId,
    workspaceId,
    name: req.body?.name,
    visibility: req.body?.visibility,
  });
  res.send({
    message: 'Workspace renamed successfully',
    workspace,
  });
});

/**
 * Add workspace member
 */
const addProjectWorkspaceMember = catchAsync(async (req, res) => {
  const { tenantId, _id: userId } = req.user;
  const { workspaceId } = req.params;
  const result = await projectFormWorkspaceService.addWorkspaceMember({
    tenantId,
    actorUserId: userId,
    workspaceId,
    role: req.body?.role,
    userId: req.body?.userId,
    email: req.body?.email,
  });
  res.send({
    message: 'Workspace member updated successfully',
    ...result,
  });
});

/**
 * Remove workspace member
 */
const removeProjectWorkspaceMember = catchAsync(async (req, res) => {
  const { tenantId, _id: actorUserId } = req.user;
  const { workspaceId, userId } = req.params;
  const workspace = await projectFormWorkspaceService.removeWorkspaceMember({
    tenantId,
    actorUserId,
    workspaceId,
    userId,
  });
  res.send({
    message: 'Workspace member removed successfully',
    workspace,
  });
});

/**
 * Leave workspace
 */
const leaveProjectWorkspace = catchAsync(async (req, res) => {
  const { tenantId, _id: actorUserId } = req.user;
  const { workspaceId } = req.params;
  const workspace = await projectFormWorkspaceService.leaveWorkspace({
    tenantId,
    actorUserId,
    workspaceId,
  });
  res.send({
    message: 'Workspace left successfully',
    workspace,
  });
});

/**
 * Delete workspace and archive linked forms
 */
const deleteProjectWorkspace = catchAsync(async (req, res) => {
  const { tenantId, _id: actorUserId } = req.user;
  const { workspaceId } = req.params;
  const result = await projectFormWorkspaceService.deleteWorkspace({
    tenantId,
    actorUserId,
    workspaceId,
  });
  await invalidateProjectResolverCache(tenantId);
  res.send({
    message: 'Workspace deleted successfully',
    ...result,
  });
});

/**
 * Duplicate a form by projectId
 */
const duplicateProjectForm = catchAsync(async (req, res) => {
  const { tenantId, _id: actorUserId } = req.user;
  const { projectId } = req.params;
  const duplicated = await projectFormService.duplicateProjectFormByProjectId({
    projectId,
    tenantId,
    actorUserId,
    name: req.body?.name,
    workspaceId: req.body?.workspaceId,
  });
  await invalidateProjectResolverCache(tenantId);
  res.status(httpStatus.CREATED).send({
    message: 'Module duplicated successfully',
    projectForm: duplicated,
    formId: duplicated.projectId,
    publicRef: duplicated.publicRef,
    shareRef: duplicated.shareRef,
    shareCode: duplicated.shareCode,
  });
});

/**
 * Get project forms by tenant
 */
const getProjectFormsByTenant = catchAsync(async (req, res) => {
  const { tenantId } = req.params;
  const filter = pick(req.query, [
    'status',
    'workspaceId',
    'identity.name',
    'identity.tags',
    'identity.category',
    'metadata.systemTarget',
    'identity.status',
  ]);
  const workspaceFilter = await resolveWorkspaceReadFilter({
    tenantId,
    userId: req.user._id,
    workspaceId: filter.workspaceId,
  });
  const normalizedFilter = applyDefaultStandardFormFilter(filter, req.query);
  Object.assign(normalizedFilter, workspaceFilter);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
  let result = await projectFormService.getProjectFormsByTenant(
    tenantId,
    normalizedFilter,
    options
  );

  const hasSystemForms =
    Array.isArray(result?.results) &&
    result.results.some(
      (item) => item?.metadata?.formCategory === 'system'
    );

  if (!hasSystemForms && req.user?._id) {
    try {
      await projectFormService.bootstrapSystemFormsForTenant({
        tenantId,
        createdBy: req.user._id,
      });
      result = await projectFormService.getProjectFormsByTenant(
        tenantId,
        normalizedFilter,
        options
      );
    } catch (bootstrapError) {
      console.warn('System form bootstrap skipped during tenant list fetch', {
        tenantId,
        userId: req.user?._id,
        error: bootstrapError?.message,
      });
    }
  }

  console.log(
    '[ProjectForms][getByTenant]',
    JSON.stringify({
      email: req.user?.email || null,
      userId: String(req.user?._id || ''),
      sessionTenantId: req.user?.tenantId || null,
      requestedTenantId: tenantId || null,
      requestedWorkspaceId: req.query?.workspaceId || null,
      normalizedFilter,
      totalResults: result?.totalResults || 0,
      resultCount: Array.isArray(result?.results) ? result.results.length : 0,
      sample: Array.isArray(result?.results)
        ? result.results.slice(0, 5).map((item) => ({
            id: item?.id || null,
            projectId: item?.projectId || null,
            workspaceId: item?.workspaceId || null,
            projectName: item?.identity?.name || null,
            formCategory: item?.identity?.category || null,
          }))
        : [],
    })
  );

  res.send(result);
});

/**
 * Get project forms by user
 */
const getProjectFormsByUser = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const filter = pick(req.query, [
    'status',
    'workspaceId',
    'identity.name',
    'identity.tags',
    'identity.category',
    'metadata.systemTarget',
    'identity.status',
  ]);
  const workspaceFilter = await resolveWorkspaceReadFilter({
    tenantId: req.user.tenantId,
    userId: req.user._id,
    workspaceId: filter.workspaceId,
  });
  const normalizedFilter = applyDefaultStandardFormFilter(filter, req.query);
  Object.assign(normalizedFilter, workspaceFilter);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);

  const result = await projectFormService.getProjectFormsByUser(
    userId,
    normalizedFilter,
    options
  );

  res.send(result);
});

/**
 * Get a project form by ID
 */
const getProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;
  const options = pick(req.query, ['populate']);

  const projectForm = await projectFormService.getProjectFormById(
    projectFormId,
    options
  );
  await assertWorkspaceReadAccessForProjectForm({
    projectForm,
    userId: req.user._id,
  });

  res.send(projectForm);
});

/**
 * Get a project form by project ID
 */
const getProjectFormByProjectId = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const options = pick(req.query, ['populate']);

  const projectForm = await projectFormService.getProjectFormByProjectId(
    projectId,
    options
  );
  await assertWorkspaceReadAccessForProjectForm({
    projectForm,
    userId: req.user._id,
  });

  // Increment views if not the owner viewing (only for authenticated users)
  if (
    req.user &&
    projectForm.createdBy &&
    req.user._id.toString() !== projectForm.createdBy._id.toString()
  ) {
    await projectFormService.incrementProjectViews(projectId);
  } else if (!req.user) {
    // For anonymous/public access, always increment views
    await projectFormService.incrementProjectViews(projectId);
  }

  res.send(projectForm);
});

/**
 * Get project form by canonical public reference (authenticated studio/edit use)
 */
const getProjectFormByPublicRef = catchAsync(async (req, res) => {
  const { publicRef } = req.params;
  const options = pick(req.query, ['populate']);

  const projectForm = await projectFormService.getProjectFormByPublicRef(
    publicRef,
    options
  );
  await assertWorkspaceReadAccessForProjectForm({
    projectForm,
    userId: req.user._id,
  });

  res.send(projectForm);
});

/**
 * Strict public read endpoint by reference (publicRef or legacy projectId)
 */
const getPublicProjectFormByReference = catchAsync(async (req, res) => {
  const { reference } = req.params;
  const result = await projectFormService.getPublicProjectFormByReference(
    reference
  );
  const qrContext = projectFormService.buildPublicQrContext(result.projectForm, {
    resolvedBy: result.resolvedBy,
  });

  const requireToken = String(process.env.PUBLIC_FORM_REQUIRE_TOKEN || 'false')
    .toLowerCase() === 'true';

  if (requireToken) {
    const incomingToken =
      req.get('x-form-access-token') || req.query?.accessToken || null;
    const configuredToken = result?.projectForm?.publicAccessToken || null;

    if (!configuredToken || !incomingToken || incomingToken !== configuredToken) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid form access token');
    }
  }

  const response = {
    ...result.form,
    canonicalRef: result.canonicalRef,
    legacyResolved: result.legacyResolved,
    canonicalPath: `/s/${result.canonicalRef}`,
    secureMode: qrContext.secureMode,
    requiresIdentityChallenge: qrContext.requiresIdentityChallenge,
    qrContextToken: qrContext.qrContextToken,
    qrContextExpiresAt: qrContext.qrContextExpiresAt,
    qrVersion: qrContext.qrVersion,
    schemaVersion: qrContext.schemaVersion,
    schemaHash: qrContext.schemaHash,
    pipelineTarget: qrContext.pipelineTarget,
  };

  await projectFormService.incrementProjectViews(result.projectForm.projectId);

  res.send(response);
});

/**
 * Strict public read endpoint by short code.
 */
const getPublicProjectFormByShortCode = catchAsync(async (req, res) => {
  const { shortCode } = req.params;
  const result = await projectFormService.getPublicProjectFormByShortCode(
    shortCode
  );
  const qrContext = projectFormService.buildPublicQrContext(result.projectForm, {
    resolvedBy: result.resolvedBy,
  });

  const requireToken = String(process.env.PUBLIC_FORM_REQUIRE_TOKEN || 'false')
    .toLowerCase() === 'true';

  if (requireToken) {
    const incomingToken =
      req.get('x-form-access-token') || req.query?.accessToken || null;
    const configuredToken = result?.projectForm?.publicAccessToken || null;

    if (!configuredToken || !incomingToken || incomingToken !== configuredToken) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid form access token');
    }
  }

  const response = {
    ...result.form,
    canonicalRef: result.canonicalRef,
    legacyResolved: false,
    canonicalPath: `/s/${result.canonicalRef}`,
    shortCode,
    secureMode: qrContext.secureMode,
    requiresIdentityChallenge: qrContext.requiresIdentityChallenge,
    qrContextToken: qrContext.qrContextToken,
    qrContextExpiresAt: qrContext.qrContextExpiresAt,
    qrVersion: qrContext.qrVersion,
    schemaVersion: qrContext.schemaVersion,
    schemaHash: qrContext.schemaHash,
    pipelineTarget: qrContext.pipelineTarget,
  };

  await projectFormService.incrementProjectViews(result.projectForm.projectId);

  res.send(response);
});

/**
 * Request secure magic-link for single-QR passwordless public form access.
 */
const requestPublicAccessLink = catchAsync(async (req, res) => {
  const { reference, identifier, qrContextToken } = req.body;
  const result = await projectFormPublicAccessService.issueAccessLink({
    reference,
    identifier,
    qrContextToken: qrContextToken || null,
  });

  res.status(httpStatus.OK).send(result);
});

/**
 * Request OTP challenge for secure public form access.
 */
const requestPublicAccessCode = catchAsync(async (req, res) => {
  const { reference, channel, identifier, qrContextToken } = req.body;
  const result = await projectFormPublicAccessService.requestAccessCode({
    reference,
    channel,
    identifier,
    qrContextToken: qrContextToken || null,
  });

  res.status(httpStatus.OK).send(result);
});

/**
 * Verify OTP challenge and return secure access token/context.
 */
const verifyPublicAccessCode = catchAsync(async (req, res) => {
  const { challengeId, otp } = req.body;
  const result = await projectFormPublicAccessService.verifyAccessCode({
    challengeId,
    otp,
  });

  res.status(httpStatus.OK).send(result);
});

/**
 * Resend OTP challenge code for secure public form access.
 */
const resendPublicAccessCode = catchAsync(async (req, res) => {
  const { challengeId } = req.body;
  const result = await projectFormPublicAccessService.resendAccessCode({
    challengeId,
  });

  res.status(httpStatus.OK).send(result);
});

/**
 * Consume secure magic-link token and return access context + assigned nodes.
 */
const consumePublicAccessLink = catchAsync(async (req, res) => {
  const accessToken =
    req.query?.accessToken ||
    req.body?.accessToken ||
    req.get('x-form-access-token') ||
    null;

  const result = await projectFormPublicAccessService.consumeAccessLink({
    accessToken,
  });

  res.status(httpStatus.OK).send(result);
});

/**
 * Get system-form prefill data for secure public access.
 */
const getPublicAccessPrefill = catchAsync(async (req, res) => {
  const accessToken =
    req.query?.accessToken ||
    req.get('x-form-access-token') ||
    null;
  const nodeId = req.query?.nodeId || null;

  const result = await projectFormPublicAccessService.getSystemFormPrefillByAccess({
    accessToken,
    nodeId,
  });

  res.status(httpStatus.OK).send(result);
});

/**
 * Submit secure public form payload via unified Postgres pipeline.
 */
const submitPublicAccessForm = catchAsync(async (req, res) => {
  const accessToken =
    req.body?.accessToken ||
    req.get('x-form-access-token') ||
    req.query?.accessToken ||
    null;

  const result = await projectFormPublicAccessService.submitWithAccess({
    accessToken,
    nodeId: req.body?.nodeId,
    submissionData: req.body?.submissionData,
    submittedAt: req.body?.submittedAt || null,
    metadata: req.body?.metadata || {},
  });

  res.status(httpStatus.CREATED).send(result);
});

/**
 * Get secure public-access metrics for one module.
 */
const getProjectPublicAccessMetrics = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const tenantId = req.user?.tenantId;
  const recentWindowHours = Number(req.query?.windowHours || 24);
  const projectForm = await projectFormService.getProjectFormByProjectId(projectId);
  await assertWorkspaceReadAccessForProjectForm({
    projectForm,
    userId: req.user._id,
  });

  const metrics =
    await projectFormPublicAccessService.getProjectPublicAccessMetrics({
      tenantId,
      projectId,
      recentWindowHours,
    });

  res.send(metrics);
});

/**
 * Get (or create) canonical storage folder for a module
 */
const getProjectStorageFolder = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const folder =
    await projectFormService.getProjectStorageFolderByProjectId(projectId);

  res.send(folder);
});

/**
 * Update a project form by ID
 */
const updateProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;
  const options = pick(req.query, ['populate']);
  const existingProjectForm = await projectFormService.getProjectFormById(
    projectFormId
  );
  await assertWorkspaceWriteAccessForProjectForm({
    projectForm: existingProjectForm,
    userId: req.user._id,
  });

  const projectForm = await projectFormService.updateProjectFormById(
    projectFormId,
    req.body,
    {
      ...options,
      actorUserId: req.user._id,
    }
  );
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Module updated successfully',
    projectForm,
  });
});

/**
 * Update a project form by project ID
 */
const updateProjectFormByProjectId = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const options = pick(req.query, ['populate']);
  const existingProjectForm = await projectFormService.getProjectFormByProjectId(
    projectId
  );
  await assertWorkspaceWriteAccessForProjectForm({
    projectForm: existingProjectForm,
    userId: req.user._id,
  });

  const projectForm = await projectFormService.updateProjectFormByProjectId(
    projectId,
    req.body,
    {
      ...options,
      actorUserId: req.user._id,
    }
  );
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Module updated successfully',
    projectForm,
  });
});



/**
 * Soft delete a project form
 */
const softDeleteProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;
  const existingProjectForm = await projectFormService.getProjectFormById(
    projectFormId
  );
  await assertWorkspaceWriteAccessForProjectForm({
    projectForm: existingProjectForm,
    userId: req.user._id,
  });

  const projectForm = await projectFormService.softDeleteProjectFormById(
    projectFormId
  );
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Module deleted successfully',
    projectForm,
  });
});

/**
 * Publish a project form
 */
const publishProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;
  const { calendarGeneration } = req.body;
  const existingProjectForm = await projectFormService.getProjectFormById(
    projectFormId
  );
  await assertWorkspaceWriteAccessForProjectForm({
    projectForm: existingProjectForm,
    userId: req.user._id,
  });

  // Extract calendar options if provided
  const publishOptions = {};
  if (calendarGeneration) {
    publishOptions.startDate = calendarGeneration.startDate;
    publishOptions.endDate = calendarGeneration.endDate;
    publishOptions.monthsToGenerate = calendarGeneration.monthsToGenerate;
    publishOptions.allowBackdating = calendarGeneration.allowBackdating;
  }

  const projectForm = await projectFormService.publishProjectForm(
    projectFormId,
    publishOptions
  );
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Module published successfully',
    projectForm,
    calendarGenerated: calendarGeneration ? true : false,
  });
});

/**
 * Unpublish a project form
 */
const unpublishProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;
  const existingProjectForm = await projectFormService.getProjectFormById(
    projectFormId
  );
  await assertWorkspaceWriteAccessForProjectForm({
    projectForm: existingProjectForm,
    userId: req.user._id,
  });

  const projectForm = await projectFormService.unpublishProjectForm(projectFormId);
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Module unpublished successfully',
    projectForm,
  });
});

/**
 * Archive a project form
 */
const archiveProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;
  const existingProjectForm = await projectFormService.getProjectFormById(
    projectFormId
  );
  await assertWorkspaceWriteAccessForProjectForm({
    projectForm: existingProjectForm,
    userId: req.user._id,
  });

  const projectForm = await projectFormService.archiveProjectForm(
    projectFormId
  );
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Module archived successfully',
    projectForm,
  });
});

/**
 * Delete a project form (soft-delete or permanent based on role)
 */
const deleteProjectForm = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const { permanent } = req.body;
  const userId = req.user._id;
  const userRole = req.user.role;
  const existingProjectForm = await projectFormService.getProjectFormByProjectId(
    projectId
  );
  await assertWorkspaceWriteAccessForProjectForm({
    projectForm: existingProjectForm,
    userId,
  });

  // Only sabyUser can do permanent deletion
  if (permanent && userRole !== 'sabyUser') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Permanent deletion requires sabyUser role'
    );
  }

  const result = await projectFormService.deleteProjectForm(
    projectId,
    userId,
    permanent
  );
  await invalidateProjectResolverCache(req.user?.tenantId);
  res.send(result);
});

/**
 * Restore a soft-deleted project form
 */
const restoreProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;

  const projectForm = await projectFormService.restoreProjectFormById(projectFormId);
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Module restored successfully',
    projectForm,
  });
});

/**
 * Get all soft-deleted project forms (within 14-day grace period)
 */
const getDeletedProjectForms = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;

  const deletedForms = await projectFormService.getDeletedProjectForms(tenantId);

  res.send({
    results: deletedForms,
    count: deletedForms.length,
  });
});

/**
 * Update payment configuration for a project form
 */
const updatePaymentConfig = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const { enabledChannels, channelConfigs } = req.body;

  const projectForm = await projectFormService.getProjectFormByProjectId(projectId);
  await assertWorkspaceWriteAccessForProjectForm({
    projectForm,
    userId: req.user._id,
  });

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  // Check if form has financial tag
  const hasFinancial =
    projectForm.identity?.tags?.includes('financial') ||
    projectForm.identity?.tags?.includes('payment');

  if (!hasFinancial) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Payment channels are only available for modules with a financial tag'
    );
  }

  projectForm.capabilities = projectForm.capabilities || {};
  projectForm.capabilities.transaction = projectForm.capabilities.transaction || {};
  projectForm.capabilities.transaction.payment = {
    enabled: true,
    enabledChannels,
    channelConfigs,
    defaultChannel: enabledChannels[0] || 'sabypipe',
  };

  await projectForm.save();
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Payment configuration updated',
    payment: projectForm.capabilities.transaction.payment,
  });
});

/**
 * Get project form analytics
 */
const getProjectAnalytics = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const projectForm = await projectFormService.getProjectFormByProjectId(projectId);
  await assertWorkspaceReadAccessForProjectForm({
    projectForm,
    userId: req.user._id,
  });

  const analytics = await projectFormService.getProjectAnalytics(projectId);

  res.send(analytics);
});

/**
 * Get schema profile by project ID
 */
const getProjectSchemaProfile = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const projectForm = await projectFormService.getProjectFormByProjectId(projectId);
  await assertWorkspaceReadAccessForProjectForm({
    projectForm,
    userId: req.user._id,
  });
  const profile = await projectFormService.getProjectSchemaProfile(projectId);
  res.send(profile);
});

/**
 * Increment project submissions (for form responses)
 */
const incrementSubmissions = catchAsync(async (req, res) => {
  const { projectId } = req.params;

  await projectFormService.incrementProjectSubmissions(projectId);

  res.send({
    message: 'Submission count updated successfully',
  });
});

/**
 * Bulk operations on project forms
 */
const bulkOperations = catchAsync(async (req, res) => {
  const { operations } = req.body;

  if (!operations || !Array.isArray(operations)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Operations array is required');
  }

  const results = await projectFormService.bulkOperations(operations);

  res.send({
    message: 'Bulk operations completed',
    results,
  });
});

/**
 * Search project forms
 */
const searchProjectForms = catchAsync(async (req, res) => {
  const { q, workspaceId } = req.query;

  if (!q) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Search query is required');
  }

  const workspaceFilter = await resolveWorkspaceReadFilter({
    tenantId: req.user.tenantId,
    userId: req.user._id,
    workspaceId,
  });

  const filter = {
    tenantId: req.user.tenantId,
  };
  Object.assign(filter, workspaceFilter);
  const normalizedFilter = applyDefaultStandardFormFilter(filter, req.query);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);

  const result = await projectFormService.searchProjectForms(
    q,
    normalizedFilter,
    options
  );

  res.send(result);
});

/**
 * Get project form statistics
 */
const getProjectFormStats = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  // Get basic statistics
  const totalProjects = await projectFormService.queryProjectForms(
    { tenantId },
    { limit: 0 }
  );

  const publishedProjects = await projectFormService.queryProjectForms(
    { tenantId, 'identity.status': 'published' },
    { limit: 0 }
  );

  const draftProjects = await projectFormService.queryProjectForms(
    { tenantId, 'identity.status': 'draft' },
    { limit: 0 }
  );

  const archivedProjects = await projectFormService.queryProjectForms(
    { tenantId, 'identity.status': 'archived' },
    { limit: 0 }
  );

  res.send({
    total: totalProjects.totalResults,
    published: publishedProjects.totalResults,
    draft: draftProjects.totalResults,
    archived: archivedProjects.totalResults,
  });
});

module.exports = {
  createProjectForm,
  getProjectForms,
  listProjectWorkspaces,
  createProjectWorkspace,
  renameProjectWorkspace,
  addProjectWorkspaceMember,
  removeProjectWorkspaceMember,
  leaveProjectWorkspace,
  deleteProjectWorkspace,
  getProjectFormsByTenant,
  getProjectFormsByUser,
  getProjectForm,
  getProjectFormByProjectId,
  getProjectFormByPublicRef,
  getPublicProjectFormByReference,
  getPublicProjectFormByShortCode,
  requestPublicAccessLink,
  requestPublicAccessCode,
  verifyPublicAccessCode,
  resendPublicAccessCode,
  consumePublicAccessLink,
  getPublicAccessPrefill,
  submitPublicAccessForm,
  getProjectPublicAccessMetrics,
  getProjectStorageFolder,
  updateProjectForm,
  updateProjectFormByProjectId,
  duplicateProjectForm,
  deleteProjectForm,
  softDeleteProjectForm,
  restoreProjectForm,
  getDeletedProjectForms,
  publishProjectForm,
  unpublishProjectForm,
  archiveProjectForm,
  updatePaymentConfig,
  getProjectAnalytics,
  getProjectSchemaProfile,
  incrementSubmissions,
  bulkOperations,
  searchProjectForms,
  getProjectFormStats,
  bootstrapSystemForms,
  getSystemProjectForm,
  submitSystemForm,
};
