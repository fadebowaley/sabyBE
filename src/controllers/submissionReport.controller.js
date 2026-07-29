/**
 * Submission Report Controller
 *
 * HTTP endpoints for submission reporting and data management.
 * Handles request validation, authentication, and response formatting.
 *
 * @module controllers/submissionReport
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const submissionReportService = require('../services/submissionReport.service');
const SubmissionModel = require('../models/submission.model');
const ProjectForm = require('../models/projectForm.model');
const { Role } = require('../models');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const projectFormWorkspaceService = require('../services/projectFormWorkspace.service');
const workspaceProjectAccessService = require('../services/workspaceProjectAccess.service');

const resolveActorRoleRefs = async (req) => {
  const rawRoles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const roleIds = rawRoles
    .map((entry) => String(entry?._id || entry || '').trim())
    .filter(Boolean);
  const roleNames = rawRoles
    .map((entry) => String(entry?.name || '').trim())
    .filter(Boolean);

  if (roleIds.length === 0) {
    return Array.from(new Set([req.user?.role, ...roleNames].filter(Boolean)));
  }

  const roles = await Role.find({
    _id: { $in: roleIds },
    tenantId: req.user?.tenantId,
  })
    .select('_id name')
    .lean()
    .exec();

  return Array.from(
    new Set(
      [
        req.user?.role,
        ...roleIds,
        ...roleNames,
        ...roles.map((role) => String(role._id)),
        ...roles.map((role) => String(role.name || '').trim()).filter(Boolean),
      ].filter(Boolean)
    )
  );
};

const getApprovalActorFromRequest = async (req) => ({
  userId: req.user?.id || req.user?._id || req.user?.userId || null,
  role: req.user?.role || null,
  roles: await resolveActorRoleRefs(req),
});

const canBypassWorkspaceScope = (req) =>
  Boolean(req.user?.isSuper) || Boolean(req.user?.isSaby);

const hasExplicitWorkspaceScope = (workspaceId) => {
  const normalizedWorkspaceId = String(workspaceId || '').trim();
  return (
    Boolean(normalizedWorkspaceId) &&
    normalizedWorkspaceId !== projectFormWorkspaceService.DEFAULT_WORKSPACE_ID &&
    normalizedWorkspaceId !== projectFormWorkspaceService.LEGACY_DEFAULT_WORKSPACE_ID
  );
};

const assertProjectWorkspaceScope = async ({ req, tenantId, projectId }) => {
  if (!tenantId || !projectId || canBypassWorkspaceScope(req)) {
    return null;
  }

  const projectForm = await ProjectForm.findOne(
    { tenantId, projectId, deletedAt: null },
    { workspaceId: 1, projectId: 1, tenantId: 1 }
  )
    .lean()
    .exec();

  if (!projectForm || !hasExplicitWorkspaceScope(projectForm.workspaceId)) {
    return projectForm;
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

  return projectForm;
};

const assertSubmissionWorkspaceScope = async ({ req, submissionId }) => {
  const submission = await SubmissionModel.getSubmissionById(submissionId);
  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  await assertProjectWorkspaceScope({
    req,
    tenantId: submission.tenant_id,
    projectId: submission.project_id,
  });

  return submission;
};

/**
 * GET /v1/submission-reports
 * Get submissions with advanced filtering and pagination
 */
const getSubmissions = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'form_id',
    'node_id',
    'user_id',
    'status',
    'source',
    'month',
    'year',
    'perm_enabled',
    'is_locked',
    'start_date',
    'end_date',
    'completeness_status',
  ]);

  const options = pick(req.query, ['limit', 'offset']);

  if (req.user?.tenantId) {
    if (
      filters.tenant_id &&
      !canBypassWorkspaceScope(req) &&
      String(filters.tenant_id) !== String(req.user.tenantId)
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Cannot access submissions for another tenant'
      );
    }
    filters.tenant_id = filters.tenant_id || req.user.tenantId;
  }

  if (req.user?.tenantId && filters.project_id) {
    await assertProjectWorkspaceScope({
      req,
      tenantId: req.user.tenantId,
      projectId: filters.project_id,
    });
  }

  const accessibleProjectIds =
    await workspaceProjectAccessService.getAccessibleProjectIds({
      tenantId: filters.tenant_id || req.user?.tenantId || null,
      user: req.user,
    });

  if (Array.isArray(accessibleProjectIds)) {
    if (filters.project_id) {
      if (!accessibleProjectIds.includes(String(filters.project_id))) {
        filters.project_ids = [];
        delete filters.project_id;
      }
    } else {
      filters.project_ids = accessibleProjectIds;
    }
  }

  const result = await submissionReportService.getSubmissions(filters, options);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submissions retrieved successfully',
    data: result.results,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: result.pages,
    },
  });
});

