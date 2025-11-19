const {
  userService,
  projectFormService,
  authService,
  tokenService,
  nodeService,
  tenantConfigService,
  customFieldService,
} = require('../../../services');
const whatsappValidationService = require('../services/whatsappValidation.service');
const whatsappNotificationService = require('../services/whatsappNotification.service');
const formHandler = require('./formHandler');
const logger = require('../../../config/logger');

const { validateCustomFields } = customFieldService;

const AFFIRMATIVE_RESPONSES = [
  'yes',
  'y',
  'confirm',
  'ok',
  'okay',
  'yeah',
  'sure',
  '✅',
  '👍',
];
const NEGATIVE_RESPONSES = ['no', 'n', 'cancel', 'not now', 'nope', '❌', '👎'];

const MAX_PASSCODE_ATTEMPTS = 3;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;
const RECENT_PASSCODE_WINDOW_MS = 5 * 60 * 1000;

const WHATSAPP_INTEGRATION_KEY = 'whatsapp';

const BASE_PROFILE_UPDATE_FIELDS = [
  {
    key: 'firstname',
    label: 'First Name',
    description: 'Given name',
    path: ['firstname'],
    type: 'text',
    minLength: 2,
    maxLength: 50,
    aliases: ['first', 'first name'],
  },
  {
    key: 'lastname',
    label: 'Last Name',
    description: 'Surname / family name',
    path: ['lastname'],
    type: 'text',
    minLength: 2,
    maxLength: 50,
    aliases: ['last', 'last name', 'surname'],
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Primary email address',
    path: ['email'],
    type: 'email',
    aliases: ['mail', 'email address'],
  },
  {
    key: 'phoneNumber',
    label: 'Phone Number',
    description: 'Mobile phone with country code',
    path: ['phoneNumber'],
    type: 'phone',
    aliases: ['phone', 'mobile'],
  },
];

const BASE_NODE_UPDATE_FIELDS = [
  {
    key: 'name',
    label: 'Unit Name',
    description: 'Official name of the unit',
    path: ['name'],
    type: 'text',
    minLength: 2,
    maxLength: 160,
  },
  {
    key: 'address',
    label: 'Address',
    description: 'Street address',
    path: ['address'],
    type: 'text',
    maxLength: 240,
  },
  {
    key: 'city',
    label: 'City',
    description: 'City where the unit is located',
    path: ['city'],
    type: 'text',
    maxLength: 120,
  },
  {
    key: 'state',
    label: 'State / Region',
    description: 'State or region',
    path: ['state'],
    type: 'text',
    maxLength: 120,
    aliases: ['state of residence', 'region'],
  },
  {
    key: 'country',
    label: 'Country',
    description: 'Country of operation',
    path: ['country'],
    type: 'text',
    maxLength: 120,
  },
  {
    key: 'postalCode',
    label: 'Postal Code',
    description: 'ZIP or postal code',
    path: ['postalCode'],
    type: 'text',
    maxLength: 20,
    aliases: ['zip'],
  },
  {
    key: 'isMain',
    label: 'Primary Unit',
    description: 'yes / no',
    path: ['isMain'],
    type: 'boolean',
    aliases: ['main', 'primary'],
  },
  {
    key: 'isActive',
    label: 'Active Status',
    description: 'yes / no',
    path: ['isActive'],
    type: 'boolean',
    aliases: ['active'],
  },
  {
    key: 'dateOfEstablishment',
    label: 'Date Established',
    description: 'Format: YYYY-MM-DD',
    path: ['profile', 'dateOfEstablishment'],
    type: 'date',
    aliases: ['established', 'establishment date'],
  },
  {
    key: 'propertyStatus',
    label: 'Property Status',
    description: 'Owned, Rented, Leased, Other',
    path: ['profile', 'propertyStatus'],
    type: 'enum',
    options: ['Owned', 'Rented', 'Leased', 'Other'],
  },
  {
    key: 'estimatedValue',
    label: 'Estimated Value',
    description: 'Estimated property value',
    path: ['profile', 'estimatedValue'],
    type: 'number',
    min: 0,
    aliases: ['value'],
  },
  {
    key: 'buildingType',
    label: 'Building Type',
    description: 'Facility/building type',
    path: ['profile', 'buildingType'],
    type: 'text',
    maxLength: 120,
  },
  {
    key: 'facilityStatus',
    label: 'Facility Status',
    description: 'Active, Inactive, Under Construction',
    path: ['profile', 'facilityStatus'],
    type: 'enum',
    options: ['Active', 'Inactive', 'Under Construction'],
    aliases: ['status'],
  },
];

function normalizeFieldKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Fetch user nodes and store in session metadata
 */
async function preloadUserNodes(session) {
  try {
    const nodes = await userService.getUserNodes(session.userId);
    session.metadata = session.metadata || {};
    session.metadata.nodesCache = nodes.map((node) => ({
      id: node._id?.toString?.() || node.id,
      nodeId: node.nodeId,
      name: node.name,
      city: node.city,
      state: node.state,
      country: node.country,
      isMain: node.isMain,
      levelName: node.level?.name,
      structureName: node.structure?.name,
      customFields: node.customFields || {},
      customFieldsVersion: node.customFieldsVersion || 0,
    }));
    session.markModified('metadata');
    await session.save();
  } catch (error) {
    logger.error(
      `❌ Failed to preload nodes for user ${session.userId}:`,
      error.message
    );
  }
}
function buildFieldLookup(fields) {
  const map = new Map();
  fields.forEach((field) => {
    const keys = new Set([field.key, field.label, ...(field.aliases || [])]);
    keys.forEach((entry) => {
      if (!entry) {
        return;
      }
      map.set(normalizeFieldKey(entry), field);
    });
  });
  return map;
}

const SUPPORTED_CUSTOM_FIELD_TYPES = new Set([
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
  'multi-select',
]);

function mapCustomFieldToPrompt(field) {
  if (!field || !field.id) {
    return null;
  }
  const type = (field.type || 'text').toLowerCase();
  if (!SUPPORTED_CUSTOM_FIELD_TYPES.has(type)) {
    return null;
  }

  const prompt = {
    key: field.id,
    label: field.label || field.id,
    description: field.description || field.placeholder || 'Custom field',
    path: ['customFields', field.id],
    type: 'text',
    aliases: [],
    isCustomField: true,
    customFieldId: field.id,
    validation: field.validation || {},
    required: Boolean(field.required),
  };

  switch (type) {
    case 'number':
      prompt.type = 'number';
      if (field.validation?.min !== undefined) {
        prompt.min = field.validation.min;
      }
      if (field.validation?.max !== undefined) {
        prompt.max = field.validation.max;
      }
      break;
    case 'date':
      prompt.type = 'date';
      break;
    case 'boolean':
      prompt.type = 'boolean';
      break;
    case 'select':
      prompt.type = 'enum';
      prompt.options = (field.options || [])
        .map((option) =>
          option && option.value !== undefined ? option.value : option?.label
        )
        .filter((value) => value !== undefined);
      break;
    case 'multi-select':
      prompt.type = 'checkbox';
      prompt.multiple = true;
      prompt.options = (field.options || [])
        .map((option) =>
          option && option.value !== undefined ? option.value : option?.label
        )
        .filter((value) => value !== undefined);
      break;
    default:
      prompt.type = 'text';
      if (field.validation?.minLength !== undefined) {
        prompt.minLength = field.validation.minLength;
      }
      if (field.validation?.maxLength !== undefined) {
        prompt.maxLength = field.validation.maxLength;
      }
  }

  return prompt;
}

function buildCustomFieldPrompts(config) {
  if (!config || !Array.isArray(config.fields) || !config.fields.length) {
    return [];
  }
  return config.fields
    .map((field) => mapCustomFieldToPrompt(field))
    .filter(Boolean);
}

function getTenantConfigFromSession(session, entityType) {
  return session?.metadata?.tenantConfigs?.[entityType] || null;
}

function getProfileUpdateFields(session) {
  return [
    ...BASE_PROFILE_UPDATE_FIELDS,
    ...buildCustomFieldPrompts(getTenantConfigFromSession(session, 'user')),
  ];
}

function getNodeUpdateFields(session) {
  return [
    ...BASE_NODE_UPDATE_FIELDS,
    ...buildCustomFieldPrompts(getTenantConfigFromSession(session, 'node')),
  ];
}

function getProfileFieldLookup(session) {
  return buildFieldLookup(getProfileUpdateFields(session));
}

function getNodeFieldLookup(session) {
  return buildFieldLookup(getNodeUpdateFields(session));
}

async function ensureTenantConfigs(session, tenantIdParam = null) {
  session.metadata = session.metadata || {};
  const tenantId =
    tenantIdParam ||
    session.tenantId ||
    session.metadata?.profileSnapshot?.tenantId;

  if (!tenantId) {
    return null;
  }

  session.metadata.tenantConfigs = session.metadata.tenantConfigs || {};
  const cache = session.metadata.tenantConfigs;
  let changed = false;

  if (!cache.user || cache.user.tenantId !== tenantId) {
    cache.user =
      (await tenantConfigService.getTenantConfig(tenantId, 'user')) ||
      tenantConfigService.buildFallbackConfig(tenantId, 'user');
    changed = true;
  }

  if (!cache.node || cache.node.tenantId !== tenantId) {
    cache.node =
      (await tenantConfigService.getTenantConfig(tenantId, 'node')) ||
      tenantConfigService.buildFallbackConfig(tenantId, 'node');
    changed = true;
  }

  if (changed) {
    session.markModified('metadata');
    await session.save();
  }

  return cache;
}

const KEY_VALUE_SEPARATOR_REGEX = /[:=|-]/;

