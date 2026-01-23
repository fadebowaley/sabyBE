// submission.client.js
const axios = require('axios');
const { logAudit } = require('./auditLogger');

// Constants & ENV
const { EMAIL_INGESTION_API_KEY } = process.env;
const BASE_URL =
  process.env.SUBMISSION_API_BASE_URL || 'http://127.0.0.1:4000/v1';
const TIMEOUT_MS = process.env.SUBMISSION_API_TIMEOUT_MS || 10000; // 10s default
const MAX_RETRIES = process.env.SUBMISSION_API_MAX_RETRIES || 3;

if (!BASE_URL) {
  throw new Error('SUBMISSION_API_BASE_URL env var must be defined');
}

// Create a dedicated axios instance so global axios config is not affected
const client = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': EMAIL_INGESTION_API_KEY,
  },
});

/**
 * POST submission payload with basic retry logic (exponential back-off).
 * @param {object} data
 */
const submitDataFromEmail = async (data) => {
  const endpoint = '/api-submit';
  let attempt = 0;
  let backoff = 500; // start 0.5s

  while (attempt < MAX_RETRIES) {
    try {
      const res = await client.post(endpoint, data);
      logAudit('submission-success', {
        tenant: data.tenantId,
        formId: data.formId,
        status: res.status,
      });
      return res.data;
    } catch (err) {
      attempt += 1;
      const status = err?.response?.status;
      const errMsg = err?.response?.data || err.message;

      logAudit('submission-attempt-failed', {
        tenant: data.tenantId,
        attempt,
        status,
        error: errMsg,
      });

      if (attempt >= MAX_RETRIES || (status && status >= 400 && status < 500)) {
        // Do not retry on client errors or if max retries reached
        logAudit('submission-failed', { tenant: data.tenantId, error: errMsg });
        throw err;
      }

      // Back-off before next attempt
      await new Promise((resolve) => setTimeout(resolve, backoff));
      backoff *= 2; // exponential
    }
  }
};

module.exports = { submitDataFromEmail };
