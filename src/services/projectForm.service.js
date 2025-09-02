const httpStatus = require('http-status');
const { ProjectForm } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a project form
 * @param {Object} projectFormBody - The project form data
 * @param {string} tenantId - The tenant ID
 * @param {ObjectId} createdBy - The user creating the project
 * @returns {Promise<ProjectForm>}
 */
const createProjectForm = async (projectFormBody, tenantId, createdBy) => {
  // Check if project name is already taken within the tenant
  const isNameTaken = await ProjectForm.isProjectNameTaken(projectFormBody.configuration.projectName, tenantId);
  if (isNameTaken) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A project with this name already exists in your workspace');
  }
  return ProjectForm.createProjectForm(projectFormBody, tenantId, createdBy);
};

/**
 * Query for project forms
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {string} [options.populate] - Comma separated fields to populate
 * @returns {Promise<QueryResult>}
 */
const queryProjectForms = async (filter, options) => {
  // Add filter to exclude deleted projects by default
  const finalFilter = {
    ...filter,
    deletedAt: null,
  };

  const projectForms = await ProjectForm.paginate(finalFilter, {
    ...options,
    populate: options.populate || 'createdBy',
  });

  return projectForms;
};

/**
 * Get project form by id
 * @param {ObjectId} id - The project form ID
 * @param {Object} options - Query options
 * @returns {Promise<ProjectForm>}
 */
const getProjectFormById = async (id, options = {}) => {
  const populateFields = options.populate || 'createdBy';
  const projectForm = await ProjectForm.findById(id).populate(populateFields);

  if (!projectForm || projectForm.deletedAt) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Project form not found');
  }

  return projectForm;
};

/**
 * Get project form by project ID
 * @param {string} projectId - The unique project ID
 * @param {Object} options - Query options
 * @returns {Promise<ProjectForm>}
 */
const getProjectFormByProjectId = async (projectId, options = {}) => {
  const populateFields = options.populate || 'createdBy';
  const projectForm = await ProjectForm.findOne({
    projectId,
    deletedAt: null,
  }).populate(populateFields);

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Project form not found');
  }

  return projectForm;
};

/**
 * Get project forms by tenant ID
 * @param {string} tenantId - The tenant ID
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getProjectFormsByTenant = async (tenantId, filter = {}, options = {}) => {
  const tenantFilter = {
    ...filter,
    tenantId,
    deletedAt: null,
  };

  return queryProjectForms(tenantFilter, options);
};

/**
 * Get project forms by user (created by user)
 * @param {ObjectId} userId - The user ID
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getProjectFormsByUser = async (userId, filter = {}, options = {}) => {
  const userFilter = {
    ...filter,
    createdBy: userId,
    deletedAt: null,
  };

  return queryProjectForms(userFilter, options);
};

/**
 * Update project form by id
 * @param {ObjectId} projectFormId - The project form ID
 * @param {Object} updateBody - The update data
 * @param {Object} options - Update options
 * @returns {Promise<ProjectForm>}
 */
const updateProjectFormById = async (projectFormId, updateBody, options = {}) => {
  const projectForm = await getProjectFormById(projectFormId);

  // Check if project name is being updated and if it's already taken
  if (
    updateBody.configuration &&
    updateBody.configuration.projectName &&
    updateBody.configuration.projectName !== projectForm.configuration.projectName
  ) {
    const isNameTaken = await ProjectForm.isProjectNameTaken(
      updateBody.configuration.projectName,
      projectForm.tenantId,
      projectFormId
    );

    if (isNameTaken) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'A project with this name already exists in your workspace');
    }
  }

  // Update metadata
  if (updateBody.metadata) {
    updateBody.metadata.lastModified = new Date();
  }

  Object.assign(projectForm, updateBody);
  await projectForm.save();

  if (options.populate) {
    await projectForm.populate(options.populate);
  }

  return projectForm;
};