function splitPayloadLines(input = '') {
  return input
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseKeyValueLines(input = '') {
  return splitPayloadLines(input).map((line) => {
    const separatorMatch = line.match(KEY_VALUE_SEPARATOR_REGEX);
    if (!separatorMatch) {
      return {
        raw: line,
        key: null,
        value: line,
      };
    }
    const idx = separatorMatch.index;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    return {
      raw: line,
      key,
      value,
    };
  });
}

function applyValueToPath(target, path, value) {
  if (!Array.isArray(path) || path.length === 0) {
    return;
  }
  let current = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    if (
      current[segment] === undefined ||
      current[segment] === null ||
      typeof current[segment] !== 'object'
    ) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[path[path.length - 1]] = value;
}

function normalizeEnumValue(options = [], rawValue = '') {
  if (!Array.isArray(options) || options.length === 0) {
    return { value: rawValue, matched: true };
  }
  const lowerRaw = rawValue.trim().toLowerCase();
  const match = options.find(
    (option) => option.toString().toLowerCase() === lowerRaw
  );
  if (match) {
    return { value: match, matched: true };
  }
  return { value: rawValue, matched: false };
}

function coerceFieldValue(fieldConfig, rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return {
      success: false,
      error: 'Value is required',
    };
  }

  const trimmedValue =
    typeof rawValue === 'string' ? rawValue.trim() : rawValue;

  switch (fieldConfig.type) {
    case 'boolean': {
      const normalized = trimmedValue.toString().toLowerCase();
      if (['yes', 'true', '1', 'y', 'on'].includes(normalized)) {
        return { success: true, value: true, display: 'Yes' };
      }
      if (['no', 'false', '0', 'n', 'off'].includes(normalized)) {
        return { success: true, value: false, display: 'No' };
      }
      return { success: false, error: 'Expected yes/no value' };
    }
    case 'enum': {
      const { value, matched } = normalizeEnumValue(
        fieldConfig.options || [],
        trimmedValue
      );
      if (!matched) {
        return {
          success: false,
          error: `Value must be one of: ${(fieldConfig.options || []).join(
            ', '
          )}`,
        };
      }
      return { success: true, value, display: value };
    }
    case 'checkbox': {
      const rawValues = Array.isArray(trimmedValue)
        ? trimmedValue
        : trimmedValue.split(',').map((val) => val.trim());
      const values = rawValues.filter((val) => val.length > 0);
      if (!values.length) {
        return {
          success: false,
          error: 'Provide at least one value (comma separated).',
        };
      }
      const allowedOptions = fieldConfig.options || [];
      const normalizedValues = values.map((val) => {
        if (!allowedOptions.length) {
          return val;
        }
        const match = allowedOptions.find(
          (option) =>
            option?.toString().toLowerCase() === val.toString().toLowerCase()
        );
        return match !== undefined ? match : val;
      });

      if (allowedOptions.length) {
        const invalid = normalizedValues.filter(
          (val) => !allowedOptions.includes(val)
        );
        if (invalid.length) {
          return {
            success: false,
            error: `Invalid option(s): ${invalid.join(', ')}`,
          };
        }
      }

      return {
        success: true,
        value: normalizedValues,
        display: normalizedValues.join(', '),
      };
    }
    default: {
      const validatorElement = {
        type: fieldConfig.type,
        properties: {},
      };
      if (fieldConfig.minLength !== undefined) {
        validatorElement.properties.minLength = fieldConfig.minLength;
      }
      if (fieldConfig.maxLength !== undefined) {
        validatorElement.properties.maxLength = fieldConfig.maxLength;
      }
      if (fieldConfig.min !== undefined) {
        validatorElement.properties.min = fieldConfig.min;
      }
      if (fieldConfig.max !== undefined) {
        validatorElement.properties.max = fieldConfig.max;
      }
      if (fieldConfig.options) {
        validatorElement.properties.options = fieldConfig.options;
      }
      const validationResult = whatsappValidationService.validateFieldValue(
        trimmedValue,
        validatorElement
      );
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error || 'Invalid value',
        };
      }

      let displayValue = validationResult.value;
      if (fieldConfig.type === 'date' && validationResult.value) {
        const iso = new Date(validationResult.value).toISOString();
        displayValue = iso.slice(0, 10);
      }

      return {
        success: true,
        value: validationResult.value,
        display: displayValue,
      };
    }
  }
}

function buildBulkUpdatePayload(input, fieldLookup) {
  const lines = parseKeyValueLines(input);
  const updates = {};
  const applied = [];
  const errors = [];
  const unknown = [];
  const seenKeys = new Set();

  lines.forEach(({ raw, key, value }) => {
    if (!key) {
      unknown.push({ raw, reason: 'Missing field name' });
      return;
    }
    const fieldConfig = fieldLookup.get(normalizeFieldKey(key));
    if (!fieldConfig) {
      unknown.push({ raw, field: key });
      return;
    }

    const result = coerceFieldValue(fieldConfig, value);
    if (!result.success) {
      errors.push({
        field: fieldConfig.key,
        label: fieldConfig.label,
        value,
        error: result.error,
      });
      return;
    }

    applyValueToPath(updates, fieldConfig.path, result.value);
    applied.push({
      field: fieldConfig.key,
      label: fieldConfig.label,
      value: result.value,
      display: result.display,
      path: fieldConfig.path,
      raw,
      isCustomField: Boolean(fieldConfig.isCustomField),
      customFieldId: fieldConfig.customFieldId,
      entityType: fieldConfig.entityType,
    });
    seenKeys.add(fieldConfig.key);
  });

  return {
    updates,
    applied,
    errors,
    unknown,
    processedKeys: Array.from(seenKeys),
  };
}

function setDocumentPath(doc, path, value) {
  if (!Array.isArray(path) || path.length === 0) {
    return;
  }
  let current = doc;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    if (
      current[segment] === undefined ||
      current[segment] === null ||
      typeof current[segment] !== 'object'
    ) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[path[path.length - 1]] = value;
}

async function markUserVerified(userId) {
  if (!userId) {
    return;
  }

  try {
    const user = await userService.getUserById(userId);
    if (!user) {
      logger.warn(`⚠️ Unable to mark verification; user not found (${userId})`);
      return;
    }

    user.isEmailVerified = true;
    user.isPhoneVerified = true;
    user.status = true;
    user.otpVerified = true;

    await user.save();
  } catch (error) {
    logger.error(
      `❌ Failed to mark user verified (${userId}):`,
      error?.message || error
    );
  }
}

function hasRecentPasscodeValidation(session) {
  if (!session?.metadata?.lastPasscodeVerifiedAt) {
    return false;
  }
  const lastVerified =
    session.metadata.lastPasscodeVerifiedAt instanceof Date
      ? session.metadata.lastPasscodeVerifiedAt
      : new Date(session.metadata.lastPasscodeVerifiedAt);
  if (Number.isNaN(lastVerified.getTime())) {
    return false;
  }
  return Date.now() - lastVerified.getTime() <= RECENT_PASSCODE_WINDOW_MS;
}

function isAccountFullyVerified(userDoc = {}, session = null) {
  const emailVerified =
    userDoc?.isEmailVerified ??
    session?.metadata?.profileSnapshot?.isEmailVerified ??
    session?.metadata?.profileSnapshot?.emailVerified ??
    false;
  const phoneVerified =
    userDoc?.isPhoneVerified ??
    session?.metadata?.profileSnapshot?.isPhoneVerified ??
    session?.metadata?.profileSnapshot?.phoneVerified ??
    false;
  return Boolean(emailVerified && phoneVerified);
}

async function applyProfileBulkUpdates(session, appliedItems) {
  const user = await userService.getUserById(session.userId);
  if (!user) {
    throw new Error('User not found for profile update');
  }
  const modifiedRoots = new Set();
  const customFieldUpdates = {};
  appliedItems.forEach((item) => {
    if (item.isCustomField && item.customFieldId) {
      customFieldUpdates[item.customFieldId] = item.value;
    } else if (item.path) {
      setDocumentPath(user, item.path, item.value);
      modifiedRoots.add(item.path[0]);
    }
  });

  if (Object.keys(customFieldUpdates).length) {
    const mergedCustomFields = {
      ...(user.customFields || {}),
      ...customFieldUpdates,
    };
    const { values, version } = await validateCustomFields({
      tenantId: user.tenantId,
      entityType: 'user',
      payload: mergedCustomFields,
    });
    user.customFields = values;
    user.customFieldsVersion = version;
    modifiedRoots.add('customFields');
    modifiedRoots.add('customFieldsVersion');
  }

  modifiedRoots.forEach((root) => user.markModified(root));
  await user.save();
  return {
    customFields: user.customFields || {},
    customFieldsVersion: user.customFieldsVersion || 0,
  };
}

async function applyNodeBulkUpdates(nodeId, appliedItems) {
  const node = await nodeService.getNodeById(nodeId);
  if (!node) {
    throw new Error('Node not found for update');
  }
  const modifiedRoots = new Set();
  const customFieldUpdates = {};
  appliedItems.forEach((item) => {
    if (item.isCustomField && item.customFieldId) {
      customFieldUpdates[item.customFieldId] = item.value;
    } else if (item.path) {
      setDocumentPath(node, item.path, item.value);
      modifiedRoots.add(item.path[0]);
    }
  });

  if (Object.keys(customFieldUpdates).length) {
    const mergedCustomFields = {
      ...(node.customFields || {}),
      ...customFieldUpdates,
    };
    const { values, version } = await validateCustomFields({
      tenantId: node.tenantId,
      entityType: 'node',
      payload: mergedCustomFields,
    });
    node.customFields = values;
    node.customFieldsVersion = version;
    modifiedRoots.add('customFields');
    modifiedRoots.add('customFieldsVersion');
  }

  modifiedRoots.forEach((root) => node.markModified(root));
  await node.save();
  return typeof node.toObject === 'function' ? node.toObject() : node;
}

async function processProfileBulkUpdate(phoneNumber, session, input) {
  await ensureTenantConfigs(session);
  const profileFieldLookup = getProfileFieldLookup(session);
  const result = buildBulkUpdatePayload(input, profileFieldLookup);

  logger.info('📝 Processing profile bulk update', {
    phoneNumber,
    sessionId: session._id?.toString?.(),
    userId: session.userId?.toString?.(),
    rawInput: input,
    appliedCount: result.applied.length,
    errorCount: result.errors.length,
    unknownCount: result.unknown.length,
  });

  if (
    result.applied.length === 0 &&
    result.errors.length === 0 &&
    result.unknown.length === 0
  ) {
    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'No recognized profile fields detected. Use the format "field: value".'
    );
    return;
  }

  let updatedCustomState = null;
  if (result.applied.length > 0) {
    updatedCustomState = await applyProfileBulkUpdates(session, result.applied);
    result.applied.forEach((item) => {
      if (item.isCustomField && item.customFieldId) {
        session.metadata.profileSnapshot =
          session.metadata.profileSnapshot || {};
        session.metadata.profileSnapshot.customFields =
          session.metadata.profileSnapshot.customFields || {};
        session.metadata.profileSnapshot.customFields[item.customFieldId] =
          item.value;
      } else {
        updateProfileSnapshot(session, item.field, item.value, item.path);
      }
    });
    if (updatedCustomState) {
      session.metadata.profileSnapshot = session.metadata.profileSnapshot || {};
      session.metadata.profileSnapshot.customFields =
        updatedCustomState.customFields || {};
      session.metadata.profileSnapshot.customFieldsVersion =
        updatedCustomState.customFieldsVersion || 0;
    }
    session.markModified('metadata');
    await session.save();
  }

  await whatsappNotificationService.sendProfileBulkResult(phoneNumber, result);
}

