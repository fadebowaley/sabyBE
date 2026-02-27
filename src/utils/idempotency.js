const crypto = require('crypto');

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sortObjectDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortObjectDeep);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObjectDeep(value[key]);
      return acc;
    }, {});
};

const stableStringify = (value) => JSON.stringify(sortObjectDeep(value));

const hashPayload = (payload) =>
  crypto.createHash('sha256').update(stableStringify(payload || {})).digest('hex');

const buildDeterministicIdempotencyKey = ({
  tenant_id,
  project_id,
  form_id,
  node_id,
  event_date,
  submitter_id,
  payload,
}) => {
  const payloadHash = hashPayload(payload);
  const raw = [
    tenant_id || '',
    project_id || '',
    form_id || '',
    node_id || '',
    event_date || '',
    submitter_id || '',
    payloadHash,
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
};

module.exports = {
  stableStringify,
  hashPayload,
  buildDeterministicIdempotencyKey,
};

