/**
 * Submission Report Service
 *
 * Orchestration layer for submission reporting and data management.
 * Provides high-level business logic for CRUD operations on submissions.
 *
 * Features:
 * - Advanced filtering and pagination
 * - Compliance reporting
 * - Data management (update, delete)
 * - Bulk operations
 * - Export capabilities
 *
 * @module services/submissionReport
 */

const httpStatus = require('http-status');
const SubmissionModel = require('../models/submission.model');
const ProjectForm = require('../models/projectForm.model');
const User = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const { logActivity } = require('../utils/activityLogger');
const { postgresPool } = require('../config/postgres');
const mongoose = require('mongoose');

const DEFAULT_TABLE_LIMIT = 100;
const MAX_TABLE_LIMIT = 500;
const DEFAULT_AGGREGATION_LIMIT = 25;
const MAX_AGGREGATION_LIMIT = 50;
const DEFAULT_TREND_LIMIT = 24;
const MAX_TREND_LIMIT = 60;
const ALLOWED_AGGREGATIONS = new Set(['sum', 'avg', 'min', 'max', 'count']);
const ALLOWED_TREND_GRAINS = new Set(['day', 'week', 'month', 'quarter']);
const ALLOWED_SUBMISSION_STATUSES = new Set([
  'submitted',
  'pending',
  'pending_approval',
  'approved',
  'rejected',
  'changes_requested',
  'completed',
  'failed',
]);
const HIERARCHY_ORDERING_CACHE_MS = 60 * 1000;
const FIXED_COLUMN_LABELS = {
  node_name: 'Node Name',
  nodeid: 'NodeId',
  user_id: 'User',
  status: 'Status',
  submitted_at: 'Submitted At',
};
const RESERVED_REPORT_PAYLOAD_KEYS = new Set(['__payment', '__invoice']);

const normalizeJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const APPROVAL_FALLBACK_ROLE_REFS = new Set([
  'admin',
  'owner',
  'sabyadmin',
  'sabyowner',
  'superadmin',
  'superuser',
  'tenantadmin',
  'tenantowner',
]);

const actorHasApprovalFallbackAccess = (actor = {}) => {
  if (actor.isAdmin || actor.isOwner || actor.isSaby || actor.isSuper) {
    return true;
  }

  const roleRefs = [actor.role, ...(Array.isArray(actor.roles) ? actor.roles : [])]
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

  return roleRefs.some((entry) => APPROVAL_FALLBACK_ROLE_REFS.has(entry));
};

const actorCanActionApprovalStep = (step, actor = {}) => {
  if (!step || String(step.approval_step_status || '').toLowerCase() !== 'in_progress') {
    return false;
  }

  const actorUserId = String(actor.userId || '').trim();
  const actorRoleRefs = Array.from(
    new Set(
      [actor.role, ...(Array.isArray(actor.roles) ? actor.roles : [])]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
  const assigneeType = String(step.approver_type || '').trim().toLowerCase();
  const assigneeRole = String(step.approver_role || '').trim();
  const assigneeRoles = normalizeJsonArray(step.approver_roles);
  const assigneeUsers = normalizeJsonArray(step.approver_users);

  if (assigneeType === 'user') {
    const allowedUsers = assigneeUsers
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);

    if (allowedUsers.length > 0) {
      return Boolean(actorUserId) && allowedUsers.includes(actorUserId);
    }

    // Legacy/broken workflow rows may have `assignee_type=user` without users.
    // Let workspace owners/admins recover the approval instead of deadlocking it.
    return actorHasApprovalFallbackAccess(actor);
  }

  if (assigneeType === 'role' || !assigneeType) {
    const allowedRoles = new Set(
      [assigneeRole, ...assigneeRoles]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    );
    return actorRoleRefs.some((entry) => allowedRoles.has(entry));
  }

  return false;
};

const normalizeApprovalLabel = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return prettifyKey(normalized);
};
let hierarchyOrderingCapability = {
  checkedAt: 0,
  enabled: false,
};

const toSnakeCase = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const prettifyKey = (key = '') =>
  String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const unwrapValue = (value) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'object' ? JSON.stringify(item) : item))
      .join(', ');
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return value.value;
    }
    try {
      return JSON.stringify(value);
    } catch (_err) {
      return String(value);
    }
  }
  return value;
};

const compactStrings = (values = [], limit = 5000) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ).slice(0, limit);

const normalizeSubmissionStatuses = (values = []) =>
  compactStrings(values)
    .map((value) => value.toLowerCase())
    .filter((value) => ALLOWED_SUBMISSION_STATUSES.has(value));

const shouldPreserveStructuredValue = (fieldType = '') => {
  const normalized = String(fieldType || '').trim().toLowerCase();
  return ['file', 'image', 'fileupload', 'profile_image_upload'].includes(normalized);
};

const resolveAggregationSql = (aggregate) => {
  switch (aggregate) {
    case 'sum':
      return 'COALESCE(SUM(metric.value_numeric), 0)::numeric';
    case 'avg':
      return 'AVG(metric.value_numeric)::numeric';
    case 'min':
      return 'MIN(metric.value_numeric)::numeric';
    case 'max':
      return 'MAX(metric.value_numeric)::numeric';
    case 'count':
      return 'COUNT(DISTINCT fs.id)::numeric';
    default:
      return null;
  }
};

