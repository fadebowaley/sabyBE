'use strict';

/**
 * Prompt Registry Service — Phase 4
 *
 * Manages versioned prompt templates stored in copilot.prompt_versions.
 * Each prompt_key has one or more integer versions; exactly one may be
 * 'active' at any time (enforced by a partial unique index on the table).
 *
 * renderPrompt() performs simple {{variable}} substitution — no eval, no
 * templating engine, no external dependencies.
 */

const { postgresPool } = require('../config/postgres');

/**
 * Get the currently active prompt version for a key.
 *
 * @param {string} promptKey
 * @returns {Promise<object|null>}
 */
async function getActivePrompt(promptKey) {
  const sql = `
    SELECT
      id, prompt_key, version, owner, description,
      system_prompt, user_prompt_template,
      input_variables, output_schema,
      model_hint, task_type, status, eval_set, changelog, created_by, created_at
    FROM copilot.prompt_versions
    WHERE prompt_key = $1
      AND status = 'active'
    LIMIT 1
  `;
  const { rows } = await postgresPool.query(sql, [promptKey]);
  return rows[0] || null;
}

/**
 * Get a specific version of a prompt.
 */
async function getPromptVersion(promptKey, version) {
  const sql = `
    SELECT
      id, prompt_key, version, owner, description,
      system_prompt, user_prompt_template,
      input_variables, output_schema,
      model_hint, task_type, status, eval_set, changelog, created_by, created_at
    FROM copilot.prompt_versions
    WHERE prompt_key = $1 AND version = $2
    LIMIT 1
  `;
  const { rows } = await postgresPool.query(sql, [promptKey, version]);
  return rows[0] || null;
}

/**
 * List prompts, optionally filtered by task_type or status.
 *
 * @param {object} opts
 * @param {string} [opts.taskType]
 * @param {string} [opts.status]
 * @param {number} [opts.limit]
 * @returns {Promise<Array>}
 */
async function listPrompts({ taskType, status, limit = 100 } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (taskType) { conditions.push(`task_type = $${idx++}`); values.push(taskType); }
  if (status)   { conditions.push(`status = $${idx++}`);    values.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const sql = `
    SELECT
      id, prompt_key, version, owner, description,
      model_hint, task_type, status, created_at
    FROM copilot.prompt_versions
    ${where}
    ORDER BY prompt_key, version DESC
    LIMIT $${idx}
  `;
  const { rows } = await postgresPool.query(sql, values);
  return rows;
}

/**
 * Create a new prompt version (in 'draft' status by default).
 * The version number is automatically set to max(existing) + 1 for the key.
 *
 * @param {object} opts
 * @param {string} opts.promptKey
 * @param {string} opts.owner
 * @param {string} [opts.description]
 * @param {string} opts.systemPrompt
 * @param {string} [opts.userPromptTemplate]
 * @param {string[]} [opts.inputVariables]
 * @param {object} [opts.outputSchema]
 * @param {string} [opts.modelHint]
 * @param {string} [opts.taskType]
 * @param {string} [opts.status]        — 'draft' | 'active'
 * @param {Array}  [opts.evalSet]
 * @param {string} [opts.changelog]
 * @param {string} [opts.createdBy]
 * @returns {Promise<object>}
 */
async function createPromptVersion({
  promptKey, owner = 'system', description = null,
  systemPrompt, userPromptTemplate = null,
  inputVariables = [], outputSchema = {}, modelHint = null,
  taskType = null, status = 'draft',
  evalSet = [], changelog = null, createdBy = null,
}) {
  // Determine next version number
  const versionSql = `
    SELECT COALESCE(MAX(version), 0) + 1 AS next_version
    FROM copilot.prompt_versions
    WHERE prompt_key = $1
  `;
  const { rows: vRows } = await postgresPool.query(versionSql, [promptKey]);
  const version = vRows[0].next_version;

  // If creating as 'active', demote any existing active version first
  if (status === 'active') {
    await _demoteActiveVersion(promptKey);
  }

  const sql = `
    INSERT INTO copilot.prompt_versions (
      prompt_key, version, owner, description,
      system_prompt, user_prompt_template,
      input_variables, output_schema,
      model_hint, task_type, status,
      eval_set, changelog, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    RETURNING *
  `;
  const values = [
    promptKey, version, owner, description,
    systemPrompt, userPromptTemplate,
    JSON.stringify(inputVariables), JSON.stringify(outputSchema),
    modelHint, taskType, status,
    JSON.stringify(evalSet), changelog, createdBy,
  ];
  const { rows } = await postgresPool.query(sql, values);
  return rows[0];
}

/**
 * Activate a specific prompt version (demotes the current active version).
 *
 * @param {string} promptKey
 * @param {number} version
 * @returns {Promise<object>}
 */
async function activatePromptVersion(promptKey, version) {
  const existing = await getPromptVersion(promptKey, version);
  if (!existing) {
    throw Object.assign(
      new Error(`Prompt version not found: ${promptKey} v${version}`),
      { code: 'PROMPT_VERSION_NOT_FOUND' }
    );
  }

  await _demoteActiveVersion(promptKey);

  const sql = `
    UPDATE copilot.prompt_versions
    SET status = 'active', updated_at = now()
    WHERE prompt_key = $1 AND version = $2
    RETURNING *
  `;
  const { rows } = await postgresPool.query(sql, [promptKey, version]);
  return rows[0];
}

/**
 * Demote any currently active version of a prompt_key to 'deprecated'.
 */
async function _demoteActiveVersion(promptKey) {
  const sql = `
    UPDATE copilot.prompt_versions
    SET status = 'deprecated', updated_at = now()
    WHERE prompt_key = $1 AND status = 'active'
  `;
  await postgresPool.query(sql, [promptKey]);
}

/**
 * Render a prompt template by substituting {{variable}} placeholders.
 * Returns the filled system_prompt and user_prompt (if template exists).
 *
 * @param {string} promptKey
 * @param {object} variables  — key/value pairs matching input_variables
 * @returns {Promise<{systemPrompt:string, userPrompt:string|null, version:number, promptId:string}>}
 */
async function renderPrompt(promptKey, variables = {}) {
  const prompt = await getActivePrompt(promptKey);
  if (!prompt) {
    throw Object.assign(
      new Error(`No active prompt found for key: ${promptKey}`),
      { code: 'PROMPT_NOT_FOUND', promptKey }
    );
  }

  const systemPrompt = _interpolate(prompt.system_prompt, variables);
  const userPrompt = prompt.user_prompt_template
    ? _interpolate(prompt.user_prompt_template, variables)
    : null;

  return {
    systemPrompt,
    userPrompt,
    version:  prompt.version,
    promptId: prompt.id,
    modelHint: prompt.model_hint,
    taskType:  prompt.task_type,
  };
}

/**
 * Replace {{key}} tokens in a template string with values from the map.
 * Unknown tokens are left as-is (no silent data loss).
 */
function _interpolate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      const v = variables[key];
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    return match;
  });
}

module.exports = {
  getActivePrompt,
  getPromptVersion,
  listPrompts,
  createPromptVersion,
  activatePromptVersion,
  renderPrompt,
};
