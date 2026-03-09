const httpStatus = require('http-status');
const { ProjectForm, StorageFolder } = require('../models');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');
const fieldCatalogService = require('./fieldCatalog.service');

const BLOCK_TYPES = new Set([
  'header',
  'paragraph',
  'description',
  'spacer',
  'divider',
]);
const NUMERIC_TYPES = new Set(['number', 'currency', 'rating', 'slider']);
const DATE_TYPES = new Set(['date', 'datetime', 'time', 'datepicker', 'date-picker']);
const CATEGORICAL_TYPES = new Set([
  'select',
  'dropdown',
  'radio',
  'checkbox',
  'multiselect',
  'multi-select',
  'tags',
]);
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url']);

const normalizeTags = (tags = []) =>
  Array.from(
    new Set(
      (Array.isArray(tags) ? tags : [])
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

const inferDomainFromTags = (tags = []) => {
  const set = new Set(tags);
  if (
    ['finance', 'financial', 'payment', 'collection', 'offering', 'tithe', 'subscription'].some((t) =>
      set.has(t)
    )
  ) {
    return 'finance';
  }
  if (
    ['attendance', 'members', 'member', 'worship', 'church-attendance'].some((t) => set.has(t))
  ) {
    return 'attendance';
  }
  if (['hr', 'staff', 'employee', 'people'].some((t) => set.has(t))) {
    return 'hr';
  }
  if (['operations', 'ops', 'compliance', 'workflow'].some((t) => set.has(t))) {
    return 'operations';
  }
  return 'custom';
};

const isCatalogCandidate = (element) => {
  const type = String(element?.type || '').toLowerCase();
  if (!element?.id) return false;
  if (BLOCK_TYPES.has(type)) return false;
  return true;
};

const inferAnalysisProfile = ({ configuration = {}, elements = [] }) => {
  const tags = normalizeTags(configuration.tags || []);
  const candidates = (Array.isArray(elements) ? elements : []).filter(isCatalogCandidate);
  let numericFields = 0;
  let categoricalFields = 0;
  let dateFields = 0;
  let textFields = 0;
  const defaultMeasureFieldKeys = [];
  const defaultDimensionFieldKeys = [];
  let primaryTimeField = null;

  candidates.forEach((element) => {
    const type = String(element?.type || '').toLowerCase();
    const key = element?.id;
    const role = String(element?.semantic?.role || '').toLowerCase();

    if (DATE_TYPES.has(type)) {
      dateFields += 1;
      if (!primaryTimeField && key) primaryTimeField = key;
    }
    if (NUMERIC_TYPES.has(type)) {
      numericFields += 1;
    } else if (CATEGORICAL_TYPES.has(type)) {
      categoricalFields += 1;
    } else if (TEXT_TYPES.has(type)) {
      textFields += 1;
    }

    if (key) {
      if (role === 'measure' || NUMERIC_TYPES.has(type)) {
        defaultMeasureFieldKeys.push(key);
      }
      if (role === 'dimension' || CATEGORICAL_TYPES.has(type) || DATE_TYPES.has(type)) {
        defaultDimensionFieldKeys.push(key);
      }
    }
  });

  const hasNumeric = numericFields > 0;
  const hasNonNumeric = categoricalFields + dateFields + textFields > 0;
  const dataNature = hasNumeric && hasNonNumeric ? 'hybrid' : hasNumeric ? 'quantitative' : 'qualitative';

  return {
    dataNature,
    domain: inferDomainFromTags(tags),
    primaryTimeField: primaryTimeField || 'event_date',
    defaultMeasureFieldKeys: Array.from(new Set(defaultMeasureFieldKeys)).slice(0, 20),
    defaultDimensionFieldKeys: Array.from(new Set(defaultDimensionFieldKeys)).slice(0, 20),
    currency: tags.some((t) => ['finance', 'financial', 'payment', 'collection', 'offering', 'tithe'].includes(t))
      ? 'NGN'
      : null,
    scoreStrategy: 'rule_based',
    inferredAt: new Date(),
    fieldStats: {
      totalFields: candidates.length,
      numericFields,
      categoricalFields,
      dateFields,
      textFields,
    },
  };
};

const enrichConfigurationWithAnalysisProfile = ({
  configuration = {},
  elements = [],
  existingProfile = null,
}) => {
  const inferred = inferAnalysisProfile({ configuration, elements });
  const explicit = configuration.analysisProfile || {};
  const base = existingProfile || {};
  const merged = {
    ...inferred,
    ...base,
    ...explicit,
    defaultMeasureFieldKeys:
      Array.isArray(explicit.defaultMeasureFieldKeys) &&
      explicit.defaultMeasureFieldKeys.length > 0
        ? explicit.defaultMeasureFieldKeys
        : inferred.defaultMeasureFieldKeys,
    defaultDimensionFieldKeys:
      Array.isArray(explicit.defaultDimensionFieldKeys) &&
      explicit.defaultDimensionFieldKeys.length > 0
        ? explicit.defaultDimensionFieldKeys
        : inferred.defaultDimensionFieldKeys,
    inferredAt: explicit.inferredAt || new Date(),
  };
  return {
    ...configuration,
    tags: normalizeTags(configuration.tags || []),
    analysisProfile: merged,
  };
};

const hasFileUploadElement = (elements = []) =>
  Array.isArray(elements) &&
  elements.some((element) => {
    const type = String(element?.type || '').toLowerCase();
    if (type.includes('file') || type.includes('upload')) {
      return true;
    }

    const properties = element?.properties || {};
    return Boolean(properties.accept || properties.acceptedTypes);
  });

const normalizeModuleFolderName = (projectName = '') => {
  const trimmed = String(projectName || '').trim();
  if (!trimmed) return 'module';
  return trimmed.slice(0, 120);
};

const ensureModuleStorageFolder = async (projectForm, { userId } = {}) => {
  if (!projectForm || !hasFileUploadElement(projectForm.elements)) {
    return null;
  }

  const folderName = normalizeModuleFolderName(
    projectForm?.configuration?.projectName
  );
  const ownerId =
    userId || projectForm?.createdBy?._id || projectForm?.createdBy || null;

  if (!projectForm.tenantId || !ownerId) {
    return null;
  }

  const existing = await StorageFolder.findOne({
    tenantId: projectForm.tenantId,
    name: folderName,
    parentFolder: null,
    status: 'active',
  }).sort({ createdAt: 1 });

  if (existing) {
    return existing;
  }

  return StorageFolder.create({
    tenantId: projectForm.tenantId,
    userId: ownerId,
    name: folderName,
    parentFolder: null,
    metadata: {
      description: `Auto-created folder for module: ${folderName}`,
      moduleProjectId: projectForm.projectId,
    },
  });
};

const getProjectStorageFolderByProjectId = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  const folderName = normalizeModuleFolderName(
    projectForm?.configuration?.projectName
  );

  const existing = await StorageFolder.findOne({
    tenantId: projectForm.tenantId,
    name: folderName,
    parentFolder: null,
    status: 'active',
  }).sort({ createdAt: 1 });

  if (existing) {
    return existing;
  }

  const ownerId = projectForm?.createdBy?._id || projectForm?.createdBy || null;
  if (!ownerId) {
    return null;
  }

  return StorageFolder.create({
    tenantId: projectForm.tenantId,
    userId: ownerId,
    name: folderName,
    parentFolder: null,
    metadata: {
      description: `Auto-created folder for module: ${folderName}`,
      moduleProjectId: projectForm.projectId,
    },
  });
};

/**
 * Create a project form
 * @param {Object} projectFormBody - The project form data
 * @param {string} tenantId - The tenant ID
 * @param {ObjectId} createdBy - The user creating the project
 * @returns {Promise<ProjectForm>}
 */
const createProjectForm = async (projectFormBody, tenantId, createdBy) => {
  const normalizedBody = { ...projectFormBody };
  normalizedBody.configuration = enrichConfigurationWithAnalysisProfile({
    configuration: projectFormBody.configuration || {},
    elements: projectFormBody.elements || [],
  });

  // Check if project name is already taken within the tenant
  const isNameTaken = await ProjectForm.isProjectNameTaken(
    normalizedBody.configuration.projectName,
    tenantId
  );
  if (isNameTaken) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'A module with this name already exists in your workspace'
    );
  }
  const projectForm = await ProjectForm.createProjectForm(
    normalizedBody,
    tenantId,
    createdBy
  );

  await fieldCatalogService.syncCatalogFromForm(projectForm);
  await ensureModuleStorageFolder(projectForm, { userId: createdBy });
  return projectForm;
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
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
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
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
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
const updateProjectFormById = async (
  projectFormId,
  updateBody,
  options = {}
) => {
  const projectForm = await getProjectFormById(projectFormId);

  // Check if project name is being updated and if it's already taken
  if (
    updateBody.configuration &&
    updateBody.configuration.projectName &&
    updateBody.configuration.projectName !==
      projectForm.configuration.projectName
  ) {
    const isNameTaken = await ProjectForm.isProjectNameTaken(
      updateBody.configuration.projectName,
      projectForm.tenantId,
      projectFormId
    );

    if (isNameTaken) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'A module with this name already exists in your workspace'
      );
    }
  }

  // Update metadata
  if (updateBody.metadata) {
    updateBody.metadata.lastModified = new Date();
  }

  const mergedElements = Array.isArray(updateBody.elements)
    ? updateBody.elements
    : projectForm.elements || [];
  const mergedConfiguration = enrichConfigurationWithAnalysisProfile({
    configuration: {
      ...(projectForm.configuration?.toObject
        ? projectForm.configuration.toObject()
        : projectForm.configuration || {}),
      ...(updateBody.configuration || {}),
    },
    elements: mergedElements,
    existingProfile: projectForm?.configuration?.analysisProfile || null,
  });
  updateBody.configuration = mergedConfiguration;

  Object.assign(projectForm, updateBody);
  await projectForm.save();

  if (options.populate) {
    await projectForm.populate(options.populate);
  }

  await fieldCatalogService.syncCatalogFromForm(projectForm);
  await ensureModuleStorageFolder(projectForm);
  return projectForm;
};

