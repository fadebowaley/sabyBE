const catchAsync = require('../utils/catchAsync');
const { approvalService } = require('../services');
const { Role } = require('../models');

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
    new Set([
      req.user?.role,
      ...roleIds,
      ...roleNames,
      ...roles.map((role) => String(role._id)),
      ...roles.map((role) => String(role.name || '').trim()).filter(Boolean),
    ].filter(Boolean))
  );
};

const getActorFromRequest = async (req) => ({
  userId: req.user?.id || req.user?._id || req.user?.userId || null,
  userName:
    req.user?.name ||
    [req.user?.firstname, req.user?.lastname].filter(Boolean).join(' ') ||
    null,
  userEmail: req.user?.email || null,
  role: req.user?.role || null,
  roles: await resolveActorRoleRefs(req),
  isAdmin: Boolean(req.user?.isAdmin),
  isOwner: Boolean(req.user?.isOwner),
  isSaby: Boolean(req.user?.isSaby),
  isSuper: Boolean(req.user?.isSuper),
});

const getApprovalQueue = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id || req.user?._id || req.user?.userId || null;
  const role = req.query.role || req.user?.role || null;
  const roles = await resolveActorRoleRefs(req);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  const items = await approvalService.getApprovalQueue({
    tenantId,
    userId,
    role,
    roles,
    limit,
  });

  res.send({
    total: items.length,
    items,
  });
});

const getSubmissionApproval = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const submissionId = req.params.id || req.params.submissionId;

  const approval = await approvalService.getSubmissionApproval({
    submissionId,
    tenantId,
  });

  res.send(approval);
});

const approveApproval = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actor = await getActorFromRequest(req);

  const result = await approvalService.actOnApproval({
    approvalId: req.params.approvalId,
    tenantId,
    actor,
    action: 'approve',
    comments: req.body?.comments || req.body?.notes || null,
  });

  res.send({
    message: 'Approval completed successfully',
    ...result,
  });
});

const rejectApproval = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actor = await getActorFromRequest(req);

  const result = await approvalService.actOnApproval({
    approvalId: req.params.approvalId,
    tenantId,
    actor,
    action: 'reject',
    comments: req.body?.reason || req.body?.comments || null,
  });

  res.send({
    message: 'Approval rejected',
    ...result,
  });
});

const requestChangesApproval = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actor = await getActorFromRequest(req);

  const result = await approvalService.actOnApproval({
    approvalId: req.params.approvalId,
    tenantId,
    actor,
    action: 'request_changes',
    comments: req.body?.reason || req.body?.comments || null,
  });

  res.send({
    message: 'Changes requested for this submission',
    ...result,
  });
});

const escalateApproval = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actor = await getActorFromRequest(req);

  const result = await approvalService.actOnApproval({
    approvalId: req.params.approvalId,
    tenantId,
    actor,
    action: 'escalate',
    comments: req.body?.reason || req.body?.comments || null,
  });

  res.send({
    message: 'Approval escalated',
    ...result,
  });
});

const bulkApproveApprovals = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actor = await getActorFromRequest(req);

  const result = await approvalService.actOnApprovalsBulk({
    approvalIds: req.body?.approvalIds || [],
    tenantId,
    actor,
    action: 'approve',
    comments: req.body?.comments || req.body?.notes || null,
  });

  res.send({
    message: 'Bulk approval action completed',
    ...result,
  });
});

const bulkRejectApprovals = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actor = await getActorFromRequest(req);

  const result = await approvalService.actOnApprovalsBulk({
    approvalIds: req.body?.approvalIds || [],
    tenantId,
    actor,
    action: 'reject',
    comments: req.body?.reason || req.body?.comments || null,
  });

  res.send({
    message: 'Bulk rejection action completed',
    ...result,
  });
});

module.exports = {
  getApprovalQueue,
  getSubmissionApproval,
  approveApproval,
  rejectApproval,
  requestChangesApproval,
  escalateApproval,
  bulkApproveApprovals,
  bulkRejectApprovals,
};
