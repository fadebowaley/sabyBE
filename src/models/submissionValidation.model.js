/**
 * Submission Validation Model
 *
 * PostgreSQL model for submission_validations table.
 * Stores validation results for form submissions.
 */

const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

class SubmissionValidationModel {
  /**
   * Get validations by submission ID
   */
  static async getValidationsBySubmission(submission_id, tenant_id) {
    try {
      const query = `
        SELECT sv.* 
        FROM submission_validations sv
        JOIN form_submissions fs ON sv.submission_id = fs.id
        WHERE sv.submission_id = $1
          AND fs.tenant_id = $2
        ORDER BY sv.validated_at DESC
      `;

      const result = await postgresPool.query(query, [
        submission_id,
        tenant_id,
      ]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching validations by submission:', error);
      throw error;
    }
  }

  /**
   * Get all validations for a tenant
   */
  static async getAllValidations(tenant_id, limit = 50) {
    try {
      const query = `
        SELECT sv.* 
        FROM submission_validations sv
        JOIN form_submissions fs ON sv.submission_id = fs.id
        WHERE fs.tenant_id = $1
        ORDER BY sv.validated_at DESC
        LIMIT $2
      `;

      const result = await postgresPool.query(query, [tenant_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching all validations:', error);
      throw error;
    }
  }

  /**
   * Get failed validations
   */
  static async getFailedValidations(tenant_id, limit = 50) {
    try {
      const query = `
        SELECT sv.* 
        FROM submission_validations sv
        JOIN form_submissions fs ON sv.submission_id = fs.id
        WHERE fs.tenant_id = $1
          AND sv.is_valid = false
        ORDER BY sv.validated_at DESC
        LIMIT $2
      `;

      const result = await postgresPool.query(query, [tenant_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching failed validations:', error);
      throw error;
    }
  }

  /**
   * Create validation record
   */
  static async createValidation(validationData) {
    try {
      const {
        submission_id,
        category,
        is_valid,
        severity,
        error_code,
        error_message,
        error_details,
        validated_field,
        expected_value,
        actual_value,
        validated_by,
        validation_version,
      } = validationData;

      const query = `
        INSERT INTO submission_validations
        (submission_id, category, is_valid, severity, error_code, error_message, 
         error_details, validated_field, expected_value, actual_value, 
         validated_by, validation_version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const result = await postgresPool.query(query, [
        submission_id,
        category || 'general',
        is_valid,
        severity || 'info',
        error_code,
        error_message,
        error_details ? JSON.stringify(error_details) : null,
        validated_field,
        expected_value,
        actual_value,
        validated_by || 'system',
        validation_version || '1.0',
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating validation:', error);
      throw error;
    }
  }

  /**
   * Update validation status
   */
  static async updateValidationStatus(id, tenant_id, status_update) {
    try {
      const query = `
        UPDATE submission_validations sv
        SET 
          validation_metadata = jsonb_set(
            COALESCE(sv.validation_metadata, '{}'),
            '{resolution}',
            $1::jsonb
          ),
          updated_at = NOW()
        FROM form_submissions fs
        WHERE sv.submission_id = fs.id
          AND sv.id = $2
          AND fs.tenant_id = $3
        RETURNING sv.*
      `;

      const result = await postgresPool.query(query, [
        JSON.stringify(status_update),
        id,
        tenant_id,
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating validation status:', error);
      throw error;
    }
  }

  /**
   * Resolve validation
   */
  static async resolveValidation(id, tenant_id, resolved_by, resolution_notes) {
    try {
      const resolution = {
        resolved: true,
        resolved_by,
        resolved_at: new Date().toISOString(),
        resolution_notes,
      };

      return await this.updateValidationStatus(id, tenant_id, resolution);
    } catch (error) {
      logger.error('Error resolving validation:', error);
      throw error;
    }
  }

  /**
   * Bulk resolve validations
   */
  static async bulkResolveValidations(
    ids,
    tenant_id,
    resolved_by,
    resolution_notes
  ) {
    try {
      const resolution = {
        resolved: true,
        resolved_by,
        resolved_at: new Date().toISOString(),
        resolution_notes,
      };

      const query = `
        UPDATE submission_validations sv
        SET 
          validation_metadata = jsonb_set(
            COALESCE(sv.validation_metadata, '{}'),
            '{resolution}',
            $1::jsonb
          ),
          updated_at = NOW()
        FROM form_submissions fs
        WHERE sv.submission_id = fs.id
          AND sv.id = ANY($2::uuid[])
          AND fs.tenant_id = $3
        RETURNING sv.id
      `;

      const result = await postgresPool.query(query, [
        JSON.stringify(resolution),
        ids,
        tenant_id,
      ]);

      return result.rows;
    } catch (error) {
      logger.error('Error bulk resolving validations:', error);
      throw error;
    }
  }

  /**
   * Delete validation
   */
  static async deleteValidation(id, tenant_id) {
    try {
      const query = `
        DELETE FROM submission_validations sv
        USING form_submissions fs
        WHERE sv.submission_id = fs.id
          AND sv.id = $1
          AND fs.tenant_id = $2
        RETURNING sv.*
      `;

      const result = await postgresPool.query(query, [id, tenant_id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting validation:', error);
      throw error;
    }
  }

  /**
   * Get validation statistics
   */
  static async getValidationStats(tenant_id, project_id = null) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_validations,
          COUNT(CASE WHEN sv.is_valid = true THEN 1 END) as valid_count,
          COUNT(CASE WHEN sv.is_valid = false THEN 1 END) as invalid_count,
          COUNT(CASE WHEN sv.severity = 'error' THEN 1 END) as error_count,
          COUNT(CASE WHEN sv.severity = 'warning' THEN 1 END) as warning_count,
          COUNT(CASE WHEN sv.severity = 'info' THEN 1 END) as info_count
        FROM submission_validations sv
        JOIN form_submissions fs ON sv.submission_id = fs.id
        WHERE fs.tenant_id = $1
      `;

      const params = [tenant_id];

      if (project_id) {
        query += ` AND fs.project_id = $2`;
        params.push(project_id);
      }

      const result = await postgresPool.query(query, params);
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching validation stats:', error);
      throw error;
    }
  }
}

module.exports = SubmissionValidationModel;