/**
 * Update project form by project ID
 * @param {string} projectId - The unique project ID
 * @param {Object} updateBody - The update data
 * @param {Object} options - Update options
 * @returns {Promise<ProjectForm>}
 */
const updateProjectFormByProjectId = async (
  projectId,
  updateBody,
  options = {}
) => {
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
  await fieldCatalogService.removeCatalogForProject(projectForm.projectId);
  return projectForm;
};

/**
 * Soft delete project form by id
 * @param {ObjectId} projectFormId - The project form ID
 * @param {ObjectId} userId - User who deleted it
 * @returns {Promise<ProjectForm>}
 */
const softDeleteProjectFormById = async (projectFormId, userId = null) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.softDelete(userId);
};

/**
 * Delete project form (soft-delete for regular users, permanent for sabyUser)
 * @param {string} projectId - The project ID
 * @param {ObjectId} userId - User who is deleting
 * @param {boolean} permanent - True for permanent deletion (sabyUser only)
 * @returns {Promise<Object>}
 */
const deleteProjectForm = async (projectId, userId, permanent = false) => {
  const projectForm = await ProjectForm.findOne({ projectId, deletedAt: null });

  if (!projectForm) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Module not found or already deleted'
    );
  }

  if (permanent) {
    // PERMANENT DELETE (sabyUser only - checked in controller)
    const result = await projectForm.permanentlyDelete();
    await fieldCatalogService.removeCatalogForProject(projectForm.projectId);
    return result;
  } else {
    // SOFT DELETE (14-day grace period)
    await projectForm.softDelete(userId);

    return {
      deleted: true,
      permanent: false,
      deletedAt: projectForm.deletedAt,
      permanentDeletionDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      message: 'Form soft-deleted. Will be permanently removed in 14 days.',
    };
  }
};

