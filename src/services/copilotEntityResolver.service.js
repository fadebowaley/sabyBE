const httpStatus = require('http-status');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { postgresPool } = require('../config/postgres');
const { User, Role, Nodes, ProjectForm, Permission } = require('../models');
const redis = require('../config/redis');

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;
const CACHE_TTL_SEC = 60;
const SUPPORTED_ENTITY_TYPES = ['user', 'role', 'node', 'project', 'permission'];

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
};

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const scoreTextMatch = (query, values = []) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 0;
  const pool = values
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean);
  if (pool.some((v) => v === q)) return 1;
  if (pool.some((v) => v.startsWith(q))) return 0.9;
  if (pool.some((v) => v.includes(q))) return 0.75;
  return 0.4;
};

const mapUserCandidate = (query, doc) => {
  const first = doc.firstname || '';
  const last = doc.lastname || '';
  const fullName = `${first} ${last}`.trim();
  const email = doc.email || '';
  return {
    entityType: 'user',
    id: String(doc._id),
    label: fullName || email || String(doc._id),
    meta: {
      email,
      firstname: first,
      lastname: last,
      tenantId: doc.tenantId,
    },
    score: scoreTextMatch(query, [email, first, last, fullName]),
  };
};

const mapRoleCandidate = (query, doc) => ({
  entityType: 'role',
  id: String(doc._id),
  label: doc.name || String(doc._id),
  meta: {
    description: doc.description || '',
    tenantId: doc.tenantId,
  },
  score: scoreTextMatch(query, [doc.name, doc.description]),
});

const mapNodeCandidate = (query, doc) => ({
  entityType: 'node',
  id: String(doc._id),
  label: doc.name || doc.nodeId || String(doc._id),
  meta: {
    nodeId: doc.nodeId || null,
    tenantId: doc.tenantId,
  },
  score: scoreTextMatch(query, [doc.name, doc.nodeId]),
});

const mapProjectCandidate = (query, doc) => {
  const projectName = doc.configuration?.projectName || '';
  return {
    entityType: 'project',
    id: String(doc._id),
    label: projectName || String(doc.projectId || doc._id),
    meta: {
      projectId: doc.projectId || null,
      tenantId: doc.tenantId,
      status: doc.status || null,
    },
    score: scoreTextMatch(query, [projectName, doc.projectId]),
  };
};

const mapPermissionCandidate = (query, doc) => ({
  entityType: 'permission',
  id: String(doc._id),
  label: doc.name || `${doc.action}:${doc.resource}`,
  meta: {
    resource: doc.resource || null,
    action: doc.action || null,
    method: doc.method || null,
  },
  score: scoreTextMatch(query, [doc.name, doc.resource, doc.action, doc.path]),
});

const byScoreDesc = (a, b) => Number(b.score || 0) - Number(a.score || 0);

const getCache = async (key) => {
  try {
    const client = redis.redisClient;
    if (!client || client.status !== 'ready') return null;
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const setCache = async (key, value, ttlSec = CACHE_TTL_SEC) => {
  try {
    const client = redis.redisClient;
    if (!client || client.status !== 'ready') return;
    await client.setex(key, ttlSec, JSON.stringify(value));
  } catch (_) {
    // noop
  }
};

const deleteByPattern = async (pattern) => {
  try {
    const client = redis.redisClient;
    if (!client || client.status !== 'ready') return 0;
    let cursor = '0';
    let deleted = 0;
    do {
      // ioredis scan reply: [nextCursor, keys[]]
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200
      );
      cursor = nextCursor;
      if (Array.isArray(keys) && keys.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        deleted += await client.del(...keys);
      }
    } while (cursor !== '0');
    return deleted;
  } catch (_) {
    return 0;
  }
};

const invalidateTenantEntityCaches = async ({
  tenantId,
  entityType = 'user',
}) => {
  if (!tenantId) return { deleted: 0 };
  const normalizedType = String(entityType || '').toLowerCase();
  const patterns = [
    // Search cache can contain mixed entity types; clear by tenant.
    `copilot:search:v1:${tenantId}:*`,
    // Resolve cache is entity-type scoped.
    `copilot:resolve:v1:${tenantId}:${normalizedType}:*`,
  ];

  let deleted = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const pattern of patterns) {
    // eslint-disable-next-line no-await-in-loop
    deleted += await deleteByPattern(pattern);
  }
  return { deleted };
};

