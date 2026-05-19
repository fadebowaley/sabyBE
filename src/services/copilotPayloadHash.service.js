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

const hashPayload = (payload) =>
  crypto
    .createHash('sha256')
    .update(stableStringify(payload || {}))
    .digest('hex');

module.exports = {
  stableStringify,
  hashPayload,
};
