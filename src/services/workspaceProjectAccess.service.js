const { ProjectForm } = require('../models');
const projectFormWorkspaceService = require('./projectFormWorkspace.service');

const canBypassWorkspaceProjectScope = (user = null) =>
  Boolean(user?.isSuper) || Boolean(user?.isSaby);

const getAccessibleProjectIds = async ({ tenantId, user }) => {
  if (!tenantId || canBypassWorkspaceProjectScope(user)) {
    return null;
  }

  const actorUserId = user?._id || user?.id || null;
  if (!actorUserId) {
    return [];
  }

  const workspaceIds = await projectFormWorkspaceService.getAccessibleWorkspaceIds({
    tenantId,
    userId: actorUserId,
  });

  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    return [];
  }

  const forms = await ProjectForm.find(
    {
      tenantId,
      deletedAt: null,
      workspaceId: { $in: workspaceIds },
    },
    { projectId: 1 }
  )
    .lean()
    .exec();

  return [...new Set(forms.map((form) => String(form.projectId || '').trim()).filter(Boolean))];
};

module.exports = {
  canBypassWorkspaceProjectScope,
  getAccessibleProjectIds,
};
