/**
 * Validation Report Service
 *
 * Orchestration layer for validation reporting and management.
 *
 * @module services/validationReport
 */

const httpStatus = require('http-status');
const SubmissionValidationModel = require('../models/submissionValidation.model');
const ApiError = require('../utils/ApiError');

/**
 * Get validations with filters and pagination
 */
const getValidations = async (filters, options = {}) => {
  try {
    const { limit = 50, offset = 0 } = options;

    const result = await SubmissionValidationModel.getValidations({
      ...filters,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    return result;
  } catch (error) {
    console.error('❌ Error in getValidations service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch validations'
    );
  }
};

/**
 * Get validation by ID
 */
const getValidationById = async (id) => {
  try {
    const validation = await SubmissionValidationModel.getValidationById(id);

    if (!validation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Validation not found');
    }

    return validation;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in getValidationById service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch validation'
    );
  }
};

/**
 * Get validations by submission
 */
const getValidationsBySubmission = async (submission_id) => {
  try {
    return await SubmissionValidationModel.getValidationsBySubmission(
      submission_id
    );
  } catch (error) {
    console.error(
      '❌ Error in getValidationsBySubmission service:',
      error.message
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch validations by submission'
    );
  }
};

/**
 * Get failed validations
 */
const getFailedValidations = async (filters) => {
  try {
    return await SubmissionValidationModel.getFailedValidations(filters);
  } catch (error) {
    console.error('❌ Error in getFailedValidations service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch failed validations'
    );
  }
};

/**
 * Get validation statistics
 */
const getValidationStats = async (
  tenant_id,
  project_id = null,
  month = null
) => {
  try {
    return await SubmissionValidationModel.getValidationStats(
      tenant_id,
      project_id,
      month
    );
  } catch (error) {
    console.error('❌ Error in getValidationStats service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch validation statistics'
    );
  }
};

/**
 * Get validation errors within date range
 */
const getValidationErrors = async (tenant_id, dateRange = {}) => {
  try {
    return await SubmissionValidationModel.getValidationErrors(
      tenant_id,
      dateRange
    );
  } catch (error) {
    console.error('❌ Error in getValidationErrors service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch validation errors'
    );
  }
};

/**
 * Resolve validation
 */
const resolveValidation = async (id, user_id, resolution_note) => {
  try {
    const existing = await SubmissionValidationModel.getValidationById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Validation not found');
    }

    if (existing.resolution_status === 'resolved') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Validation is already resolved'
      );
    }

    return await SubmissionValidationModel.resolveValidation(
      id,
      user_id,
      resolution_note
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in resolveValidation service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to resolve validation'
    );
  }
};

/**
 * Bulk resolve validations
 */
const bulkResolveValidations = async (ids, user_id, resolution_note) => {
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid validation IDs');
    }

    const resolved = await SubmissionValidationModel.bulkResolveValidations(
      ids,
      user_id,
      resolution_note
    );

    return {
      resolved_count: resolved.length,
      ids: resolved.map((v) => v.id),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in bulkResolveValidations service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to bulk resolve validations'
    );
  }
};

/**
 * Delete validation
 */
const deleteValidation = async (id) => {
  try {
    const existing = await SubmissionValidationModel.getValidationById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Validation not found');
    }

    return await SubmissionValidationModel.deleteValidation(id);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in deleteValidation service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to delete validation'
    );
  }
};

module.exports = {
  getValidations,
  getValidationById,
  getValidationsBySubmission,
  getFailedValidations,
  getValidationStats,
  getValidationErrors,
  resolveValidation,
  bulkResolveValidations,
  deleteValidation,
};
