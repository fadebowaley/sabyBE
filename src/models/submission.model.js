// 📁 models/submission.model.js
const { postgresPool } = require('../config/postgres');

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
      user_id,
      source,
      data,
      meta = {},
      status = 'submitted',
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
        user_id,
        source,
        data,
        meta,
        status,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
      ) RETURNING *;
    `;

    const values = [
      tenant_id,
      project_id,
      project_name,
      project_category,
      form_id,
      node_id,
      user_id,
      source,
      data,
      meta,
      status,
    ];

    try {
      const result = await postgresPool.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('❌ Error saving submission:', err.message);
      throw err;
    }
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
    const { tenant_id, project_id, form_id, node_id, user_id, status, source } =
      filters;
    const clauses = [];
    const values = [];

    if (tenant_id)
      clauses.push(`tenant_id = $${values.length + 1}`) &&
        values.push(tenant_id);
    if (project_id)
      clauses.push(`project_id = $${values.length + 1}`) &&
        values.push(project_id);
    if (form_id)
      clauses.push(`form_id = $${values.length + 1}`) && values.push(form_id);
    if (node_id)
      clauses.push(`node_id = $${values.length + 1}`) && values.push(node_id);
    if (user_id)
      clauses.push(`user_id = $${values.length + 1}`) && values.push(user_id);
    if (status)
      clauses.push(`status = $${values.length + 1}`) && values.push(status);
    if (source)
      clauses.push(`source = $${values.length + 1}`) && values.push(source);

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const query = `SELECT * FROM form_submissions ${whereClause} ORDER BY created_at DESC`;

    try {
      const result = await postgresPool.query(query, values);
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