async function processNodeBulkUpdate(phoneNumber, session, input) {
  const state = session.metadata.nodeUpdate || {};
  const selectedNode = session.metadata?.selectedNode;
  if (!selectedNode || !selectedNode.id) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Please select a unit before sending updates.'
    );
    return;
  }

  await ensureTenantConfigs(session);
  const nodeFieldLookup = getNodeFieldLookup(session);
  const result = buildBulkUpdatePayload(input, nodeFieldLookup);

  logger.info('🏗️ Processing node bulk update', {
    phoneNumber,
    sessionId: session._id?.toString?.(),
    userId: session.userId?.toString?.(),
    nodeId: selectedNode.id,
    rawInput: input,
    appliedCount: result.applied.length,
    errorCount: result.errors.length,
    unknownCount: result.unknown.length,
  });

  if (
    result.applied.length === 0 &&
    result.errors.length === 0 &&
    result.unknown.length === 0
  ) {
    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'No recognizable unit fields found. Use the format "field: value".'
    );
    return;
  }

  if (result.applied.length > 0) {
    const updatedNode = await applyNodeBulkUpdates(
      selectedNode.id,
      result.applied
    );
    const plainNode =
      typeof updatedNode.toObject === 'function'
        ? updatedNode.toObject()
        : updatedNode;
    if (!plainNode.id && plainNode._id) {
      plainNode.id =
        typeof plainNode._id.toString === 'function'
          ? plainNode._id.toString()
          : plainNode._id;
    }
    session.metadata.selectedNode = plainNode;
    if (session.metadata.nodeUpdate) {
      session.metadata.nodeUpdate.selectedNode = plainNode;
    }
    session.markModified('metadata');
    await session.save();
  }

  await whatsappNotificationService.sendNodeBulkResult(
    phoneNumber,
    session.metadata?.selectedNode ||
      (state.selectedNode
        ? state.selectedNode
        : typeof selectedNode === 'object'
        ? selectedNode
        : null),
    result
  );
}

function isAffirmativeResponse(text = '') {
  const value = text.trim().toLowerCase();
  return AFFIRMATIVE_RESPONSES.includes(value);
}

function isNegativeResponse(text = '') {
  const value = text.trim().toLowerCase();
  return NEGATIVE_RESPONSES.includes(value);
}

