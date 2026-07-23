const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const ProjectForm = require('../models/projectForm.model');
const ProjectFormSubmission = require('../models/projectFormSubmission.model');
const projectFormWorkspaceService = require('../services/projectFormWorkspace.service');

const getRequestTenantId = (req) => {
  const value =
    req.user?.tenantId ||
    req.tenantId ||
    req.apiKey?.tenant?._id ||
    req.apiKey?.tenant?.tenantId;

  return value?.toString?.() || value || null;
};

const canCrossTenant = (req) =>
  req.user?.isSuper === true || req.user?.isSaby === true;

const hasExplicitWorkspaceScope = (workspaceId) => {
  const normalizedWorkspaceId = String(workspaceId || '').trim();
  return (
    Boolean(normalizedWorkspaceId) &&
    normalizedWorkspaceId !== projectFormWorkspaceService.DEFAULT_WORKSPACE_ID &&
    normalizedWorkspaceId !== projectFormWorkspaceService.LEGACY_DEFAULT_WORKSPACE_ID
  );
};

const assertProjectWorkspaceScope = async ({
  req,
  tenantId,
  projectForm,
}) => {
  if (!projectForm || !hasExplicitWorkspaceScope(projectForm.workspaceId)) {
    return;
  }

  const actorUserId = req.user?._id || req.user?.id || null;
  if (!actorUserId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Workspace-scoped access requires an authenticated user context'
    );
  }

  await projectFormWorkspaceService.assertWorkspaceAccess({
    tenantId,
    workspaceId: String(projectForm.workspaceId).trim(),
    userId: actorUserId,
  });
};

const requireTenantParamAccess =
  (paramName = 'tenantId') =>
  (req, res, next) => {
    try {
      if (canCrossTenant(req)) return next();

      const requestedTenantId = req.params[paramName]?.toString();
      const authTenantId = getRequestTenantId(req);

      if (!authTenantId) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Tenant context is required');
      }

      if (authTenantId !== requestedTenantId) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Cannot access resources for another tenant'
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };

const requireProjectFormTenantAccess =
  (paramName = 'projectId') =>
  async (req, res, next) => {
    try {
      if (canCrossTenant(req)) return next();

      const projectId = req.params[paramName];
      const tenantId = getRequestTenantId(req);

      if (!tenantId) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Tenant context is required');
      }

      const projectForm = await ProjectForm.findOne({
        projectId,
        tenantId,
        deletedAt: null,
      }).select('_id projectId tenantId workspaceId');

      if (!projectForm) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Cannot access project form submissions for another tenant'
        );
      }

      await assertProjectWorkspaceScope({
        req,
        tenantId,
        projectForm,
      });

      req.projectForm = projectForm;
      return next();
    } catch (error) {
      return next(error);
    }
  };

const requireSubmissionTenantAccess =
  (paramName = 'submissionId') =>
  async (req, res, next) => {
    try {
      if (canCrossTenant(req)) return next();

      const submissionId = req.params[paramName];
      const tenantId = getRequestTenantId(req);

      if (!tenantId) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Tenant context is required');
      }

      const submission = await ProjectFormSubmission.findOne({
        _id: submissionId,
        tenantId,
        deletedAt: null,
      }).select('_id tenantId projectId submissionId');

      if (!submission) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Cannot access form submission for another tenant'
        );
      }

      const projectForm = await ProjectForm.findOne({
        projectId: submission.projectId,
        tenantId,
        deletedAt: null,
      }).select('_id projectId tenantId workspaceId');

      await assertProjectWorkspaceScope({
        req,
        tenantId,
        projectForm,
      });

      req.formSubmission = submission;
      req.projectForm = projectForm || null;
      return next();
    } catch (error) {
      return next(error);
    }
  };

const requireBusinessSubmissionTenantAccess =
  (paramName = 'submissionId') =>
  async (req, res, next) => {
    try {
      if (canCrossTenant(req)) return next();

      const submissionId = req.params[paramName];
      const tenantId = getRequestTenantId(req);

      if (!tenantId) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Tenant context is required');
      }

      const submission = await ProjectFormSubmission.findOne({
        submissionId,
        tenantId,
        deletedAt: null,
      }).select('_id tenantId projectId submissionId');

      if (!submission) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Cannot access form submission for another tenant'
        );
      }

      const projectForm = await ProjectForm.findOne({
        projectId: submission.projectId,
        tenantId,
        deletedAt: null,
      }).select('_id projectId tenantId workspaceId');

      await assertProjectWorkspaceScope({
        req,
        tenantId,
        projectForm,
      });

      req.formSubmission = submission;
      req.projectForm = projectForm || null;
      return next();
    } catch (error) {
      return next(error);
    }
  };

module.exports = {
  requireTenantParamAccess,
  requireProjectFormTenantAccess,
  requireSubmissionTenantAccess,
  requireBusinessSubmissionTenantAccess,
};
