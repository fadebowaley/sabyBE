'use strict';

/**
 * Incident Playbook Service — Phase 7 Enterprise Autonomy
 *
 * Manages incident response playbooks (templates) and active incident records.
 * When an autonomous system detects a failure pattern (worker down, DLQ spike,
 * security anomaly, payment exception), it opens an incident record linked to
 * the relevant playbook. The playbook's steps guide the response team through
 * a structured resolution path.
 *
 * Lifecycle: open → acknowledged → investigating → contained → resolved
 *            (or → post_mortem for critical incidents)
 */

const { postgresPool } = require('../config/postgres');
const logger           = require('../config/logger');

const VALID_STATUSES = new Set([
  'open','acknowledged','investigating','contained','resolved','post_mortem'
]);
const VALID_SEVERITIES = new Set(['low','medium','high','critical']);

// ─── Playbook CRUD ────────────────────────────────────────────────────────────

async function createPlaybook({
  name,
  incidentType,
  description = null,
  stepsJson = [],
  severity = 'medium',
  autoTriggerConditions = {},
  enabled = true,
}) {
  if (!VALID_SEVERITIES.has(severity)) {
    throw Object.assign(new Error(`Invalid severity: ${severity}`), { code: 'INVALID_SEVERITY' });
  }

  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.incident_playbooks
       (name, incident_type, description, steps_json, severity,
        auto_trigger_conditions, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (name) DO UPDATE
       SET incident_type           = EXCLUDED.incident_type,
           description             = EXCLUDED.description,
           steps_json              = EXCLUDED.steps_json,
           severity                = EXCLUDED.severity,
           auto_trigger_conditions = EXCLUDED.auto_trigger_conditions,
           enabled                 = EXCLUDED.enabled,
           updated_at              = NOW()
     RETURNING *`,
    [name, incidentType, description, JSON.stringify(stepsJson),
     severity, JSON.stringify(autoTriggerConditions), enabled]
  );
  logger.info('[IncidentPlaybook] Playbook registered', { name, incidentType, severity });
  return rows[0];
}

async function listPlaybooks({ incidentType, enabled } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (incidentType) {
    conditions.push(`incident_type = $${idx++}`);
    values.push(incidentType);
  }
  if (enabled !== undefined) {
    conditions.push(`enabled = $${idx++}`);
    values.push(enabled);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await postgresPool.query(
    `SELECT * FROM copilot.incident_playbooks ${where} ORDER BY severity DESC, name ASC`,
    values
  );
  return rows;
}

// ─── Incident Records ─────────────────────────────────────────────────────────

async function openIncident({
  tenantId,
  incidentType,
  title,
  description = null,
  severity = 'medium',
  contextJson = {},
  playbookId = null,
  taskId = null,
}) {
  if (!VALID_SEVERITIES.has(severity)) {
    throw Object.assign(new Error(`Invalid severity: ${severity}`), { code: 'INVALID_SEVERITY' });
  }

  // Auto-select a matching playbook when none is supplied.
  // Prefer a playbook whose incident_type matches exactly; fall back to any
  // enabled playbook ordered by severity desc so the most relevant fires first.
  let resolvedPlaybookId = playbookId;
  if (!resolvedPlaybookId) {
    try {
      const { rows: pbRows } = await postgresPool.query(
        `SELECT id FROM copilot.incident_playbooks
         WHERE incident_type = $1 AND enabled = true
         ORDER BY CASE severity
           WHEN 'critical' THEN 1 WHEN 'high' THEN 2
           WHEN 'medium'   THEN 3 ELSE 4 END
         LIMIT 1`,
        [incidentType]
      );
      if (pbRows.length) {
        resolvedPlaybookId = pbRows[0].id;
        logger.info('[IncidentPlaybook] Auto-selected playbook', {
          playbookId: resolvedPlaybookId, incidentType,
        });
      }
    } catch (pbErr) {
      // Non-fatal — open incident without a playbook
      logger.warn('[IncidentPlaybook] Playbook auto-select failed (non-fatal)', {
        incidentType, err: pbErr.message,
      });
    }
  }

  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.incident_records
       (tenant_id, incident_type, title, description, severity,
        status, context_json, playbook_id, task_id)
     VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8)
     RETURNING *`,
    [tenantId, incidentType, title, description, severity,
     JSON.stringify(contextJson), resolvedPlaybookId, taskId]
  );

  logger.info('[IncidentPlaybook] Incident opened', {
    incidentId: rows[0].id, tenantId, incidentType, severity,
    playbookId: resolvedPlaybookId,
  });
  return rows[0];
}

