// src/ingestion/email/services/validationLogger.service.js

const logger = require('../../../config/logger');
const { postgresPool } = require('../../../config/postgres');

/**
 * Validation Logger Service
 * Logs validation errors and rejected submissions for audit and debugging
 */

class ValidationLoggerService {
  /**
   * Log validation error to database
   * @param {Object} errorData - Validation error data
   */
  async logValidationError(errorData) {
    try {
      const {
        tenantId,
        senderEmail,
        projectId,
        errorType,
        errorMessage,
        validationErrors,
        emailMetadata,
        timestamp = new Date(),
      } = errorData;

      const query = `
        INSERT INTO email_validation_errors (
          tenant_id,
          sender_email,
          project_id,
          error_type,
          error_message,
          validation_errors,
          email_metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      const values = [
        tenantId,
        senderEmail,
        projectId,
        errorType,
        errorMessage,
        JSON.stringify(validationErrors || []),
        JSON.stringify(emailMetadata || {}),
        timestamp,
      ];

      await postgresPool.query(query, values);

      logger.info(
        `📝 Validation error logged for ${senderEmail} to project ${projectId}`
      );
    } catch (error) {
      logger.error('❌ Failed to log validation error:', error.message);
    }
  }

  /**
   * Log rejected submission
   * @param {Object} rejectionData - Rejection data
   */
  async logRejectedSubmission(rejectionData) {
    try {
      const {
        tenantId,
        senderEmail,
        projectId,
        reason,
        validationResult,
        emailContent,
        timestamp = new Date(),
      } = rejectionData;

      const query = `
        INSERT INTO email_rejected_submissions (
          tenant_id,
          sender_email,
          project_id,
          rejection_reason,
          validation_result,
          email_content,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      const values = [
        tenantId,
        senderEmail,
        projectId,
        reason,
        JSON.stringify(validationResult || {}),
        emailContent,
        timestamp,
      ];

      await postgresPool.query(query, values);

      logger.info(
        `📝 Rejected submission logged for ${senderEmail} to project ${projectId}`
      );
    } catch (error) {
      logger.error('❌ Failed to log rejected submission:', error.message);
    }
  }

  /**
   * Get validation error statistics
   * @param {string} tenantId - Tenant ID
   * @param {Date} startDate - Start date for statistics
   * @param {Date} endDate - End date for statistics
   * @returns {Promise<Object>} Validation statistics
   */
  async getValidationStatistics(tenantId, startDate, endDate) {
    try {
      const query = `
        SELECT
          error_type,
          COUNT(*) as count,
          COUNT(DISTINCT sender_email) as unique_senders,
          COUNT(DISTINCT project_id) as unique_projects
        FROM email_validation_errors
        WHERE tenant_id = $1
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY error_type
        ORDER BY count DESC
      `;

      const result = await postgresPool.query(query, [
        tenantId,
        startDate,
        endDate,
      ]);

      return {
        totalErrors: result.rows.reduce(
          (sum, row) => sum + parseInt(row.count),
          0
        ),
        errorTypes: result.rows,
        period: { startDate, endDate },
      };
    } catch (error) {
      logger.error('❌ Failed to get validation statistics:', error.message);
      return { totalErrors: 0, errorTypes: [], period: { startDate, endDate } };
    }
  }

  /**
   * Get recent validation errors
   * @param {string} tenantId - Tenant ID
   * @param {number} limit - Number of recent errors to fetch
   * @returns {Promise<Array>} Recent validation errors
   */
  async getRecentValidationErrors(tenantId, limit = 10) {
    try {
      const query = `
        SELECT
          sender_email,
          project_id,
          error_type,
          error_message,
          created_at
        FROM email_validation_errors
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await postgresPool.query(query, [tenantId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('❌ Failed to get recent validation errors:', error.message);
      return [];
    }
  }

  /**
   * Log successful validation
   * @param {Object} successData - Success data
   */
  async logSuccessfulValidation(successData) {
    try {
      const {
        tenantId,
        senderEmail,
        projectId,
        userId,
        projectFormId,
        warnings,
        timestamp = new Date(),
      } = successData;

      const query = `
        INSERT INTO email_successful_validations (
          tenant_id,
          sender_email,
          project_id,
          user_id,
          project_form_id,
          warnings,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      const values = [
        tenantId,
        senderEmail,
        projectId,
        userId,
        projectFormId,
        JSON.stringify(warnings || []),
        timestamp,
      ];

      await postgresPool.query(query, values);

      logger.info(
        `📝 Successful validation logged for ${senderEmail} to project ${projectId}`
      );
    } catch (error) {
      logger.error('❌ Failed to log successful validation:', error.message);
    }
  }
}

module.exports = new ValidationLoggerService();