/**
 * GET /v1/submission-reports/module-table
 * Get module-specific report in table format (dynamic columns per form fields).
 *
 * Access rules:
 * - owner/super/saby: tenant-based scope
 * - non-owner: tenant + node scope
 */
const getModuleReportTable = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = req.user?._id || req.user?.id || null;
  let isOwnerScoped =
    Boolean(req.user?.isOwner) ||
    Boolean(req.user?.isSuper) ||
    Boolean(req.user?.isSaby);

  const filters = pick(req.query, [
    'project_id',
    'month',
    'start_date',
    'end_date',
    'limit',
    'offset',
    'search',
    'debug',
    'node_id',
    'nodeId',
  ]);

  const nodeFilter =
    filters.node_id ||
    filters.nodeId ||
    req.user?.nodeId ||
    req.user?.node_id ||
    null;

  const projectForm = await ProjectForm.findOne(
    { tenantId, projectId: filters.project_id },
    { workspaceId: 1, projectId: 1 }
  )
    .lean()
    .exec();

  if (!projectForm) {
    return res.status(httpStatus.NOT_FOUND).send({
      success: false,
      message: 'Project form not found for the requested project_id',
    });
  }

  const workspaceId = String(projectForm.workspaceId || '').trim();
  const usesExplicitWorkspace =
    workspaceId &&
    workspaceId !== projectFormWorkspaceService.DEFAULT_WORKSPACE_ID &&
    workspaceId !== projectFormWorkspaceService.LEGACY_DEFAULT_WORKSPACE_ID;

  if (usesExplicitWorkspace && actorUserId) {
    await projectFormWorkspaceService.assertWorkspaceAccess({
      tenantId,
      workspaceId,
      userId: actorUserId,
    });
    isOwnerScoped = true;
  }

  if (!isOwnerScoped && !nodeFilter) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'node_id is required for non-owner users',
    });
  }

  const report = await submissionReportService.getModuleReportTable({
    tenant_id: tenantId,
    project_id: filters.project_id,
    month: filters.month,
    start_date: filters.start_date,
    end_date: filters.end_date,
    search: filters.search,
    debug: filters.debug,
    limit: filters.limit,
    offset: filters.offset,
    node_filter: isOwnerScoped ? nodeFilter || null : nodeFilter,
    approval_actor: await getApprovalActorFromRequest(req),
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Module report table retrieved successfully',
    ...report,
  });
});

/**
 * GET /v1/submission-reports/:id
 * Get submission by ID
 */
const getSubmissionById = catchAsync(async (req, res) => {
  await assertSubmissionWorkspaceScope({
    req,
    submissionId: req.params.id,
  });

  const submission = await submissionReportService.getSubmissionById(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission retrieved successfully',
    data: submission,
  });
});

/**
 * GET /v1/submission-reports/compliance/:month
 * Get compliance report for a project/month
 */
const getComplianceReport = catchAsync(async (req, res) => {
  const { tenant_id, project_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  await assertProjectWorkspaceScope({
    req,
    tenantId: tenant_id,
    projectId: project_id,
  });

  const report = await submissionReportService.getComplianceReport(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance report retrieved successfully',
    data: report,
  });
});

/**
 * GET /v1/submission-reports/node/:nodeId
 * Get submissions by node
 */
const getSubmissionsByNode = catchAsync(async (req, res) => {
  const { tenant_id, project_id } = req.query;
  const { nodeId } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  await assertProjectWorkspaceScope({
    req,
    tenantId: tenant_id,
    projectId: project_id,
  });

  const options = pick(req.query, ['perm_only', 'limit']);

  const submissions = await submissionReportService.getSubmissionsByNode(
    tenant_id,
    project_id,
    nodeId,
    options
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submissions retrieved successfully',
    data: submissions,
    count: submissions.length,
  });
});

/**
 * GET /v1/submission-reports/stats
 * Get submission statistics
 */
const getSubmissionStats = catchAsync(async (req, res) => {
  const tenantId = req.query.tenant_id || req.user?.tenantId;

  if (!tenantId) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  if (
    req.user?.tenantId &&
    !canBypassWorkspaceScope(req) &&
    String(tenantId) !== String(req.user.tenantId)
  ) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Cannot access submission statistics for another tenant'
    );
  }

  const filters = pick(req.query, ['project_id', 'form_id', 'month', 'year']);

  if (filters.project_id) {
    await assertProjectWorkspaceScope({
      req,
      tenantId,
      projectId: filters.project_id,
    });
  }

  const accessibleProjectIds =
    await workspaceProjectAccessService.getAccessibleProjectIds({
      tenantId,
      user: req.user,
    });

  if (Array.isArray(accessibleProjectIds)) {
    if (filters.project_id) {
      if (!accessibleProjectIds.includes(String(filters.project_id))) {
        filters.project_ids = [];
        delete filters.project_id;
      }
    } else {
      filters.project_ids = accessibleProjectIds;
    }
  }

  const stats = await submissionReportService.getSubmissionStats(
    tenantId,
    filters
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Statistics retrieved successfully',
    data: stats,
  });
});

