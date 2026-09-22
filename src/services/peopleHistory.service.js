/**
 * People History Service
 *
 * Append-only temporal history of agent-initiated people mutations.
 *
 * Every copilot action event in PEOPLE_PEOPLE_ACTIONS is written to
 * copilot.people_history exactly once (UNIQUE action_event_id). The rows form
 * an immutable subject timeline (user / role / node) that powers the
 * access_flux detection rule and change-triggered re-observation.
 *
 * Guardrails:
 *  - No UPDATE/DELETE — write is INSERT ... ON CONFLICT (action_event_id) DO NOTHING
 *  - Every row is tenant-scoped
 *  - The subject is derived deterministically from the action payload;
 *    unknown subjects are skipped rather than guessed
 */

const { postgresPool } = require('../config/postgres');

const PEOPLE_ACTIONS = new Set([
  'create_user',
  'update_user',
  'deactivate_user',
  'reactivate_user',
  'delete_user',
  'reset_password',
  'verify_account',
  'create_role',
  'delete_role',
  'assign_role',
  'unassign_role',
  'grant_permission',
  'revoke_permission',
  'create_node',
  'move_node',
  'delete_node',
  'restore_node',
  'assign_user_to_node',
  'unassign_user_from_node',
]);

const USER_ACTIONS = new Set([
  'create_user',
  'update_user',
  'deactivate_user',
  'reactivate_user',
  'delete_user',
  'reset_password',
  'verify_account',
  'assign_role',
  'unassign_role',
  'assign_user_to_node',
  'unassign_user_from_node',
]);

const ROLE_ACTIONS = new Set([
  'create_role',
  'delete_role',
  'grant_permission',
  'revoke_permission',
]);

const NODE_ACTIONS = new Set([
  'create_node',
  'move_node',
  'delete_node',
  'restore_node',
]);

const pick = (payload, keys) => {
  const foundKey = keys.find((key) => {
    const value = payload?.[key];
    return value !== undefined && value !== null && value !== '';
  });
  return foundKey === undefined ? null : payload[foundKey];
};

/**
 * Deterministically derives { kind, id } for a people action payload.
 * Returns null when the subject cannot be located.
 */
const subjectOf = (actionType, payload) => {
  const body = payload?.userBody || {};
  const roleBody = payload?.roleBody || {};
  const nodeBody = payload?.nodeBody || {};
  const action = payload?.action || {};

  if (USER_ACTIONS.has(actionType)) {
    const id =
      pick(payload, ['userId', 'user_id', 'targetUserId', 'targetUser']) ||
      pick(body, ['userId', 'user_id', 'id']) ||
      pick(action, ['targetUserId']);
    return id ? { kind: 'USER', id: String(id) } : null;
  }
  if (ROLE_ACTIONS.has(actionType)) {
    const id =
      pick(payload, ['roleId', 'role_id']) ||
      pick(roleBody, ['roleId', 'role_id', 'id']) ||
      pick(action, ['roleId']);
    if (id) return { kind: 'ROLE', id: String(id) };
    const name = pick(payload, ['roleName']) || pick(roleBody, ['name']);
    return name ? { kind: 'ROLE', id: String(name) } : null;
  }
  if (NODE_ACTIONS.has(actionType)) {
    const id =
      pick(payload, ['nodeId', 'node_id', 'parentNodeId']) ||
      pick(nodeBody, ['nodeId', 'node_id', 'id']) ||
      pick(payload, ['newParentId']) ||
      pick(action, ['nodeId']);
    return id ? { kind: 'NODE', id: String(id) } : null;
  }
  return null;
};

/**
 * Persists one history row for a people mutation event. Idempotent per
 * action event. Non-people actions and unresolvable subjects are silently
 * skipped.
 */
const recordPeopleMutation = async ({
  tenantId,
  actionEventId,
  actionType,
  payload = {},
  actorUserId = null,
  taskId = null,
}) => {
  if (!tenantId || !actionEventId) return null;
  if (!PEOPLE_ACTIONS.has(actionType)) return null;

  const subject = subjectOf(actionType, payload);
  if (!subject) return null;

  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.people_history (
       tenant_id, action_event_id, task_id, actor_user_id, action_type,
       subject_kind, subject_id, after_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (action_event_id) DO NOTHING
     RETURNING id, action_type, subject_kind, subject_id`,
    [
      tenantId,
      actionEventId,
      taskId || null,
      actorUserId || null,
      actionType,
      subject.kind,
      subject.id,
      JSON.stringify(payload),
    ]
  );
  return rows[0] || null;
};

/**
 * Reads the subject timeline, newest first.
 */
const listPeopleHistory = async ({
  tenantId,
  subjectKind,
  subjectId,
  actionType,
  limit = 50,
}) => {
  if (!tenantId) return [];
  const values = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (subjectKind) {
    values.push(subjectKind);
    where += ` AND subject_kind = $${values.length}`;
  }
  if (subjectId) {
    values.push(subjectId);
    where += ` AND subject_id = $${values.length}`;
  }
  if (actionType) {
    values.push(actionType);
    where += ` AND action_type = $${values.length}`;
  }
  values.push(Math.max(1, Math.min(200, Number(limit) || 50)));

  const { rows } = await postgresPool.query(
    `SELECT id, action_event_id, actor_user_id, action_type,
            subject_kind, subject_id, after_json, created_at
     FROM copilot.people_history
     ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return rows;
};

/**
 * Detects subjects with an anomalous volume of sensitive changes within a
 * lookback window. Returns observations in the same shape as the detection
 * rules so the people-intelligence cycle can classify / record / escalate
 * them.
 */
const detectFlux = async ({ tenantId, sinceHours = 168, limit = 10 }) => {
  if (!tenantId) return [];
  const hours = Number(sinceHours) || 168;
  const maxSubjects = Math.max(1, Math.min(50, Number(limit) || 10));

  const { rows } = await postgresPool.query(
    `SELECT subject_kind, subject_id, COUNT(*)::int     AS changes,
            COUNT(*) FILTER (WHERE action_type IN ('assign_role','unassign_role','assign_user_to_node','unassign_user_from_node'))::int AS role_changes,
            MAX(created_at)                              AS last_changed_at
     FROM copilot.people_history
     WHERE tenant_id = $1
       AND created_at >= NOW() - ($2::int * INTERVAL '1 hour')
     GROUP BY subject_kind, subject_id
     HAVING COUNT(*) >= 3
     ORDER BY changes DESC
     LIMIT $3`,
    [tenantId, hours, maxSubjects]
  );

  return rows.map((row) => ({
    ruleId: 'access_flux',
    severity: 'warning',
    subject: { kind: row.subject_kind, id: row.subject_id },
    summary: `${row.changes} access change(s) on ${row.subject_kind} ${row.subject_id} within ${hours}h`,
    evidence: [
      {
        source: `history:${row.subject_kind}:${row.subject_id}`,
        detail: `${row.changes} total, ${
          row.role_changes
        } role/membership change(s), last at ${new Date(
          row.last_changed_at
        ).toISOString()}`,
      },
    ],
  }));
};

module.exports = {
  PEOPLE_ACTIONS,
  subjectOf,
  recordPeopleMutation,
  listPeopleHistory,
  detectFlux,
};