/**
 * Update project form by project ID
 * @param {string} projectId - The unique project ID
 * @param {Object} updateBody - The update data
 * @param {Object} options - Update options
 * @returns {Promise<ProjectForm>}
 */
const updateProjectFormByProjectId = async (projectId, updateBody, options = {}) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  return updateProjectFormById(projectForm._id, updateBody, options);
};

/**
 * Delete project form by id (hard delete)
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const deleteProjectFormById = async (projectFormId) => {
  const projectForm = await getProjectFormById(projectFormId);
  await projectForm.deleteOne();
  return projectForm;
};

/**
 * Soft delete project form by id
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const softDeleteProjectFormById = async (projectFormId) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.softDelete();
};

/**
 * Restore soft deleted project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const restoreProjectFormById = async (projectFormId) => {
  const projectForm = await ProjectForm.findById(projectFormId);

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Project form not found');
  }
  if (!projectForm.deletedAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Project form is not deleted');
  }
  return projectForm.restore();
};

/**
 * Publish project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const publishProjectForm = async (projectFormId) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.publish();
};

/**
 * Archive project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const archiveProjectForm = async (projectFormId) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.archive();
};

/**
 * Increment project form views
 * @param {string} projectId - The unique project ID
 * @returns {Promise<void>}
 */
const incrementProjectViews = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  await projectForm.incrementViews();
};

/**
 * Increment project form submissions
 * @param {string} projectId - The unique project ID
 * @returns {Promise<void>}
 */
const incrementProjectSubmissions = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  await projectForm.incrementSubmissions();
};

/**
 * Get project form analytics
 * @param {string} projectId - The unique project ID
 * @returns {Promise<Object>}
 */
const getProjectAnalytics = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  return {
    projectId: projectForm.projectId,
    projectName: projectForm.configuration.projectName,
    analytics: projectForm.analytics,
    metadata: projectForm.metadata,
    status: projectForm.status,
    createdAt: projectForm.createdAt,
    publishedAt: projectForm.publishedAt,
  };
};

/**
 * Bulk operations for project forms
 * @param {Object} operations - The bulk operations to perform
 * @returns {Promise<Object>}
 */
const bulkOperations = async (operations) => {
  const results = {
    success: [],
    errors: [],
  };

  for (const operation of operations) {
    try {
      let result;
      switch (operation.type) {
        case 'delete':
          result = await softDeleteProjectFormById(operation.projectFormId);
          break;
        case 'restore':
          result = await restoreProjectFormById(operation.projectFormId);
          break;
        case 'publish':
          result = await publishProjectForm(operation.projectFormId);
          break;
        case 'archive':
          result = await archiveProjectForm(operation.projectFormId);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      results.success.push({
        projectFormId: operation.projectFormId,
        operation: operation.type,
        result,
      });
    } catch (error) {
      results.errors.push({
        projectFormId: operation.projectFormId,
        operation: operation.type,
        error: error.message,
      });
    }
  }

  return results;
};

/**
 * Search project forms
 * @param {string} query - Search query
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const searchProjectForms = async (query, filter = {}, options = {}) => {
  const searchRegex = new RegExp(query, 'i');

  const searchFilter = {
    ...filter,
    deletedAt: null,
    $or: [
      { 'configuration.projectName': searchRegex },
      { 'configuration.tags': { $in: [searchRegex] } },
      { projectId: searchRegex },
    ],
  };

  return queryProjectForms(searchFilter, options);
};

module.exports = {
  createProjectForm,
  queryProjectForms,
  getProjectFormById,
  getProjectFormByProjectId,
  getProjectFormsByTenant,
  getProjectFormsByUser,
  updateProjectFormById,
  updateProjectFormByProjectId,
  deleteProjectFormById,
  softDeleteProjectFormById,
  restoreProjectFormById,
  publishProjectForm,
  archiveProjectForm,
  incrementProjectViews,
  incrementProjectSubmissions,
  getProjectAnalytics,
  bulkOperations,
  searchProjectForms,
};
