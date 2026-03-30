const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { projectFormService } = require('../services');
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

/**
 * Create a project form
 */
const createProjectForm = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const createdBy = req.user._id;

  const projectForm = await projectFormService.createProjectForm(
    req.body,
    tenantId,
    createdBy
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
 * Get all project forms
 */
const getProjectForms = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    'status',
    'configuration.projectName',
    'configuration.tags',
    'configuration.security',
    'metadata.deploymentStatus',
  ]);

  const { q, tenantId } = req.query;

  // If search query is provided, use search functionality
  if (q) {
    const searchFilter = tenantId
      ? { tenantId }
      : { tenantId: req.user.tenantId };
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
    filter.tenantId = req.user.tenantId;
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
  const result = await projectFormService.queryProjectForms(filter, options);

  res.send(result);
});

/**
 * Get project forms by tenant
 */
const getProjectFormsByTenant = catchAsync(async (req, res) => {
  const { tenantId } = req.params;
  const filter = pick(req.query, [
    'status',
    'configuration.projectName',
    'configuration.tags',
    'metadata.deploymentStatus',
  ]);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
  const result = await projectFormService.getProjectFormsByTenant(
    tenantId,
    filter,
    options
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
    'configuration.projectName',
    'configuration.tags',
    'metadata.deploymentStatus',
  ]);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);

  const result = await projectFormService.getProjectFormsByUser(
    userId,
    filter,
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
  };

  await projectFormService.incrementProjectViews(result.projectForm.projectId);

  res.send(response);
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

  const projectForm = await projectFormService.updateProjectFormById(
    projectFormId,
    req.body,
    options
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

  const projectForm = await projectFormService.updateProjectFormByProjectId(
    projectId,
    req.body,
    options
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
 * Archive a project form
 */
const archiveProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;

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

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  // Check if form has financial tag
  const hasFinancial =
    projectForm.configuration?.tags?.includes('financial') ||
    projectForm.configuration?.tags?.includes('payment');

  if (!hasFinancial) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Payment channels are only available for modules with a financial tag'
    );
  }

  projectForm.paymentConfig = {
    enabled: true,
    enabledChannels,
    channelConfigs,
    defaultChannel: enabledChannels[0] || 'sabypipe',
  };

  await projectForm.save();
  await invalidateProjectResolverCache(req.user?.tenantId || projectForm?.tenantId);

  res.send({
    message: 'Payment configuration updated',
    paymentConfig: projectForm.paymentConfig,
  });
});

/**
 * Get project form analytics
 */
const getProjectAnalytics = catchAsync(async (req, res) => {
  const { projectId } = req.params;

  const analytics = await projectFormService.getProjectAnalytics(projectId);

  res.send(analytics);
});

/**
 * Get schema profile by project ID
 */
const getProjectSchemaProfile = catchAsync(async (req, res) => {
  const { projectId } = req.params;
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
  const { q } = req.query;

  if (!q) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Search query is required');
  }

  const filter = { tenantId: req.user.tenantId };
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);

  const result = await projectFormService.searchProjectForms(
    q,
    filter,
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
    { tenantId, 'metadata.deploymentStatus': 'published' },
    { limit: 0 }
  );

  const draftProjects = await projectFormService.queryProjectForms(
    { tenantId, 'metadata.deploymentStatus': 'draft' },
    { limit: 0 }
  );

  const archivedProjects = await projectFormService.queryProjectForms(
    { tenantId, 'metadata.deploymentStatus': 'archived' },
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
  getProjectFormsByTenant,
  getProjectFormsByUser,
  getProjectForm,
  getProjectFormByProjectId,
  getProjectFormByPublicRef,
  getPublicProjectFormByReference,
  getPublicProjectFormByShortCode,
  getProjectStorageFolder,
  updateProjectForm,
  updateProjectFormByProjectId,
  deleteProjectForm,
  softDeleteProjectForm,
  restoreProjectForm,
  getDeletedProjectForms,
  publishProjectForm,
  archiveProjectForm,
  updatePaymentConfig,
  getProjectAnalytics,
  getProjectSchemaProfile,
  incrementSubmissions,
  bulkOperations,
  searchProjectForms,
  getProjectFormStats,
};
