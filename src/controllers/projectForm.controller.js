const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { projectFormService } = require('../services');

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
  console.log('🔍 [SERVER DATA] Project Form Created:', req.body);
  res.status(httpStatus.CREATED).send({
    message: 'Project form created successfully',
    projectForm,
    formId: projectForm.projectId,
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

  res.send({
    message: 'Project form updated successfully',
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

  res.send({
    message: 'Project form updated successfully',
    projectForm,
  });
});

/**
 * Delete a project form (hard delete)
 */
const deleteProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;

  await projectFormService.deleteProjectFormById(projectFormId);

  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Soft delete a project form
 */
const softDeleteProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;

  const projectForm = await projectFormService.softDeleteProjectFormById(
    projectFormId
  );

  res.send({
    message: 'Project form deleted successfully',
    projectForm,
  });
});

/**
 * Restore a soft deleted project form
 */
const restoreProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;

  const projectForm = await projectFormService.restoreProjectFormById(
    projectFormId
  );

  res.send({
    message: 'Project form restored successfully',
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

  res.send({
    message: 'Project form published successfully',
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

  res.send({
    message: 'Project form archived successfully',
    projectForm,
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
  updateProjectForm,
  updateProjectFormByProjectId,
  deleteProjectForm,
  softDeleteProjectForm,
  restoreProjectForm,
  publishProjectForm,
  archiveProjectForm,
  getProjectAnalytics,
  incrementSubmissions,
  bulkOperations,
  searchProjectForms,
  getProjectFormStats,
};
