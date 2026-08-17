// 📁 models/submission.model.js
const { postgresPool } = require('../config/postgres');

const RESERVED_SUBMISSION_DATA_KEYS = new Set(['__payment', '__invoice']);

const SubmissionModel = {
  /**
   * Save new form submission to PostgreSQL
   * @param {Object} payload - includes tenant_id, project_id, form_id, node_id, user_id, source, data, submitted_by, etc.
   */
  async createSubmission(payload) {
    const {
      tenant_id,
      project_id,
      project_name,
      project_category,
      form_id,
      node_id,
      node_name,
      node_reference,
      user_id,
      source,
      data,
      meta = {},
      status = 'submitted',
      event_date = null,
      month = null,
      year = null,
      perm_enabled = false,
      submitted_by = null,
      submitted_at = null,
      idempotency_key = null,
      client = null,
    } = payload;

    const query = `
      INSERT INTO form_submissions (
        id,
        tenant_id,
        project_id,
        project_name,
        project_category,
        form_id,
        node_id,
        node_name,
        node_reference,
        user_id,
        source,
        data,
        meta,
        status,
        event_date,
        month,
        year,
        perm_enabled,
        submitted_by,
        submitted_at,
        idempotency_key,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, NOW(), NOW()
      )
      ON CONFLICT (tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO UPDATE SET updated_at = form_submissions.updated_at
      RETURNING *, (xmax = 0) AS _inserted;
    `;

    const values = [
      tenant_id,
      project_id,
      project_name,
      project_category,
      form_id,
      node_id,
      node_name,
      node_reference,
      user_id,
      source,
      data,
      meta,
      status,
      event_date,
      month,
      year,
      perm_enabled,
      submitted_by,
      submitted_at,
      idempotency_key,
    ];

    try {
      const db = client || postgresPool;
      const result = await db.query(query, values);
      if (result.rows[0]?._inserted === true) {
        try {
          const ProjectForm = require('./projectForm.model');
          await ProjectForm.updateOne(
            { tenantId: tenant_id, projectId: project_id, deletedAt: null },
            { $inc: { 'analytics.submissions': 1 } }
          );
        } catch (counterError) {
          console.warn(
            '⚠️ Failed to increment form submission counter:',
            counterError.message
          );
        }
      }
      return result.rows[0];
    } catch (err) {
      console.error('❌ Error saving submission:', err.message);
      throw err;
    }
  },

  async buildFactsFromSubmission(submission, catalog = {}) {
    if (
      !submission ||
      !submission.data ||
      typeof submission.data !== 'object'
    ) {
      return [];
    }

    const fields = submission.data.structured || submission.data;
    const facts = [];
    const createdAt = submission.created_at
      ? new Date(submission.created_at)
      : new Date();
    const submissionDate = submission.submission_date
      ? new Date(submission.submission_date)
      : createdAt;
    const monthBucket = new Date(createdAt);
    monthBucket.setUTCDate(1);
    monthBucket.setUTCHours(0, 0, 0, 0);

    const dayBucket = new Date(
      Date.UTC(
        submissionDate.getUTCFullYear(),
        submissionDate.getUTCMonth(),
        submissionDate.getUTCDate()
      )
    );
    const weekBucket = new Date(dayBucket);
    const dayOfWeek = weekBucket.getUTCDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday-based weeks
    weekBucket.setUTCDate(weekBucket.getUTCDate() + diff);

    const catalogEntries = catalog || {};
    const catalogValues = Object.values(catalogEntries);

    Object.keys(fields).forEach((fieldKey) => {
      if (RESERVED_SUBMISSION_DATA_KEYS.has(fieldKey)) {
        return;
      }

      const rawValue = fields[fieldKey];
      const lowercaseKey = fieldKey?.toLowerCase?.();

      let catalogEntry = catalogEntries[fieldKey];
      if (!catalogEntry && lowercaseKey) {
        catalogEntry = catalogValues.find((entry) => {
          if (!entry || !Array.isArray(entry.aliases)) {
            return false;
          }
          return entry.aliases.some(
            (alias) => alias && alias.toLowerCase() === lowercaseKey
          );
        });
      }

      const transformations = Array.isArray(catalogEntry?.transformations)
        ? catalogEntry.transformations
        : [];

      const hasStructuredEnvelope =
        rawValue &&
        typeof rawValue === 'object' &&
        rawValue !== null &&
        Object.prototype.hasOwnProperty.call(rawValue, 'value');

      const actualValue = hasStructuredEnvelope ? rawValue.value : rawValue;

      const fact = {
        submission_id: submission.id,
        tenant_id: submission.tenant_id,
        project_id: submission.project_id,
        form_id: submission.form_id,
        node_id: submission.node_id,
        user_id: submission.user_id,
        source: submission.source || 'unknown',
        field_key: fieldKey,
        field_label: catalogEntry?.field_label || fieldKey,
        field_type: catalogEntry?.field_type || null,
        value_text: actualValue != null ? String(actualValue) : null,
        value_numeric: null,
        value_boolean: null,
        value_date: null,
        value_json: hasStructuredEnvelope ? rawValue : null,
        value_sum_candidate: null,
        value_years: null,
        value_months: null,
        value_category: null,
        value_bucket: null,
        value_array_length: null,
        value_normalised: null,
        month_bucket: monthBucket,
        day_bucket: dayBucket,
        week_bucket: weekBucket,
      };

      if (actualValue === null || actualValue === undefined) {
        facts.push(fact);
        return;
      }

      const trimmedValue =
        typeof actualValue === 'string' ? actualValue.trim() : actualValue;

      if (Array.isArray(actualValue)) {
        fact.value_json = hasStructuredEnvelope ? rawValue : actualValue;
        fact.value_array_length = actualValue.length;
        if (actualValue.every((item) => typeof item === 'number')) {
          const sum = actualValue.reduce((acc, curr) => acc + curr, 0);
          fact.value_numeric = sum;
          fact.value_sum_candidate = sum;
        }
        fact.value_text = actualValue.join(', ');
      } else if (
        typeof actualValue === 'object' &&
        actualValue !== null &&
        !Array.isArray(actualValue)
      ) {
        fact.value_json = hasStructuredEnvelope ? rawValue : actualValue;
        try {
          fact.value_text = JSON.stringify(actualValue);
        } catch (err) {
          fact.value_text = '[object]';
        }
      }

      const numericCandidate = (() => {
        if (typeof actualValue === 'number') {
          return actualValue;
        }
        if (typeof trimmedValue === 'string') {
          const normalisedNumeric = trimmedValue
            .replace(/,/g, '')
            .replace(/[^0-9.+-]/g, '');
          if (normalisedNumeric.length === 0) {
            return null;
          }
          const parsed = Number(normalisedNumeric);
          return Number.isNaN(parsed) ? null : parsed;
        }
        return null;
      })();

      if (numericCandidate !== null) {
        fact.value_numeric = numericCandidate;
        if (transformations.includes('sum')) {
          fact.value_sum_candidate = numericCandidate;
        }
        const bucketSize = 10;
        const bucketFloor =
          Math.floor(numericCandidate / bucketSize) * bucketSize;
        const bucketCeil = bucketFloor + bucketSize - 1;
        fact.value_bucket = `${bucketFloor}-${bucketCeil}`;
      }

      if (typeof actualValue === 'boolean') {
        fact.value_boolean = actualValue;
      } else if (typeof trimmedValue === 'string') {
        const normalised = trimmedValue.toLowerCase();
        fact.value_normalised = normalised;
        if (['true', 'yes', 'y', '1'].includes(normalised)) {
          fact.value_boolean = true;
        } else if (['false', 'no', 'n', '0'].includes(normalised)) {
          fact.value_boolean = false;
        }
      }

      const dateCandidate = (() => {
        if (actualValue instanceof Date) {
          return actualValue;
        }
        if (typeof trimmedValue === 'string') {
          const parsed = new Date(trimmedValue);
          return Number.isNaN(parsed.valueOf()) ? null : parsed;
        }
        return null;
      })();

      if (dateCandidate) {
        fact.value_date = dateCandidate;
        if (transformations.includes('age_years')) {
          const diffMs = Date.now() - dateCandidate.getTime();
          const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
          if (Number.isFinite(years)) {
            fact.value_years = Math.floor(years);
            fact.value_months = Math.floor(years * 12);
          }
        }
      }

      if (
        transformations.includes('categorical') ||
        transformations.includes('enum')
      ) {
        fact.value_category = fact.value_text;
      }

      facts.push(fact);
    });

    return facts;
  },

  /**
   * Retrieve all submissions for a tenant and project
   */
  async getSubmissionsByProject(tenant_id, project_id) {
    try {
      const result = await postgresPool.query(
        `SELECT * FROM form_submissions WHERE tenant_id = $1 AND project_id = $2 ORDER BY created_at DESC`,
        [tenant_id, project_id]
      );
      return result.rows;
    } catch (err) {
      console.error('❌ Error fetching submissions:', err.message);
      throw err;
    }
  },

  /**
   * Optional dynamic filtering
   */
  async getFilteredSubmissions(filters = {}) {
    const {
      tenant_id,
      project_id,
      project_ids,
      form_id,
      node_id,
      nodeId,
      user_id,
      status,
      source,
      perm_enabled,
      month,
      start_date,
      end_date,
    } = filters;
    const clauses = [];
    const values = [];

    console.log('[submission.model] getFilteredSubmissions called with:', {
      filters,
      perm_enabled_value: perm_enabled,
      perm_enabled_type: typeof perm_enabled,
    });

    if (tenant_id)
      clauses.push(`tenant_id = $${values.length + 1}`) &&
        values.push(tenant_id);
    if (Array.isArray(project_ids)) {
      if (project_ids.length === 0) {
        clauses.push('1 = 0');
      } else {
        clauses.push(`project_id = ANY($${values.length + 1}::text[])`);
        values.push(project_ids);
      }
    } else if (project_id)
      clauses.push(`project_id = $${values.length + 1}`) &&
        values.push(project_id);
    if (form_id)
      clauses.push(`form_id = $${values.length + 1}`) && values.push(form_id);
    const nodeFilter = nodeId || node_id;
    if (nodeFilter) {
      clauses.push(
        `(node_id = $${values.length + 1} OR node_reference = $${values.length + 1})`
      ) && values.push(nodeFilter);
    }
    if (user_id)
      clauses.push(`user_id = $${values.length + 1}`) && values.push(user_id);
    if (status)
      clauses.push(`status = $${values.length + 1}`) && values.push(status);
    if (source)
      clauses.push(`source = $${values.length + 1}`) && values.push(source);
    // 🔧 FIX: Add perm_enabled filter for PERM dashboard
    if (perm_enabled !== undefined)
      clauses.push(`perm_enabled = $${values.length + 1}`) &&
        values.push(perm_enabled);
    if (month)
      clauses.push(`month = $${values.length + 1}`) && values.push(month);
    if (start_date)
      clauses.push(`submission_date >= $${values.length + 1}`) &&
        values.push(start_date);
    if (end_date)
      clauses.push(`submission_date <= $${values.length + 1}`) &&
        values.push(end_date);

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const query = `SELECT * FROM form_submissions ${whereClause} ORDER BY created_at DESC`;

    console.log('[submission.model] Executing query:', {
      query,
      values,
      whereClause,
      clausesCount: clauses.length,
    });

    try {
      const result = await postgresPool.query(query, values);
      console.log(
        `[submission.model] Query returned ${result.rows.length} rows`
      );
      return result.rows;
    } catch (err) {
      console.error('❌ Error fetching filtered submissions:', err.message);
      throw err;
    }
  },

  /**
   * Get a submission by ID
   */
  async getSubmissionById(id) {
    try {
      const result = await postgresPool.query(
        `SELECT * FROM form_submissions WHERE id = $1`,
        [id]
      );
      return result.rows[0];
    } catch (err) {
      console.error('❌ Error fetching submission by id:', err.message);
      throw err;
    }
  },

  async countSubmissions(filters = {}) {
    const {
      tenant_id,
      project_id,
      project_ids,
      form_id,
      month,
      year,
      status,
    } = filters;

    const clauses = [];
    const values = [];

    if (tenant_id) {
      clauses.push(`tenant_id = $${values.length + 1}`);
      values.push(tenant_id);
    }

    if (Array.isArray(project_ids)) {
      if (project_ids.length === 0) {
        clauses.push('1 = 0');
      } else {
        clauses.push(`project_id = ANY($${values.length + 1}::text[])`);
        values.push(project_ids);
      }
    } else if (project_id) {
      clauses.push(`project_id = $${values.length + 1}`);
      values.push(project_id);
    }

    if (form_id) {
      clauses.push(`form_id = $${values.length + 1}`);
      values.push(form_id);
    }

    if (month) {
      clauses.push(`month = $${values.length + 1}`);
      values.push(month);
    }

    if (year) {
      clauses.push(`EXTRACT(YEAR FROM month) = $${values.length + 1}`);
      values.push(year);
    }

    if (status) {
      clauses.push(`status = $${values.length + 1}`);
      values.push(status);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await postgresPool.query(
      `SELECT COUNT(*)::int AS total FROM form_submissions ${whereClause}`,
      values
    );
    return Number(result.rows[0]?.total || 0);
  },

  /**
   * Delete all submissions by form_id
   */
  async deleteSubmission(form_id) {
    try {
      const result = await postgresPool.query(
        `DELETE FROM form_submissions WHERE form_id = $1 RETURNING *`,
        [form_id]
      );
      return result.rows;
    } catch (err) {
      console.error('❌ Error deleting submissions by form_id:', err.message);
      throw err;
    }
  },

  /**
   * Retry a submission (stub, actual logic in service)
   */
  async retrySubmission(id) {
    // This can be expanded to fetch and re-queue the submission
    return this.getSubmissionById(id);
  },
};

module.exports = SubmissionModel;
