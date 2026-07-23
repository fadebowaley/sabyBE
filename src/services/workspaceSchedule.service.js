const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const ALERT_WORKFLOW_BY_TYPE = {
  'Compliance alert': 'settings_compliance_alert',
  'Anomaly alert': 'settings_anomaly_alert',
  'Billing alert': 'settings_billing_alert',
  'System alert': 'settings_system_alert',
};

const FREQUENCIES = ['Daily', 'Weekly', 'Monthly'];
const CHANNELS = ['Email', 'In-app', 'Email + In-app'];

const canManageWorkspaceSchedules = (user = {}) => {
  if (!user) return false;
  if (user.isSaby || user.isSuper || user.isOwner || user.isAdmin) return true;
  return Array.isArray(user.roles) && user.roles.length > 0;
};

const requireWorkspaceScheduleAccess = (user = {}) => {
  if (!user?.tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant context is required');
  }
  if (!canManageWorkspaceSchedules(user)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Workspace schedule access is restricted to owners, admins, and team members.'
    );
  }
};

const normalizeSchedulePayload = (body = {}) => {
  const name = String(body.name || '').trim();
  const alertType = String(body.alertType || '').trim();
  const frequency = String(body.frequency || '').trim();
  const time = String(body.time || '').trim();
  const recipients = String(body.recipients || '').trim();
  const channel = String(body.channel || '').trim();
  const active = body.active !== false;

  if (!name) throw new ApiError(httpStatus.BAD_REQUEST, 'Schedule name is required');
  if (!ALERT_WORKFLOW_BY_TYPE[alertType]) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported alert type');
  }
  if (!FREQUENCIES.includes(frequency)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported frequency');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Schedule time must use HH:mm format');
  }
  if (!recipients) throw new ApiError(httpStatus.BAD_REQUEST, 'Recipients are required');
  if (!CHANNELS.includes(channel)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported delivery channel');
  }

  return { name, alertType, frequency, time, recipients, channel, active };
};

const computeCronExpression = ({ frequency, time }) => {
  const [hour, minute] = String(time || '09:00').split(':').map((part) => Number(part));
  if (frequency === 'Daily') return `${minute} ${hour} * * *`;
  if (frequency === 'Monthly') return `${minute} ${hour} 1 * *`;
  return `${minute} ${hour} * * 1`;
};

const computeNextRunAt = ({ frequency, time }) => {
  const [hour, minute] = String(time || '09:00').split(':').map((part) => Number(part));
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);

  if (next <= now) {
    if (frequency === 'Daily') next.setDate(next.getDate() + 1);
    else if (frequency === 'Monthly') next.setMonth(next.getMonth() + 1, 1);
    else next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7));
  }

  if (frequency === 'Weekly' && next.getDay() !== 1) {
    next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7));
  }
  if (frequency === 'Monthly') {
    next.setDate(1);
    if (next <= now) next.setMonth(next.getMonth() + 1, 1);
  }

  return next;
};

const mapScheduleRow = (row = {}) => {
  const scope = row.scope_json && typeof row.scope_json === 'object' ? row.scope_json : {};
  const metadata = row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
  return {
    id: row.id,
    name: metadata.name || scope.name || row.workflow_name,
    alertType: metadata.alertType || scope.alertType || 'Compliance alert',
    frequency: metadata.frequency || scope.frequency || 'Weekly',
    time: metadata.time || scope.time || '09:00',
    recipients: metadata.recipients || scope.recipients || '',
    channel: metadata.channel || scope.channel || 'Email',
    active: Boolean(row.enabled),
    workflowName: row.workflow_name,
    cronExpression: row.cron_expression,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const listWorkspaceSchedules = async ({ user }) => {
  requireWorkspaceScheduleAccess(user);
  const result = await postgresPool.query(
    `SELECT *
       FROM copilot.agent_schedules
      WHERE tenant_id = $1
        AND workflow_name LIKE 'settings_%_alert'
      ORDER BY created_at DESC`,
    [String(user.tenantId)]
  );
  return result.rows.map(mapScheduleRow);
};

const createWorkspaceSchedule = async ({ user, body }) => {
  requireWorkspaceScheduleAccess(user);
  const schedule = normalizeSchedulePayload(body);
  const workflowName = ALERT_WORKFLOW_BY_TYPE[schedule.alertType];
  const cronExpression = computeCronExpression(schedule);
  const nextRunAt = schedule.active ? computeNextRunAt(schedule) : null;
  const createdBy = String(user._id || user.id || user.userId || user.email || 'settings-modal');
  const scopeJson = {
    source: 'settings-modal',
    name: schedule.name,
    alertType: schedule.alertType,
    frequency: schedule.frequency,
    time: schedule.time,
    recipients: schedule.recipients,
    channel: schedule.channel,
  };
  const metadataJson = {
    ...scopeJson,
    createdByEmail: user.email || null,
  };

  const result = await postgresPool.query(
    `INSERT INTO copilot.agent_schedules
       (tenant_id, workflow_name, trigger_type, cron_expression, scope_json, enabled, next_run_at, created_by, metadata_json)
     VALUES ($1, $2, 'schedule', $3, $4::jsonb, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [
      String(user.tenantId),
      workflowName,
      cronExpression,
      JSON.stringify(scopeJson),
      schedule.active,
      nextRunAt,
      createdBy,
      JSON.stringify(metadataJson),
    ]
  );

  return mapScheduleRow(result.rows[0]);
};

const updateWorkspaceScheduleStatus = async ({ user, scheduleId, active }) => {
  requireWorkspaceScheduleAccess(user);
  const result = await postgresPool.query(
    `UPDATE copilot.agent_schedules
        SET enabled = $3,
            next_run_at = CASE WHEN $3 THEN COALESCE(next_run_at, NOW()) ELSE NULL END,
            updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $2
        AND workflow_name LIKE 'settings_%_alert'
      RETURNING *`,
    [scheduleId, String(user.tenantId), Boolean(active)]
  );
  if (!result.rows[0]) throw new ApiError(httpStatus.NOT_FOUND, 'Schedule not found');
  return mapScheduleRow(result.rows[0]);
};

const deleteWorkspaceSchedule = async ({ user, scheduleId }) => {
  requireWorkspaceScheduleAccess(user);
  const result = await postgresPool.query(
    `DELETE FROM copilot.agent_schedules
      WHERE id = $1
        AND tenant_id = $2
        AND workflow_name LIKE 'settings_%_alert'`,
    [scheduleId, String(user.tenantId)]
  );
  if (!result.rowCount) throw new ApiError(httpStatus.NOT_FOUND, 'Schedule not found');
  return { deleted: true };
};

module.exports = {
  listWorkspaceSchedules,
  createWorkspaceSchedule,
  updateWorkspaceScheduleStatus,
  deleteWorkspaceSchedule,
};