function maskEmail(email = '') {
  if (!email) return 'your email';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal =
    local.length <= 2
      ? `${local[0] || ''}***`
      : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

function getSessionPhoneDigits(session) {
  const raw =
    session?.metadata?.phoneDigits ||
    session?.metadata?.profileSnapshot?.phoneNumber ||
    session?.metadata?.phoneNumber ||
    '';
  return typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
}

function describePhoneDestination(session) {
  const digits = getSessionPhoneDigits(session);
  if (!digits) {
    return null;
  }
  const last4 = digits.slice(-4);
  return last4 ? `phone ending ${last4}` : null;
}

function describeOtpDestinations(session, delivery = {}) {
  const { email, channels = [] } = delivery || {};
  const parts = [];

  if (channels.includes('email') && email) {
    parts.push(`email ${maskEmail(email)}`);
  }

  if (channels.includes('sms')) {
    const phonePart = describePhoneDestination(session);
    parts.push(phonePart || 'your registered phone');
  }

  if (parts.length === 0) {
    const fallbackEmail =
      email ||
      getLoginEmail(session) ||
      session?.metadata?.profileSnapshot?.email ||
      null;
    if (fallbackEmail) {
      return `email ${maskEmail(fallbackEmail)}`;
    }
    const phonePart = describePhoneDestination(session);
    if (phonePart) {
      return phonePart;
    }
    return 'your registered contact details';
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function getLoginEmail(session) {
  return (
    session?.metadata?.loginEmail ||
    session?.metadata?.userEmail ||
    session?.metadata?.profileSnapshot?.email ||
    null
  );
}

function derivePasscodeFromPhone(phone = '') {
  if (!phone) {
    return null;
  }
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  const tail = digits.slice(-6);
  return tail.padStart(6, '0');
}

function ensureLoginStage(session, stage = 'password') {
  session.metadata = session.metadata || {};
  session.metadata.loginStage = stage;
}

async function promptForCurrentStage(phoneNumber, session) {
  const stage = session.metadata?.loginStage || 'password';
  switch (stage) {
    case 'otp': {
      const email = getLoginEmail(session);
      await whatsappNotificationService.sendOtpVerificationPrompt(
        phoneNumber,
        maskEmail(email)
      );
      break;
    }
    case 'passcode': {
      const phoneDigits =
        session.metadata?.phoneDigits ||
        session.metadata?.profileSnapshot?.phoneNumber ||
        '';
      await whatsappNotificationService.sendPasscodePrompt(
        phoneNumber,
        phoneDigits
      );
      break;
    }
    case 'password':
    default: {
      await whatsappNotificationService.sendLoginPrompt(
        phoneNumber,
        getLoginEmail(session)
      );
      break;
    }
  }
}

async function performLogout(phoneNumber, session, { reason } = {}) {
  session.metadata = session.metadata || {};
  session.metadata.authTokens = null;
  session.metadata.isLoggedIn = false;
  session.metadata.sessionLocked = true;
  session.metadata.loginStage = 'password';
  session.metadata.pendingUserId = null;
  session.metadata.pendingTokens = null;
  session.metadata.pendingEmail = null;
  session.metadata.pendingOtp = false;
  session.metadata.mustValidatePasscode = false;
  session.metadata.passcodeAttempts = 0;
  session.metadata.forceReloginAfter = null;
  session.metadata.lastLoginAt = null;
  session.status = 'awaiting_login';
  session.markModified('metadata');
  await session.save();

  if (reason === 'expired') {
    await whatsappNotificationService.sendSessionExpired(phoneNumber);
  } else {
    await whatsappNotificationService.sendLogoutSuccess(phoneNumber);
  }
}

function normalizeIntegrationValue(value) {
  return String(value).trim().toLowerCase();
}

function extractIntegrations(metadata) {
  if (!metadata) {
    return [];
  }

  if (typeof metadata.get === 'function') {
    const mapValue = metadata.get('integrations');
    if (Array.isArray(mapValue)) {
      return mapValue.map((value) => normalizeIntegrationValue(value));
    }
  }

  const { integrations } = metadata;
  if (Array.isArray(integrations)) {
    return integrations.map((value) => normalizeIntegrationValue(value));
  }

  return [];
}

function projectSupportsIntegration(
  project,
  integrationKey = WHATSAPP_INTEGRATION_KEY
) {
  const normalizedKey = normalizeIntegrationValue(integrationKey);
  const allowValues = new Set([normalizedKey, 'all', 'any', 'global']);

  const { metadata: projectMetadata } = project || {};
  let resolvedMetadata = projectMetadata;
  if (!resolvedMetadata && typeof project?.get === 'function') {
    resolvedMetadata = project.get('metadata');
  }

  const integrations = extractIntegrations(resolvedMetadata);
  return integrations.some((value) => allowValues.has(value));
}

function normalizeLabel(label = '') {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripWrappingQuotes(value) {
  if (typeof value !== 'string') {
    return value;
  }

  let trimmed = value.trim();
  const quotePairs = [
    ['"', '"'],
    ["'", "'"],
    ['"', '"'],
    ['"', '"'],
  ];

  quotePairs.forEach(([open, close]) => {
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
      trimmed = trimmed.slice(open.length, -close.length).trim();
    }
  });

  return trimmed;
}

function formatNodeDisplay(node = {}) {
  const parts = [];
  if (node.name) {
    parts.push(node.name);
  } else if (node.nodeId) {
    parts.push(node.nodeId);
  }

  const location = [node.city, node.state, node.country]
    .filter(Boolean)
    .join(', ');

  if (location) {
    parts.push(location);
  }

  return parts.filter(Boolean).join(' • ') || 'Unit';
}

async function promptForLogin(
  phoneNumber,
  session,
  { resetAttempts = false } = {}
) {
  session.metadata = session.metadata || {};
  if (resetAttempts) {
    session.metadata.passcodeAttempts = 0;
  }
  session.metadata.sessionLocked = true;
  session.metadata.isLoggedIn = false;
  session.metadata.lastPasscodePromptAt = new Date();
  session.status = 'awaiting_login';
  session.metadata.loginStage = 'password';
  if (resetAttempts) {
    session.metadata.authTokens = null;
    session.metadata.pendingTokens = null;
  }
  session.markModified('metadata');
  await session.save();

  await whatsappNotificationService.sendLoginPrompt(
    phoneNumber,
    getLoginEmail(session)
  );
}

async function finalizeLogin(
  phoneNumber,
  session,
  user,
  tokens,
  { method = 'passcode' } = {}
) {
  session.metadata = session.metadata || {};

  logger.info('🎯 finalizeLogin invoked', {
    phoneNumber,
    userId: user?._id?.toString?.() || null,
    method,
    hasAccessToken: !!tokens?.access?.token,
    hasRefreshToken: !!tokens?.refresh?.token,
  });

  const profileSnapshot = buildProfileSnapshot(user);
  session.metadata.profileSnapshot = profileSnapshot;
  session.metadata.userEmail =
    profileSnapshot.email || session.metadata.userEmail;
  session.metadata.userName =
    profileSnapshot.displayName || session.metadata.userName;
  session.metadata.loginEmail =
    profileSnapshot.email || session.metadata.loginEmail;
  session.metadata.isLoggedIn = true;
  session.metadata.sessionLocked = false;
  session.metadata.passcodeAttempts = 0;
  session.metadata.pendingOtp = false;
  session.metadata.lastLoginAt = new Date();
  session.metadata.accountVerifiedAt = new Date();
  session.metadata.lastAuthMethod = method;
  session.metadata.loginStage = 'complete';
  session.metadata.mustValidatePasscode = false;
  session.metadata.forceReloginAfter = new Date(
    Date.now() + SESSION_MAX_AGE_MS
  );
  session.metadata.pendingUserId = null;
  session.metadata.pendingTokens = null;
  session.metadata.pendingEmail = null;
  if (tokens) {
    session.metadata.authTokens = {
      access: tokens.access?.token,
      refresh: tokens.refresh?.token,
      expires: tokens.access?.expires,
    };
  }

  const accountVerified = isAccountFullyVerified(user, session);
  if (accountVerified && !session.metadata.lastVerificationConfirmedAt) {
    session.metadata.lastVerificationConfirmedAt = new Date();
  }
  const hasConfirmedOnce = !!session.metadata.lastVerificationConfirmedAt;
  const requiresVerification = !accountVerified && !hasConfirmedOnce;

  session.status = requiresVerification
    ? 'awaiting_verification_confirmation'
    : 'selecting_project';
  session.markModified('metadata');
  await session.save();

  await preloadUserNodes(session);
  await whatsappNotificationService.sendLoginSuccess(phoneNumber, method);
  if (requiresVerification) {
    session.metadata.lastVerificationPromptAt = new Date();
    session.markModified('metadata');
    await session.save();
    await whatsappNotificationService.sendVerificationPrompt(
      phoneNumber,
      profileSnapshot
    );
  } else {
    const userName =
      session.metadata?.userName || profileSnapshot.displayName || 'User';
    await routeToMainMenuAfterLogin(phoneNumber, session, userName);
  }
}

async function finalizePendingLogin(
  phoneNumber,
  session,
  { user, authMethod = 'passcode' } = {}
) {
  session.metadata = session.metadata || {};

  try {
    let resolvedUser = user;

    if (!resolvedUser && session.metadata.pendingUserId) {
      resolvedUser = await userService.getUserById(
        session.metadata.pendingUserId
      );
    }

    if (!resolvedUser) {
      const email = session.metadata.pendingEmail || getLoginEmail(session);
      if (email) {
        resolvedUser = await userService.getUserByEmail(email);
      }
    }

    if (!resolvedUser) {
      throw new Error('Unable to resolve user for pending login');
    }

    let tokens = session.metadata.pendingTokens;
    if (!tokens || !tokens.access || !tokens.refresh) {
      logger.info('🔄 Generating new auth tokens for session', {
        phoneNumber,
        userId: resolvedUser._id?.toString?.() || null,
        hadPendingTokens: !!session.metadata.pendingTokens,
      });
      tokens = await tokenService.generateAuthTokens(resolvedUser);
    }

    logger.info('🚪 Finalizing login', {
      phoneNumber,
      userId: resolvedUser._id?.toString?.() || null,
      authMethod,
      pendingUserId: session.metadata.pendingUserId
        ? session.metadata.pendingUserId.toString()
        : null,
      hasTokens: !!(tokens && tokens.access && tokens.refresh),
    });

    await finalizeLogin(phoneNumber, session, resolvedUser, tokens, {
      method: authMethod,
    });
  } catch (error) {
    logger.error(
      `❌ Failed to finalize login for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'We hit a snag finishing your login. Please try again.'
    );
    throw error;
  }
}

function getExpectedPasscode(session) {
  const phoneDigits =
    session.metadata?.phoneDigits ||
    session.metadata?.profileSnapshot?.phoneNumber ||
    session.metadata?.phoneNumber;
  return derivePasscodeFromPhone(phoneDigits);
}

async function requirePasscode(
  phoneNumber,
  session,
  { reason = 'activity', sendPrompt = true } = {}
) {
  session.metadata = session.metadata || {};

  session.metadata.mustValidatePasscode = true;
  session.metadata.loginStage = 'passcode';
  session.metadata.sessionLocked = false;
  session.metadata.passcodeAttempts = 0;
  session.metadata.passcodeReason = reason;
  session.metadata.phoneDigits =
    session.metadata.phoneDigits ||
    session.metadata.profileSnapshot?.phoneNumber ||
    session.metadata.phoneNumber;
  session.metadata.expectedPasscode =
    session.metadata.expectedPasscode || getExpectedPasscode(session);
  session.metadata.lastPasscodePromptAt = new Date();
  session.markModified('metadata');
  await session.save();

  if (sendPrompt) {
    await whatsappNotificationService.sendPasscodePrompt(
      phoneNumber,
      session.metadata.phoneDigits
    );
  }
}

async function ensureNotExpired(phoneNumber, session) {
  const expiry = session.metadata?.forceReloginAfter;
  if (!expiry) {
    return false;
  }

  const expiresAt = expiry instanceof Date ? expiry : new Date(expiry);
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  if (Date.now() <= expiresAt.getTime()) {
    return false;
  }

  await performLogout(phoneNumber, session, { reason: 'expired' });
  return true;
}

async function handleMidSessionPasscode(phoneNumber, session, input = '') {
  session.metadata = session.metadata || {};

  if (session.status === 'awaiting_login') {
    return false;
  }

  const stage = session.metadata.loginStage || 'complete';
  const requiresValidation =
    session.metadata.mustValidatePasscode || stage === 'passcode';

  if (!requiresValidation) {
    return false;
  }

  await exports.handleLoginChallenge(phoneNumber, session, input);
  return true;
}

async function handleLogout(phoneNumber, session) {
  await performLogout(phoneNumber, session, { reason: 'user_logout' });
}

/**
 * Handle phone number authentication for user
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
exports.handlePhoneAuthentication = async (phoneNumber, session) => {
  try {
    logger.info(`🔐 Processing phone authentication for ${phoneNumber}`);

    // First, get the user by phone number to find their tenant
    const user = await userService.getUserByPhone(phoneNumber);

    if (!user) {
      logger.warn(
        `❌ Phone authentication failed for ${phoneNumber}: User not found`
      );
      await whatsappNotificationService.sendAuthenticationFailure(
        phoneNumber,
        'User not found. Please contact your administrator.'
      );
      return;
    }

    // Use the user's actual tenantId
    const { tenantId } = user;
    logger.info(`🔍 Using user's tenantId: ${tenantId}`);

    // Validate user by phone number with their actual tenant
    const userValidation = await whatsappValidationService.validateUserByPhone(
      phoneNumber,
      tenantId
    );

    if (!userValidation.valid) {
      logger.warn(
        `❌ Phone authentication failed for ${phoneNumber}: ${userValidation.error}`
      );
      await whatsappNotificationService.sendAuthenticationFailure(
        phoneNumber,
        userValidation.error
      );
      return;
    }

    const validatedUser = userValidation.user;

    // Prepare metadata container
    session.metadata = session.metadata || {};

    // Update session basic identity
    session.userId = validatedUser._id;
    session.tenantId = validatedUser.tenantId;
    session.metadata.phoneNumber = phoneNumber;
    session.metadata.userEmail = validatedUser.email;
    session.metadata.userName =
      validatedUser.name ||
      `${validatedUser.firstname || ''} ${validatedUser.lastname || ''}`.trim();

    // Build verification profile & prompt user to confirm
    const fullProfile =
      (await userService.getUserById(validatedUser._id)) || validatedUser;
    const profileSnapshot = buildProfileSnapshot(fullProfile);

    session.metadata.profileSnapshot = profileSnapshot;
    session.metadata.userEmail = profileSnapshot.email || validatedUser.email;
    session.metadata.userName =
      profileSnapshot.displayName || session.metadata.userName;
    session.metadata.loginEmail =
      profileSnapshot.email ||
      session.metadata.userEmail ||
      validatedUser.email;
    session.metadata.phoneDigits =
      profileSnapshot.phoneNumber || validatedUser.phoneNumber || phoneNumber;

    const passcode = derivePasscodeFromPhone(session.metadata.phoneDigits);
    session.metadata.expectedPasscode = passcode;
    session.metadata.pendingUserId = null;
    session.metadata.pendingTokens = null;
    session.metadata.pendingEmail = null;
    session.metadata.mustValidatePasscode = false;
    session.metadata.passcodeAttempts = 0;
    session.metadata.loginStage = 'password';
    session.metadata.isLoggedIn = false;
    session.metadata.sessionLocked = true;
    session.metadata.lastLoginAt = null;
    session.metadata.forceReloginAfter = null;

    // Preload node list for selection once authentication completes
    await preloadUserNodes(session);

    session.status = 'awaiting_login';
    session.markModified('metadata');
    await session.save();

    logger.info(
      `✅ Authentication successful for ${phoneNumber} (User ID: ${validatedUser._id}). Awaiting credentials.`
    );

    await whatsappNotificationService.sendLoginPrompt(
      phoneNumber,
      getLoginEmail(session)
    );
  } catch (error) {
    logger.error(
      `❌ Error processing phone authentication for ${phoneNumber}:`,
      error.message
    );
    logger.error(`❌ Full error details:`, error);
    await whatsappNotificationService.sendAuthenticationFailure(
      phoneNumber,
      'Authentication failed. Please try again.'
    );
  }
};

/**
 * Handle project selection
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} selectedProjectName - Selected project name
 * @param {Object} session - User session object
 */
exports.handleProjectSelection = async (
  phoneNumber,
  selectedProjectName,
  session
) => {
  try {
    logger.info(
      `📋 Processing project selection for ${phoneNumber}: "${selectedProjectName}"`
    );

    // Get available projects
    const availableProjects = await formHandler.getAvailableProjects(
      session.tenantId
    );

    // Find the selected project
    const selectedProject = availableProjects.find(
      (project) =>
        project.configuration?.projectName === selectedProjectName ||
        project.projectId === selectedProjectName
    );

    if (!selectedProject) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Invalid project selection. Please choose from the available projects.'
      );
      return;
    }

    // Validate project access
    const projectValidation =
      await whatsappValidationService.validateProjectForm(
        selectedProject.projectId,
        {
          tenantId: session.tenantId,
        }
      );

    if (!projectValidation.valid) {
      logger.warn(
        `❌ Project validation failed for ${selectedProject.projectId}: ${projectValidation.error}`
      );
      await whatsappNotificationService.sendAuthenticationFailure(
        phoneNumber,
        projectValidation.error
      );
      return;
    }

    // Update session with project information
    session.projectId = selectedProject.projectId;
    session.formId = selectedProject._id;
    session.status = 'filling_form';
    session.currentStep = 0;
    await session.save();

    logger.info(
      `✅ Project selected: ${selectedProject.projectId} for ${phoneNumber}`
    );

    // Start form filling process
    await startFormFilling(phoneNumber, session);
  } catch (error) {
    logger.error(
      `❌ Error processing project selection for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to select project. Please try again.'
    );
  }
};

/**
 * Start the form filling process
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
async function startFormFilling(phoneNumber, session) {
  try {
    // Get project form details
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectSupportsIntegration(projectForm)) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'This project is not enabled for WhatsApp submissions. Please choose another project.'
      );
      return;
    }

    if (
      !projectForm ||
      !projectForm.elements ||
      projectForm.elements.length === 0
    ) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'No form questions available for this project.'
      );
      return;
    }

    // Send the first question
    const firstQuestion = projectForm.elements[0];
    await whatsappNotificationService.sendFormQuestion(
      phoneNumber,
      firstQuestion,
      0,
      projectForm.elements.length
    );

    logger.info(
      `✅ Started form filling for ${phoneNumber} (${projectForm.elements.length} questions)`
    );
  } catch (error) {
    logger.error(
      `❌ Error starting form filling for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to start form. Please try again.'
    );
  }
}

/**
 * Handle manual phone input (fallback)
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
exports.handleManualPhone = async (phoneNumber, session) => {
  try {
    logger.info(`📱 Processing manual phone input for ${phoneNumber}`);

    // Basic phone number validation
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''))) {
      await whatsappNotificationService.sendValidationError(phoneNumber, {
        field: 'Phone Number',
        error: 'Invalid phone number format. Please enter a valid number.',
      });
      return;
    }

    // Use the same logic as phone authentication
    await exports.handlePhoneAuthentication(phoneNumber, session);
  } catch (error) {
    logger.error(
      `❌ Error processing manual phone input for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process phone number. Please try again.'
    );
  }
};

/**
 * Confirm that the user has validated their account details and continue
 * to project selection.
 */
exports.confirmAccountDetails = async (phoneNumber, session) => {
  try {
    session.metadata = session.metadata || {};
    const profileSnapshot = session.metadata?.profileSnapshot || {};

    session.metadata.pendingVerification = {
      snapshot: profileSnapshot,
      requestedAt: new Date(),
    };
    session.markModified('metadata');
    await session.save();

    if (hasRecentPasscodeValidation(session)) {
      await completePendingVerification(phoneNumber, session);
      return;
    }

    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'Great! Reply with the last 6 digits of your registered phone number to finish verification.'
    );
    await requirePasscode(phoneNumber, session, {
      reason: 'verification_confirmation',
    });
  } catch (error) {
    logger.error(
      `❌ Error confirming account details for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'We ran into an issue after verification. Please try again.'
    );
  }
};

/**
 * Allow the user to re-trigger verification (e.g. command /verify).
 */
exports.triggerVerification = async (phoneNumber, session) => {
  try {
    logger.info(
      `🔄 Triggering verification prompt for ${phoneNumber} (status: ${session.status})`
    );
    if (session.status === 'awaiting_login') {
      await whatsappNotificationService.sendLoginPrompt(
        phoneNumber,
        getLoginEmail(session)
      );
      return;
    }
    if (!session.userId) {
      logger.info(
        `⚠️ No userId in session for ${phoneNumber}; restarting authentication`
      );
      await exports.handlePhoneAuthentication(phoneNumber, session);
      return;
    }

    const user = await userService.getUserById(session.userId);
    if (!user) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'We could not find your account. Please contact your administrator.'
      );
      return;
    }

    await ensureTenantConfigs(session, user.tenantId);

    const profileSnapshot = buildProfileSnapshot(user);

    session.metadata = session.metadata || {};
    session.metadata.profileSnapshot = profileSnapshot;
    session.metadata.userEmail = profileSnapshot.email;
    session.metadata.userName = profileSnapshot.displayName;
    session.metadata.lastVerificationPromptAt = new Date();
    await preloadUserNodes(session);
    session.status = 'awaiting_verification_confirmation';
    session.markModified('metadata');
    await session.save();

    await whatsappNotificationService.sendVerificationPrompt(
      phoneNumber,
      profileSnapshot
    );
  } catch (error) {
    logger.error(
      `❌ Error triggering verification for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Unable to start verification right now. Please try again or contact support.'
    );
  }
};

exports.handleLoginChallenge = async (phoneNumber, session, input = '') => {
  session.metadata = session.metadata || {};
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Universal commands
  if (!trimmed || lower === '/start' || lower === '/login') {
    ensureLoginStage(session, 'password');
    await promptForCurrentStage(phoneNumber, session);
    return;
  }

  if (lower === '/logout' || lower === 'logout') {
    await performLogout(phoneNumber, session);
    return;
  }

  if (lower === '/help' || lower === 'help' || lower === '❓ help') {
    await whatsappNotificationService.sendHelpMessage(phoneNumber);
    return;
  }

  if (lower === '/support' || lower === 'support' || trimmed === '🆘 Support') {
    const userName = session.metadata?.userName || 'User';
    await whatsappNotificationService.sendSupportMessage(phoneNumber, userName);
    return;
  }

  const stage = session.metadata.loginStage || 'password';

  // Stage: password
  if (stage === 'password') {
    if (lower.startsWith('password')) {
      const password = trimmed.replace(/^password[:\s]*/i, '').trim();
      if (!password) {
        await whatsappNotificationService.sendLoginPrompt(
          phoneNumber,
          getLoginEmail(session)
        );
        return;
      }
      const email = getLoginEmail(session);
      if (!email) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'No account email is on record. Please contact support.'
        );
        return;
      }

      try {
        const user = await authService.loginUserWithEmailAndPassword(
          email,
          password,
          'whatsapp'
        );

        // Stage result
        const tokens = await tokenService.generateAuthTokens(user);
        session.metadata.pendingUserId = user._id;
        session.metadata.pendingTokens = tokens;
        session.metadata.pendingEmail = email;

        if (!user.otpVerified) {
          ensureLoginStage(session, 'otp');
          await whatsappNotificationService.sendOtpVerificationPrompt(
            phoneNumber,
            describeOtpDestinations(session, { email, channels: ['email'] })
          );
        } else {
          ensureLoginStage(session, 'passcode');
          await whatsappNotificationService.sendPasscodePrompt(
            phoneNumber,
            session.metadata.phoneDigits
          );
        }
        session.metadata.passcodeAttempts = 0;
        session.markModified('metadata');
        await session.save();
      } catch (error) {
        logger.error(
          `❌ Error during password login for ${phoneNumber}:`,
          error?.message || error
        );

        if (error?.name === 'OtpNotVerified') {
          try {
            const user = await userService.getUserByEmail(email);
            if (!user) {
              await whatsappNotificationService.sendErrorMessage(
                phoneNumber,
                'We could not locate your account. Please contact support.'
              );
              return;
            }

            const otpDelivery = await authService.sendUserOtp(user, {
              allowFallback: true,
            });
            session.metadata.pendingUserId = user._id;
            session.metadata.pendingEmail = email;
            session.metadata.pendingTokens = null;
            session.metadata.pendingOtp = true;
            session.metadata.lastOtpSentAt = new Date();
            ensureLoginStage(session, 'otp');
            session.markModified('metadata');
            await session.save();
            await whatsappNotificationService.sendOtpVerificationPrompt(
              phoneNumber,
              describeOtpDestinations(session, otpDelivery)
            );
          } catch (otpError) {
            logger.error(
              `❌ Failed to resend OTP for ${phoneNumber}:`,
              otpError?.message || otpError
            );
            await whatsappNotificationService.sendPasswordResetDeliveryFailure(
              phoneNumber
            );
          }
          return;
        }

        const message =
          error?.name === 'ApiError' && error?.message
            ? error.message
            : 'Incorrect email or password. Please try again.';

        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          message
        );
      }
      return;
    }

    if (lower === 'otp' || lower === '/otp') {
      if (!session.userId) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not find your account. Please start over with /start.'
        );
        return;
      }
      const user = await userService.getUserById(session.userId);
      if (!user) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not find your account. Please contact support.'
        );
        return;
      }
      try {
        const otpDelivery = await authService.sendUserOtp(user, {
          allowFallback: true,
        });
        session.metadata.pendingOtp = true;
        session.metadata.lastOtpSentAt = new Date();
        ensureLoginStage(session, 'otp');
        session.markModified('metadata');
        await session.save();
        await whatsappNotificationService.sendOtpSentConfirmation(
          phoneNumber,
          describeOtpDestinations(session, otpDelivery)
        );
      } catch (error) {
        logger.error(
          `❌ Failed to send OTP for ${phoneNumber}:`,
          error.message
        );
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not send an OTP right now. Please try again shortly.'
        );
      }
      return;
    }

    await whatsappNotificationService.sendLoginPrompt(
      phoneNumber,
      getLoginEmail(session)
    );
    return;
  }

  // Stage: otp
  if (stage === 'otp') {
    if (lower === 'otp' || lower === '/otp') {
      if (!session.userId) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not find your account. Please start over with /start.'
        );
        return;
      }
      const user = await userService.getUserById(session.userId);
      if (!user) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not find your account. Please contact support.'
        );
        return;
      }
      try {
        const otpDelivery = await authService.sendUserOtp(user, {
          allowFallback: true,
        });
        session.metadata.pendingOtp = true;
        session.metadata.lastOtpSentAt = new Date();
        session.markModified('metadata');
        await session.save();
        await whatsappNotificationService.sendOtpSentConfirmation(
          phoneNumber,
          describeOtpDestinations(session, otpDelivery)
        );
      } catch (error) {
        logger.error(
          `❌ Failed to send OTP for ${phoneNumber}:`,
          error.message
        );
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not send an OTP right now. Please try again shortly.'
        );
      }
      return;
    }

    const otpCodeMatch =
      trimmed.match(/^(?:code|otp)\s*(\d{4,6})$/i) ||
      trimmed.match(/^(\d{4,6})$/);
    if (otpCodeMatch) {
      const email = session.metadata.pendingEmail || getLoginEmail(session);
      if (!email) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'No account email is on record. Please contact support.'
        );
        return;
      }
      const code = otpCodeMatch[1];
      const expectedPasscode = session.metadata.expectedPasscode;
      if (expectedPasscode && code === expectedPasscode) {
        ensureLoginStage(session, 'passcode');
        await whatsappNotificationService.sendPasscodePrompt(
          phoneNumber,
          session.metadata.phoneDigits
        );
        session.metadata.pendingOtp = false;
        session.markModified('metadata');
        await session.save();
        return;
      }

      const { success, user } = await authService.verifyOtp(email, code);
      if (!success || !user) {
        await whatsappNotificationService.sendOtpInvalid(phoneNumber);
        return;
      }
      const tokens = await tokenService.generateAuthTokens(user);
      session.metadata.pendingUserId = user._id;
      session.metadata.pendingTokens = tokens;
      ensureLoginStage(session, 'passcode');
      session.metadata.pendingOtp = false;
      session.markModified('metadata');
      await session.save();
      await whatsappNotificationService.sendPasscodePrompt(
        phoneNumber,
        session.metadata.phoneDigits
      );
      return;
    }

    await whatsappNotificationService.sendOtpVerificationPrompt(
      phoneNumber,
      describeOtpDestinations(session, {
        email: session.metadata.pendingEmail || getLoginEmail(session),
        channels: ['email'],
      })
    );
    return;
  }

  // Stage: passcode
  if (stage === 'passcode') {
    if (lower === 'otp' || lower === '/otp') {
      const pendingUserId = session.metadata.pendingUserId || session.userId;
      if (!pendingUserId) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not find your account. Please start over with /start.'
        );
        return;
      }
      const user = await userService.getUserById(pendingUserId);
      if (!user) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not find your account. Please contact support.'
        );
        return;
      }
      try {
        const otpDelivery = await authService.sendUserOtp(user, {
          allowFallback: true,
        });
        session.metadata.pendingOtp = true;
        session.metadata.lastOtpSentAt = new Date();
        ensureLoginStage(session, 'otp');
        session.markModified('metadata');
        await session.save();
        await whatsappNotificationService.sendOtpSentConfirmation(
          phoneNumber,
          describeOtpDestinations(session, otpDelivery)
        );
      } catch (error) {
        logger.error(
          `❌ Failed to send OTP for ${phoneNumber}:`,
          error.message
        );
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not send an OTP right now. Please try again shortly.'
        );
      }
      return;
    }

    const digits = trimmed.replace(/\D/g, '');
    const phoneDigits =
      session.metadata.phoneDigits ||
      session.metadata.profileSnapshot?.phoneNumber ||
      session.metadata.phoneNumber ||
      '';
    let expectedPasscode =
      session.metadata.expectedPasscode || derivePasscodeFromPhone(phoneDigits);

    if (
      expectedPasscode &&
      session.metadata.expectedPasscode !== expectedPasscode
    ) {
      session.metadata.expectedPasscode = expectedPasscode;
      session.metadata.phoneDigits = phoneDigits;
      session.markModified('metadata');
      await session.save();
    }

    logger.info('🔐 Passcode attempt', {
      phoneNumber,
      stage,
      rawInput: trimmed,
      digits,
      expectedPasscode,
      mustValidatePasscode: session.metadata.mustValidatePasscode || false,
      passcodeAttempts: session.metadata.passcodeAttempts || 0,
      pendingUserId: session.metadata.pendingUserId
        ? session.metadata.pendingUserId.toString()
        : null,
      hasPendingTokens: !!(
        session.metadata.pendingTokens &&
        session.metadata.pendingTokens.access &&
        session.metadata.pendingTokens.refresh
      ),
    });

    if (digits.length === 6 && expectedPasscode) {
      if (digits === expectedPasscode) {
        const pendingUserId = session.metadata.pendingUserId || session.userId;

        if (session.metadata.pendingVerification) {
          session.metadata.lastPasscodeVerifiedAt = new Date();
          await completePendingVerification(phoneNumber, session);
          return;
        }

        session.metadata.lastPasscodeVerifiedAt = new Date();
        let resolvedUser = null;

        if (pendingUserId) {
          resolvedUser = await userService.getUserById(pendingUserId);
        }

        if (!resolvedUser) {
          const email = session.metadata.pendingEmail || getLoginEmail(session);
          if (email) {
            resolvedUser = await userService.getUserByEmail(email);
          }
        }

        if (!resolvedUser) {
          logger.error('❌ Passcode success but user could not be resolved', {
            phoneNumber,
            pendingUserId,
            pendingEmail: session.metadata.pendingEmail,
          });
          await whatsappNotificationService.sendErrorMessage(
            phoneNumber,
            'We could not locate your account details. Please contact support.'
          );
          return;
        }

        logger.info('✅ Passcode accepted, finalizing login', {
          phoneNumber,
          userId: resolvedUser._id?.toString?.() || null,
          pendingUserId: pendingUserId ? pendingUserId.toString() : null,
        });

        await finalizePendingLogin(phoneNumber, session, {
          user: resolvedUser,
          authMethod: 'passcode',
        });
        return;
      }

      session.metadata.passcodeAttempts =
        (session.metadata.passcodeAttempts || 0) + 1;
      session.markModified('metadata');
      await session.save();

      const attemptsLeft = Math.max(
        0,
        MAX_PASSCODE_ATTEMPTS - session.metadata.passcodeAttempts
      );
      await whatsappNotificationService.sendPasscodeFailure(
        phoneNumber,
        attemptsLeft
      );

      if (session.metadata.passcodeAttempts >= MAX_PASSCODE_ATTEMPTS) {
        await performLogout(phoneNumber, session, {
          reason: 'too_many_passcode_attempts',
        });
      }
      return;
    }

    await whatsappNotificationService.sendPasscodePrompt(
      phoneNumber,
      session.metadata.phoneDigits ||
        session.metadata.profileSnapshot?.phoneNumber ||
        session.metadata.phoneNumber
    );
    return;
  }

  ensureLoginStage(session, 'password');
  await promptForCurrentStage(phoneNumber, session);
};