/**
 * GET /v1/submission-reports/monthly/:month
 * Get monthly submissions for a project
 */
const getMonthlyReport = catchAsync(async (req, res) => {
  const { tenant_id, project_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  await assertProjectWorkspaceScope({
    req,
    tenantId: tenant_id,
    projectId: project_id,
  });

  const submissions = await submissionReportService.getMonthlySubmissions(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Monthly submissions retrieved successfully',
    data: submissions,
    count: submissions.length,
    month,
  });
});

/**
 * GET /v1/submission-reports/incomplete/:month
 * Get incomplete submissions for a project/month
 */
const getIncompleteSubmissions = catchAsync(async (req, res) => {
  const { tenant_id, project_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  await assertProjectWorkspaceScope({
    req,
    tenantId: tenant_id,
    projectId: project_id,
  });

  const submissions = await submissionReportService.getIncompleteSubmissions(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Incomplete submissions retrieved successfully',
    data: submissions,
    count: submissions.length,
  });
});

/**
 * GET /v1/submission-reports/locked
 * Get locked submissions
 */
const getLockedSubmissions = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  await assertProjectWorkspaceScope({
    req,
    tenantId: tenant_id,
    projectId: project_id,
  });

  const submissions = await submissionReportService.getLockedSubmissions(
    tenant_id,
    project_id,
    month || null
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Locked submissions retrieved successfully',
    data: submissions,
    count: submissions.length,
  });
});

/**
 * PATCH /v1/submission-reports/:id
 * Update submission data
 */
const updateSubmission = catchAsync(async (req, res) => {
  const updates = pick(req.body, ['data', 'meta', 'status', 'event_date']);
  const user_id = req.user?.id || 'system';

  await assertSubmissionWorkspaceScope({
    req,
    submissionId: req.params.id,
  });

  const updated = await submissionReportService.updateSubmission(
    req.params.id,
    updates,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission updated successfully',
    data: updated,
  });
});

/**
 * PATCH /v1/submission-reports/:id/status
 * Update submission status
 */
const updateSubmissionStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const user_id = req.user?.id || 'system';

  if (!status) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'status is required',
    });
  }

  await assertSubmissionWorkspaceScope({
    req,
    submissionId: req.params.id,
  });

  const updated = await submissionReportService.updateSubmissionStatus(
    req.params.id,
    status,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission status updated successfully',
    data: updated,
  });
});

/**
 * POST /v1/submission-reports/:id/lock
 * Lock a submission
 */
const lockSubmission = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const user_id = req.user?.id || 'system';

  await assertSubmissionWorkspaceScope({
    req,
    submissionId: req.params.id,
  });

  const locked = await submissionReportService.lockSubmission(
    req.params.id,
    user_id,
    reason || 'manual_lock'
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission locked successfully',
    data: locked,
  });
});

/**
 * POST /v1/submission-reports/:id/unlock
 * Unlock a submission
 */
const unlockSubmission = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const user_id = req.user?.id || 'system';

  await assertSubmissionWorkspaceScope({
    req,
    submissionId: req.params.id,
  });

  const unlocked = await submissionReportService.unlockSubmission(
    req.params.id,
    user_id,
    reason || 'manual_unlock'
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission unlocked successfully',
    data: unlocked,
  });
});

/**
 * DELETE /v1/submission-reports/:id
 * Delete a submission (soft delete)
 */
const deleteSubmission = catchAsync(async (req, res) => {
  const user_id = req.user?.id || 'system';

  await assertSubmissionWorkspaceScope({
    req,
    submissionId: req.params.id,
  });

  const deleted = await submissionReportService.deleteSubmission(
    req.params.id,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission deleted successfully',
    data: deleted,
  });
});

/**
 * POST /v1/submission-reports/bulk-delete
 * Bulk delete submissions
 */
const bulkDeleteSubmissions = catchAsync(async (req, res) => {
  const { ids, hard } = req.body;
  const user_id = req.user?.id || 'system';

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'ids array is required',
    });
  }

  await Promise.all(
    ids.map((id) =>
      assertSubmissionWorkspaceScope({
        req,
        submissionId: id,
      })
    )
  );

  const result = await submissionReportService.bulkDeleteSubmissions(
    ids,
    user_id,
    hard || false
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `${result.deleted_count} submission(s) deleted successfully`,
    data: result,
  });
});

// =========================================================================
// BULK OPERATIONS (Phase 6)
// =========================================================================