async function acknowledgeIncident({ incidentId, tenantId, userId }) {
  const { rows } = await postgresPool.query(
    `UPDATE copilot.incident_records
     SET status = 'acknowledged', acknowledged_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'open'
     RETURNING *`,
    [incidentId, tenantId]
  );
  if (!rows.length) {
    throw Object.assign(
      new Error('Incident not found or not in open state'),
      { code: 'INCIDENT_NOT_ACTIONABLE' }
    );
  }
  logger.info('[IncidentPlaybook] Incident acknowledged', { incidentId, userId });
  return rows[0];
}

async function updateIncidentStatus({ incidentId, tenantId, status }) {
  if (!VALID_STATUSES.has(status)) {
    throw Object.assign(new Error(`Invalid status: ${status}`), { code: 'INVALID_STATUS' });
  }
  const { rows } = await postgresPool.query(
    `UPDATE copilot.incident_records
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [status, incidentId, tenantId]
  );
  if (!rows.length) throw Object.assign(new Error('Incident not found'), { code: 'INCIDENT_NOT_FOUND' });
  return rows[0];
}

async function resolveIncident({ incidentId, tenantId, resolvedBy, resolutionNotes = null }) {
  const { rows } = await postgresPool.query(
    `UPDATE copilot.incident_records
     SET status = 'resolved', resolved_at = NOW(), resolved_by = $1,
         resolution_notes = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4
       AND status NOT IN ('resolved','post_mortem')
     RETURNING *`,
    [resolvedBy, resolutionNotes, incidentId, tenantId]
  );
  if (!rows.length) {
    throw Object.assign(
      new Error('Incident not found or already resolved'),
      { code: 'INCIDENT_NOT_ACTIONABLE' }
    );
  }
  logger.info('[IncidentPlaybook] Incident resolved', { incidentId, resolvedBy });
  return rows[0];
}

async function listIncidents({ tenantId, status, severity, limit = 50 } = {}) {
  const conditions = ['ir.tenant_id = $1'];
  const values = [tenantId];
  let idx = 2;

  if (status) {
    conditions.push(`ir.status = $${idx++}`);
    values.push(status);
  }
  if (severity) {
    conditions.push(`ir.severity = $${idx++}`);
    values.push(severity);
  }
  values.push(limit);

  const { rows } = await postgresPool.query(
    `SELECT ir.*, ip.name AS playbook_name
     FROM copilot.incident_records ir
     LEFT JOIN copilot.incident_playbooks ip ON ip.id = ir.playbook_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE ir.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3 ELSE 4 END,
       ir.created_at DESC
     LIMIT $${idx}`,
    values
  );
  return rows;
}

async function getIncidentById({ tenantId, incidentId }) {
  const { rows } = await postgresPool.query(
    `SELECT ir.*, ip.name AS playbook_name, ip.steps_json AS playbook_steps
     FROM copilot.incident_records ir
     LEFT JOIN copilot.incident_playbooks ip ON ip.id = ir.playbook_id
     WHERE ir.id = $1 AND ir.tenant_id = $2`,
    [incidentId, tenantId]
  );
  return rows[0] || null;
}

module.exports = {
  createPlaybook,
  listPlaybooks,
  openIncident,
  acknowledgeIncident,
  updateIncidentStatus,
  resolveIncident,
  listIncidents,
  getIncidentById,
};