exports.promptLogin = async (phoneNumber, session) => {
  await promptForLogin(phoneNumber, session, { resetAttempts: true });
};

exports.lockSession = async (phoneNumber, session, reason = 'secure_lock') => {
  session.metadata = session.metadata || {};
  session.metadata.sessionLocked = true;
  session.metadata.lockReason = reason;
  session.metadata.isLoggedIn = false;
  session.metadata.passcodeAttempts = 0;
  session.metadata.lastPasscodePromptAt = new Date();
  session.metadata.pendingOtp = false;
  session.metadata.authTokens = null;
  session.status = 'awaiting_login';
  session.markModified('metadata');
  await session.save();

  await whatsappNotificationService.sendSessionLockNotice(
    phoneNumber,
    getLoginEmail(session)
  );
};

/**
 * Present a profile summary to the user.
 */
exports.showProfileSummary = async (phoneNumber, session) => {
  const profileSnapshot = session.metadata?.profileSnapshot;

  if (!profileSnapshot) {
    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'I need to refresh your profile before I can show it.'
    );
    await exports.triggerVerification(phoneNumber, session);
    return;
  }

  await whatsappNotificationService.sendProfileSummary(
    phoneNumber,
    profileSnapshot
  );
};

/**
 * Initiate node selection manually (e.g., via /node command)
 */
