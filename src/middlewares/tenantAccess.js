const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const ProjectForm = require('../models/projectForm.model');
const ProjectFormSubmission = require('../models/projectFormSubmission.model');

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
      }).select('_id projectId tenantId');

      if (!projectForm) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Cannot access project form submissions for another tenant'
        );
      }

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

      req.formSubmission = submission;
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

      req.formSubmission = submission;
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