const logResolution = async ({
  tenantId,
  actorUserId,
  actionType,
  source = 'resolver',
  entityType,
  queryText,
  status,
  selectedEntityId = null,
  candidates = [],
  latencyMs = null,
  metadata = {},
}) => {
  if (!tenantId || !entityType || !queryText || !status) return;
  try {
    await postgresPool.query(
      `INSERT INTO copilot.entity_resolution_logs (
         tenant_id, actor_user_id, action_type, source, entity_type, query_text,
         status, selected_entity_id, candidate_count, top_candidates_json, latency_ms, metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10::jsonb, $11, $12::jsonb
       )`,
      [
        tenantId,
        actorUserId || null,
        actionType || null,
        source,
        entityType,
        String(queryText).slice(0, 255),
        status,
        selectedEntityId || null,
        Array.isArray(candidates) ? candidates.length : 0,
        JSON.stringify(
          (candidates || []).slice(0, 5).map((c) => ({
            id: c.id,
            label: c.label,
            score: c.score,
          }))
        ),
        Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (error) {
    // ignore if migration not yet applied
    if (error?.code !== '42P01') {
      // no-op
    }
  }
};

const searchUsers = async ({ tenantId, query, limit, includeDeleted = false }) => {
  const regex = new RegExp(escapeRegex(query), 'i');
  const filter = {
    tenantId,
    $or: [{ email: regex }, { firstname: regex }, { lastname: regex }],
  };
  if (!includeDeleted) {
    filter.deletedAt = null;
  }
  const docs = await User.find(filter)
    .select('_id tenantId firstname lastname email')
    .limit(limit)
    .lean();
  return docs.map((doc) => mapUserCandidate(query, doc)).sort(byScoreDesc);
};

const searchRoles = async ({ tenantId, query, limit }) => {
  const regex = new RegExp(escapeRegex(query), 'i');
  const docs = await Role.find({
    tenantId,
    isActive: true,
    name: regex,
  })
    .select('_id tenantId name description')
    .limit(limit)
    .lean();
  return docs.map((doc) => mapRoleCandidate(query, doc)).sort(byScoreDesc);
};

const searchNodes = async ({ tenantId, query, limit }) => {
  const regex = new RegExp(escapeRegex(query), 'i');
  const docs = await Nodes.find({
    tenantId,
    deletedAt: null,
    $or: [{ name: regex }, { nodeId: regex }],
  })
    .select('_id tenantId name nodeId')
    .limit(limit)
    .lean();
  return docs.map((doc) => mapNodeCandidate(query, doc)).sort(byScoreDesc);
};

const searchProjects = async ({ tenantId, query, limit }) => {
  const regex = new RegExp(escapeRegex(query), 'i');
  const docs = await ProjectForm.find({
    tenantId,
    deletedAt: null,
    $or: [{ projectId: regex }, { 'configuration.projectName': regex }],
  })
    .select('_id tenantId projectId status configuration.projectName')
    .limit(limit)
    .lean();
  return docs.map((doc) => mapProjectCandidate(query, doc)).sort(byScoreDesc);
};

const searchPermissions = async ({ query, limit }) => {
  const regex = new RegExp(escapeRegex(query), 'i');
  const docs = await Permission.find({
    $or: [{ name: regex }, { resource: regex }, { action: regex }, { path: regex }],
  })
    .select('_id name resource action method path')
    .limit(limit)
    .lean();
  return docs.map((doc) => mapPermissionCandidate(query, doc)).sort(byScoreDesc);
};

const searchEntities = async ({
  tenantId,
  query,
  entityTypes = SUPPORTED_ENTITY_TYPES,
  limit = DEFAULT_LIMIT,
  actionType = null,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  const q = String(query || '').trim();
  if (!q) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'query is required');
  }

  const requestedTypes = toArray(entityTypes)
    .map((x) => String(x).toLowerCase())
    .filter((x) => SUPPORTED_ENTITY_TYPES.includes(x));
  const effectiveTypes = requestedTypes.length > 0 ? requestedTypes : SUPPORTED_ENTITY_TYPES;
  const normalizedAction = String(actionType || '').toLowerCase();
  const includeDeletedUsers = normalizedAction === 'reactivate_user';
  const effectiveLimit = normalizeLimit(limit);
  const typeKey = effectiveTypes.slice().sort().join(',');
  const actionKey = normalizedAction || 'none';
  const includeDeletedKey = includeDeletedUsers ? 'with_deleted' : 'active_only';
  const cacheKey = `copilot:search:v1:${tenantId}:${typeKey}:${actionKey}:${includeDeletedKey}:${effectiveLimit}:${q.toLowerCase()}`;

  const cached = await getCache(cacheKey);
  if (Array.isArray(cached)) {
    return cached;
  }

  const all = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const type of effectiveTypes) {
    // eslint-disable-next-line no-await-in-loop
    const rows =
      type === 'user'
        ? await searchUsers({
            tenantId,
            query: q,
            limit: effectiveLimit,
            includeDeleted: includeDeletedUsers,
          })
        : type === 'role'
          ? await searchRoles({ tenantId, query: q, limit: effectiveLimit })
          : type === 'node'
            ? await searchNodes({ tenantId, query: q, limit: effectiveLimit })
            : type === 'project'
              ? await searchProjects({ tenantId, query: q, limit: effectiveLimit })
              : await searchPermissions({ query: q, limit: effectiveLimit });
    all.push(...rows);
  }

  const output = all.sort(byScoreDesc).slice(0, effectiveLimit);
  await setCache(cacheKey, output);
  return output;
};

const resolveEntityReference = async ({
  tenantId,
  entityType,
  value,
  limit = 5,
  actorUserId = null,
  actionType = null,
  source = 'resolver',
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  const normalizedType = String(entityType || '').toLowerCase();
  if (!SUPPORTED_ENTITY_TYPES.includes(normalizedType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported entityType: ${entityType}`);
  }
  const ref = String(value || '').trim();
  if (!ref) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'value is required');
  }

  const effectiveLimit = normalizeLimit(limit);
  const normalizedAction = String(actionType || '').toLowerCase();
  const includeDeletedUsers =
    normalizedType === 'user' && normalizedAction === 'reactivate_user';
  const startedAt = Date.now();
  const actionKey = normalizedAction || 'none';
  const includeDeletedKey = includeDeletedUsers ? 'with_deleted' : 'active_only';
  const cacheKey = `copilot:resolve:v1:${tenantId}:${normalizedType}:${actionKey}:${includeDeletedKey}:${effectiveLimit}:${ref.toLowerCase()}`;
  const cached = await getCache(cacheKey);
  if (cached && cached.status && Array.isArray(cached.candidates)) {
    await logResolution({
      tenantId,
      actorUserId,
      actionType,
      source,
      entityType: normalizedType,
      queryText: ref,
      status: cached.status,
      selectedEntityId: cached.candidate?.id || null,
      candidates: cached.candidates,
      latencyMs: Date.now() - startedAt,
      metadata: { cacheHit: true },
    });
    return cached;
  }

  if (normalizedType === 'user' && isObjectId(ref)) {
    const userByIdFilter = { _id: ref, tenantId };
    if (!includeDeletedUsers) {
      userByIdFilter.deletedAt = null;
    }
    const found = await User.findOne(userByIdFilter)
      .select('_id tenantId firstname lastname email')
      .lean();
    if (found) {
      const candidate = mapUserCandidate(ref, found);
      candidate.score = 1;
      const output = { status: 'resolved', candidate, candidates: [candidate] };
      await setCache(cacheKey, output);
      await logResolution({
        tenantId,
        actorUserId,
        actionType,
        source,
        entityType: normalizedType,
        queryText: ref,
        status: output.status,
        selectedEntityId: output.candidate?.id || null,
        candidates: output.candidates,
        latencyMs: Date.now() - startedAt,
        metadata: { directLookup: true },
      });
      return output;
    }
  }
  if (normalizedType === 'role' && isObjectId(ref)) {
    const found = await Role.findOne({ _id: ref, tenantId })
      .select('_id tenantId name description')
      .lean();
    if (found) {
      const candidate = mapRoleCandidate(ref, found);
      candidate.score = 1;
      const output = { status: 'resolved', candidate, candidates: [candidate] };
      await setCache(cacheKey, output);
      await logResolution({
        tenantId,
        actorUserId,
        actionType,
        source,
        entityType: normalizedType,
        queryText: ref,
        status: output.status,
        selectedEntityId: output.candidate?.id || null,
        candidates: output.candidates,
        latencyMs: Date.now() - startedAt,
        metadata: { directLookup: true },
      });
      return output;
    }
  }
  if (normalizedType === 'node' && isObjectId(ref)) {
    const found = await Nodes.findOne({ _id: ref, tenantId, deletedAt: null })
      .select('_id tenantId name nodeId')
      .lean();
    if (found) {
      const candidate = mapNodeCandidate(ref, found);
      candidate.score = 1;
      const output = { status: 'resolved', candidate, candidates: [candidate] };
      await setCache(cacheKey, output);
      await logResolution({
        tenantId,
        actorUserId,
        actionType,
        source,
        entityType: normalizedType,
        queryText: ref,
        status: output.status,
        selectedEntityId: output.candidate?.id || null,
        candidates: output.candidates,
        latencyMs: Date.now() - startedAt,
        metadata: { directLookup: true },
      });
      return output;
    }
  }
  if (normalizedType === 'project') {
    const found = await ProjectForm.findOne({
      tenantId,
      deletedAt: null,
      $or: [{ projectId: ref }, { 'configuration.projectName': ref }],
    })
      .select('_id tenantId projectId status configuration.projectName')
      .lean();
    if (found) {
      const candidate = mapProjectCandidate(ref, found);
      candidate.score = 1;
      const output = { status: 'resolved', candidate, candidates: [candidate] };
      await setCache(cacheKey, output);
      await logResolution({
        tenantId,
        actorUserId,
        actionType,
        source,
        entityType: normalizedType,
        queryText: ref,
        status: output.status,
        selectedEntityId: output.candidate?.id || null,
        candidates: output.candidates,
        latencyMs: Date.now() - startedAt,
        metadata: { directLookup: true },
      });
      return output;
    }
  }
  if (normalizedType === 'permission' && isObjectId(ref)) {
    const found = await Permission.findOne({ _id: ref })
      .select('_id name resource action method path')
      .lean();
    if (found) {
      const candidate = mapPermissionCandidate(ref, found);
      candidate.score = 1;
      const output = { status: 'resolved', candidate, candidates: [candidate] };
      await setCache(cacheKey, output);
      await logResolution({
        tenantId,
        actorUserId,
        actionType,
        source,
        entityType: normalizedType,
        queryText: ref,
        status: output.status,
        selectedEntityId: output.candidate?.id || null,
        candidates: output.candidates,
        latencyMs: Date.now() - startedAt,
        metadata: { directLookup: true },
      });
      return output;
    }
  }

  const candidates = await searchEntities({
    tenantId,
    query: ref,
    entityTypes: [normalizedType],
    limit: effectiveLimit,
    actionType,
  });
  if (candidates.length === 0) {
    const output = { status: 'not_found', candidate: null, candidates: [] };
    await setCache(cacheKey, output);
    await logResolution({
      tenantId,
      actorUserId,
      actionType,
      source,
      entityType: normalizedType,
      queryText: ref,
      status: output.status,
      selectedEntityId: null,
      candidates: [],
      latencyMs: Date.now() - startedAt,
      metadata: { directLookup: false },
    });
    return output;
  }
  if (candidates.length === 1) {
    const output = { status: 'resolved', candidate: candidates[0], candidates };
    await setCache(cacheKey, output);
    await logResolution({
      tenantId,
      actorUserId,
      actionType,
      source,
      entityType: normalizedType,
      queryText: ref,
      status: output.status,
      selectedEntityId: output.candidate?.id || null,
      candidates: output.candidates,
      latencyMs: Date.now() - startedAt,
      metadata: { directLookup: false },
    });
    return output;
  }
  const output = { status: 'ambiguous', candidate: null, candidates };
  await setCache(cacheKey, output);
  await logResolution({
    tenantId,
    actorUserId,
    actionType,
    source,
    entityType: normalizedType,
    queryText: ref,
    status: output.status,
    selectedEntityId: null,
    candidates: output.candidates,
    latencyMs: Date.now() - startedAt,
    metadata: { directLookup: false },
  });
  return output;
};

const ensureResolved = (result, details, errors, field) => {
  if (result.status === 'resolved' && result.candidate?.id) {
    return result.candidate.id;
  }
  errors.push({
    field,
    status: result.status,
    candidates: result.candidates || [],
  });
  details.push({
    field,
    status: result.status,
    candidates: (result.candidates || []).map((c) => ({
      id: c.id,
      label: c.label,
      score: c.score,
    })),
  });
  return null;
};

const resolveActionPayload = async ({
  tenantId,
  actionType,
  payload = {},
  actorUserId = null,
  source = 'tool_runtime',
}) => {
  const normalizedAction = String(actionType || '').toLowerCase();
  const resolvedPayload = { ...(payload || {}) };
  const resolutionDetails = [];
  const blockingErrors = [];

  if (['assign_role', 'unassign_role'].includes(normalizedAction)) {
    const userRef =
      resolvedPayload.userId ||
      resolvedPayload.userEmail ||
      resolvedPayload.userName ||
      resolvedPayload.user;
    if (!resolvedPayload.userId && userRef) {
      const userRes = await resolveEntityReference({
        tenantId,
        entityType: 'user',
        value: userRef,
        limit: 5,
        actorUserId,
        actionType: normalizedAction,
        source,
      });
      const userId = ensureResolved(userRes, resolutionDetails, blockingErrors, 'userId');
      if (userId) resolvedPayload.userId = userId;
    }

    if (!resolvedPayload.roleIds && !resolvedPayload.roleId && !resolvedPayload.roles) {
      const roleRefs = [
        ...toArray(resolvedPayload.roleName),
        ...toArray(resolvedPayload.roleNames),
      ].filter(Boolean);
      if (roleRefs.length > 0) {
        const roleIds = [];
        // eslint-disable-next-line no-restricted-syntax
        for (const roleRef of roleRefs) {
          // eslint-disable-next-line no-await-in-loop
          const roleRes = await resolveEntityReference({
            tenantId,
            entityType: 'role',
            value: roleRef,
            limit: 5,
            actorUserId,
            actionType: normalizedAction,
            source,
          });
          const roleId = ensureResolved(roleRes, resolutionDetails, blockingErrors, 'roleIds');
          if (roleId) roleIds.push(roleId);
        }
        const uniqueRoleIds = [...new Set(roleIds)];
        if (uniqueRoleIds.length === 1) {
          resolvedPayload.roleId = uniqueRoleIds[0];
        } else if (uniqueRoleIds.length > 1) {
          resolvedPayload.roleIds = uniqueRoleIds;
        }
      }
    }
  }

  if (['grant_permission', 'revoke_permission'].includes(normalizedAction)) {
    const roleRef =
      resolvedPayload.roleId ||
      resolvedPayload.roleName ||
      resolvedPayload.role;
    if (!resolvedPayload.roleId && roleRef) {
      const roleRes = await resolveEntityReference({
        tenantId,
        entityType: 'role',
        value: roleRef,
        limit: 5,
        actorUserId,
        actionType: normalizedAction,
        source,
      });
      const roleId = ensureResolved(roleRes, resolutionDetails, blockingErrors, 'roleId');
      if (roleId) resolvedPayload.roleId = roleId;
    }

    if (
      !resolvedPayload.permissionIds &&
      !resolvedPayload.permissionId &&
      !resolvedPayload.permissions
    ) {
      const permissionRefs = [
        ...toArray(resolvedPayload.permissionName),
        ...toArray(resolvedPayload.permissionNames),
      ].filter(Boolean);
      if (permissionRefs.length > 0) {
        const permissionIds = [];
        // eslint-disable-next-line no-restricted-syntax
        for (const permissionRef of permissionRefs) {
          // eslint-disable-next-line no-await-in-loop
          const permissionRes = await resolveEntityReference({
            tenantId,
            entityType: 'permission',
            value: permissionRef,
            limit: 5,
            actorUserId,
            actionType: normalizedAction,
            source,
          });
          const permissionId = ensureResolved(
            permissionRes,
            resolutionDetails,
            blockingErrors,
            'permissionIds'
          );
          if (permissionId) permissionIds.push(permissionId);
        }
        const uniquePermissionIds = [...new Set(permissionIds)];
        if (uniquePermissionIds.length === 1) {
          resolvedPayload.permissionId = uniquePermissionIds[0];
        } else if (uniquePermissionIds.length > 1) {
          resolvedPayload.permissionIds = uniquePermissionIds;
        }
      }
    }
  }

  if (
    [
      'delete_node',
      'restore_node',
      'move_node',
      'assign_user_to_node',
      'unassign_user_from_node',
    ].includes(normalizedAction)
  ) {
    const nodeRef = resolvedPayload.nodeId || resolvedPayload.nodeName || resolvedPayload.node;
    if (!resolvedPayload.nodeId && nodeRef) {
      const nodeRes = await resolveEntityReference({
        tenantId,
        entityType: 'node',
        value: nodeRef,
        limit: 5,
        actorUserId,
        actionType: normalizedAction,
        source,
      });
      const nodeId = ensureResolved(nodeRes, resolutionDetails, blockingErrors, 'nodeId');
      if (nodeId) resolvedPayload.nodeId = nodeId;
    }

    if (normalizedAction === 'move_node') {
      const parentRef =
        resolvedPayload.targetParentId ||
        resolvedPayload.parentId ||
        resolvedPayload.targetParentName ||
        resolvedPayload.parentName;
      if (!resolvedPayload.targetParentId && !resolvedPayload.parentId && parentRef) {
        const parentRes = await resolveEntityReference({
          tenantId,
          entityType: 'node',
          value: parentRef,
          limit: 5,
          actorUserId,
          actionType: normalizedAction,
          source,
        });
        const parentId = ensureResolved(
          parentRes,
          resolutionDetails,
          blockingErrors,
          'targetParentId'
        );
        if (parentId) resolvedPayload.targetParentId = parentId;
      }
    }

    if (
      ['assign_user_to_node', 'unassign_user_from_node'].includes(normalizedAction)
    ) {
      const nodeUserRef =
        resolvedPayload.userId || resolvedPayload.userEmail || resolvedPayload.userName;
      if (!resolvedPayload.userId && nodeUserRef) {
        const userRes = await resolveEntityReference({
          tenantId,
          entityType: 'user',
          value: nodeUserRef,
          limit: 5,
          actorUserId,
          actionType: normalizedAction,
          source,
        });
        const userId = ensureResolved(userRes, resolutionDetails, blockingErrors, 'userId');
        if (userId) resolvedPayload.userId = userId;
      }
    }
  }

  if (['archive_project', 'restore_project'].includes(normalizedAction)) {
    const projectRef =
      resolvedPayload.projectFormId ||
      resolvedPayload.projectName ||
      resolvedPayload.projectId;
    if (!resolvedPayload.projectFormId && projectRef) {
      const projectRes = await resolveEntityReference({
        tenantId,
        entityType: 'project',
        value: projectRef,
        limit: 5,
        actorUserId,
        actionType: normalizedAction,
        source,
      });
      const projectFormId = ensureResolved(
        projectRes,
        resolutionDetails,
        blockingErrors,
        'projectFormId'
      );
      if (projectFormId) resolvedPayload.projectFormId = projectFormId;
    }
  }

  if (
    ['update_user', 'delete_user', 'deactivate_user', 'reactivate_user'].includes(
      normalizedAction
    )
  ) {
    const userRef =
      resolvedPayload.userId ||
      resolvedPayload.userEmail ||
      resolvedPayload.email ||
      resolvedPayload.userName ||
      resolvedPayload.user;
    if (!resolvedPayload.userId && userRef) {
      const userRes = await resolveEntityReference({
        tenantId,
        entityType: 'user',
        value: userRef,
        limit: 5,
        actorUserId,
        actionType: normalizedAction,
        source,
      });
      const userId = ensureResolved(userRes, resolutionDetails, blockingErrors, 'userId');
      if (userId) resolvedPayload.userId = userId;
    }
  }

  return {
    resolvedPayload,
    resolutionDetails,
    blockingErrors,
    canExecute: blockingErrors.length === 0,
  };
};

module.exports = {
  searchEntities,
  resolveEntityReference,
  resolveActionPayload,
  invalidateTenantEntityCaches,
  __private: {
    normalizeLimit,
    scoreTextMatch,
    SUPPORTED_ENTITY_TYPES,
    deleteByPattern,
  },
};