exports.requestNodeSelection = async (phoneNumber, session) => {
  const needsSelection = await ensureNodeSelection(
    phoneNumber,
    session,
    false,
    true
  );

  if (!needsSelection) {
    const node = session.metadata?.selectedNode;
    if (node) {
      await whatsappNotificationService.sendInfoMessage(
        phoneNumber,
        `📍 Current location: ${node.name || node.nodeId}`
      );
    }
  }
};

/**
 * Handle user response during node selection state.
 */
exports.handleNodeSelection = async (phoneNumber, input, session) => {
  session.metadata = session.metadata || {};
  const nodes = session.metadata.nodesCache || [];

  if (!nodes || nodes.length === 0) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'No locations are assigned to your account. Please contact your administrator.'
    );
    await ensureNodeSelection(phoneNumber, session, false, true);
    return;
  }

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  if (['cancel', 'exit', 'back', 'menu'].includes(lower)) {
    const prevStatus = session.metadata.previousStatus || 'selecting_project';
    delete session.metadata.pendingProjectSelection;
    delete session.metadata.previousStatus;
    session.status = prevStatus;
    session.markModified('metadata');
    await session.save();
    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'Node selection cancelled.'
    );
    return;
  }

  let selectedNode = null;
  if (/^\d+$/.test(trimmed)) {
    const index = parseInt(trimmed, 10) - 1;
    if (index >= 0 && index < nodes.length) {
      selectedNode = nodes[index];
    }
  }

  if (!selectedNode) {
    selectedNode = nodes.find(
      (node) =>
        node.name?.toLowerCase() === lower ||
        node.nodeId?.toLowerCase() === lower
    );
  }

  if (!selectedNode) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Invalid selection. Please reply with the number or name of a listed location.'
    );
    await whatsappNotificationService.sendNodeSelectionPrompt(
      phoneNumber,
      nodes
    );
    return;
  }

  const continueToProjects = !!session.metadata.pendingProjectSelection;
  const previousStatus =
    session.metadata.previousStatus ||
    (continueToProjects ? 'selecting_project' : 'filling_form');

  session.metadata.selectedNode = selectedNode;
  session.metadata.selectedNodeAt = new Date();
  session.status = continueToProjects ? 'selecting_project' : previousStatus;
  delete session.metadata.pendingProjectSelection;
  delete session.metadata.previousStatus;
  session.markModified('metadata');
  await session.save();

  await whatsappNotificationService.sendInfoMessage(
    phoneNumber,
    `📍 Location set to ${selectedNode.name || selectedNode.nodeId}.`
  );

  if (continueToProjects) {
    await presentProjectSelection(
      phoneNumber,
      session,
      session.metadata?.profileSnapshot || {}
    );
  }
};

/**
 * Begin node (unit) update flow.
 */
exports.startNodeUpdate = async (phoneNumber, session) => {
  try {
    if (!session.userId || !session.tenantId) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Please authenticate first by sending your phone number or using /start.'
      );
      return;
    }

    await ensureTenantConfigs(session);

    await preloadUserNodes(session);
    const nodes = session.metadata?.nodesCache || [];

    if (!nodes.length) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'No units are assigned to your account yet.'
      );
      return;
    }

    session.metadata = session.metadata || {};
    session.metadata.nodeUpdate = {
      step: 'select_node',
      instructionsShown: false,
    };
    if (!session.metadata.previousStatus) {
      session.metadata.previousStatus = session.status;
    }
    session.status = 'updating_node';
    session.markModified('metadata');
    await session.save();

    await whatsappNotificationService.sendNodeUpdateSelectionPrompt(
      phoneNumber,
      nodes
    );
  } catch (error) {
    logger.error(
      `❌ Error starting node update for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Unable to start unit update right now. Please try again shortly.'
    );
  }
};

/**
 * Handle node (unit) update flow.
 */
exports.handleNodeUpdate = async (phoneNumber, input, session) => {
  try {
    const text = (input || '').trim();
    session.metadata = session.metadata || {};
    session.metadata.nodeUpdate = session.metadata.nodeUpdate || {
      step: 'select_node',
      instructionsShown: false,
    };
    await ensureTenantConfigs(session);
    const state = session.metadata.nodeUpdate;
    const nodes = session.metadata.nodesCache || [];

    const lower = text.toLowerCase();
    const isCancelCommand =
      ['cancel', '/cancel', 'menu', '/menu'].includes(lower) ||
      isNegativeResponse(text);

    if (isCancelCommand) {
      await finishNodeUpdate(phoneNumber, session, { cancelled: true });
      return;
    }

    if (['done', 'finish', 'complete'].includes(lower)) {
      await whatsappNotificationService.sendInfoMessage(
        phoneNumber,
        'Unit update completed.'
      );
      await finishNodeUpdate(phoneNumber, session, { cancelled: false });
      return;
    }

    if (
      /[=:]/.test(text) &&
      (session.metadata.selectedNode || state.selectedNode)
    ) {
      if (!state.selectedNode && session.metadata.selectedNode) {
        state.selectedNode = session.metadata.selectedNode;
      }
      await processNodeBulkUpdate(phoneNumber, session, input);
      return;
    }

    if (!text) {
      const activeNode = state.selectedNode || session.metadata.selectedNode;
      if (!activeNode || state.step === 'select_node') {
        await whatsappNotificationService.sendNodeUpdateSelectionPrompt(
          phoneNumber,
          nodes
        );
      } else if (!state.instructionsShown) {
        const nodeFields = getNodeUpdateFields(session);
        await whatsappNotificationService.sendNodeBulkInstructions(
          phoneNumber,
          activeNode,
          nodeFields
        );
        state.instructionsShown = true;
        session.markModified('metadata');
        await session.save();
      } else {
        await whatsappNotificationService.sendInfoMessage(
          phoneNumber,
          `Send updates as "field: value" or type *done* when finished.`
        );
      }
      return;
    }

    switch (state.step) {
      case 'select_node': {
        if (!nodes.length) {
          await whatsappNotificationService.sendErrorMessage(
            phoneNumber,
            'You do not have any units assigned yet.'
          );
          await finishNodeUpdate(phoneNumber, session, { cancelled: true });
          return;
        }

        let selectedNode = null;
        const numericIndex = Number.parseInt(text, 10);
        if (!Number.isNaN(numericIndex) && nodes[numericIndex - 1]) {
          selectedNode = nodes[numericIndex - 1];
        }

        if (!selectedNode) {
          const normalizedInput = normalizeLabel(text);
          selectedNode = nodes.find((node) => {
            const nameMatch = normalizeLabel(node.name || '');
            const idMatch = normalizeLabel(node.nodeId || '');
            return nameMatch === normalizedInput || idMatch === normalizedInput;
          });
        }

        if (!selectedNode) {
          await whatsappNotificationService.sendErrorMessage(
            phoneNumber,
            'Please reply with a valid unit number or name from the list.'
          );
          await whatsappNotificationService.sendNodeUpdateSelectionPrompt(
            phoneNumber,
            nodes
          );
          return;
        }

        state.selectedNode = selectedNode;
        state.step = 'bulk';
        state.instructionsShown = true;
        session.metadata.selectedNode = selectedNode;
        session.markModified('metadata');
        await session.save();

        const nodeFields = getNodeUpdateFields(session);
        await whatsappNotificationService.sendNodeBulkInstructions(
          phoneNumber,
          selectedNode,
          nodeFields
        );
        return;
      }
      default: {
        const activeNode = state.selectedNode || session.metadata.selectedNode;
        if (activeNode) {
          if (!state.instructionsShown) {
            const nodeFields = getNodeUpdateFields(session);
            await whatsappNotificationService.sendNodeBulkInstructions(
              phoneNumber,
              activeNode,
              nodeFields
            );
            state.instructionsShown = true;
            session.markModified('metadata');
            await session.save();
          } else {
            await whatsappNotificationService.sendInfoMessage(
              phoneNumber,
              `Send more updates for ${
                activeNode.name || activeNode.nodeId
              }, or type *done* when finished.`
            );
          }
        } else {
          await whatsappNotificationService.sendNodeUpdateSelectionPrompt(
            phoneNumber,
            nodes
          );
        }
        return;
      }
    }
  } catch (error) {
    logger.error(
      `❌ Error handling node update for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'We hit an unexpected issue. Please try again.'
    );
  }
};