/**
 * Bulk update submission status
 * POST /v1/submission-reports/bulk-update-status
 */
const bulkUpdateStatus = catchAsync(async (req, res) => {
  const { ids, status, updated_by } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'ids array is required');
  }

  if (!status) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'status is required');
  }

  await Promise.all(
    ids.map((id) =>
      assertSubmissionWorkspaceScope({
        req,
        submissionId: id,
      })
    )
  );

  const results = await SubmissionModel.bulk.bulkUpdateStatus(
    ids,
    status,
    updated_by
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Updated ${results.length} submissions`,
    data: results,
  });
});

/**
 * Bulk lock/unlock submissions
 * POST /v1/submission-reports/bulk-lock
 */
const bulkLockUnlock = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, is_locked, locked_by } = req.body;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'tenant_id, project_id, and month are required'
    );
  }

  await assertProjectWorkspaceScope({
    req,
    tenantId: tenant_id,
    projectId: project_id,
  });

  const results = await SubmissionModel.bulk.bulkLockUnlock(
    tenant_id,
    project_id,
    month,
    is_locked !== false, // default to true
    locked_by
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `${is_locked ? 'Locked' : 'Unlocked'} ${
      results.length
    } submissions`,
    data: results,
  });
});

/**
 * Bulk update compliance
 * POST /v1/submission-reports/bulk-update-compliance
 */
const bulkUpdateCompliance = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, compliance_data } = req.body;

  if (!tenant_id || !project_id || !month || !compliance_data) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'tenant_id, project_id, month, and compliance_data are required'
    );
  }

  if (!Array.isArray(compliance_data)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'compliance_data must be an array'
    );
  }

  await assertProjectWorkspaceScope({
    req,
    tenantId: tenant_id,
    projectId: project_id,
  });

  const results = await SubmissionModel.bulk.bulkUpdateCompliance(
    tenant_id,
    project_id,
    month,
    compliance_data
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Updated compliance for ${results.length} nodes`,
    data: results,
  });
});

/**
 * Bulk archive old submissions
 * POST /v1/submission-reports/bulk-archive
 */
const bulkArchive = catchAsync(async (req, res) => {
  const { tenant_id, older_than_months = 12, project_ids = [] } = req.body;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }

  await Promise.all(
    (Array.isArray(project_ids) ? project_ids : [])
      .filter(Boolean)
      .map((projectId) =>
        assertProjectWorkspaceScope({
          req,
          tenantId: tenant_id,
          projectId,
        })
      )
  );

  const results = await SubmissionModel.bulk.bulkArchive(
    tenant_id,
    older_than_months,
    project_ids
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Archived ${results.length} submissions older than ${older_than_months} months`,
    data: results,
  });
});

/**
 * Bulk delete submissions (enhanced)
 * POST /v1/submission-reports/bulk-delete-advanced
 */
const bulkDeleteAdvanced = catchAsync(async (req, res) => {
  const { tenant_id, ...filters } = req.body;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }

  if (filters.project_id) {
    await assertProjectWorkspaceScope({
      req,
      tenantId: tenant_id,
      projectId: filters.project_id,
    });
  }

  const result = await SubmissionModel.bulk.bulkDelete(tenant_id, filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: `${result.hard_delete ? 'Permanently deleted' : 'Soft deleted'} ${
      result.deleted
    } submissions`,
    deleted: result.deleted,
    hard_delete: result.hard_delete,
  });
});

/**
 * Bulk update metadata
 * POST /v1/submission-reports/bulk-update-metadata
 */
const bulkUpdateMetadata = catchAsync(async (req, res) => {
  const { ids, metadata } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'ids array is required');
  }

  if (!metadata || typeof metadata !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'metadata object is required');
  }

  await Promise.all(
    ids.map((id) =>
      assertSubmissionWorkspaceScope({
        req,
        submissionId: id,
      })
    )
  );

  const results = await SubmissionModel.bulk.bulkUpdateMetadata(ids, metadata);

  res.status(httpStatus.OK).send({
    success: true,
    message: `Updated metadata for ${results.length} submissions`,
    data: results,
  });
});

module.exports = {
  getModuleReportTable,
  getSubmissions,
  getSubmissionById,
  getComplianceReport,
  getSubmissionsByNode,
  getSubmissionStats,
  getMonthlyReport,
  getIncompleteSubmissions,
  getLockedSubmissions,
  updateSubmission,
  updateSubmissionStatus,
  lockSubmission,
  unlockSubmission,
  deleteSubmission,
  bulkDeleteSubmissions,
  // Phase 6: Bulk Operations
  bulkUpdateStatus,
  bulkLockUnlock,
  bulkUpdateCompliance,
  bulkArchive,
  bulkDeleteAdvanced,
  bulkUpdateMetadata,
};
