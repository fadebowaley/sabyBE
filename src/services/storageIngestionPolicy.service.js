const { StorageSettings } = require('../models');

const normalizeArray = (value) =>
  Array.isArray(value) ? value.filter(Boolean).map(String) : [];

const includesMatch = (candidates, target, { caseInsensitive = true } = {}) => {
  if (!candidates.length) return false;
  if (!target) return false;
  const normalizedTarget = caseInsensitive ? String(target).toLowerCase() : String(target);
  return candidates.some((candidate) => {
    const normalizedCandidate = caseInsensitive
      ? String(candidate).toLowerCase()
      : String(candidate);
    return normalizedTarget === normalizedCandidate;
  });
};

const matchesPrefix = (prefixes, value) => {
  if (!prefixes.length || !value) return false;
  const target = String(value).toLowerCase();
  return prefixes.some((prefix) => target.startsWith(String(prefix).toLowerCase()));
};

const matchesPattern = (patterns, value) => {
  if (!patterns.length || !value) return false;
  const target = String(value).toLowerCase();
  return patterns.some((pattern) => target.includes(String(pattern).toLowerCase()));
};

const matchesIngestionRule = (rule = {}, file = {}, context = {}) => {
  if (!rule?.enabled) return false;
  const match = rule.match || {};
  const hasCriteria = Object.values(match).some((value) => Array.isArray(value) && value.length);
  if (!hasCriteria) return false;

  const mimeTypes = normalizeArray(match.mimeTypes);
  const extensions = normalizeArray(match.extensions);
  const pathPrefixes = normalizeArray(match.pathPrefixes);
  const namePatterns = normalizeArray(match.namePatterns);
  const ownerTypes = normalizeArray(match.ownerTypes);
  const sourceTypes = normalizeArray(match.sourceTypes);

  return (
    (mimeTypes.length ? includesMatch(mimeTypes, file.mimeType) : true) &&
    (extensions.length ? includesMatch(extensions, file.fileExtension) : true) &&
    (pathPrefixes.length ? matchesPrefix(pathPrefixes, file.storagePath) : true) &&
    (namePatterns.length ? matchesPattern(namePatterns, file.originalName) : true) &&
    (ownerTypes.length ? includesMatch(ownerTypes, context.ownerType) : true) &&
    (sourceTypes.length ? includesMatch(sourceTypes, context.sourceType) : true)
  );
};

const isTextIngestible = (file = {}) => {
  const mimeType = String(file.mimeType || '').toLowerCase();
  const extension = String(file.fileExtension || '').toLowerCase();

  return (
    mimeType.startsWith('text/') ||
    [
      'application/pdf',
      'application/json',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ].includes(mimeType) ||
    ['.txt', '.md', '.pdf', '.json', '.csv', '.doc', '.docx', '.xls', '.xlsx'].includes(extension)
  );
};

const resolveIngestionDecision = async ({
  tenantId,
  uploadInput = {},
  file = {},
  ownerType = 'user',
  sourceType = 'manual_upload',
}) => {
  const explicitMode = uploadInput?.ingestionMode;
  if (explicitMode) {
    return {
      mode: explicitMode,
      shouldQueue: explicitMode !== 'off' && isTextIngestible(file),
      reason: 'upload_parameter',
    };
  }

  const settings = await StorageSettings.findOne({ tenantId });
  const policy = settings?.ingestionPolicy || {};
  const rules = Array.isArray(policy.rules) ? policy.rules : [];

  for (const rule of rules) {
    if (matchesIngestionRule(rule, file, { ownerType, sourceType })) {
      return {
        mode: rule.mode || 'auto',
        shouldQueue: rule.mode !== 'off' && isTextIngestible(file),
        reason: `matched_rule:${rule.name}`,
      };
    }
  }

  const defaultMode = policy.defaultMode || 'off';
  return {
    mode: defaultMode,
    shouldQueue: defaultMode !== 'off' && isTextIngestible(file),
    reason: 'tenant_default',
  };
};

module.exports = {
  resolveIngestionDecision,
  matchesIngestionRule,
  isTextIngestible,
};