/**
 * Begin profile update flow
 */
exports.startProfileUpdate = async (phoneNumber, session) => {
  session.metadata = session.metadata || {};
  const profileSnapshot = session.metadata.profileSnapshot;

  if (!profileSnapshot) {
    logger.info('ℹ️ Profile update requested without cached profile', {
      phoneNumber,
      sessionId: session._id?.toString?.(),
    });
    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'Refreshing your profile first...'
    );
    await exports.triggerVerification(phoneNumber, session);
    return;
  }

  await ensureTenantConfigs(session);

  session.metadata.profileUpdate = {
    step: 'bulk',
    originalProfile: profileSnapshot,
    instructionsShown: true,
  };
  if (!session.metadata.previousStatus) {
    session.metadata.previousStatus = session.status;
  }
  session.status = 'updating_profile';
  session.markModified('metadata');
  await session.save();

  logger.info('🛠️ Starting WhatsApp profile update flow', {
    phoneNumber,
    sessionId: session._id?.toString?.(),
    userId: session.userId?.toString?.(),
    mode: 'bulk',
  });

  const profileFields = getProfileUpdateFields(session);
  await whatsappNotificationService.sendProfileBulkInstructions(
    phoneNumber,
    profileFields
  );
};
async function finishProfileUpdate(
  phoneNumber,
  session,
  { sendMessage = true, cancelled = false } = {}
) {
  session.metadata = session.metadata || {};
  session.metadata.profileUpdate = {};
  session.status = session.metadata.previousStatus || 'selecting_project';
  delete session.metadata.previousStatus;
  session.markModified('metadata');
  await session.save();

  logger.info('ℹ️ WhatsApp profile update flow exited', {
    phoneNumber,
    sessionId: session._id?.toString?.(),
    userId: session.userId?.toString?.(),
    sendMessage,
  });

  if (sendMessage) {
    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'Profile update exited.'
    );
  }

  if (cancelled) {
    const userName = session.metadata?.userName || 'User';
    await whatsappNotificationService.sendMainMenu(phoneNumber, userName);
    return;
  }

  await requirePasscode(phoneNumber, session, {
    reason: 'profile_update',
  });
}

/**

/**
 * Handle user responses during profile update flow
 * 
 * 
 */
exports.handleProfileUpdate = async (phoneNumber, input, session) => {
  session.metadata = session.metadata || {};
  session.metadata.profileUpdate = session.metadata.profileUpdate || {
    step: 'bulk',
  };
  await ensureTenantConfigs(session);

  const trimmed = (input || '').trim();
  const state = session.metadata.profileUpdate;

  if (!trimmed) {
    if (!state.instructionsShown) {
      const profileFields = getProfileUpdateFields(session);
      await whatsappNotificationService.sendProfileBulkInstructions(
        phoneNumber,
        profileFields
      );
      state.instructionsShown = true;
      session.markModified('metadata');
      await session.save();
    } else {
      await whatsappNotificationService.sendInfoMessage(
        phoneNumber,
        'Send updates as "field: value" or type *done* when you’re finished.'
      );
    }
    return;
  }

  const lower = trimmed.toLowerCase();

  if (['cancel', 'exit', 'menu', 'stop'].includes(lower)) {
    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'Profile update cancelled. No changes applied.'
    );
    await finishProfileUpdate(phoneNumber, session, {
      sendMessage: false,
      cancelled: true,
    });
    return;
  }

  if (['done', 'finish', 'complete', 'submit'].includes(lower)) {
    await whatsappNotificationService.sendInfoMessage(
      phoneNumber,
      'Profile update completed.'
    );
    await finishProfileUpdate(phoneNumber, session, {
      sendMessage: false,
      cancelled: false,
    });
    return;
  }

  await processProfileBulkUpdate(phoneNumber, session, trimmed);
};

/**
 * Helper to present the project selection menu once verification is complete.
 */
async function presentProjectSelection(phoneNumber, session, profileSnapshot) {
  const snapshot =
    profileSnapshot && Object.keys(profileSnapshot).length > 0
      ? profileSnapshot
      : session.metadata?.profileSnapshot || {};

  const needsNodeSelection = await ensureNodeSelection(
    phoneNumber,
    session,
    true
  );
  if (needsNodeSelection) return;

  const availableProjects = await formHandler.getAvailableProjects(
    session.tenantId
  );

  if (!availableProjects || availableProjects.length === 0) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'No projects available for your account. Please contact your administrator.'
    );
    return;
  }

  session.markModified('metadata');
  session.status = 'selecting_project';
  await session.save();

  await whatsappNotificationService.sendAuthenticationSuccess(
    phoneNumber,
    {
      ...snapshot,
      tenantId: session.tenantId,
      phoneNumber: session.metadata?.phoneNumber,
    },
    availableProjects
  );
}

function updateProfileSnapshot(session, fieldKey, value, path = null) {
  session.metadata = session.metadata || {};
  session.metadata.profileSnapshot = session.metadata.profileSnapshot || {};
  if (path && Array.isArray(path) && path.length > 0) {
    applyValueToPath(session.metadata.profileSnapshot, path, value);
  } else {
    session.metadata.profileSnapshot[fieldKey] = value;
  }

  if (['firstname', 'lastname'].includes(fieldKey)) {
    const first = session.metadata.profileSnapshot.firstname || '';
    const last = session.metadata.profileSnapshot.lastname || '';
    const displayName =
      `${first} ${last}`.trim() || session.metadata.profileSnapshot.displayName;
    session.metadata.profileSnapshot.displayName = displayName;
    session.metadata.userName = displayName;
  }

  if (fieldKey === 'email') {
    session.metadata.userEmail = value;
  }

  if (fieldKey === 'phoneNumber') {
    session.metadata.phoneNumber = value;
  }
}

/**
 * Create a safe profile snapshot for WhatsApp prompts/messages.
 */
function buildProfileSnapshot(userDoc = {}) {
  const lean =
    typeof userDoc.toObject === 'function' ? userDoc.toObject() : userDoc;

  const displayName =
    lean.name ||
    `${lean.firstname || ''} ${lean.lastname || ''}`.trim() ||
    lean.email ||
    lean.userId ||
    'User';

  return {
    id: lean._id?.toString?.() || lean.id,
    userId: lean.userId,
    sabyId: lean.sabyId || lean.haloId || null,
    tenantId: lean.tenantId,
    email: lean.email,
    phoneNumber: lean.phoneNumber,
    firstname: lean.firstname,
    lastname: lean.lastname,
    customFields: lean.customFields || {},
    customFieldsVersion: lean.customFieldsVersion || 0,
    roles: (lean.roles || []).map((role) => {
      if (!role) return null;
      if (typeof role === 'string') return role;
      if (role.name) return role.name;
      if (role.roleName) return role.roleName;
      return role._id?.toString?.() || null;
    }),
    displayName,
  };
}

async function finishNodeUpdate(
  phoneNumber,
  session,
  { cancelled = false } = {}
) {
  session.metadata = session.metadata || {};
  delete session.metadata.nodeUpdate;

  const nextStatus = session.metadata.previousStatus || 'selecting_project';
  delete session.metadata.previousStatus;

  if (!cancelled) {
    session.metadata.menuContext = 'main';
    session.metadata.activeSubmenu = null;
    session.metadata.awaitingMenuSelection = true;
  }

  session.status = nextStatus;
  session.markModified('metadata');
  await session.save();

  if (cancelled) {
    await whatsappNotificationService.sendNodeUpdateCancelled(phoneNumber);
    const userName = session.metadata?.userName || 'User';
    await whatsappNotificationService.sendMainMenu(phoneNumber, userName);
    return;
  }

  await requirePasscode(phoneNumber, session, {
    reason: 'unit_update',
  });
}

/**
 * Prompt the user to select a node.
 */
async function ensureNodeSelection(
  phoneNumber,
  session,
  continueToProjects = false,
  alwaysPrompt = false
) {
  session.metadata = session.metadata || {};

  if (
    !session.metadata.nodesCache ||
    session.metadata.nodesCache.length === 0
  ) {
    await preloadUserNodes(session);
  }

  return promptNodeSelection(phoneNumber, session, {
    continueToProjects,
    alwaysPrompt,
  });
}

async function promptNodeSelection(
  phoneNumber,
  session,
  { continueToProjects = false, alwaysPrompt = false } = {}
) {
  session.metadata = session.metadata || {};
  const nodes = session.metadata.nodesCache || [];

  if (!alwaysPrompt && session.metadata.selectedNode && nodes.length <= 1) {
    return false;
  }

  if (!nodes || nodes.length === 0) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'No locations are assigned to your account. Please contact your administrator.'
    );
    return false;
  }

  if (nodes.length === 1 && !alwaysPrompt) {
    session.metadata.selectedNode = nodes[0];
    session.markModified('metadata');
    await session.save();
    if (continueToProjects) {
      await whatsappNotificationService.sendInfoMessage(
        phoneNumber,
        `📍 Using ${nodes[0].name || nodes[0].nodeId} for this session.`
      );
    }
    return false;
  }

  session.metadata.previousStatus = session.status;
  session.metadata.pendingProjectSelection = continueToProjects;
  session.markModified('metadata');
  session.status = 'selecting_node';
  await session.save();

  await whatsappNotificationService.sendNodeSelectionPrompt(phoneNumber, nodes);
  return true;
}

function isStrongPassword(value = '') {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length < PASSWORD_MIN_LENGTH) {
    return false;
  }
  const hasLetter = /[A-Za-z]/.test(trimmed);
  const hasNumber = /\d/.test(trimmed);
  return hasLetter && hasNumber;
}

