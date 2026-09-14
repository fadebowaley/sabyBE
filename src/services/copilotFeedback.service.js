/**
 * Structured, machine-readable feedback sent back to the Saby Copilot agent
 * whenever a copilot action fails validation or execution.
 *
 * The agent consumes `feedback` from `action_events.result_json` (or the
 * `details` payload of a synchronous ApiError) so it can correct its input and
 * re-execute the task instead of leaving the user with a one-way dead end.
 *
 * Shape:
 * {
 *   code: 'VALIDATION' | 'EXECUTION',
 *   retryable: boolean,     // true when the agent may resubmit a corrected payload
 *   message: string,        // human-readable summary
 *   fieldErrors: [{ field, message, hint? }],
 * }
 */

const PASSWORD_HINT =
  'Password must be at least 8 characters and contain at least one letter and one number.';

const OBJECT_ID_FIELDS = [
  'userId',
  '_id',
  'id',
  'createdBy',
  'roleId',
  'roleIds',
  'projectId',
  'formId',
  'nodeId',
  'levelId',
  'structureId',
  'contactId',
  'approvalTokenId',
];

function isObjectIdField(field) {
  const key = String(field || '').toLowerCase();
  return OBJECT_ID_FIELDS.some(
    (candidate) => key === candidate || key.endsWith(`.${candidate}`)
  );
}

function fieldHint(field) {
  if (
    String(field || '')
      .toLowerCase()
      .includes('password')
  ) {
    return PASSWORD_HINT;
  }
  if (isObjectIdField(field)) {
    return 'This field must be a valid 24-character hexadecimal object identifier.';
  }
  return null;
}

function normalizeFieldErrors(error) {
  if (!error) return [];
  if (error.feedback && Array.isArray(error.feedback.fieldErrors)) {
    return error.feedback.fieldErrors.map((item) => ({
      field: item.field,
      message: item.message,
      hint: item.hint || fieldHint(item.field),
    }));
  }
  if (error.name === 'ValidationError' && error.errors) {
    return Object.keys(error.errors).map((path) => {
      const detail = error.errors[path] || {};
      return {
        field: path,
        message: detail.message || 'Invalid value',
        hint: fieldHint(path),
      };
    });
  }
  if (error.name === 'CastError') {
    return [
      {
        field: error.path || 'id',
        message: error.message || 'Invalid identifier',
        hint: fieldHint(error.path),
      },
    ];
  }
  return [];
}

function feedbackFromError(error) {
  const statusCode = Number(error?.statusCode || 0);
  const is4xx = statusCode >= 400 && statusCode < 500;
  const fieldErrors = normalizeFieldErrors(error);
  const message =
    (error?.feedback && error.feedback.message) ||
    (fieldErrors.length > 0 ? fieldErrors[0].message : '') ||
    error?.message ||
    'Execution failed';
  return {
    code: fieldErrors.length > 0 || is4xx ? 'VALIDATION' : 'EXECUTION',
    retryable: fieldErrors.length > 0 || is4xx,
    message,
    fieldErrors,
  };
}

function feedbackToResultJson(
  error,
  { statusCode, retryCount, deadLettered } = {}
) {
  const feedback = feedbackFromError(error);
  return {
    error: error?.message || 'Execution failed',
    statusCode: Number(statusCode || error?.statusCode || 500),
    retryCount: Number(retryCount || 0),
    deadLettered: Boolean(deadLettered),
    feedback,
  };
}

module.exports = {
  PASSWORD_HINT,
  feedbackFromError,
  feedbackToResultJson,
};
