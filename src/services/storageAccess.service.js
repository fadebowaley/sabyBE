const mongoose = require('mongoose');

const normalizePermissionSubjects = (userInfo = {}) => {
  const userId = userInfo?.userId ? String(userInfo.userId) : null;
  const roleIds = []
    .concat(userInfo?.roleIds || [])
    .concat(userInfo?.roles || [])
    .concat(userInfo?.role ? [userInfo.role] : [])
    .filter(Boolean)
    .map(String);
  const nodeIds = []
    .concat(userInfo?.nodeIds || [])
    .filter(Boolean)
    .map(String);

  return { userId, roleIds, nodeIds };
};

const buildPermissionClauses = (userInfo = {}, permission = 'read') => {
  const { userId, roleIds, nodeIds } = normalizePermissionSubjects(userInfo);
  const allowedPermissions =
    permission === 'read' ? ['read', 'write', 'admin'] : ['write', 'admin'];

  const clauses = [];

  if (userId) {
    clauses.push({
      permissions: {
        $elemMatch: {
          subjectType: 'user',
          subjectId: userId,
          permission: { $in: allowedPermissions },
        },
      },
    });
  }

  if (roleIds.length) {
    clauses.push({
      permissions: {
        $elemMatch: {
          subjectType: 'role',
          subjectId: { $in: roleIds },
          permission: { $in: allowedPermissions },
        },
      },
    });
  }

  if (nodeIds.length) {
    clauses.push({
      permissions: {
        $elemMatch: {
          subjectType: 'node',
          subjectId: { $in: nodeIds },
          permission: { $in: allowedPermissions },
        },
      },
    });
  }

  return clauses;
};

const buildAccessibleStorageQuery = ({ tenantId, userInfo = {}, permission = 'read' }) => {
  const userId = userInfo?.userId ? String(userInfo.userId) : null;
  const permissionClauses = buildPermissionClauses(userInfo, permission);
  const objectIdClauses =
    userId && mongoose.Types.ObjectId.isValid(userId)
      ? [
          { userId: new mongoose.Types.ObjectId(userId) },
          { createdBy: new mongoose.Types.ObjectId(userId) },
        ]
      : [];
  const query = {
    tenantId,
    status: 'active',
    $or: [
      ...objectIdClauses,
      ...(userId ? [{ ownerType: 'user', ownerId: userId }] : []),
      { visibility: 'tenant' },
      ...permissionClauses,
      { visibility: 'public_share', 'shareSettings.isShared': true },
    ],
  };

  return query;
};

const hasPermissionEntry = (entity, userInfo = {}, permission = 'read') => {
  const allowedPermissions =
    permission === 'read' ? ['read', 'write', 'admin'] : ['write', 'admin'];
  const { userId, roleIds, nodeIds } = normalizePermissionSubjects(userInfo);
  const permissions = Array.isArray(entity?.permissions) ? entity.permissions : [];

  return permissions.some((entry) => {
    if (!allowedPermissions.includes(entry?.permission)) return false;
    if (entry?.subjectType === 'user' && userId) {
      return String(entry.subjectId) === userId;
    }
    if (entry?.subjectType === 'role' && roleIds.length) {
      return roleIds.includes(String(entry.subjectId));
    }
    if (entry?.subjectType === 'node' && nodeIds.length) {
      return nodeIds.includes(String(entry.subjectId));
    }
    return false;
  });
};

const isOwner = (entity, userInfo = {}) => {
  const userId = userInfo?.userId ? String(userInfo.userId) : null;
  if (!userId) return false;

  return (
    String(entity?.userId || '') === userId ||
    String(entity?.createdBy || '') === userId ||
    (entity?.ownerType === 'user' && String(entity?.ownerId || '') === userId)
  );
};

const canReadStorageEntity = (userInfo = {}, entity) => {
  if (!entity) return false;
  if (isOwner(entity, userInfo)) return true;
  if (entity.visibility === 'tenant') return true;
  if (entity.visibility === 'public_share' && entity?.shareSettings?.isShared) {
    return true;
  }
  return hasPermissionEntry(entity, userInfo, 'read');
};

const canWriteStorageEntity = (userInfo = {}, entity) => {
  if (!entity) return false;
  if (isOwner(entity, userInfo)) return true;
  return hasPermissionEntry(entity, userInfo, 'write');
};

const canAdminStorageEntity = (userInfo = {}, entity) => {
  if (!entity) return false;
  if (isOwner(entity, userInfo)) return true;
  const permissions = Array.isArray(entity?.permissions) ? entity.permissions : [];
  const { userId, roleIds, nodeIds } = normalizePermissionSubjects(userInfo);

  return permissions.some((entry) => {
    if (entry?.permission !== 'admin') return false;
    if (entry?.subjectType === 'user' && userId) {
      return String(entry.subjectId) === userId;
    }
    if (entry?.subjectType === 'role' && roleIds.length) {
      return roleIds.includes(String(entry.subjectId));
    }
    if (entry?.subjectType === 'node' && nodeIds.length) {
      return nodeIds.includes(String(entry.subjectId));
    }
    return false;
  });
};

module.exports = {
  buildAccessibleStorageQuery,
  canReadStorageEntity,
  canWriteStorageEntity,
  canAdminStorageEntity,
};