async function startPasswordReset(phoneNumber, session) {
  session.metadata = session.metadata || {};

  if (!session.userId) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Please log in before trying to reset your password.'
    );
    await promptForLogin(phoneNumber, session, { resetAttempts: true });
    return;
  }

  const user = await userService.getUserById(session.userId);
  if (!user) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'We could not locate your account. Please contact support.'
    );
    return;
  }

  try {
    const otpDelivery = await authService.sendUserOtp(user, {
      allowFallback: true,
    });
    const destinationSummary = describeOtpDestinations(session, otpDelivery);

    session.metadata.passwordReset = {
      stage: 'awaiting_code',
      email: otpDelivery.email || getLoginEmail(session),
      channels: otpDelivery.channels || [],
      lastOtpSentAt: new Date(),
    };
    session.metadata.menuContext = null;
    session.metadata.activeSubmenu = null;
    session.metadata.awaitingMenuSelection = false;
    if (!session.metadata.previousStatus) {
      session.metadata.previousStatus = session.status;
    }
    session.status = 'resetting_password';
    session.markModified('metadata');
    await session.save();

    await whatsappNotificationService.sendPasswordResetIntro(
      phoneNumber,
      destinationSummary
    );
    if (
      Array.isArray(otpDelivery.channels) &&
      !otpDelivery.channels.includes('email') &&
      otpDelivery.email
    ) {
      await whatsappNotificationService.sendPasswordResetEmailUnavailable(
        phoneNumber,
        otpDelivery.email
      );
    }
  } catch (error) {
    logger.error(
      `❌ Failed to start password reset for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendPasswordResetDeliveryFailure(
      phoneNumber
    );
    await resetSessionForFreshStart(phoneNumber, session, {
      preserveAuth: true,
    });
  }
}

async function finishPasswordReset(
  phoneNumber,
  session,
  { cancelled = false } = {}
) {
  session.metadata = session.metadata || {};
  delete session.metadata.passwordReset;

  const nextStatus = session.metadata.previousStatus || 'selecting_project';
  delete session.metadata.previousStatus;

  session.status = nextStatus;
  session.markModified('metadata');
  await session.save();

  if (cancelled) {
    await whatsappNotificationService.sendPasswordResetCancelled(phoneNumber);
    const userName = session.metadata?.userName || 'User';
    await whatsappNotificationService.sendMainMenu(phoneNumber, userName);
    return;
  }

  await whatsappNotificationService.sendPasswordResetSuccess(phoneNumber);
  await requirePasscode(phoneNumber, session, { reason: 'password_reset' });
}

function resetSessionMaps(session) {
  if (!session) {
    return;
  }
  if (typeof session.answers?.clear === 'function') {
    session.answers.clear();
    session.markModified('answers');
  }
  if (typeof session.batchAnswers?.clear === 'function') {
    session.batchAnswers.clear();
    session.markModified('batchAnswers');
  }
  session.batchMeta = {};
  session.markModified('batchMeta');
}

async function resetSessionForFreshStart(
  phoneNumber,
  session,
  { preserveAuth = true, notifyMenu = true, infoMessage = null } = {}
) {
  if (!session) {
    return;
  }

  session.metadata = session.metadata || {};
  const wasLoggedIn =
    preserveAuth && session.metadata && session.metadata.isLoggedIn;

  resetSessionMaps(session);

  session.currentStep = 0;
  session.projectId = null;
  session.formId = null;
  session.validationResult = null;
  session.batchStatus = 'collecting';
  session.submittedAt = null;
  session.completedAt = null;

  delete session.metadata.passwordReset;
  delete session.metadata.profileUpdate;
  delete session.metadata.nodeUpdate;
  delete session.metadata.previousStatus;
  delete session.metadata.pendingVerification;
  session.metadata.pendingOtp = false;
  session.metadata.pendingTokens = null;
  session.metadata.pendingUserId = null;
  session.metadata.pendingEmail = null;
  session.metadata.mustValidatePasscode = false;
  session.metadata.passcodeReason = null;
  session.metadata.menuContext = wasLoggedIn ? 'main' : null;
  session.metadata.activeSubmenu = null;
  session.metadata.awaitingMenuSelection = wasLoggedIn;
  session.metadata.menuStack = wasLoggedIn ? ['main'] : [];
  session.metadata.lastMenuKey = wasLoggedIn ? 'main' : null;
  session.metadata.lastSubmenu = null;
  session.metadata.batchTemplate = [];

  session.status = wasLoggedIn ? 'selecting_project' : 'authenticating';

  session.markModified('metadata');
  await session.save();

  if (infoMessage) {
    await whatsappNotificationService.sendInfoMessage(phoneNumber, infoMessage);
  }

  if (!notifyMenu) {
    return;
  }

  if (wasLoggedIn) {
    const userName = session.metadata?.userName || 'User';
    await whatsappNotificationService.sendMainMenu(phoneNumber, userName);
  } else {
    await whatsappNotificationService.sendEnhancedWelcomeMessage(phoneNumber);
  }
}

async function routeToMainMenuAfterLogin(phoneNumber, session, userName) {
  await resetSessionForFreshStart(phoneNumber, session, {
    preserveAuth: true,
    notifyMenu: false,
  });
  const safeName =
    userName ||
    session.metadata?.userName ||
    session.metadata?.profileSnapshot?.displayName ||
    'User';
  await whatsappNotificationService.sendMainMenu(phoneNumber, safeName);
}

async function completePendingVerification(phoneNumber, session) {
  session.metadata = session.metadata || {};
  const pendingUserId = session.metadata.pendingUserId || session.userId;
  const verificationSnapshot =
    session.metadata.pendingVerification?.snapshot ||
    session.metadata.profileSnapshot ||
    {};

  await markUserVerified(pendingUserId);

  session.metadata.mustValidatePasscode = false;
  session.metadata.passcodeAttempts = 0;
  session.metadata.loginStage = 'complete';
  session.metadata.passcodeReason = null;
  session.metadata.pendingVerification = null;
  session.metadata.lastVerificationConfirmedAt = new Date();
  session.metadata.accountVerifiedAt = new Date();
  session.metadata.lastPasscodeVerifiedAt = new Date();
  if (session.metadata.profileSnapshot) {
    session.metadata.profileSnapshot.isEmailVerified = true;
    session.metadata.profileSnapshot.isPhoneVerified = true;
    session.metadata.profileSnapshot.status = true;
  }
  session.markModified('metadata');
  await session.save();

  await whatsappNotificationService.sendVerificationSuccess(
    phoneNumber,
    verificationSnapshot
  );
  const userName =
    session.metadata?.userName || verificationSnapshot.displayName || 'User';
  await routeToMainMenuAfterLogin(phoneNumber, session, userName);
}

async function handlePasswordReset(phoneNumber, input, session) {
  session.metadata = session.metadata || {};
  session.metadata.passwordReset = session.metadata.passwordReset || {
    stage: 'awaiting_code',
    email: getLoginEmail(session),
  };

  const state = session.metadata.passwordReset;
  const text = (input || '').trim();
  const lower = text.toLowerCase();

  if (['cancel', '/cancel', 'stop', 'exit', 'menu'].includes(lower)) {
    await finishPasswordReset(phoneNumber, session, { cancelled: true });
    return;
  }

  if (!text) {
    if (state.stage === 'awaiting_code') {
      await whatsappNotificationService.sendPasswordResetIntro(
        phoneNumber,
        describeOtpDestinations(session, {
          email: state.email || getLoginEmail(session),
          channels: ['email'],
        })
      );
    } else {
      await whatsappNotificationService.sendPasswordResetCodeVerified(
        phoneNumber
      );
    }
    return;
  }

  switch (state.stage) {
    case 'awaiting_code': {
      if (lower === 'otp' || lower === '/otp') {
        const user = await userService.getUserById(session.userId);
        if (!user) {
          await whatsappNotificationService.sendErrorMessage(
            phoneNumber,
            'We could not locate your account. Please contact support.'
          );
          return;
        }
        try {
          const otpDelivery = await authService.sendUserOtp(user, {
            allowFallback: true,
          });
          state.email = otpDelivery.email || state.email;
          state.channels = otpDelivery.channels || state.channels || [];
          state.lastOtpSentAt = new Date();
          session.markModified('metadata');
          await session.save();
          await whatsappNotificationService.sendPasswordResetIntro(
            phoneNumber,
            describeOtpDestinations(session, otpDelivery)
          );
          if (
            Array.isArray(otpDelivery.channels) &&
            !otpDelivery.channels.includes('email') &&
            otpDelivery.email
          ) {
            await whatsappNotificationService.sendPasswordResetEmailUnavailable(
              phoneNumber,
              otpDelivery.email
            );
          }
        } catch (error) {
          logger.error(
            `❌ Failed to resend password reset OTP for ${phoneNumber}:`,
            error.message
          );
          await whatsappNotificationService.sendPasswordResetDeliveryFailure(
            phoneNumber
          );
          await resetSessionForFreshStart(phoneNumber, session, {
            preserveAuth: true,
          });
        }
        return;
      }

      const codeMatch =
        text.match(/^(?:code\s*)(\d{4,6})$/i) || text.match(/^(\d{4,6})$/);
      if (!codeMatch) {
        await whatsappNotificationService.sendOtpInvalid(phoneNumber);
        return;
      }

      const code = codeMatch[1];
      const email = state.email || getLoginEmail(session);
      const expectedPasscode = session.metadata.expectedPasscode;

      if (expectedPasscode && code === expectedPasscode) {
        state.stage = 'awaiting_new_password';
        state.otpVerifiedAt = new Date();
        session.markModified('metadata');
        await session.save();
        await whatsappNotificationService.sendPasswordResetCodeVerified(
          phoneNumber
        );
        return;
      }

      const { success } = await authService.verifyOtp(email, code);
      if (!success) {
        await whatsappNotificationService.sendOtpInvalid(phoneNumber);
        return;
      }

      state.stage = 'awaiting_new_password';
      state.otpVerifiedAt = new Date();
      session.markModified('metadata');
      await session.save();
      await whatsappNotificationService.sendPasswordResetCodeVerified(
        phoneNumber
      );
      return;
    }
    case 'awaiting_new_password': {
      const match = text.match(/^password_new\s+(.{3,})$/i);
      if (!match) {
        await whatsappNotificationService.sendPasswordResetInvalidPassword(
          phoneNumber
        );
        return;
      }

      const newPassword = match[1].trim();
      if (!isStrongPassword(newPassword)) {
        await whatsappNotificationService.sendPasswordResetInvalidPassword(
          phoneNumber
        );
        return;
      }

      try {
        await authService.updateUserPassword(session.userId, newPassword);
        state.stage = 'completed';
        session.markModified('metadata');
        await session.save();
        await finishPasswordReset(phoneNumber, session, { cancelled: false });
      } catch (error) {
        logger.error(
          `❌ Failed to update password for ${phoneNumber}:`,
          error.message
        );
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'We could not update your password right now. Please try again.'
        );
        await resetSessionForFreshStart(phoneNumber, session, {
          preserveAuth: true,
        });
      }
      return;
    }
    default:
      await finishPasswordReset(phoneNumber, session, { cancelled: false });
  }
}

exports.requirePasscode = requirePasscode;
exports.handleMidSessionPasscode = handleMidSessionPasscode;
exports.ensureNotExpired = ensureNotExpired;
exports.handleLogout = handleLogout;
exports.startPasswordReset = startPasswordReset;
exports.handlePasswordReset = handlePasswordReset;
exports.resetSessionForFreshStart = resetSessionForFreshStart;