const resolveTrendGrain = (grain) => {
  const normalized = String(grain || 'month').trim().toLowerCase();
  return ALLOWED_TREND_GRAINS.has(normalized) ? normalized : 'month';
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NON_DATA_ELEMENT_TYPES = new Set([
  'header',
  'paragraph',
  'description',
  'spacer',
  'divider',
]);

const resolvePublicSecureMode = (projectForm) => {
  const mode = String(
    projectForm?.capabilities?.experience?.security?.publicSecureMode || 'off'
  ).toLowerCase();

  if (['off', 'link_only', 'otp', 'access_code'].includes(mode)) {
    return mode;
  }
  return 'off';
};

const isOpenFormWithoutAuthentication = (projectForm) => {
  const security = projectForm?.capabilities?.experience?.security || {};
  const authentication = security.authentication || {};
  const mode = String(security.mode || 'public').toLowerCase();
  const publicSecureMode = resolvePublicSecureMode(projectForm);

  if (mode === 'private') return false;
  if (publicSecureMode === 'otp' || publicSecureMode === 'access_code') return false;
  if (authentication.requireLogin === true) return false;

  return authentication.allowAnonymous !== false;
};

const getFieldOrder = (field = {}) => {
  const metadata = field.metadata && typeof field.metadata === 'object' ? field.metadata : {};
  const numericOrder = Number(metadata.order);
  return Number.isFinite(numericOrder) ? numericOrder : Number.MAX_SAFE_INTEGER;
};

const getProjectFormReportContext = async ({ tenant_id, project_id }) => {
  const projectForm = await ProjectForm.findOne(
    { tenantId: tenant_id, projectId: project_id },
    {
      elements: 1,
      capabilities: 1,
      identity: 1,
      projectId: 1,
      tenantId: 1,
    }
  )
    .lean()
    .exec();

  if (!projectForm) {
    return {
      projectForm: null,
      orderedFields: [],
      isOpenForm: false,
      hideIdentityColumns: false,
    };
  }

  const orderedFields = Array.isArray(projectForm.elements)
    ? projectForm.elements
        .filter((element) => {
          if (!element?.id) return false;
          if (!element?.properties?.label) return false;
          return !NON_DATA_ELEMENT_TYPES.has(String(element.type || '').toLowerCase());
        })
        .map((element, index) => ({
          field_key: element.id,
          field_label: element?.properties?.label || element.id,
          field_type: element?.type || null,
          metadata: { order: index, elementId: element.id },
        }))
    : [];

  const isOpenForm = isOpenFormWithoutAuthentication(projectForm);

  return {
    projectForm,
    orderedFields,
    isOpenForm,
    hideIdentityColumns: isOpenForm,
  };
};

const isTruthyDebugFlag = (value) => {
  if (value === true) return true;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
};

const isHierarchyOrderingAvailable = async () => {
  const now = Date.now();
  if (
    now - hierarchyOrderingCapability.checkedAt <
    HIERARCHY_ORDERING_CACHE_MS
  ) {
    return hierarchyOrderingCapability.enabled;
  }

  const requiredColumns = [
    'tenant_id',
    'node_id',
    'node_reference',
    'lineage_refs',
  ];

  try {
    const result = await postgresPool.query(
      `
        SELECT COUNT(*)::int AS matched
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'node_dimension'
          AND column_name = ANY($1::text[])
      `,
      [requiredColumns]
    );
    const matched = Number(result.rows[0]?.matched || 0);
    hierarchyOrderingCapability = {
      checkedAt: now,
      enabled: matched === requiredColumns.length,
    };
  } catch (_error) {
    hierarchyOrderingCapability = {
      checkedAt: now,
      enabled: false,
    };
  }

  return hierarchyOrderingCapability.enabled;
};

const buildDynamicColumns = (
  catalogRows = [],
  submissionRows = [],
  { hideIdentityColumns = false } = {}
) => {
  const dynamicColumns = [];
  const usedKeys = new Set(['status', 'submitted_at']);
  const sourceKeyToColumnKey = new Map([
    ['status', 'status'],
    ['created_at', 'submitted_at'],
    ['submitted_at', 'submitted_at'],
  ]);

  if (!hideIdentityColumns) {
    usedKeys.add('node_name');
    usedKeys.add('nodeid');
    usedKeys.add('user_id');
    sourceKeyToColumnKey.set('node_name', 'node_name');
    sourceKeyToColumnKey.set('node_id', 'nodeid');
    sourceKeyToColumnKey.set('node_reference', 'nodeid');
    sourceKeyToColumnKey.set('user_id', 'user_id');
  }

  const register = (sourceKey, labelHint, preferredKey = null, catalogRow = null) => {
    if (!sourceKey) return;
    if (sourceKeyToColumnKey.has(sourceKey)) return;

    const label = labelHint || prettifyKey(sourceKey);
    let candidate =
      preferredKey || toSnakeCase(label) || toSnakeCase(sourceKey) || 'field';
    let suffix = 2;
    while (usedKeys.has(candidate)) {
      candidate = `${toSnakeCase(label) || 'field'}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(candidate);
    sourceKeyToColumnKey.set(sourceKey, candidate);
    dynamicColumns.push({
      key: candidate,
      label,
      source_key: sourceKey,
      field_type: catalogRow?.field_type || null,
      metadata: catalogRow?.metadata || {},
    });
  };

  catalogRows
    .slice()
    .sort((left, right) => {
      const leftOrder = getFieldOrder(left);
      const rightOrder = getFieldOrder(right);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left.field_label || left.field_key || '').localeCompare(
        String(right.field_label || right.field_key || '')
      );
    })
    .forEach((row) => {
    register(row.field_key, row.field_label, toSnakeCase(row.field_key || ''), row);
    });

  submissionRows.forEach((row) => {
    const payload = row.data && typeof row.data === 'object' ? row.data : {};
    Object.keys(payload).forEach((key) => {
      if (RESERVED_REPORT_PAYLOAD_KEYS.has(key)) return;
      const rawValue = payload[key];
      const inferredFieldType =
        rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
          ? (() => {
              const mimeType = String(
                rawValue.mimeType || rawValue.type || ''
              ).toLowerCase();
              const hasUploadShape = Boolean(
                rawValue.uploadId || rawValue.url || rawValue.key
              );
              if (!hasUploadShape) return null;
              if (mimeType.startsWith('image/')) return 'image';
              return 'file';
            })()
          : null;
      register(
        key,
        null,
        null,
        inferredFieldType ? { field_type: inferredFieldType, metadata: {} } : null
      );
    });
  });

  const modeResultRows = submissionRows
    .map((row) => row.meta?.modeResult)
    .filter((result) => result && typeof result === 'object');
  if (modeResultRows.length > 0) {
    const mode = String(modeResultRows[0].mode || '').trim().toLowerCase();
    const label =
      mode === 'lead_qualification'
        ? 'Lead Result'
        : mode === 'knowledge_quiz'
          ? 'Quiz Result'
          : mode === 'match_quiz'
            ? 'Match Result'
            : 'Result';
    register('mode_result', label, 'mode_result', {
      field_type: 'mode_result',
      metadata: { mode },
    });
  }

  const proctoringRows = submissionRows
    .map((row) => row.meta?.proctoring)
    .filter((result) => result && typeof result === 'object');
  if (proctoringRows.length > 0) {
    register('proctoring_status', 'Integrity Status', 'proctoring_status', {
      field_type: 'status',
      metadata: { source: 'proctoring' },
    });
    register('proctoring_warnings', 'Warnings', 'proctoring_warnings', {
      field_type: 'number',
      metadata: { source: 'proctoring' },
    });
    register('proctoring_focus_events', 'Focus Loss Events', 'proctoring_focus_events', {
      field_type: 'number',
      metadata: { source: 'proctoring' },
    });
    register('proctoring_paste_attempts', 'Paste Attempts', 'proctoring_paste_attempts', {
      field_type: 'number',
      metadata: { source: 'proctoring' },
    });
  }

  const columns = [];
  if (!hideIdentityColumns) {
    columns.push(
      { key: 'node_name', label: FIXED_COLUMN_LABELS.node_name, pinned: true },
      { key: 'nodeid', label: FIXED_COLUMN_LABELS.nodeid, pinned: true },
      { key: 'user_id', label: FIXED_COLUMN_LABELS.user_id }
    );
  }
  columns.push(
    ...dynamicColumns,
    { key: 'status', label: FIXED_COLUMN_LABELS.status },
    { key: 'submitted_at', label: FIXED_COLUMN_LABELS.submitted_at }
  );

  return { columns, sourceKeyToColumnKey };
};

const mergeOrderedFieldsWithCatalog = (orderedFields = [], catalogRows = []) => {
  if (!Array.isArray(orderedFields) || orderedFields.length === 0) {
    return catalogRows;
  }

  const catalogByKey = new Map(
    (catalogRows || []).map((row) => [String(row.field_key || ''), row])
  );
  const merged = [];
  const usedKeys = new Set();

  orderedFields.forEach((field) => {
    const fieldKey = String(field?.field_key || '');
    if (!fieldKey) return;
    usedKeys.add(fieldKey);
    merged.push({
      ...(catalogByKey.get(fieldKey) || {}),
      ...field,
      metadata: {
        ...((catalogByKey.get(fieldKey) || {}).metadata || {}),
        ...(field.metadata || {}),
      },
    });
  });

  (catalogRows || []).forEach((row) => {
    const fieldKey = String(row?.field_key || '');
    if (!fieldKey || usedKeys.has(fieldKey)) return;
    merged.push(row);
  });

  return merged;
};

const buildUserDisplayMap = async ({ tenantId, userIds = [] }) => {
  const cleanedIds = [...new Set((userIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (cleanedIds.length === 0) {
    return new Map();
  }

  const objectIds = cleanedIds.filter((value) => mongoose.Types.ObjectId.isValid(value));
  const lookupFilters = [];

  if (objectIds.length > 0) {
    lookupFilters.push({ _id: { $in: objectIds } });
  }

  lookupFilters.push({ userId: { $in: cleanedIds } });

  const users = await User.find({
    tenantId,
    $or: lookupFilters,
  })
    .select('_id userId firstname lastname email')
    .lean()
    .exec();

  const userDisplayMap = new Map();
  users.forEach((user) => {
    const displayName =
      `${user?.firstname || ''} ${user?.lastname || ''}`.trim() ||
      user?.email ||
      user?.userId ||
      (user?._id ? String(user._id) : null);

    if (!displayName) return;

    if (user?._id) {
      userDisplayMap.set(String(user._id), displayName);
    }
    if (user?.userId) {
      userDisplayMap.set(String(user.userId), displayName);
    }
  });

  return userDisplayMap;
};

/**
 * Get module report table in row/column format.
 * Columns are generated dynamically from form catalog + submission payload keys.
 * Rows are sourced directly from form_submissions for immediate availability.
 */
const getModuleReportTable = async (filters = {}) => {
  const {
    tenant_id,
    project_id,
    node_filter,
    node_filters,
    search,
    debug,
    start_date,
    end_date,
    month,
    status,
    statuses,
    limit = DEFAULT_TABLE_LIMIT,
    offset = 0,
    approval_actor = null,
  } = filters;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }
  if (!project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'project_id is required');
  }
  const includeDebug = isTruthyDebugFlag(debug);
  const reportContext = await getProjectFormReportContext({ tenant_id, project_id });

  const safeLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_TABLE_LIMIT, 1),
    MAX_TABLE_LIMIT
  );
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const canUseHierarchyOrdering = await isHierarchyOrderingAvailable();

  const where = ['fs.tenant_id = $1', 'fs.project_id = $2'];
  const values = [tenant_id, project_id];
  let index = 3;

  const nodeFilterValues = compactStrings([
    node_filter,
    ...(Array.isArray(node_filters) ? node_filters : []),
  ]);
  if (nodeFilterValues.length === 1) {
    where.push(`(fs.node_id = $${index} OR fs.node_reference = $${index})`);
    values.push(nodeFilterValues[0]);
    index += 1;
  } else if (nodeFilterValues.length > 1) {
    where.push(`(fs.node_id = ANY($${index}::text[]) OR fs.node_reference = ANY($${index}::text[]))`);
    values.push(nodeFilterValues);
    index += 1;
  }
  if (month) {
    where.push(`fs.month = $${index}`);
    values.push(month);
    index += 1;
  }
  const statusValues = normalizeSubmissionStatuses([
    status,
    ...(Array.isArray(statuses) ? statuses : []),
  ]);
  if (statusValues.length === 1) {
    where.push(`fs.status = $${index}`);
    values.push(statusValues[0]);
    index += 1;
  } else if (statusValues.length > 1) {
    where.push(`fs.status = ANY($${index}::text[])`);
    values.push(statusValues);
    index += 1;
  }
  if (start_date) {
    if (typeof start_date === 'string' && DATE_ONLY_PATTERN.test(start_date)) {
      where.push(`fs.created_at >= $${index}::date`);
    } else {
      where.push(`fs.created_at >= $${index}`);
    }
    values.push(start_date);
    index += 1;
  }
  if (end_date) {
    if (typeof end_date === 'string' && DATE_ONLY_PATTERN.test(end_date)) {
      where.push(`fs.created_at < ($${index}::date + INTERVAL '1 day')`);
    } else {
      where.push(`fs.created_at <= $${index}`);
    }
    values.push(end_date);
    index += 1;
  }
  if (search && String(search).trim() !== '') {
    where.push(`(
      CAST(fs.id AS TEXT) ILIKE $${index}
      OR COALESCE(fs.node_name, '') ILIKE $${index}
      OR COALESCE(fs.node_reference, '') ILIKE $${index}
      OR COALESCE(fs.node_id, '') ILIKE $${index}
      OR COALESCE(fs.status, '') ILIKE $${index}
    )`);
    values.push(`%${String(search).trim()}%`);
    index += 1;
  }

  // Hide soft-deleted records from reporting table by default.
  where.push(`fs.status != 'deleted'`);

  const whereClause = `WHERE ${where.join(' AND ')}`;
  const hierarchyJoin = canUseHierarchyOrdering
    ? `
      LEFT JOIN LATERAL (
        SELECT
          nd.node_id,
          nd.node_reference,
          nd.lineage_refs,
          nd.lineage_names,
          nd.depth,
          nd.level_name
        FROM node_dimension nd
        WHERE nd.tenant_id = fs.tenant_id
          AND (
            (fs.node_id IS NOT NULL AND nd.node_id = fs.node_id)
            OR (
              fs.node_reference IS NOT NULL
              AND nd.node_reference = fs.node_reference
            )
          )
        ORDER BY
          CASE WHEN fs.node_id IS NOT NULL AND nd.node_id = fs.node_id THEN 0 ELSE 1 END,
          nd.updated_at DESC NULLS LAST
        LIMIT 1
      ) nd ON TRUE
    `
    : '';

  const approvalJoin = `
    LEFT JOIN LATERAL (
      SELECT
        sw.id AS workflow_id,
        sw.workflow_name,
        sw.workflow_type,
        sw.status AS workflow_status,
        sws.id AS approval_id,
        sws.step_name AS approval_step,
        sws.step_order AS approval_step_order,
        sws.status AS approval_step_status,
        sws.action AS approval_action,
        sws.action_type AS approval_action_type,
        sws.assignee_type AS approver_type,
        sws.assignee_role AS approver_role,
        sws.assignee_roles AS approver_roles,
        sws.assignee_users AS approver_users,
        sws.action_by_user_name AS approval_actor_name,
        sws.action_by_user_email AS approval_actor_email,
        sws.comments AS approval_comment,
        sws.actioned_at AS approval_actioned_at,
        sws.due_at AS approval_due_at
      FROM submission_workflows sw
      JOIN submission_workflow_steps sws
        ON sws.workflow_id = sw.id
       AND sws.tenant_id = sw.tenant_id
      WHERE sw.submission_id = fs.id
        AND sw.tenant_id = fs.tenant_id
      ORDER BY
        CASE
          WHEN sws.status = 'in_progress' THEN 0
          WHEN sws.status = 'pending' THEN 1
          ELSE 2
        END ASC,
        sws.step_order ASC,
        sws.updated_at DESC NULLS LAST
      LIMIT 1
    ) approval ON TRUE
  `;

  const orderByClause = canUseHierarchyOrdering
    ? `
      ORDER BY
        CASE WHEN nd.node_id IS NULL THEN 1 ELSE 0 END ASC,
        array_to_string(
          COALESCE(nd.lineage_refs, ARRAY[]::text[]) || COALESCE(nd.node_reference, fs.node_reference, fs.node_id, ''),
          '/'
        ) ASC,
        fs.created_at DESC
    `
    : 'ORDER BY fs.created_at DESC';

  const rowsQuery = `
    SELECT
      fs.id,
      fs.node_id,
      fs.node_reference,
      fs.node_name,
      fs.user_id,
      fs.meta,
      fs.status,
      fs.data,
      fs.created_at,
      COALESCE(nd.lineage_refs, ARRAY[]::text[]) AS hierarchy_lineage_refs,
      COALESCE(nd.lineage_names, ARRAY[]::text[]) AS hierarchy_lineage_names,
      COALESCE(nd.depth, 0) AS hierarchy_depth,
      COALESCE(nd.level_name, NULL) AS hierarchy_level_name,
      approval.workflow_id,
      approval.workflow_name,
      approval.workflow_type,
      approval.workflow_status,
      approval.approval_id,
      approval.approval_step,
      approval.approval_step_order,
      approval.approval_step_status,
      approval.approval_action,
      approval.approval_action_type,
      approval.approver_type,
      approval.approver_role,
      approval.approver_roles,
      approval.approver_users,
      approval.approval_actor_name,
      approval.approval_actor_email,
      approval.approval_comment,
      approval.approval_actioned_at,
      approval.approval_due_at
    FROM form_submissions fs
    ${hierarchyJoin}
    ${approvalJoin}
    ${whereClause}
    ${orderByClause}
    LIMIT $${index} OFFSET $${index + 1}
  `;
  const rowsValues = [...values, safeLimit, safeOffset];
  const rowsResult = await postgresPool.query(rowsQuery, rowsValues);
  const userDisplayMap = reportContext.hideIdentityColumns
    ? new Map()
    : await buildUserDisplayMap({
        tenantId: tenant_id,
        userIds: rowsResult.rows.map((row) => row.user_id),
      });

  const countQuery = `SELECT COUNT(*)::bigint AS total FROM form_submissions fs ${whereClause}`;
  const countResult = await postgresPool.query(countQuery, values);
  const total = Number(countResult.rows[0]?.total || 0);

  const summaryQuery = `
    SELECT
      COUNT(*)::bigint AS total_rows,
      COUNT(DISTINCT COALESCE(node_reference, node_id))::bigint AS unique_nodes,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(user_id, ''), NULLIF(node_id, ''), NULLIF(node_reference, '')) IS NULL
      )::bigint AS anonymous_count,
      COUNT(*) FILTER (
        WHERE COALESCE(NULLIF(user_id, ''), NULLIF(node_id, ''), NULLIF(node_reference, '')) IS NOT NULL
      )::bigint AS identified_count,
      MIN(created_at) AS first_submission_at,
      MAX(created_at) AS latest_submission_at,
      COUNT(*) FILTER (WHERE status = 'submitted')::bigint AS submitted_count,
      COUNT(*) FILTER (WHERE status = 'approved')::bigint AS approved_count,
      COUNT(*) FILTER (WHERE status IN ('pending', 'pending_approval'))::bigint AS pending_count,
      COUNT(*) FILTER (WHERE status = 'rejected')::bigint AS rejected_count,
      COUNT(*) FILTER (WHERE status = 'changes_requested')::bigint AS changes_requested_count,
      COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed_count,
      COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count
    FROM form_submissions fs
    ${whereClause}
  `;
  const summaryResult = await postgresPool.query(summaryQuery, values);
  const summaryRow = summaryResult.rows[0] || {};
  const anonymousCount = Number(summaryRow.anonymous_count || 0);
  const identifiedCount = Number(summaryRow.identified_count || 0);

  let catalogRows = [];
  try {
    const catalogQuery = `
      SELECT field_key, field_label, field_type, metadata
      FROM form_field_catalog
      WHERE tenant_id = $1
        AND project_id = $2
      ORDER BY
        COALESCE((metadata->>'order')::int, 2147483647) ASC,
        field_label ASC,
        field_key ASC
    `;
    const catalogResult = await postgresPool.query(catalogQuery, [
      tenant_id,
      project_id,
    ]);
    catalogRows = catalogResult.rows || [];
  } catch (_catalogError) {
    // Fail-safe: reporting still works even when catalog entries are missing.
    catalogRows = [];
  }

  const orderedCatalogRows = mergeOrderedFieldsWithCatalog(
    reportContext.orderedFields,
    catalogRows
  );

  const { columns, sourceKeyToColumnKey } = buildDynamicColumns(
    orderedCatalogRows,
    rowsResult.rows,
    { hideIdentityColumns: reportContext.hideIdentityColumns }
  );
  const columnByKey = new Map(columns.map((column) => [column.key, column]));

  const rows = rowsResult.rows.map((row, rowIndex) => {
    const approvalStatus =
      row.workflow_id || row.approval_id
        ? row.status || row.workflow_status || row.approval_step_status
        : null;
    const canActionApproval = actorCanActionApprovalStep(
      row,
      approval_actor || {}
    );
    const reportRow = {
      sn: safeOffset + rowIndex + 1,
      submission_id: row.id,
      status: row.status,
      submitted_at: row.created_at,
      approval_status: approvalStatus,
      approval_workflow: normalizeApprovalLabel(approvalStatus) || 'No approval',
      workflow_id: row.workflow_id || null,
      workflow_name: row.workflow_name || null,
      workflow_type: row.workflow_type || null,
      workflow_status: row.workflow_status || null,
      approval_id: row.approval_id || null,
      approval_step: row.approval_step || null,
      approval_level:
        row.approval_step_order !== null && row.approval_step_order !== undefined
          ? Number(row.approval_step_order) + 1
          : null,
      approval_step_status: row.approval_step_status || null,
      approval_action: row.approval_action || null,
      approval_action_type: row.approval_action_type || null,
      approver_type: row.approver_type || null,
      approver_role: row.approver_role || null,
      approver_roles: normalizeJsonArray(row.approver_roles),
      approver_users: normalizeJsonArray(row.approver_users),
      approval_actor:
        row.approval_actor_name || row.approval_actor_email || null,
      approval_comment: row.approval_comment || null,
      approval_actioned_at: row.approval_actioned_at || null,
      approval_due_at: row.approval_due_at || null,
      can_approve: canActionApproval,
      can_reject: canActionApproval,
      can_request_changes: canActionApproval,
      __lineage_refs: Array.isArray(row.hierarchy_lineage_refs)
        ? row.hierarchy_lineage_refs
        : [],
      __lineage_names: Array.isArray(row.hierarchy_lineage_names)
        ? row.hierarchy_lineage_names
        : [],
      __node_depth:
        Number.isFinite(Number(row.hierarchy_depth))
          ? Number(row.hierarchy_depth)
          : 0,
      __level_name: row.hierarchy_level_name || null,
    };

    if (!reportContext.hideIdentityColumns) {
      reportRow.nodeid = row.node_reference || row.node_id || null;
      reportRow.node_name = row.node_name || null;
      reportRow.user_id =
        userDisplayMap.get(String(row.user_id || '').trim()) || row.user_id || null;
      reportRow.__user_id = row.user_id || null;
    }

    const payload = row.data && typeof row.data === 'object' ? row.data : {};
    Object.entries(payload).forEach(([sourceKey, rawValue]) => {
      if (RESERVED_REPORT_PAYLOAD_KEYS.has(sourceKey)) return;
      const key = sourceKeyToColumnKey.get(sourceKey);
      if (key) {
        const column = columnByKey.get(key);
        reportRow[key] = shouldPreserveStructuredValue(column?.field_type)
          ? rawValue
          : unwrapValue(rawValue);
      }
    });

    const modeResult = row.meta?.modeResult;
    if (modeResult && typeof modeResult === 'object') {
      reportRow.mode_result =
        modeResult.band ||
        modeResult.match ||
        (typeof modeResult.percentage === 'number'
          ? `${modeResult.percentage}%${modeResult.passed ? ' Passed' : ' Not passed'}`
          : typeof modeResult.score === 'number'
            ? `Score ${modeResult.score}`
            : null);
    }

    const proctoring = row.meta?.proctoring;
    if (proctoring && typeof proctoring === 'object') {
      reportRow.proctoring_status = proctoring.status || 'unknown';
      reportRow.proctoring_warnings = Number(proctoring.warningCount || 0);
      reportRow.proctoring_focus_events = Number(
        proctoring.summary?.tabSwitchCount || 0
      ) + Number(proctoring.summary?.windowBlurCount || 0);
      reportRow.proctoring_paste_attempts = Number(
        proctoring.summary?.copyPasteAttemptCount || 0
      );
    }

    return reportRow;
  });

  const response = {
    total,
    limit: safeLimit,
    offset: safeOffset,
    display_order: columns.map((column) => column.key),
    summary: {
      total_rows: Number(summaryRow.total_rows || 0),
      unique_nodes: reportContext.hideIdentityColumns
        ? 0
        : Number(summaryRow.unique_nodes || 0),
      first_submission_at: summaryRow.first_submission_at || null,
      latest_submission_at: summaryRow.latest_submission_at || null,
      submitted_count: Number(summaryRow.submitted_count || 0),
      approved_count: Number(summaryRow.approved_count || 0),
      pending_count: Number(summaryRow.pending_count || 0),
      rejected_count: Number(summaryRow.rejected_count || 0),
      changes_requested_count: Number(summaryRow.changes_requested_count || 0),
      completed_count: Number(summaryRow.completed_count || 0),
      failed_count: Number(summaryRow.failed_count || 0),
    },
    report_context: {
      is_open_form: reportContext.isOpenForm,
      hide_identity_columns: reportContext.hideIdentityColumns,
      authentication_required: !reportContext.isOpenForm,
      identity_mode: reportContext.isOpenForm ? 'open' : 'secured',
      anonymous_submission_count: anonymousCount,
      identified_submission_count: identifiedCount,
      mixed_identity_history: anonymousCount > 0 && identifiedCount > 0,
    },
    columns,
    rows,
  };
  if (includeDebug) {
    response.debug = {
      filters: {
        tenant_id,
        project_id,
        node_filter: nodeFilterValues.length === 1 ? nodeFilterValues[0] : null,
        node_filters: nodeFilterValues.length > 1 ? nodeFilterValues : [],
        month: month || null,
        statuses: statusValues,
        search: search || null,
        start_date: start_date || null,
        end_date: end_date || null,
        limit: safeLimit,
        offset: safeOffset,
      },
      catalog_count: catalogRows.length,
      catalog_rows: catalogRows,
      columns_count: columns.length,
      columns,
      display_order: response.display_order,
      hierarchy_ordering_enabled: canUseHierarchyOrdering,
      sample_input_row: rowsResult.rows[0] || null,
      sample_mapped_row: rows[0] || null,
    };
  }
  return response;
};

const getModuleReportAggregation = async (filters = {}) => {
  const {
    tenant_id,
    project_id,
    metric_field_key,
    dimension_field_key,
    aggregate = 'sum',
    node_filter,
    node_filters,
    search,
    start_date,
    end_date,
    month,
    status,
    statuses,
    dimension_values,
    order_direction = 'desc',
    limit = DEFAULT_AGGREGATION_LIMIT,
    offset = 0,
  } = filters;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }
  if (!project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'project_id is required');
  }
  if (!dimension_field_key) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'dimension_field_key is required');
  }

  const normalizedAggregate = String(aggregate || 'sum').trim().toLowerCase();
  if (!ALLOWED_AGGREGATIONS.has(normalizedAggregate)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported aggregation');
  }
  const normalizedOrderDirection = String(order_direction || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
  const aggregateOrderKeyword = normalizedOrderDirection === 'asc' ? 'ASC' : 'DESC';
  if (normalizedAggregate !== 'count' && !metric_field_key) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'metric_field_key is required');
  }

  const aggregateSql = resolveAggregationSql(normalizedAggregate);
  const safeLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_AGGREGATION_LIMIT, 1),
    MAX_AGGREGATION_LIMIT
  );
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const values = [tenant_id, project_id];
  let index = 3;

  const joins = [
    `LEFT JOIN form_submission_facts dimension
      ON dimension.submission_id = fs.id
      AND dimension.tenant_id = fs.tenant_id
      AND dimension.project_id = fs.project_id
      AND dimension.field_key = $${index}`,
  ];
  values.push(dimension_field_key);
  index += 1;

  if (normalizedAggregate !== 'count') {
    joins.push(
      `LEFT JOIN form_submission_facts metric
        ON metric.submission_id = fs.id
        AND metric.tenant_id = fs.tenant_id
        AND metric.project_id = fs.project_id
        AND metric.field_key = $${index}`
    );
    values.push(metric_field_key);
    index += 1;
  }

  const where = ['fs.tenant_id = $1', 'fs.project_id = $2', `fs.status != 'deleted'`];
  const nodeFilterValues = compactStrings([
    node_filter,
    ...(Array.isArray(node_filters) ? node_filters : []),
  ]);
  if (nodeFilterValues.length === 1) {
    where.push(`(fs.node_id = $${index} OR fs.node_reference = $${index})`);
    values.push(nodeFilterValues[0]);
    index += 1;
  } else if (nodeFilterValues.length > 1) {
    where.push(`(fs.node_id = ANY($${index}::text[]) OR fs.node_reference = ANY($${index}::text[]))`);
    values.push(nodeFilterValues);
    index += 1;
  }
  if (month) {
    where.push(`fs.month = $${index}`);
    values.push(month);
    index += 1;
  }
  const statusValues = normalizeSubmissionStatuses([
    status,
    ...(Array.isArray(statuses) ? statuses : []),
  ]);
  if (statusValues.length === 1) {
    where.push(`fs.status = $${index}`);
    values.push(statusValues[0]);
    index += 1;
  } else if (statusValues.length > 1) {
    where.push(`fs.status = ANY($${index}::text[])`);
    values.push(statusValues);
    index += 1;
  }
  const dimensionValues = compactStrings(dimension_values, 50).map((value) => value.toLowerCase());
  if (dimensionValues.length === 1) {
    where.push(`COALESCE(dimension.value_normalised, LOWER(dimension.value_text), '') = $${index}`);
    values.push(dimensionValues[0]);
    index += 1;
  } else if (dimensionValues.length > 1) {
    where.push(`COALESCE(dimension.value_normalised, LOWER(dimension.value_text), '') = ANY($${index}::text[])`);
    values.push(dimensionValues);
    index += 1;
  }
  if (start_date) {
    if (typeof start_date === 'string' && DATE_ONLY_PATTERN.test(start_date)) {
      where.push(`fs.created_at >= $${index}::date`);
    } else {
      where.push(`fs.created_at >= $${index}`);
    }
    values.push(start_date);
    index += 1;
  }
  if (end_date) {
    if (typeof end_date === 'string' && DATE_ONLY_PATTERN.test(end_date)) {
      where.push(`fs.created_at < ($${index}::date + INTERVAL '1 day')`);
    } else {
      where.push(`fs.created_at <= $${index}`);
    }
    values.push(end_date);
    index += 1;
  }
  if (search && String(search).trim() !== '') {
    where.push(`(
      CAST(fs.id AS TEXT) ILIKE $${index}
      OR COALESCE(fs.node_name, '') ILIKE $${index}
      OR COALESCE(fs.node_reference, '') ILIKE $${index}
      OR COALESCE(fs.node_id, '') ILIKE $${index}
      OR COALESCE(fs.status, '') ILIKE $${index}
      OR COALESCE(dimension.value_text, '') ILIKE $${index}
    )`);
    values.push(`%${String(search).trim()}%`);
    index += 1;
  }

  const numericPredicate =
    normalizedAggregate === 'count' ? '' : 'AND metric.value_numeric IS NOT NULL';
  const numericValueCountSql =
    normalizedAggregate === 'count' ? '0::int' : 'COUNT(metric.value_numeric)::int';
  const query = `
    SELECT
      COALESCE(
        NULLIF(dimension.value_category, ''),
        NULLIF(dimension.value_normalised, ''),
        NULLIF(dimension.value_text, ''),
        'Unspecified'
      ) AS dimension_value,
      ${aggregateSql} AS aggregate_value,
      COUNT(DISTINCT fs.id)::int AS submission_count,
      ${numericValueCountSql} AS numeric_value_count,
      MIN(fs.created_at) AS first_submission_at,
      MAX(fs.created_at) AS latest_submission_at,
      (ARRAY_REMOVE(ARRAY_AGG(DISTINCT fs.id::text), NULL))[1:25] AS sampled_submission_ids
    FROM form_submissions fs
    ${joins.join('\n')}
    WHERE ${where.join(' AND ')}
      ${numericPredicate}
    GROUP BY dimension_value
    ORDER BY aggregate_value ${aggregateOrderKeyword} NULLS LAST, submission_count DESC, dimension_value ASC
    LIMIT $${index} OFFSET $${index + 1}
  `;
  const result = await postgresPool.query(query, [...values, safeLimit, safeOffset]);

  const countQuery = `
    SELECT COUNT(*)::int AS group_count
    FROM (
      SELECT
        COALESCE(
          NULLIF(dimension.value_category, ''),
          NULLIF(dimension.value_normalised, ''),
          NULLIF(dimension.value_text, ''),
          'Unspecified'
        ) AS dimension_value
      FROM form_submissions fs
      ${joins.join('\n')}
      WHERE ${where.join(' AND ')}
        ${numericPredicate}
      GROUP BY dimension_value
    ) grouped
  `;
  const countResult = await postgresPool.query(countQuery, values);

  const rows = result.rows.map((row) => ({
    dimension_value: row.dimension_value,
    aggregate_value:
      row.aggregate_value === null || row.aggregate_value === undefined
        ? null
        : Number(row.aggregate_value),
    submission_count: Number(row.submission_count || 0),
    numeric_value_count: Number(row.numeric_value_count || 0),
    first_submission_at: row.first_submission_at || null,
    latest_submission_at: row.latest_submission_at || null,
    sampled_submission_ids: Array.isArray(row.sampled_submission_ids)
      ? row.sampled_submission_ids
      : [],
  }));

  return {
    total_groups: Number(countResult.rows[0]?.group_count || 0),
    limit: safeLimit,
    offset: safeOffset,
    aggregation: {
      aggregate: normalizedAggregate,
      metric_field_key: normalizedAggregate === 'count' ? null : metric_field_key,
      dimension_field_key,
    },
    rows,
    query_context: {
      source_table: 'form_submission_facts',
      source_join: 'form_submissions',
      read_only: true,
      node_filter: nodeFilterValues.length === 1 ? nodeFilterValues[0] : null,
      node_filters: nodeFilterValues.length > 1 ? nodeFilterValues : [],
      month: month || null,
      statuses: statusValues,
      dimension_values: dimensionValues,
      order_direction: normalizedOrderDirection,
      start_date: start_date || null,
      end_date: end_date || null,
      search: search || null,
    },
  };
};

const getModuleReportTrend = async (filters = {}) => {
  const {
    tenant_id,
    project_id,
    metric_field_key,
    aggregate = 'sum',
    grain = 'month',
    node_filter,
    node_filters,
    search,
    start_date,
    end_date,
    month,
    status,
    statuses,
    limit = DEFAULT_TREND_LIMIT,
    offset = 0,
  } = filters;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }
  if (!project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'project_id is required');
  }

  const normalizedAggregate = String(aggregate || 'sum').trim().toLowerCase();
  if (!ALLOWED_AGGREGATIONS.has(normalizedAggregate)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported aggregation');
  }
  if (normalizedAggregate !== 'count' && !metric_field_key) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'metric_field_key is required');
  }

  const normalizedGrain = resolveTrendGrain(grain);
  const aggregateSql = resolveAggregationSql(normalizedAggregate);
  const safeLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_TREND_LIMIT, 1),
    MAX_TREND_LIMIT
  );
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const values = [tenant_id, project_id];
  let index = 3;

  const joins = [];
  if (normalizedAggregate !== 'count') {
    joins.push(
      `LEFT JOIN form_submission_facts metric
        ON metric.submission_id = fs.id
        AND metric.tenant_id = fs.tenant_id
        AND metric.project_id = fs.project_id
        AND metric.field_key = $${index}`
    );
    values.push(metric_field_key);
    index += 1;
  }

  const where = ['fs.tenant_id = $1', 'fs.project_id = $2', `fs.status != 'deleted'`];
  const nodeFilterValues = compactStrings([
    node_filter,
    ...(Array.isArray(node_filters) ? node_filters : []),
  ]);
  if (nodeFilterValues.length === 1) {
    where.push(`(fs.node_id = $${index} OR fs.node_reference = $${index})`);
    values.push(nodeFilterValues[0]);
    index += 1;
  } else if (nodeFilterValues.length > 1) {
    where.push(`(fs.node_id = ANY($${index}::text[]) OR fs.node_reference = ANY($${index}::text[]))`);
    values.push(nodeFilterValues);
    index += 1;
  }
  if (month) {
    where.push(`fs.month = $${index}`);
    values.push(month);
    index += 1;
  }
  const statusValues = normalizeSubmissionStatuses([
    status,
    ...(Array.isArray(statuses) ? statuses : []),
  ]);
  if (statusValues.length === 1) {
    where.push(`fs.status = $${index}`);
    values.push(statusValues[0]);
    index += 1;
  } else if (statusValues.length > 1) {
    where.push(`fs.status = ANY($${index}::text[])`);
    values.push(statusValues);
    index += 1;
  }
  if (start_date) {
    if (typeof start_date === 'string' && DATE_ONLY_PATTERN.test(start_date)) {
      where.push(`fs.created_at >= $${index}::date`);
    } else {
      where.push(`fs.created_at >= $${index}`);
    }
    values.push(start_date);
    index += 1;
  }
  if (end_date) {
    if (typeof end_date === 'string' && DATE_ONLY_PATTERN.test(end_date)) {
      where.push(`fs.created_at < ($${index}::date + INTERVAL '1 day')`);
    } else {
      where.push(`fs.created_at <= $${index}`);
    }
    values.push(end_date);
    index += 1;
  }
  if (search && String(search).trim() !== '') {
    where.push(`(
      CAST(fs.id AS TEXT) ILIKE $${index}
      OR COALESCE(fs.node_name, '') ILIKE $${index}
      OR COALESCE(fs.node_reference, '') ILIKE $${index}
      OR COALESCE(fs.node_id, '') ILIKE $${index}
      OR COALESCE(fs.status, '') ILIKE $${index}
    )`);
    values.push(`%${String(search).trim()}%`);
    index += 1;
  }

  const numericPredicate =
    normalizedAggregate === 'count' ? '' : 'AND metric.value_numeric IS NOT NULL';
  const numericValueCountSql =
    normalizedAggregate === 'count' ? '0::int' : 'COUNT(metric.value_numeric)::int';
  const bucketSql = `DATE_TRUNC('${normalizedGrain}', fs.created_at)`;
  const query = `
    SELECT
      ${bucketSql} AS period_start,
      ${aggregateSql} AS aggregate_value,
      COUNT(DISTINCT fs.id)::int AS submission_count,
      ${numericValueCountSql} AS numeric_value_count,
      MIN(fs.created_at) AS first_submission_at,
      MAX(fs.created_at) AS latest_submission_at,
      (ARRAY_REMOVE(ARRAY_AGG(DISTINCT fs.id::text), NULL))[1:25] AS sampled_submission_ids
    FROM form_submissions fs
    ${joins.join('\n')}
    WHERE ${where.join(' AND ')}
      ${numericPredicate}
    GROUP BY period_start
    ORDER BY period_start ASC
    LIMIT $${index} OFFSET $${index + 1}
  `;
  const result = await postgresPool.query(query, [...values, safeLimit, safeOffset]);

  const countQuery = `
    SELECT COUNT(*)::int AS period_count
    FROM (
      SELECT ${bucketSql} AS period_start
      FROM form_submissions fs
      ${joins.join('\n')}
      WHERE ${where.join(' AND ')}
        ${numericPredicate}
      GROUP BY period_start
    ) grouped
  `;
  const countResult = await postgresPool.query(countQuery, values);

  const rows = result.rows.map((row) => ({
    period_start: row.period_start || null,
    aggregate_value:
      row.aggregate_value === null || row.aggregate_value === undefined
        ? null
        : Number(row.aggregate_value),
    submission_count: Number(row.submission_count || 0),
    numeric_value_count: Number(row.numeric_value_count || 0),
    first_submission_at: row.first_submission_at || null,
    latest_submission_at: row.latest_submission_at || null,
    sampled_submission_ids: Array.isArray(row.sampled_submission_ids)
      ? row.sampled_submission_ids
      : [],
  }));

  return {
    total_periods: Number(countResult.rows[0]?.period_count || 0),
    limit: safeLimit,
    offset: safeOffset,
    trend: {
      aggregate: normalizedAggregate,
      metric_field_key: normalizedAggregate === 'count' ? null : metric_field_key,
      grain: normalizedGrain,
      time_source: 'form_submissions.created_at',
    },
    rows,
    query_context: {
      source_table: 'form_submission_facts',
      source_join: 'form_submissions',
      read_only: true,
      time_source: 'form_submissions.created_at',
      grain: normalizedGrain,
      node_filter: nodeFilterValues.length === 1 ? nodeFilterValues[0] : null,
      node_filters: nodeFilterValues.length > 1 ? nodeFilterValues : [],
      month: month || null,
      statuses: statusValues,
      start_date: start_date || null,
      end_date: end_date || null,
      search: search || null,
    },
  };
};

const getModuleReportPeriodComparison = async (filters = {}) => {
  const {
    tenant_id,
    project_id,
    metric_field_key,
    aggregate = 'sum',
    periods = [],
    node_filter,
    node_filters,
    search,
    status,
    statuses,
  } = filters;

  if (!tenant_id) throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  if (!project_id) throw new ApiError(httpStatus.BAD_REQUEST, 'project_id is required');
  if (!Array.isArray(periods) || periods.length !== 2) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Exactly two comparison periods are required');
  }

  const normalizedAggregate = String(aggregate || 'sum').trim().toLowerCase();
  if (!ALLOWED_AGGREGATIONS.has(normalizedAggregate)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported aggregation');
  }
  if (normalizedAggregate !== 'count' && !metric_field_key) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'metric_field_key is required');
  }

  const aggregateSql = resolveAggregationSql(normalizedAggregate);
  const nodeFilterValues = compactStrings([
    node_filter,
    ...(Array.isArray(node_filters) ? node_filters : []),
  ]);
  const statusValues = normalizeSubmissionStatuses([
    status,
    ...(Array.isArray(statuses) ? statuses : []),
  ]);

  const runPeriod = async (period) => {
    const values = [tenant_id, project_id];
    let index = 3;
    const joins = [];

    if (normalizedAggregate !== 'count') {
      joins.push(
        `LEFT JOIN form_submission_facts metric
          ON metric.submission_id = fs.id
          AND metric.tenant_id = fs.tenant_id
          AND metric.project_id = fs.project_id
          AND metric.field_key = $${index}`
      );
      values.push(metric_field_key);
      index += 1;
    }

    const where = ['fs.tenant_id = $1', 'fs.project_id = $2', `fs.status != 'deleted'`];
    if (nodeFilterValues.length === 1) {
      where.push(`(fs.node_id = $${index} OR fs.node_reference = $${index})`);
      values.push(nodeFilterValues[0]);
      index += 1;
    } else if (nodeFilterValues.length > 1) {
      where.push(`(fs.node_id = ANY($${index}::text[]) OR fs.node_reference = ANY($${index}::text[]))`);
      values.push(nodeFilterValues);
      index += 1;
    }
    if (statusValues.length === 1) {
      where.push(`fs.status = $${index}`);
      values.push(statusValues[0]);
      index += 1;
    } else if (statusValues.length > 1) {
      where.push(`fs.status = ANY($${index}::text[])`);
      values.push(statusValues);
      index += 1;
    }
    if (period.start) {
      where.push(`fs.created_at >= $${index}`);
      values.push(period.start);
      index += 1;
    }
    if (period.end) {
      where.push(`fs.created_at <= $${index}`);
      values.push(period.end);
      index += 1;
    }
    if (search && String(search).trim() !== '') {
      where.push(`(
        CAST(fs.id AS TEXT) ILIKE $${index}
        OR COALESCE(fs.node_name, '') ILIKE $${index}
        OR COALESCE(fs.node_reference, '') ILIKE $${index}
        OR COALESCE(fs.node_id, '') ILIKE $${index}
        OR COALESCE(fs.status, '') ILIKE $${index}
      )`);
      values.push(`%${String(search).trim()}%`);
      index += 1;
    }

    const numericPredicate =
      normalizedAggregate === 'count' ? '' : 'AND metric.value_numeric IS NOT NULL';
    const numericValueCountSql =
      normalizedAggregate === 'count' ? '0::int' : 'COUNT(metric.value_numeric)::int';
    const query = `
      SELECT
        ${aggregateSql} AS aggregate_value,
        COUNT(DISTINCT fs.id)::int AS submission_count,
        ${numericValueCountSql} AS numeric_value_count,
        MIN(fs.created_at) AS first_submission_at,
        MAX(fs.created_at) AS latest_submission_at,
        (ARRAY_REMOVE(ARRAY_AGG(DISTINCT fs.id::text), NULL))[1:25] AS sampled_submission_ids
      FROM form_submissions fs
      ${joins.join('\n')}
      WHERE ${where.join(' AND ')}
        ${numericPredicate}
    `;
    const result = await postgresPool.query(query, values);
    const row = result.rows[0] || {};
    return {
      label: period.label || null,
      start: period.start || null,
      end: period.end || null,
      aggregate_value:
        row.aggregate_value === null || row.aggregate_value === undefined
          ? null
          : Number(row.aggregate_value),
      submission_count: Number(row.submission_count || 0),
      numeric_value_count: Number(row.numeric_value_count || 0),
      first_submission_at: row.first_submission_at || null,
      latest_submission_at: row.latest_submission_at || null,
      sampled_submission_ids: Array.isArray(row.sampled_submission_ids)
        ? row.sampled_submission_ids
        : [],
    };
  };

  const [current, baseline] = await Promise.all(periods.map(runPeriod));
  const currentValue = Number(current.aggregate_value || 0);
  const baselineValue = Number(baseline.aggregate_value || 0);
  const absoluteChange = currentValue - baselineValue;
  const percentChange = baselineValue !== 0 ? absoluteChange / baselineValue : null;

  return {
    comparison: {
      aggregate: normalizedAggregate,
      metric_field_key: normalizedAggregate === 'count' ? null : metric_field_key,
      time_source: 'form_submissions.created_at',
    },
    periods: [current, baseline],
    change: {
      absolute: absoluteChange,
      percent: percentChange,
      direction: absoluteChange > 0 ? 'increase' : absoluteChange < 0 ? 'decrease' : 'no_change',
    },
    query_context: {
      source_table: 'form_submission_facts',
      source_join: 'form_submissions',
      read_only: true,
      time_source: 'form_submissions.created_at',
      node_filter: nodeFilterValues.length === 1 ? nodeFilterValues[0] : null,
      node_filters: nodeFilterValues.length > 1 ? nodeFilterValues : [],
      statuses: statusValues,
      search: search || null,
    },
  };
};

/**
 * Get submissions with advanced filtering
 * @param {Object} filters - Filter criteria
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated submissions
 */
const getSubmissions = async (filters, options = {}) => {
  try {
    const { limit = 50, offset = 0 } = options;

    const result = await SubmissionModel.getFilteredSubmissions({
      ...filters,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    return result;
  } catch (error) {
    console.error('❌ Error in getSubmissions service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submissions'
    );
  }
};

/**
 * Get submission by ID
 * @param {string} id - Submission ID
 * @returns {Promise<Object>} Submission
 */
const getSubmissionById = async (id) => {
  try {
    const submission = await SubmissionModel.getSubmissionById(id);

    if (!submission) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    return submission;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in getSubmissionById service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submission'
    );
  }
};

/**
 * Get submissions by date range
 * @param {string} tenant_id - Tenant ID
 * @param {string} start_date - Start date
 * @param {string} end_date - End date
 * @returns {Promise<Array>} Submissions
 */
const getSubmissionsByDateRange = async (tenant_id, start_date, end_date) => {
  try {
    return await SubmissionModel.getSubmissionsByDateRange(
      tenant_id,
      start_date,
      end_date
    );
  } catch (error) {
    console.error(
      '❌ Error in getSubmissionsByDateRange service:',
      error.message
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submissions by date range'
    );
  }
};

/**
 * Get submissions by node
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} node_id - Node ID
 * @param {Object} options - Options (perm_only, limit)
 * @returns {Promise<Array>} Submissions
 */
const getSubmissionsByNode = async (
  tenant_id,
  project_id,
  node_id,
  options = {}
) => {
  try {
    return await SubmissionModel.getSubmissionsByNode(
      tenant_id,
      project_id,
      node_id,
      options
    );
  } catch (error) {
    console.error('❌ Error in getSubmissionsByNode service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submissions by node'
    );
  }
};

/**
 * Get monthly submissions for a project
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (YYYY-MM-01)
 * @returns {Promise<Array>} Submissions
 */
const getMonthlySubmissions = async (tenant_id, project_id, month) => {
  try {
    return await SubmissionModel.getMonthlySubmissions(
      tenant_id,
      project_id,
      month
    );
  } catch (error) {
    console.error('❌ Error in getMonthlySubmissions service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch monthly submissions'
    );
  }
};

/**
 * Get submissions by status
 * @param {string} tenant_id - Tenant ID
 * @param {string} status - Status
 * @returns {Promise<Array>} Submissions
 */
const getSubmissionsByStatus = async (tenant_id, status) => {
  try {
    return await SubmissionModel.getSubmissionsByStatus(tenant_id, status);
  } catch (error) {
    console.error('❌ Error in getSubmissionsByStatus service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submissions by status'
    );
  }
};

/**
 * Get locked submissions
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (optional)
 * @returns {Promise<Array>} Locked submissions
 */
const getLockedSubmissions = async (tenant_id, project_id, month = null) => {
  try {
    return await SubmissionModel.getLockedSubmissions(
      tenant_id,
      project_id,
      month
    );
  } catch (error) {
    console.error('❌ Error in getLockedSubmissions service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch locked submissions'
    );
  }
};

/**
 * Get compliance report for a project/month
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (YYYY-MM-01)
 * @returns {Promise<Object>} Compliance report
 */
const getComplianceReport = async (tenant_id, project_id, month) => {
  try {
    const report = await SubmissionModel.getComplianceReport(
      tenant_id,
      project_id,
      month
    );

    // Calculate additional metrics
    const totalNodes = parseInt(report.total_nodes, 10);
    const completeNodes = parseInt(report.complete_nodes, 10);
    const partialNodes = parseInt(report.partial_nodes, 10);
    const incompleteNodes = parseInt(report.incomplete_nodes, 10);

    return {
      ...report,
      total_nodes: totalNodes,
      complete_nodes: completeNodes,
      partial_nodes: partialNodes,
      incomplete_nodes: incompleteNodes,
      completion_rate:
        totalNodes > 0
          ? parseFloat(((completeNodes / totalNodes) * 100).toFixed(2))
          : 0,
      compliance_status:
        completeNodes === totalNodes
          ? 'complete'
          : completeNodes > 0
          ? 'partial'
          : 'incomplete',
    };
  } catch (error) {
    console.error('❌ Error in getComplianceReport service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch compliance report'
    );
  }
};

/**
 * Get incomplete submissions
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (YYYY-MM-01)
 * @returns {Promise<Array>} Incomplete submissions
 */
const getIncompleteSubmissions = async (tenant_id, project_id, month) => {
  try {
    return await SubmissionModel.getIncompleteSubmissions(
      tenant_id,
      project_id,
      month
    );
  } catch (error) {
    console.error(
      '❌ Error in getIncompleteSubmissions service:',
      error.message
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch incomplete submissions'
    );
  }
};

/**
 * Get submission statistics
 * @param {string} tenant_id - Tenant ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} Statistics
 */
const getSubmissionStats = async (tenant_id, filters = {}) => {
  try {
    const totalCount = await SubmissionModel.countSubmissions({
      tenant_id,
      ...filters,
    });

    const completedCount = await SubmissionModel.countSubmissions({
      tenant_id,
      status: 'completed',
      ...filters,
    });

    const pendingCount = await SubmissionModel.countSubmissions({
      tenant_id,
      status: 'pending',
      ...filters,
    });

    const failedCount = await SubmissionModel.countSubmissions({
      tenant_id,
      status: 'failed',
      ...filters,
    });

    return {
      total: totalCount,
      completed: completedCount,
      pending: pendingCount,
      failed: failedCount,
      completion_rate:
        totalCount > 0
          ? parseFloat(((completedCount / totalCount) * 100).toFixed(2))
          : 0,
    };
  } catch (error) {
    console.error('❌ Error in getSubmissionStats service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submission statistics'
    );
  }
};

/**
 * Update submission
 * @param {string} id - Submission ID
 * @param {Object} updates - Fields to update
 * @param {string} user_id - User ID performing the update
 * @returns {Promise<Object>} Updated submission
 */
const updateSubmission = async (id, updates, user_id) => {
  try {
    // Check if submission exists
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    // Check if submission is locked
    if (existing.is_locked) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Cannot update locked submission'
      );
    }

    // Perform update
    const updated = await SubmissionModel.updateSubmission(id, updates);

    // Log activity
    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'updated',
      status: 'success',
      message: 'Submission updated',
    });

    return updated;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in updateSubmission service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update submission'
    );
  }
};

/**
 * Update submission status
 * @param {string} id - Submission ID
 * @param {string} status - New status
 * @param {string} user_id - User ID performing the update
 * @returns {Promise<Object>} Updated submission
 */
const updateSubmissionStatus = async (id, status, user_id) => {
  try {
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    const updated = await SubmissionModel.updateSubmissionStatus(
      id,
      status,
      user_id
    );

    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'status_updated',
      status: 'success',
      message: `Status updated to ${status}`,
    });

    return updated;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in updateSubmissionStatus service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update submission status'
    );
  }
};

/**
 * Lock submission
 * @param {string} id - Submission ID
 * @param {string} user_id - User ID performing the lock
 * @param {string} reason - Lock reason
 * @returns {Promise<Object>} Locked submission
 */
const lockSubmission = async (id, user_id, reason = 'manual_lock') => {
  try {
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    if (existing.is_locked) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Submission is already locked'
      );
    }

    const locked = await SubmissionModel.lockSubmission(id, user_id, reason);

    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'locked',
      status: 'success',
      message: `Submission locked: ${reason}`,
    });

    return locked;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in lockSubmission service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to lock submission'
    );
  }
};

/**
 * Unlock submission
 * @param {string} id - Submission ID
 * @param {string} user_id - User ID performing the unlock
 * @param {string} reason - Unlock reason
 * @returns {Promise<Object>} Unlocked submission
 */
const unlockSubmission = async (id, user_id, reason = 'manual_unlock') => {
  try {
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    if (!existing.is_locked) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Submission is not locked');
    }

    const unlocked = await SubmissionModel.unlockSubmission(
      id,
      user_id,
      reason
    );

    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'unlocked',
      status: 'success',
      message: `Submission unlocked: ${reason}`,
    });

    return unlocked;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in unlockSubmission service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to unlock submission'
    );
  }
};

/**
 * Delete submission (soft delete)
 * @param {string} id - Submission ID
 * @param {string} user_id - User ID performing the delete
 * @returns {Promise<Object>} Deleted submission
 */
const deleteSubmission = async (id, user_id) => {
  try {
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    if (existing.is_locked) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Cannot delete locked submission'
      );
    }

    const deleted = await SubmissionModel.softDeleteSubmission(id, user_id);

    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'deleted',
      status: 'success',
      message: 'Submission deleted (soft)',
    });

    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in deleteSubmission service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to delete submission'
    );
  }
};

/**
 * Bulk delete submissions
 * @param {Array<string>} ids - Submission IDs
 * @param {string} user_id - User ID performing the delete
 * @param {boolean} hard - Hard delete (permanent)
 * @returns {Promise<Object>} Delete result
 */
const bulkDeleteSubmissions = async (ids, user_id, hard = false) => {
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid submission IDs');
    }

    // Check for locked submissions
    const submissions = await Promise.all(
      ids.map((id) => SubmissionModel.getSubmissionById(id))
    );

    const lockedSubmissions = submissions.filter((s) => s && s.is_locked);
    if (lockedSubmissions.length > 0) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Cannot delete ${lockedSubmissions.length} locked submission(s)`
      );
    }

    const deleted = await SubmissionModel.bulkDeleteSubmissions(
      ids,
      user_id,
      hard
    );

    // Log activity for first submission (representative)
    if (submissions[0]) {
      await logActivity({
        tenant_id: submissions[0].tenant_id,
        project_id: submissions[0].project_id,
        project_name: submissions[0].project_name,
        project_category: submissions[0].project_category,
        form_id: submissions[0].form_id,
        node_id: submissions[0].node_id,
        user_id,
        action: 'bulk_deleted',
        status: 'success',
        message: `${deleted.length} submissions deleted (${
          hard ? 'hard' : 'soft'
        })`,
      });
    }

    return {
      deleted_count: deleted.length,
      type: hard ? 'hard' : 'soft',
      ids: deleted.map((s) => s.id),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in bulkDeleteSubmissions service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to bulk delete submissions'
    );
  }
};

module.exports = {
  getSubmissions,
  getSubmissionById,
  getSubmissionsByDateRange,
  getSubmissionsByNode,
  getMonthlySubmissions,
  getSubmissionsByStatus,
  getLockedSubmissions,
  getComplianceReport,
  getIncompleteSubmissions,
  getSubmissionStats,
  updateSubmission,
  updateSubmissionStatus,
  lockSubmission,
  unlockSubmission,
  deleteSubmission,
  bulkDeleteSubmissions,
  getModuleReportTable,
  getModuleReportAggregation,
  getModuleReportTrend,
  getModuleReportPeriodComparison,
};