/**
 * Restore soft deleted project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const restoreProjectFormById = async (projectFormId) => {
  const projectForm = await ProjectForm.findById(projectFormId);

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }
  if (!projectForm.deletedAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Module is not deleted');
  }
  return projectForm.restore();
};

/**
 * Get all soft-deleted project forms (within 14-day grace period)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<ProjectForm[]>}
 */
const getDeletedProjectForms = async (tenantId) => {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  return ProjectForm.find({
    tenantId,
    deletedAt: { $gte: fourteenDaysAgo },
  }).sort({ deletedAt: -1 });
};

/**
 * Publish project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const publishProjectForm = async (projectFormId, options = {}) => {
  const projectForm = await getProjectFormById(projectFormId);
  await projectForm.publish(options);
  projectForm.configuration = enrichConfigurationWithAnalysisProfile({
    configuration: projectForm.configuration?.toObject
      ? projectForm.configuration.toObject()
      : projectForm.configuration || {},
    elements: projectForm.elements || [],
    existingProfile: projectForm?.configuration?.analysisProfile || null,
  });
  projectForm.markModified('configuration');
  await projectForm.save();
  return projectForm;
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
 * Get schema profile for a project/module
 * Combines Mongo form configuration with Postgres field catalog.
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
const getProjectSchemaProfile = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  const configuration = projectForm.configuration?.toObject
    ? projectForm.configuration.toObject()
    : projectForm.configuration || {};
  const analysisProfile =
    configuration.analysisProfile &&
    Object.keys(configuration.analysisProfile).length > 0
      ? configuration.analysisProfile
      : inferAnalysisProfile({
          configuration,
          elements: projectForm.elements || [],
        });

  let catalogFields = [];
  try {
    const result = await postgresPool.query(
      `SELECT field_key, field_label, field_type, is_required, aliases, transformations, metadata
       FROM form_field_catalog
       WHERE project_id = $1
       ORDER BY field_label ASC`,
      [projectId]
    );
    catalogFields = result.rows || [];
  } catch (error) {
    if (error?.code !== '42P01') {
      throw error;
    }
    catalogFields = [];
  }

  const elementMap = new Map();
  (Array.isArray(projectForm.elements) ? projectForm.elements : []).forEach((element) => {
    if (element?.id) {
      elementMap.set(String(element.id), element);
    }
  });

  const fromCatalog = catalogFields.map((field) => {
    const element = elementMap.get(String(field.field_key));
    const semantic = element?.semantic || {};
    return {
      key: field.field_key,
      label: field.field_label,
      type: field.field_type,
      required: Boolean(field.is_required),
      aliases: Array.isArray(field.aliases) ? field.aliases : [],
      transformations: Array.isArray(field.transformations)
        ? field.transformations
        : [],
      semantic: {
        role: semantic.role || null,
        valueType: semantic.valueType || null,
        aggregationAllowed: Array.isArray(semantic.aggregationAllowed)
          ? semantic.aggregationAllowed
          : [],
      },
      metadata: field.metadata || {},
    };
  });

  const inferValueType = (type = '') => {
    const t = String(type || '').toLowerCase();
    if (NUMERIC_TYPES.has(t)) return t === 'currency' ? 'currency' : 'number';
    if (DATE_TYPES.has(t)) return t;
    if (CATEGORICAL_TYPES.has(t)) return 'enum';
    if (TEXT_TYPES.has(t)) return 'text';
    return 'unknown';
  };

  const fromElements = (Array.isArray(projectForm.elements) ? projectForm.elements : [])
    .filter(isCatalogCandidate)
    .map((element) => {
      const type = String(element.type || 'text').toLowerCase();
      const semantic = element.semantic || {};
      return {
        key: element.id,
        label: element?.properties?.label || element.id,
        type,
        required: Boolean(element?.properties?.validation?.required),
        aliases: Array.isArray(element.aliases) ? element.aliases : [],
        transformations: [],
        semantic: {
          role:
            semantic.role ||
            (NUMERIC_TYPES.has(type) ? 'measure' : CATEGORICAL_TYPES.has(type) ? 'dimension' : null),
          valueType: semantic.valueType || inferValueType(type),
          aggregationAllowed: Array.isArray(semantic.aggregationAllowed)
            ? semantic.aggregationAllowed
            : [],
        },
        metadata: element.metadata || {},
      };
    });

  const fields = fromCatalog.length > 0 ? fromCatalog : fromElements;

  return {
    projectId: projectForm.projectId,
    tenantId: projectForm.tenantId,
    projectName: configuration.projectName,
    status: projectForm.status,
    deploymentStatus: projectForm.metadata?.deploymentStatus || null,
    tags: Array.isArray(configuration.tags) ? configuration.tags : [],
    analysisProfile,
    formFieldCount: fields.length,
    fields,
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
  deleteProjectForm,
  getDeletedProjectForms,
  publishProjectForm,
  archiveProjectForm,
  incrementProjectViews,
  incrementProjectSubmissions,
  getProjectAnalytics,
  getProjectSchemaProfile,
  bulkOperations,
  searchProjectForms,
  getProjectStorageFolderByProjectId,
};
