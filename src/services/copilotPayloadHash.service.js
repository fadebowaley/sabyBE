const crypto = require('crypto');

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
};

const normalizePayloadForHashing = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const clean = { ...payload };
  delete clean.idempotencyKey;
  delete clean.approvalToken;
  delete clean.lockKey;
  delete clean.correlationId;
  return clean;
};

const hashPayload = (payload) =>
  crypto
    .createHash('sha256')
    .update(stableStringify(normalizePayloadForHashing(payload) || {}))
    .digest('hex');

module.exports = {
  stableStringify,
  hashPayload,
};
