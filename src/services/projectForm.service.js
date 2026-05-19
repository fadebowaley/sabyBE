const httpStatus = require('http-status');
const jwt = require('jsonwebtoken');
const { randomUUID, createHash } = require('crypto');
const { ProjectForm, StorageFolder, User, Role, Nodes } = require('../models');
const { postgresPool } = require('../config/postgres');
const config = require('../config/config');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const fieldCatalogService = require('./fieldCatalog.service');
const userService = require('./user.service');
const nodeService = require('./node.service');
const projectFormWorkspaceService = require('./projectFormWorkspace.service');

const BLOCK_TYPES = new Set([
  'header',
  'paragraph',
  'description',
  'spacer',
  'divider',
]);
const NUMERIC_TYPES = new Set(['number', 'currency', 'rating', 'slider']);
const DATE_TYPES = new Set(['date', 'datetime', 'time', 'datepicker', 'date-picker']);
const CATEGORICAL_TYPES = new Set([
  'select',
  'dropdown',
  'radio',
  'checkbox',
  'multiselect',
  'multi-select',
  'tags',
]);
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url']);
const SYSTEM_FORM_CATEGORY = 'system';
const SYSTEM_TARGET_USER_PROFILE = 'user_profile';
const SYSTEM_TARGET_NODE_PROFILE = 'node_profile';
const VALID_SYSTEM_TARGETS = new Set([
  SYSTEM_TARGET_USER_PROFILE,
  SYSTEM_TARGET_NODE_PROFILE,
]);

const makeSystemElement = ({
  id,
  type,
  label,
  required = false,
  placeholder = '',
  options = [],
  bindingPath,
}) => ({
  id,
  type,
  properties: {
    label,
    required,
    placeholder,
    ...(Array.isArray(options) && options.length > 0 ? { options } : {}),
  },
  metadata: {
    systemBound: true,
    bindingPath,
  },
});

const getUserProfileSystemElements = () => [
  makeSystemElement({
    id: 'firstname',
    type: 'text',
    label: 'First Name',
    required: true,
    placeholder: 'Enter first name',
    bindingPath: 'firstname',
  }),
  makeSystemElement({
    id: 'lastname',
    type: 'text',
    label: 'Last Name',
    required: true,
    placeholder: 'Enter last name',
    bindingPath: 'lastname',
  }),
  makeSystemElement({
    id: 'email',
    type: 'email',
    label: 'Email Address',
    required: true,
    placeholder: 'Enter email address',
    bindingPath: 'email',
  }),
  makeSystemElement({
    id: 'phoneNumber',
    type: 'phone',
    label: 'Phone Number',
    required: true,
    placeholder: 'Enter phone number',
    bindingPath: 'phoneNumber',
  }),
  makeSystemElement({
    id: 'profile_title',
    type: 'select',
    label: 'Title',
    options: ['Mr', 'Mrs', 'Miss', 'Dr', 'Pastor'],
    bindingPath: 'profile.title',
  }),
  makeSystemElement({
    id: 'profile_other_name',
    type: 'text',
    label: 'Other Name',
    placeholder: 'Enter other name',
    bindingPath: 'profile.otherName',
  }),
  makeSystemElement({
    id: 'profile_gender',
    type: 'select',
    label: 'Gender',
    options: ['Male', 'Female', 'Other'],
    bindingPath: 'profile.gender',
  }),
  makeSystemElement({
    id: 'profile_dob',
    type: 'date',
    label: 'Date of Birth',
    bindingPath: 'profile.dateOfBirth',
  }),
  makeSystemElement({
    id: 'profile_qualification',
    type: 'select',
    label: 'Highest Qualification',
    options: ['PHD', 'MSC', 'BSC', 'HND EQUIVALENT', 'OTHERS'],
    bindingPath: 'profile.highestQualification',
  }),
  makeSystemElement({
    id: 'profile_professional',
    type: 'text',
    label: 'Profession',
    placeholder: 'Enter profession',
    bindingPath: 'profile.professional',
  }),
  makeSystemElement({
    id: 'profile_employment_category',
    type: 'select',
    label: 'Employment Category',
    options: ['EMPLOYED', 'SELF EMPLOYED', 'UNEMPLOYED', 'RETIRED'],
    bindingPath: 'profile.employmentCategory',
  }),
  makeSystemElement({
    id: 'profile_occupation',
    type: 'text',
    label: 'Occupation',
    placeholder: 'Enter occupation',
    bindingPath: 'profile.occupation',
  }),
  makeSystemElement({
    id: 'profile_employee_id',
    type: 'text',
    label: 'Employee ID',
    placeholder: 'Click Generate to create employee ID',
    bindingPath: 'profile.employeeId',
  }),
  makeSystemElement({
    id: 'profile_office_title',
    type: 'select',
    label: 'Office Title',
    options: ['MD', 'CEO', 'FOUNDER', 'PASTOR', 'OTHERS'],
    bindingPath: 'profile.officeTitle',
  }),
  makeSystemElement({
    id: 'profile_marital_status',
    type: 'select',
    label: 'Marital Status',
    options: ['Single', 'Married', 'Divorced', 'Widowed'],
    bindingPath: 'profile.maritalStatus',
  }),
  makeSystemElement({
    id: 'profile_spouse_name',
    type: 'text',
    label: 'Spouse Name',
    placeholder: 'Enter spouse name',
    bindingPath: 'profile.spouse.name',
  }),
  makeSystemElement({
    id: 'profile_spouse_phone',
    type: 'phone',
    label: 'Spouse Phone Number',
    placeholder: 'Enter spouse phone number',
    bindingPath: 'profile.spouse.phoneNumber',
  }),
  makeSystemElement({
    id: 'profile_spouse_dob',
    type: 'date',
    label: 'Spouse Date of Birth',
    bindingPath: 'profile.spouse.dateOfBirth',
  }),
  makeSystemElement({
    id: 'profile_nok_name',
    type: 'text',
    label: 'Next of Kin Name',
    placeholder: 'Enter next of kin name',
    bindingPath: 'profile.nextOfKin.name',
  }),
  makeSystemElement({
    id: 'profile_nok_phone',
    type: 'phone',
    label: 'Next of Kin Phone Number',
    placeholder: 'Enter next of kin phone number',
    bindingPath: 'profile.nextOfKin.phoneNumber',
  }),
  makeSystemElement({
    id: 'profile_nok_relationship',
    type: 'text',
    label: 'Next of Kin Relationship',
    placeholder: 'Enter relationship',
    bindingPath: 'profile.nextOfKin.relationship',
  }),
  makeSystemElement({
    id: 'profile_state_origin',
    type: 'text',
    label: 'State of Origin',
    placeholder: 'Enter state of origin',
    bindingPath: 'profile.stateOfOrigin',
  }),
  makeSystemElement({
    id: 'profile_lga_origin',
    type: 'text',
    label: 'LGA of Origin',
    placeholder: 'Enter LGA of origin',
    bindingPath: 'profile.lgaOfOrigin',
  }),
  makeSystemElement({
    id: 'profile_home_town',
    type: 'text',
    label: 'Home Town',
    placeholder: 'Enter home town',
    bindingPath: 'profile.homeTown',
  }),
  makeSystemElement({
    id: 'profile_residential_address',
    type: 'textarea',
    label: 'Residential Address',
    placeholder: 'Enter residential address',
    bindingPath: 'profile.residentialAddress',
  }),
  makeSystemElement({
    id: 'profile_state_residence',
    type: 'text',
    label: 'State of Residence',
    placeholder: 'Enter state of residence',
    bindingPath: 'profile.stateOfResidence',
  }),
  makeSystemElement({
    id: 'profile_lga_residence',
    type: 'text',
    label: 'LGA of Residence',
    placeholder: 'Enter LGA of residence',
    bindingPath: 'profile.lgaOfResidence',
  }),
];

const getNodeProfileSystemElements = () => [
  makeSystemElement({
    id: 'name',
    type: 'text',
    label: 'Node Name',
    required: true,
    placeholder: 'Enter node name',
    bindingPath: 'name',
  }),
  makeSystemElement({
    id: 'country',
    type: 'select',
    label: 'Country',
    required: true,
    placeholder: 'Select country',
    options: ['Nigeria'],
    bindingPath: 'country',
  }),
  makeSystemElement({
    id: 'state',
    type: 'select',
    label: 'State / Region',
    placeholder: 'Select state',
    bindingPath: 'state',
  }),
  makeSystemElement({
    id: 'lga',
    type: 'select',
    label: 'LGA / County',
    placeholder: 'Select LGA or county',
    bindingPath: 'city',
  }),
  makeSystemElement({
    id: 'postal_code',
    type: 'text',
    label: 'Postal Code',
    placeholder: 'Enter postal code',
    bindingPath: 'postalCode',
  }),
  makeSystemElement({
    id: 'address',
    type: 'textarea',
    label: 'Address',
    placeholder: 'Enter address',
    bindingPath: 'address',
  }),
  makeSystemElement({
    id: 'date_of_establishment',
    type: 'date',
    label: 'Date of Establishment',
    bindingPath: 'dateOfEstablishment',
  }),
  makeSystemElement({
    id: 'profile_property_status',
    type: 'select',
    label: 'Property Status',
    options: ['Owned', 'Rented', 'Leased', 'Other'],
    bindingPath: 'profile.propertyStatus',
  }),
  makeSystemElement({
    id: 'profile_estimated_value',
    type: 'currency',
    label: 'Estimated Value',
    placeholder: 'Enter estimated value',
    bindingPath: 'profile.estimatedValue',
  }),
  makeSystemElement({
    id: 'profile_building_type',
    type: 'text',
    label: 'Building Type',
    placeholder: 'Enter building type',
    bindingPath: 'profile.buildingType',
  }),
  makeSystemElement({
    id: 'profile_facility_status',
    type: 'select',
    label: 'Facility Status',
    options: ['Completed', 'Not Started', 'Under Construction'],
    bindingPath: 'profile.facilityStatus',
  }),
];

const normalizeSystemFormContract = ({
  body = {},
  existing = null,
  enforceForCreate = false,
}) => {
  const normalized = { ...body };
  const existingMetadata = existing?.metadata || {};
  const existingCategory = existingMetadata?.formCategory || 'standard';
  const incomingCategory = normalized?.metadata?.formCategory;
  const category =
    existingCategory === SYSTEM_FORM_CATEGORY
      ? SYSTEM_FORM_CATEGORY
      : incomingCategory || existingCategory;
  const isSystem = category === SYSTEM_FORM_CATEGORY;

  if (!normalized.metadata) normalized.metadata = {};
  normalized.metadata.formCategory = category;

  if (!isSystem) {
    return normalized;
  }

  const target =
    normalized?.metadata?.systemTarget || existingMetadata?.systemTarget || null;
  if (!target || !VALID_SYSTEM_TARGETS.has(target)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'System forms require metadata.systemTarget = user_profile or node_profile'
    );
  }

  normalized.metadata.systemTarget = target;
  normalized.metadata.systemVersion =
    normalized?.metadata?.systemVersion ||
    existingMetadata?.systemVersion ||
    '1.0.0';

  normalized.configuration = {
    ...(existing?.configuration?.toObject
      ? existing.configuration.toObject()
      : existing?.configuration || {}),
    ...(normalized.configuration || {}),
  };
  normalized.configuration.security = 'private';
  normalized.configuration.publicSecureMode = 'off';
  normalized.configuration.tags = Array.from(
    new Set([...(normalized.configuration.tags || []), 'system', 'profile'])
  );

  if (enforceForCreate && (!normalized.elements || normalized.elements.length === 0)) {
    normalized.elements =
      target === SYSTEM_TARGET_USER_PROFILE
        ? getUserProfileSystemElements()
        : getNodeProfileSystemElements();
  }

  return normalized;
};

const SYSTEM_USER_TOP_LEVEL_FIELDS = new Set([
  'firstname',
  'lastname',
  'email',
  'phoneNumber',
]);

const SYSTEM_USER_PROFILE_FIELDS = new Set([
  'title',
  'otherName',
  'gender',
  'dateOfBirth',
  'highestQualification',
  'professional',
  'employmentCategory',
  'occupation',
  'employeeId',
  'officeTitle',
  'maritalStatus',
  'stateOfOrigin',
  'lgaOfOrigin',
  'homeTown',
  'residentialAddress',
  'stateOfResidence',
  'lgaOfResidence',
]);

const SYSTEM_NODE_TOP_LEVEL_FIELDS = new Set([
  'name',
  'address',
  'city',
  'state',
  'country',
  'postalCode',
  'dateOfEstablishment',
]);

const SYSTEM_NODE_PROFILE_FIELDS = new Set([
  'propertyStatus',
  'facilityStatus',
  // legacy fields retained for backward compatibility with older templates
  'estimatedValue',
  'buildingType',
  'averageAttendance',
  'averageIncome',
]);

const setByPath = (target, path, value) => {
  const segments = String(path || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return;

  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (
      typeof cursor[key] !== 'object' ||
      cursor[key] === null ||
      Array.isArray(cursor[key])
    ) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[segments[segments.length - 1]] = value;
};

const normalizePermissionName = (permission = '') => {
  if (!permission || typeof permission !== 'string') {
    return '';
  }
  if (permission === '*' || permission === 'all:*') {
    return '*';
  }

  const raw = permission.trim().toLowerCase();
  if (!raw.includes(':')) return raw;

  const parts = raw.split(':');
  if (parts.length !== 2) return raw;
  const [first, second] = parts;
  const actionCandidates = new Set([
    'view',
    'read',
    'create',
    'update',
    'delete',
    'manage',
    'assign',
    'approve',
    'export',
    'import',
    'restore',
    'activate',
    'deactivate',
    'move',
    'permissions',
    'upload',
    'download',
    'share',
    'copy',
    'publish',
    'archive',
    'submit',
    'process',
    'complete',
    'cancel',
    'refund',
    'regenerate',
    'togglestatus',
    'assignrole',
    'sendmessage',
    'forgotpassword',
    'resetpassword',
    'verify',
    'refresh',
    'send',
    'draft',
    'retry',
    'public',
    'private',
    'status',
    'auth',
    'all',
  ]);
  if (actionCandidates.has(second)) return `${first}:${second}`;
  if (actionCandidates.has(first)) return `${second}:${first}`;
  return raw;
};

const hasRequiredPermission = async (actorUser, requiredPermission) => {
  if (!actorUser) return false;
  if (actorUser.isSaby || actorUser.isSuper || actorUser.isOwner) return true;

  const roleIds = Array.isArray(actorUser.roles) ? actorUser.roles : [];
  if (roleIds.length === 0) return false;

  const roles = await Role.find({ _id: { $in: roleIds } }).populate('permissions');
  const permissionSet = new Set();
  roles.forEach((role) => {
    (role.permissions || []).forEach((permission) => {
      const name = normalizePermissionName(permission?.name || '');
      if (name) permissionSet.add(name);
    });
  });

  if (permissionSet.has('*')) return true;

  const normalizedRequired = normalizePermissionName(requiredPermission);
  if (permissionSet.has(normalizedRequired)) return true;

  const [resource, action] = normalizedRequired.split(':');
  if (!resource || !action) return false;

  if (permissionSet.has(`${resource}:*`)) return true;
  if (permissionSet.has(`${resource}:manage`)) {
    if (['view', 'read', 'create', 'update', 'delete'].includes(action)) {
      return true;
    }
  }

  return false;
};

const buildSystemUpdatePayload = ({ projectForm, submissionData = {} }) => {
  const payload = {};
  const elements = Array.isArray(projectForm?.elements) ? projectForm.elements : [];

  elements.forEach((element = {}) => {
    const bindingPath = element?.metadata?.bindingPath;
    if (!bindingPath) return;

    const elementId = element?.id;
    let incomingValue;
    if (
      submissionData &&
      Object.prototype.hasOwnProperty.call(submissionData, elementId)
    ) {
      incomingValue = submissionData[elementId];
    } else if (
      submissionData &&
      Object.prototype.hasOwnProperty.call(submissionData, bindingPath)
    ) {
      incomingValue = submissionData[bindingPath];
    } else {
      return;
    }

    setByPath(payload, bindingPath, incomingValue);
  });

  return payload;
};

const sanitizeSystemUpdatePayload = ({ target, payload = {} }) => {
  const sanitized = {};

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (target === SYSTEM_TARGET_USER_PROFILE) {
      if (SYSTEM_USER_TOP_LEVEL_FIELDS.has(key)) {
        sanitized[key] = value;
        return;
      }
      if (key === 'profile' && value && typeof value === 'object') {
        const cleanProfile = {};
        Object.entries(value).forEach(([profileKey, profileValue]) => {
          if (SYSTEM_USER_PROFILE_FIELDS.has(profileKey)) {
            cleanProfile[profileKey] = profileValue;
            return;
          }
          if (profileKey === 'spouse' && profileValue && typeof profileValue === 'object') {
            const spouse = {};
            if (Object.prototype.hasOwnProperty.call(profileValue, 'name')) {
              spouse.name = profileValue.name;
            }
            if (Object.prototype.hasOwnProperty.call(profileValue, 'phoneNumber')) {
              spouse.phoneNumber = profileValue.phoneNumber;
            }
            if (Object.prototype.hasOwnProperty.call(profileValue, 'dateOfBirth')) {
              spouse.dateOfBirth = profileValue.dateOfBirth;
            }
            if (Object.keys(spouse).length > 0) {
              cleanProfile.spouse = spouse;
            }
            return;
          }
          if (profileKey === 'nextOfKin' && profileValue && typeof profileValue === 'object') {
            const nextOfKin = {};
            if (Object.prototype.hasOwnProperty.call(profileValue, 'name')) {
              nextOfKin.name = profileValue.name;
            }
            if (Object.prototype.hasOwnProperty.call(profileValue, 'phoneNumber')) {
              nextOfKin.phoneNumber = profileValue.phoneNumber;
            }
            if (Object.prototype.hasOwnProperty.call(profileValue, 'relationship')) {
              nextOfKin.relationship = profileValue.relationship;
            }
            if (Object.keys(nextOfKin).length > 0) {
              cleanProfile.nextOfKin = nextOfKin;
            }
          }
        });
        if (Object.keys(cleanProfile).length > 0) {
          sanitized.profile = cleanProfile;
        }
      }
      return;
    }

    if (target === SYSTEM_TARGET_NODE_PROFILE) {
      if (SYSTEM_NODE_TOP_LEVEL_FIELDS.has(key)) {
        sanitized[key] = value;
        return;
      }
      if (key === 'profile' && value && typeof value === 'object') {
        const cleanProfile = {};
        Object.entries(value).forEach(([profileKey, profileValue]) => {
          if (SYSTEM_NODE_PROFILE_FIELDS.has(profileKey)) {
            cleanProfile[profileKey] = profileValue;
          }
        });
        if (Object.keys(cleanProfile).length > 0) {
          sanitized.profile = cleanProfile;
        }
      }
    }
  });

  return sanitized;
};

const normalizeTags = (tags = []) =>
  Array.from(
    new Set(
      (Array.isArray(tags) ? tags : [])
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

const SMART_MAPPING_TARGETS = {
  phone: ['phone', 'mobile', 'telephone', 'whatsapp', 'phone_number'],
  email: ['email', 'email_address', 'mail'],
  fullName: ['name', 'full_name', 'member_name', 'fullname'],
  dob: ['dob', 'date_of_birth', 'birth_date'],
  joinDate: ['join_date', 'membership_date', 'start_date'],
  eventDate: ['event_date', 'service_date', 'meeting_date'],
};

const defaultCapabilities = () => ({
  experience: {
    security: {
      enabled: false,
      mode: 'public',
      authRequired: false,
      allowedRoles: [],
      allowedUsers: [],
      restrictByLocation: false,
      allowedCountries: [],
      requireNodeAccess: false,
    },
    compliance: {
      enabled: false,
      trackingMode: 'none',
      frequency: 'none',
      requireNodeId: true,
      requireMonth: true,
      trackCompliance: false,
      autoGenerateCalendar: false,
      autoLockMonthEnd: false,
      calendarRequired: false,
    },
    workflow: {
      enabled: false,
      approvalMode: 'none',
      triggerOn: 'submission',
      steps: [],
    },
  },
  transaction: {
    payment: {
      enabled: false,
      mode: 'none',
      enabledChannels: [],
      defaultChannel: null,
      settlementType: 'none',
      receivingAccount: null,
      channelConfigs: {},
    },
    remittance: {
      enabled: false,
      accountSource: 'none',
      requireNodeAccount: false,
      nodeAccountField: null,
      settlementRule: null,
    },
    invoice: {
      enabled: false,
      calculationMode: 'none',
      currency: null,
      lineItemsEnabled: false,
      discountsEnabled: false,
      taxEnabled: false,
      rules: [],
    },
  },
});

const defaultSmartMappings = () => ({
  enabled: true,
  autoDetect: true,
  allowManualOverride: true,
  fields: {
    phone: 'phone_number',
    email: 'email',
    fullName: 'full_name',
    dob: 'date_of_birth',
    joinDate: 'join_date',
    eventDate: 'event_date',
  },
});

const toLookupTokens = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .split('_')
    .filter(Boolean);

const detectSmartMappings = (elements = [], existingFields = {}) => {
  const detected = { ...existingFields };
  const allowedIds = new Set(
    (Array.isArray(elements) ? elements : [])
      .map((element) => String(element?.id || '').trim())
      .filter(Boolean)
  );

  Object.entries(existingFields || {}).forEach(([key, value]) => {
    if (!value || !allowedIds.has(String(value).trim())) {
      delete detected[key];
    }
  });

  (Array.isArray(elements) ? elements : []).forEach((element = {}) => {
    const elementId = String(element?.id || '').trim();
    if (!elementId) return;

    const candidates = new Set([
      elementId.toLowerCase(),
      ...toLookupTokens(elementId),
      String(element?.properties?.label || '').trim().toLowerCase(),
      ...toLookupTokens(element?.properties?.label || ''),
      ...(Array.isArray(element?.aliases)
        ? element.aliases.flatMap((alias) => [
            String(alias || '').trim().toLowerCase(),
            ...toLookupTokens(alias),
          ])
        : []),
      String(element?.type || '').trim().toLowerCase(),
      String(element?.semantic?.valueType || '').trim().toLowerCase(),
    ]);

    Object.entries(SMART_MAPPING_TARGETS).forEach(([mappingKey, synonyms]) => {
      if (detected[mappingKey]) return;
      if (synonyms.some((synonym) => candidates.has(synonym))) {
        detected[mappingKey] = elementId;
      }
    });
  });

  return detected;
};

const synchronizeCapabilitiesWithLegacyFields = ({
  configuration = {},
  userSettings = {},
  permSettings = {},
  workflows = [],
  paymentConfig = {},
  capabilities = {},
}) => {
  const base = defaultCapabilities();
  const next = {
    experience: {
      security: {
        ...base.experience.security,
        ...(capabilities?.experience?.security || {}),
      },
      compliance: {
        ...base.experience.compliance,
        ...(capabilities?.experience?.compliance || {}),
      },
      workflow: {
        ...base.experience.workflow,
        ...(capabilities?.experience?.workflow || {}),
      },
    },
    transaction: {
      payment: {
        ...base.transaction.payment,
        ...(capabilities?.transaction?.payment || {}),
      },
      remittance: {
        ...base.transaction.remittance,
        ...(capabilities?.transaction?.remittance || {}),
      },
      invoice: {
        ...base.transaction.invoice,
        ...(capabilities?.transaction?.invoice || {}),
      },
    },
  };

  next.experience.security = {
    ...next.experience.security,
    enabled:
      next.experience.security.enabled ||
      configuration?.security === 'private' ||
      configuration?.publicSecureMode === 'single_qr_passwordless',
    mode: configuration?.security === 'private' ? 'private' : 'public',
    authRequired:
      next.experience.security.authRequired ||
      configuration?.publicSecureMode === 'single_qr_passwordless',
    allowedRoles: Array.isArray(userSettings?.access?.allowedRoles)
      ? userSettings.access.allowedRoles
      : next.experience.security.allowedRoles,
    allowedUsers: Array.isArray(userSettings?.access?.allowedUsers)
      ? userSettings.access.allowedUsers
      : next.experience.security.allowedUsers,
    restrictByLocation:
      typeof userSettings?.access?.restrictByLocation === 'boolean'
        ? userSettings.access.restrictByLocation
        : next.experience.security.restrictByLocation,
    allowedCountries: Array.isArray(userSettings?.access?.allowedCountries)
      ? userSettings.access.allowedCountries
      : next.experience.security.allowedCountries,
  };

  next.experience.compliance = {
    ...next.experience.compliance,
    enabled: Boolean(permSettings?.enabled),
    trackingMode: permSettings?.trackingMode || next.experience.compliance.trackingMode,
    frequency:
      permSettings?.trackingMode && permSettings.trackingMode !== 'none'
        ? permSettings.trackingMode
        : next.experience.compliance.frequency,
    requireNodeId:
      typeof permSettings?.requireNodeId === 'boolean'
        ? permSettings.requireNodeId
        : next.experience.compliance.requireNodeId,
    requireMonth:
      typeof permSettings?.requireMonth === 'boolean'
        ? permSettings.requireMonth
        : next.experience.compliance.requireMonth,
    trackCompliance:
      typeof permSettings?.trackCompliance === 'boolean'
        ? permSettings.trackCompliance
        : next.experience.compliance.trackCompliance,
    autoGenerateCalendar:
      typeof permSettings?.autoGenerateCalendar === 'boolean'
        ? permSettings.autoGenerateCalendar
        : next.experience.compliance.autoGenerateCalendar,
    autoLockMonthEnd:
      typeof permSettings?.autoLockMonthEnd === 'boolean'
        ? permSettings.autoLockMonthEnd
        : next.experience.compliance.autoLockMonthEnd,
    calendarRequired:
      typeof permSettings?.calendarRequired === 'boolean'
        ? permSettings.calendarRequired
        : next.experience.compliance.calendarRequired,
  };

  next.experience.workflow = {
    ...next.experience.workflow,
    enabled: Array.isArray(workflows) && workflows.length > 0,
    approvalMode:
      Array.isArray(workflows) && workflows.length > 0
        ? workflows[0]?.type || 'custom'
        : next.experience.workflow.approvalMode,
    triggerOn:
      Array.isArray(workflows) && workflows.length > 0
        ? workflows[0]?.triggerOn || 'submission'
        : next.experience.workflow.triggerOn,
    steps:
      Array.isArray(workflows) && workflows.length > 0
        ? workflows.flatMap((workflow) => workflow?.steps || [])
        : next.experience.workflow.steps,
  };

  next.transaction.payment = {
    ...next.transaction.payment,
    enabled: Boolean(paymentConfig?.enabled),
    mode: paymentConfig?.enabled ? 'payment' : next.transaction.payment.mode,
    enabledChannels: Array.isArray(paymentConfig?.enabledChannels)
      ? paymentConfig.enabledChannels
      : next.transaction.payment.enabledChannels,
    defaultChannel:
      paymentConfig?.defaultChannel !== undefined
        ? paymentConfig.defaultChannel
        : next.transaction.payment.defaultChannel,
    channelConfigs:
      paymentConfig?.channelConfigs || next.transaction.payment.channelConfigs,
  };

  return next;
};

const applyLegacyFieldsFromCapabilities = (payload = {}, existing = {}) => {
  const next = { ...payload };
  const capabilities = payload?.capabilities;
  if (!capabilities || typeof capabilities !== 'object') {
    return next;
  }

  const existingConfiguration =
    existing?.configuration?.toObject
      ? existing.configuration.toObject()
      : existing?.configuration || {};
  const existingUserSettings =
    existing?.userSettings?.toObject
      ? existing.userSettings.toObject()
      : existing?.userSettings || {};
  const existingPermSettings =
    existing?.permSettings?.toObject
      ? existing.permSettings.toObject()
      : existing?.permSettings || {};
  const existingPaymentConfig =
    existing?.paymentConfig?.toObject
      ? existing.paymentConfig.toObject()
      : existing?.paymentConfig || {};

  const securityCapability = capabilities?.experience?.security || {};
  const complianceCapability = capabilities?.experience?.compliance || {};
  const workflowCapability = capabilities?.experience?.workflow || {};
  const paymentCapability = capabilities?.transaction?.payment || {};
  const remittanceCapability = capabilities?.transaction?.remittance || {};
  const invoiceCapability = capabilities?.transaction?.invoice || {};

  next.configuration = {
    ...existingConfiguration,
    ...(next.configuration || {}),
  };
  next.userSettings = {
    ...existingUserSettings,
    ...(next.userSettings || {}),
    access: {
      ...(existingUserSettings.access || {}),
      ...((next.userSettings && next.userSettings.access) || {}),
    },
  };
  next.permSettings = {
    ...existingPermSettings,
    ...(next.permSettings || {}),
  };
  next.paymentConfig = {
    ...existingPaymentConfig,
    ...(next.paymentConfig || {}),
  };

  if (Object.keys(securityCapability).length > 0) {
    if (securityCapability.mode) {
      next.configuration.security = securityCapability.mode;
    }
    if (securityCapability.authRequired !== undefined) {
      next.configuration.publicSecureMode = securityCapability.authRequired
        ? 'single_qr_passwordless'
        : 'off';
    }
    next.userSettings.access.allowedRoles = Array.isArray(securityCapability.allowedRoles)
      ? securityCapability.allowedRoles
      : next.userSettings.access.allowedRoles || [];
    next.userSettings.access.allowedUsers = Array.isArray(securityCapability.allowedUsers)
      ? securityCapability.allowedUsers
      : next.userSettings.access.allowedUsers || [];
    if (typeof securityCapability.restrictByLocation === 'boolean') {
      next.userSettings.access.restrictByLocation =
        securityCapability.restrictByLocation;
    }
    next.userSettings.access.allowedCountries = Array.isArray(
      securityCapability.allowedCountries
    )
      ? securityCapability.allowedCountries
      : next.userSettings.access.allowedCountries || [];
  }

  if (Object.keys(complianceCapability).length > 0) {
    next.permSettings.enabled = Boolean(complianceCapability.enabled);
    if (complianceCapability.trackingMode) {
      next.permSettings.trackingMode = complianceCapability.trackingMode;
    }
    [
      'requireNodeId',
      'requireMonth',
      'trackCompliance',
      'autoGenerateCalendar',
      'autoLockMonthEnd',
      'calendarRequired',
    ].forEach((key) => {
      if (typeof complianceCapability[key] === 'boolean') {
        next.permSettings[key] = complianceCapability[key];
      }
    });
  }

  if (Object.keys(workflowCapability).length > 0 && Array.isArray(next.workflows)) {
    next.workflows = next.workflows.map((workflow, index) =>
      index === 0
        ? {
            ...workflow,
            triggerOn: workflowCapability.triggerOn || workflow.triggerOn,
            type:
              workflowCapability.approvalMode && workflowCapability.approvalMode !== 'none'
                ? workflowCapability.approvalMode
                : workflow.type,
            steps: Array.isArray(workflowCapability.steps) && workflowCapability.steps.length > 0
              ? workflowCapability.steps
              : workflow.steps,
          }
        : workflow
    );
  }

  if (Object.keys(paymentCapability).length > 0) {
    next.paymentConfig.enabled = Boolean(paymentCapability.enabled);
    next.paymentConfig.enabledChannels = Array.isArray(paymentCapability.enabledChannels)
      ? paymentCapability.enabledChannels
      : next.paymentConfig.enabledChannels || [];
    if (paymentCapability.defaultChannel !== undefined) {
      next.paymentConfig.defaultChannel = paymentCapability.defaultChannel;
    }
    if (paymentCapability.channelConfigs) {
      next.paymentConfig.channelConfigs = paymentCapability.channelConfigs;
    }
  }

  if (Object.keys(remittanceCapability).length > 0) {
    next.paymentConfig.remittance = {
      ...(next.paymentConfig.remittance || {}),
      ...remittanceCapability,
    };
  }

  if (Object.keys(invoiceCapability).length > 0) {
    next.paymentConfig.invoice = {
      ...(next.paymentConfig.invoice || {}),
      ...invoiceCapability,
    };
  }

  return next;
};

const applyProjectFormSchemaDefaults = (projectFormLike = {}, options = {}) => {
  const source =
    typeof projectFormLike?.toObject === 'function'
      ? projectFormLike.toObject()
      : projectFormLike || {};

  const elements = Array.isArray(source.elements) ? source.elements : [];
  const smartMappings = {
    ...defaultSmartMappings(),
    ...(source.smartMappings || {}),
    fields: detectSmartMappings(
      elements,
      {
        ...defaultSmartMappings().fields,
        ...((source.smartMappings && source.smartMappings.fields) || {}),
      }
    ),
  };

  const capabilities = synchronizeCapabilitiesWithLegacyFields({
    configuration: source.configuration || {},
    userSettings: source.userSettings || {},
    permSettings: source.permSettings || {},
    workflows: source.workflows || [],
    paymentConfig: source.paymentConfig || {},
    capabilities: source.capabilities || {},
  });

  const metadata = {
    ...(source.metadata || {}),
    formCategory: source?.metadata?.formCategory || 'standard',
    systemTarget: source?.metadata?.systemTarget || null,
    systemVersion: source?.metadata?.systemVersion || null,
    schemaVersion: source?.metadata?.schemaVersion || '1.1.0',
    enabledCapabilities: Array.isArray(source?.metadata?.enabledCapabilities)
      ? source.metadata.enabledCapabilities
      : [],
  };

  const configuration = {
    ...(source.configuration || {}),
    publicSecureMode:
      source?.configuration?.publicSecureMode === 'single_qr_passwordless'
        ? 'single_qr_passwordless'
        : 'off',
  };

  const normalized = {
    ...source,
    workspaceId:
      source?.workspaceId || projectFormWorkspaceService.DEFAULT_WORKSPACE_ID,
    configuration,
    capabilities,
    smartMappings,
    metadata,
  };

  if (options.asDocument && projectFormLike && typeof projectFormLike.set === 'function') {
    projectFormLike.set('workspaceId', normalized.workspaceId);
    projectFormLike.set('configuration', configuration);
    projectFormLike.set('capabilities', capabilities);
    projectFormLike.set('smartMappings', smartMappings);
    projectFormLike.set('metadata', metadata);
    return projectFormLike;
  }

  return normalized;
};

const inferDomainFromTags = (tags = []) => {
  const set = new Set(tags);
  if (
    ['finance', 'financial', 'payment', 'collection', 'offering', 'tithe', 'subscription'].some((t) =>
      set.has(t)
    )
  ) {
    return 'finance';
  }
  if (
    ['attendance', 'members', 'member', 'worship', 'church-attendance'].some((t) => set.has(t))
  ) {
    return 'attendance';
  }
  if (['hr', 'staff', 'employee', 'people'].some((t) => set.has(t))) {
    return 'hr';
  }
  if (['operations', 'ops', 'compliance', 'workflow'].some((t) => set.has(t))) {
    return 'operations';
  }
  return 'custom';
};

const isCatalogCandidate = (element) => {
  const type = String(element?.type || '').toLowerCase();
  if (!element?.id) return false;
  if (BLOCK_TYPES.has(type)) return false;
  return true;
};

const inferAnalysisProfile = ({ configuration = {}, elements = [] }) => {
  const tags = normalizeTags(configuration.tags || []);
  const candidates = (Array.isArray(elements) ? elements : []).filter(isCatalogCandidate);
  let numericFields = 0;
  let categoricalFields = 0;
  let dateFields = 0;
  let textFields = 0;
  const defaultMeasureFieldKeys = [];
  const defaultDimensionFieldKeys = [];
  let primaryTimeField = null;

  candidates.forEach((element) => {
    const type = String(element?.type || '').toLowerCase();
    const key = element?.id;
    const role = String(element?.semantic?.role || '').toLowerCase();

    if (DATE_TYPES.has(type)) {
      dateFields += 1;
      if (!primaryTimeField && key) primaryTimeField = key;
    }
    if (NUMERIC_TYPES.has(type)) {
      numericFields += 1;
    } else if (CATEGORICAL_TYPES.has(type)) {
      categoricalFields += 1;
    } else if (TEXT_TYPES.has(type)) {
      textFields += 1;
    }

    if (key) {
      if (role === 'measure' || NUMERIC_TYPES.has(type)) {
        defaultMeasureFieldKeys.push(key);
      }
      if (role === 'dimension' || CATEGORICAL_TYPES.has(type) || DATE_TYPES.has(type)) {
        defaultDimensionFieldKeys.push(key);
      }
    }
  });

  const hasNumeric = numericFields > 0;
  const hasNonNumeric = categoricalFields + dateFields + textFields > 0;
  const dataNature = hasNumeric && hasNonNumeric ? 'hybrid' : hasNumeric ? 'quantitative' : 'qualitative';

  return {
    dataNature,
    domain: inferDomainFromTags(tags),
    primaryTimeField: primaryTimeField || 'event_date',
    defaultMeasureFieldKeys: Array.from(new Set(defaultMeasureFieldKeys)).slice(0, 20),
    defaultDimensionFieldKeys: Array.from(new Set(defaultDimensionFieldKeys)).slice(0, 20),
    currency: tags.some((t) => ['finance', 'financial', 'payment', 'collection', 'offering', 'tithe'].includes(t))
      ? 'NGN'
      : null,
    scoreStrategy: 'rule_based',
    inferredAt: new Date(),
    fieldStats: {
      totalFields: candidates.length,
      numericFields,
      categoricalFields,
      dateFields,
      textFields,
    },
  };
};

const enrichConfigurationWithAnalysisProfile = ({
  configuration = {},
  elements = [],
  existingProfile = null,
}) => {
  const inferred = inferAnalysisProfile({ configuration, elements });
  const explicit = configuration.analysisProfile || {};
  const base = existingProfile || {};
  const merged = {
    ...inferred,
    ...base,
    ...explicit,
    defaultMeasureFieldKeys:
      Array.isArray(explicit.defaultMeasureFieldKeys) &&
      explicit.defaultMeasureFieldKeys.length > 0
        ? explicit.defaultMeasureFieldKeys
        : inferred.defaultMeasureFieldKeys,
    defaultDimensionFieldKeys:
      Array.isArray(explicit.defaultDimensionFieldKeys) &&
      explicit.defaultDimensionFieldKeys.length > 0
        ? explicit.defaultDimensionFieldKeys
        : inferred.defaultDimensionFieldKeys,
    inferredAt: explicit.inferredAt || new Date(),
  };
  return {
    ...configuration,
    tags: normalizeTags(configuration.tags || []),
    analysisProfile: merged,
  };
};

const hasFileUploadElement = (elements = []) =>
  Array.isArray(elements) &&
  elements.some((element) => {
    const type = String(element?.type || '').toLowerCase();
    if (type.includes('file') || type.includes('upload')) {
      return true;
    }

    const properties = element?.properties || {};
    return Boolean(properties.accept || properties.acceptedTypes);
  });

const normalizeWorkflowTriggerOn = (workflows = []) => {
  if (!Array.isArray(workflows)) return [];

  const createWorkflowId = () =>
    `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const createStepId = (index = 0) =>
    `step_${index + 1}_${Math.random().toString(36).slice(2, 7)}`;

  return workflows.map((workflow) => {
    const triggerOn = String(workflow?.triggerOn || '').toLowerCase();
    const steps = Array.isArray(workflow?.steps)
      ? workflow.steps.map((step = {}, index) => ({
          ...step,
          id: step?.id || createStepId(index),
          name: step?.name || `Step ${index + 1}`,
          stepOrder:
            Number.isFinite(step?.stepOrder) && step.stepOrder >= 0
              ? step.stepOrder
              : index,
        }))
      : [];

    return {
      ...workflow,
      id: workflow?.id || createWorkflowId(),
      triggerOn: triggerOn === 'submit' ? 'submission' : workflow?.triggerOn || 'submission',
      steps,
    };
  });
};

const isStrictPublicAccessible = (projectForm) => {
  if (!projectForm) return false;
  const isSystemForm = projectForm?.metadata?.formCategory === SYSTEM_FORM_CATEGORY;
  return (
    projectForm?.metadata?.deploymentStatus === 'published' &&
    projectForm?.status === 'active' &&
    (projectForm?.configuration?.security === 'public' || isSystemForm)
  );
};

const sanitizePublicForm = (projectForm) => {
  const source =
    typeof projectForm?.toObject === 'function' ? projectForm.toObject() : projectForm;

  const safeElements = Array.isArray(source.elements)
    ? source.elements.map((element = {}) => ({
        id: element.id,
        type: element.type,
        properties: element.properties || {},
      }))
    : [];

  const behaviorSettings = source?.userSettings?.behavior || {};
  const uiSettings = source?.userSettings?.ui || {};

  return {
    shareRef: source.shareRef || null,
    shareCode: source.shareCode || null,
    publicRef: source.publicRef,
    formReference: source.formReference || null,
    configuration: {
      projectName: source.configuration?.projectName || '',
      tags: Array.isArray(source.configuration?.tags)
        ? source.configuration.tags
        : [],
      security: source.configuration?.security || 'public',
      publicSecureMode: source.configuration?.publicSecureMode || 'off',
    },
    elements: safeElements,
    style: source.style || 'default',
    wizardMode: Boolean(source.wizardMode),
    columnSpans: source.columnSpans || {},
    userSettings: {
      behavior: {
        allowMultipleSubmissions:
          behaviorSettings.allowMultipleSubmissions !== false,
        submitOnComplete: behaviorSettings.submitOnComplete !== false,
      },
      ui: uiSettings,
    },
    metadata: {
      version: source.metadata?.version || '1.0.0',
      elementsCount:
        source.metadata?.elementsCount ||
        safeElements.length,
      hasValidation: Boolean(source.metadata?.hasValidation),
      lastModified: source.metadata?.lastModified || source.updatedAt || null,
      formCategory: source.metadata?.formCategory || 'standard',
      systemTarget: source.metadata?.systemTarget || null,
      systemVersion: source.metadata?.systemVersion || null,
    },
  };
};

const resolvePublicSecureMode = (projectForm) => {
  if (projectForm?.metadata?.formCategory === SYSTEM_FORM_CATEGORY) {
    return 'single_qr_passwordless';
  }
  const mode = String(
    projectForm?.configuration?.publicSecureMode ||
      projectForm?.metadata?.publicSecureMode ||
      'off'
  ).toLowerCase();

  if (mode === 'single_qr_passwordless') return mode;
  return 'off';
};

const buildSchemaHash = (projectForm) => {
  const payload = {
    projectId: projectForm?.projectId || '',
    publicRef: projectForm?.publicRef || '',
    shareRef: projectForm?.shareRef || '',
    version: projectForm?.metadata?.version || '1.0.0',
    updatedAt: projectForm?.updatedAt
      ? new Date(projectForm.updatedAt).toISOString()
      : null,
    elements: Array.isArray(projectForm?.elements)
      ? projectForm.elements.map((element = {}) => ({
          id: element.id,
          type: element.type,
          properties: element.properties || {},
        }))
      : [],
  };

  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
};

const buildPublicQrContext = (projectForm, options = {}) => {
  const secureMode = resolvePublicSecureMode(projectForm);
  const requiresIdentityChallenge = secureMode === 'single_qr_passwordless';
  const ttlSec = Number(config?.publicForm?.qrContextTtlSec || 900);
  const nowEpoch = Math.floor(Date.now() / 1000);
  const schemaHash = buildSchemaHash(projectForm);
  const qrVersion = 'v1';

  const claims = {
    typ: 'public_qr_context',
    jti: randomUUID(),
    tenantId: projectForm?.tenantId || null,
    projectId: projectForm?.projectId || null,
    projectFormId: projectForm?._id ? String(projectForm._id) : null,
    publicRef: projectForm?.publicRef || null,
    shareRef: projectForm?.shareRef || null,
    shareCode: projectForm?.shareCode || null,
    deploymentStatus: projectForm?.metadata?.deploymentStatus || null,
    status: projectForm?.status || null,
    security: projectForm?.configuration?.security || null,
    publicSecureMode: secureMode,
    pipelineTarget: 'postgres_unified',
    schemaVersion: projectForm?.metadata?.version || '1.0.0',
    schemaHash,
    qrVersion,
    issuedAt: new Date().toISOString(),
    resolvedBy: options?.resolvedBy || null,
  };

  const token = jwt.sign(claims, config.publicForm.qrContextSecret, {
    algorithm: 'HS256',
    issuer: 'saby-public-form',
    audience: 'saby-public-form-entry',
    expiresIn: ttlSec,
    notBefore: 0,
  });

  return {
    secureMode,
    requiresIdentityChallenge,
    qrContextToken: token,
    qrContextExpiresAt: new Date((nowEpoch + ttlSec) * 1000).toISOString(),
    qrVersion,
    schemaHash,
    schemaVersion: claims.schemaVersion,
    pipelineTarget: claims.pipelineTarget,
  };
};

const normalizeModuleFolderName = (projectName = '') => {
  const trimmed = String(projectName || '').trim();
  if (!trimmed) return 'module';
  return trimmed.slice(0, 120);
};

const ensureModuleStorageFolder = async (projectForm, { userId } = {}) => {
  if (!projectForm || !hasFileUploadElement(projectForm.elements)) {
    return null;
  }

  const folderName = normalizeModuleFolderName(
    projectForm?.configuration?.projectName
  );
  const ownerId =
    userId || projectForm?.createdBy?._id || projectForm?.createdBy || null;

  if (!projectForm.tenantId || !ownerId) {
    return null;
  }

  const existing = await StorageFolder.findOne({
    tenantId: projectForm.tenantId,
    name: folderName,
    parentFolder: null,
    status: 'active',
  }).sort({ createdAt: 1 });

  if (existing) {
    return existing;
  }

  return StorageFolder.create({
    tenantId: projectForm.tenantId,
    userId: ownerId,
    name: folderName,
    parentFolder: null,
    metadata: {
      description: `Auto-created folder for module: ${folderName}`,
      moduleProjectId: projectForm.projectId,
    },
  });
};

const getProjectStorageFolderByProjectId = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  const folderName = normalizeModuleFolderName(
    projectForm?.configuration?.projectName
  );

  const existing = await StorageFolder.findOne({
    tenantId: projectForm.tenantId,
    name: folderName,
    parentFolder: null,
    status: 'active',
  }).sort({ createdAt: 1 });

  if (existing) {
    return existing;
  }

  const ownerId = projectForm?.createdBy?._id || projectForm?.createdBy || null;
  if (!ownerId) {
    return null;
  }

  return StorageFolder.create({
    tenantId: projectForm.tenantId,
    userId: ownerId,
    name: folderName,
    parentFolder: null,
    metadata: {
      description: `Auto-created folder for module: ${folderName}`,
      moduleProjectId: projectForm.projectId,
    },
  });
};

/**
 * Create a project form
 * @param {Object} projectFormBody - The project form data
 * @param {string} tenantId - The tenant ID
 * @param {ObjectId} createdBy - The user creating the project
 * @returns {Promise<ProjectForm>}
 */
const createProjectForm = async (
  projectFormBody,
  tenantId,
  createdBy,
  options = {}
) => {
  let normalizedBody = { ...projectFormBody };
  normalizedBody = applyLegacyFieldsFromCapabilities(normalizedBody, null);
  normalizedBody = normalizeSystemFormContract({
    body: normalizedBody,
    existing: null,
    enforceForCreate: true,
  });
  normalizedBody.workflows = normalizeWorkflowTriggerOn(
    normalizedBody.workflows || []
  );
  normalizedBody.configuration = enrichConfigurationWithAnalysisProfile({
    configuration: normalizedBody.configuration || {},
    elements: normalizedBody.elements || [],
  });
  normalizedBody = applyProjectFormSchemaDefaults(normalizedBody);

  const workspaceId = await projectFormWorkspaceService.resolveWorkspaceForFormWrite({
    tenantId,
    actorUserId: options.actorUserId || createdBy,
    workspaceId: normalizedBody.workspaceId || options.workspaceId,
  });
  normalizedBody.workspaceId = workspaceId;

  const projectForm = await ProjectForm.createProjectForm(
    normalizedBody,
    tenantId,
    createdBy
  );

  await fieldCatalogService.syncCatalogFromForm(projectForm);
  await ensureModuleStorageFolder(projectForm, { userId: createdBy });
  return projectForm;
};

/**
 * Query for project forms
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {string} [options.populate] - Comma separated fields to populate
 * @returns {Promise<QueryResult>}
 */
const queryProjectForms = async (filter, options) => {
  // Add filter to exclude deleted projects by default
  const finalFilter = {
    ...filter,
    deletedAt: null,
  };

  const projectForms = await ProjectForm.paginate(finalFilter, {
    ...options,
    populate: options.populate || 'createdBy',
  });

  if (Array.isArray(projectForms?.results)) {
    projectForms.results = projectForms.results.map((projectForm) =>
      applyProjectFormSchemaDefaults(projectForm)
    );
  }

  return projectForms;
};

/**
 * Get the canonical system form for a tenant and target.
 * This bypasses generic list pagination so clients always resolve
 * the tenant's exact user_profile or node_profile form.
 *
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {'user_profile'|'node_profile'} params.target
 * @param {boolean} [params.syncTemplate=true]
 * @returns {Promise<ProjectForm>}
 */
const getSystemProjectFormForTenant = async ({
  tenantId,
  target,
  syncTemplate = true,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  if (!VALID_SYSTEM_TARGETS.has(target)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid system form target');
  }

  let projectForm = await ProjectForm.findOne({
    tenantId,
    deletedAt: null,
    'metadata.formCategory': SYSTEM_FORM_CATEGORY,
    'metadata.systemTarget': target,
  }).populate('createdBy');

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'System form not found');
  }

  if (syncTemplate) {
    projectForm = await syncSystemFormTemplateIfNeeded(projectForm);
    if (projectForm?.populate) {
      await projectForm.populate('createdBy');
    }
  }

  return projectForm;
};

/**
 * Get project form by id
 * @param {ObjectId} id - The project form ID
 * @param {Object} options - Query options
 * @returns {Promise<ProjectForm>}
 */
const getProjectFormById = async (id, options = {}) => {
  const populateFields = options.populate || 'createdBy';
  const projectForm = await ProjectForm.findById(id).populate(populateFields);

  if (!projectForm || (!options.includeDeleted && projectForm.deletedAt)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  return applyProjectFormSchemaDefaults(projectForm, { asDocument: true });
};

/**
 * Get project form by project ID
 * @param {string} projectId - The unique project ID
 * @param {Object} options - Query options
 * @returns {Promise<ProjectForm>}
 */
const getProjectFormByProjectId = async (projectId, options = {}) => {
  const populateFields = options.populate || 'createdBy';
  const projectForm = await ProjectForm.findOne({
    projectId,
    deletedAt: null,
  }).populate(populateFields);

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  return applyProjectFormSchemaDefaults(projectForm, { asDocument: true });
};

/**
 * Get project form by canonical public reference
 * @param {string} publicRef
 * @param {Object} options
 * @returns {Promise<ProjectForm>}
 */
const getProjectFormByPublicRef = async (publicRef, options = {}) => {
  const populateFields = options.populate || 'createdBy';
  const projectForm = await ProjectForm.findOne({
    publicRef,
    deletedAt: null,
  }).populate(populateFields);

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  return applyProjectFormSchemaDefaults(projectForm, { asDocument: true });
};

/**
 * Resolve and return strict public form payload by reference.
 * Supports canonical publicRef and legacy projectId.
 * @param {string} reference
 * @returns {Promise<Object>}
 */
const getPublicProjectFormByReference = async (reference) => {
  let projectForm = await ProjectForm.findOne({
    shareRef: reference,
    deletedAt: null,
  });
  let resolvedBy = 'shareRef';

  if (!projectForm) {
    projectForm = await ProjectForm.findOne({
      publicRef: reference,
      deletedAt: null,
    });
    resolvedBy = 'publicRef';
  }

  if (!projectForm) {
    projectForm = await ProjectForm.findOne({
      projectId: reference,
      deletedAt: null,
    });
    resolvedBy = 'projectId';
  }

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  await syncSystemFormTemplateIfNeeded(projectForm);

  if (!isStrictPublicAccessible(projectForm)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'This module is not currently available for public access'
    );
  }

  return {
    form: sanitizePublicForm(projectForm),
    canonicalRef:
      projectForm.shareRef || projectForm.publicRef || projectForm.projectId,
    legacyResolved: resolvedBy === 'projectId',
    resolvedBy,
    projectForm,
  };
};

/**
 * Resolve and return strict public form payload by short code.
 * @param {string} shortCode
 * @returns {Promise<Object>}
 */
const getPublicProjectFormByShortCode = async (shortCode) => {
  const projectForm = await ProjectForm.findOne({
    shareCode: shortCode,
    deletedAt: null,
  });

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Short link not found');
  }

  await syncSystemFormTemplateIfNeeded(projectForm);

  if (!isStrictPublicAccessible(projectForm)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'This module is not currently available for public access'
    );
  }

  return {
    form: sanitizePublicForm(projectForm),
    canonicalRef:
      projectForm.shareRef || projectForm.publicRef || projectForm.projectId,
    legacyResolved: false,
    resolvedBy: 'shareCode',
    projectForm,
  };
};

/**
 * Get project forms by tenant ID
 * @param {string} tenantId - The tenant ID
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getProjectFormsByTenant = async (tenantId, filter = {}, options = {}) => {
  const tenantFilter = {
    ...filter,
    tenantId,
    deletedAt: null,
  };

  return queryProjectForms(tenantFilter, options);
};

/**
 * Get project forms by user (created by user)
 * @param {ObjectId} userId - The user ID
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getProjectFormsByUser = async (userId, filter = {}, options = {}) => {
  const userFilter = {
    ...filter,
    createdBy: userId,
    deletedAt: null,
  };

  return queryProjectForms(userFilter, options);
};

/**
 * Duplicate a project form by projectId
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.tenantId
 * @param {ObjectId|string} params.actorUserId
 * @param {string} [params.name]
 * @param {string} [params.workspaceId]
 * @returns {Promise<ProjectForm>}
 */
const duplicateProjectFormByProjectId = async ({
  projectId,
  tenantId,
  actorUserId,
  name = '',
  workspaceId = '',
}) => {
  const source = await ProjectForm.findOne({
    projectId,
    tenantId,
    deletedAt: null,
  });

  if (!source) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  const sourceWorkspaceId = String(
    source.workspaceId || projectFormWorkspaceService.DEFAULT_WORKSPACE_ID
  );

  await projectFormWorkspaceService.assertWorkspaceAccess({
    tenantId,
    workspaceId: sourceWorkspaceId,
    userId: actorUserId,
    allowedRoles: [
      projectFormWorkspaceService.WORKSPACE_ROLE_OWNER,
      projectFormWorkspaceService.WORKSPACE_ROLE_EDITOR,
    ],
  });

  const targetWorkspaceId =
    (workspaceId && String(workspaceId).trim()) || sourceWorkspaceId;

  await projectFormWorkspaceService.assertWorkspaceAccess({
    tenantId,
    workspaceId: targetWorkspaceId,
    userId: actorUserId,
    allowedRoles: [
      projectFormWorkspaceService.WORKSPACE_ROLE_OWNER,
      projectFormWorkspaceService.WORKSPACE_ROLE_EDITOR,
    ],
  });

  const sourceObj = source.toObject();
  const baseProjectName =
    sourceObj?.configuration?.projectName || sourceObj?.projectId || 'Module';
  const duplicateName = String(name || '').trim() || `${baseProjectName} Copy`;

  const duplicatePayload = {
    configuration: {
      ...(sourceObj.configuration || {}),
      projectName: duplicateName,
    },
    elements: Array.isArray(sourceObj.elements) ? sourceObj.elements : [],
    style: sourceObj.style || 'default',
    wizardMode: Boolean(sourceObj.wizardMode),
    columnSpans: sourceObj.columnSpans || {},
    userSettings: sourceObj.userSettings || {},
    permSettings: sourceObj.permSettings || {},
    paymentConfig: sourceObj.paymentConfig || {},
    workflows: Array.isArray(sourceObj.workflows) ? sourceObj.workflows : [],
    metadata: {
      ...(sourceObj.metadata || {}),
      deploymentStatus: 'draft',
      version: '1.0.0',
      lastModified: new Date(),
    },
    status: 'inactive',
    workspaceId: targetWorkspaceId,
  };

  const created = await createProjectForm(
    duplicatePayload,
    tenantId,
    actorUserId,
    {
      actorUserId,
      workspaceId: targetWorkspaceId,
    }
  );

  return created;
};

/**
 * Update project form by id
 * @param {ObjectId} projectFormId - The project form ID
 * @param {Object} updateBody - The update data
 * @param {Object} options - Update options
 * @returns {Promise<ProjectForm>}
 */
const updateProjectFormById = async (
  projectFormId,
  updateBody,
  options = {}
) => {
  let normalizedUpdateBody = { ...updateBody };
  if (Array.isArray(updateBody.workflows)) {
    normalizedUpdateBody.workflows = normalizeWorkflowTriggerOn(updateBody.workflows);
  }
  const projectForm = await getProjectFormById(projectFormId);
  normalizedUpdateBody = applyLegacyFieldsFromCapabilities(
    normalizedUpdateBody,
    projectForm
  );
  if (
    Object.prototype.hasOwnProperty.call(normalizedUpdateBody, 'workspaceId')
  ) {
    if (!options.actorUserId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'actorUserId is required to move a module between workspaces'
      );
    }
    const resolvedWorkspaceId =
      await projectFormWorkspaceService.resolveWorkspaceForFormWrite({
        tenantId: projectForm.tenantId,
        actorUserId: options.actorUserId,
        workspaceId: normalizedUpdateBody.workspaceId,
      });
    normalizedUpdateBody.workspaceId = resolvedWorkspaceId;
  }
  normalizedUpdateBody = normalizeSystemFormContract({
    body: normalizedUpdateBody,
    existing: projectForm,
    enforceForCreate: false,
  });

  // Update metadata
  if (normalizedUpdateBody.metadata) {
    normalizedUpdateBody.metadata.lastModified = new Date();
    const currentVersion = String(projectForm?.metadata?.version || '1.0.0');
    const [major = 1, minor = 0, patch = 0] = currentVersion
      .split('.')
      .map((part) => Number(part) || 0);
    normalizedUpdateBody.metadata.version = `${major}.${minor}.${patch + 1}`;
  }

  const mergedElements = Array.isArray(normalizedUpdateBody.elements)
    ? normalizedUpdateBody.elements
    : projectForm.elements || [];
  const mergedConfiguration = enrichConfigurationWithAnalysisProfile({
    configuration: {
      ...(projectForm.configuration?.toObject
        ? projectForm.configuration.toObject()
        : projectForm.configuration || {}),
      ...(normalizedUpdateBody.configuration || {}),
    },
    elements: mergedElements,
    existingProfile: projectForm?.configuration?.analysisProfile || null,
  });
  normalizedUpdateBody.configuration = mergedConfiguration;
  normalizedUpdateBody = applyProjectFormSchemaDefaults({
    ...(projectForm?.toObject ? projectForm.toObject() : projectForm),
    ...normalizedUpdateBody,
    configuration: mergedConfiguration,
    elements: mergedElements,
    workflows: normalizedUpdateBody.workflows || projectForm.workflows || [],
    userSettings: {
      ...(projectForm.userSettings?.toObject
        ? projectForm.userSettings.toObject()
        : projectForm.userSettings || {}),
      ...(normalizedUpdateBody.userSettings || {}),
    },
    permSettings: {
      ...(projectForm.permSettings?.toObject
        ? projectForm.permSettings.toObject()
        : projectForm.permSettings || {}),
      ...(normalizedUpdateBody.permSettings || {}),
    },
    paymentConfig: {
      ...(projectForm.paymentConfig?.toObject
        ? projectForm.paymentConfig.toObject()
        : projectForm.paymentConfig || {}),
      ...(normalizedUpdateBody.paymentConfig || {}),
    },
    metadata: {
      ...(projectForm.metadata?.toObject
        ? projectForm.metadata.toObject()
        : projectForm.metadata || {}),
      ...(normalizedUpdateBody.metadata || {}),
    },
  });

  Object.assign(projectForm, normalizedUpdateBody);
  await projectForm.save();

  if (options.populate) {
    await projectForm.populate(options.populate);
  }

  await fieldCatalogService.syncCatalogFromForm(projectForm);
  await ensureModuleStorageFolder(projectForm);
  return projectForm;
};

const buildSystemFormTemplate = (target) => {
  if (target === SYSTEM_TARGET_USER_PROFILE) {
    return {
      configuration: {
        projectName: 'User Profile',
        tags: ['system', 'profile', 'user'],
        accessibility: ['api', 'mobile'],
        security: 'private',
        publicSecureMode: 'off',
      },
      elements: getUserProfileSystemElements(),
      style: 'default',
      wizardMode: false,
      userSettings: {
        behavior: {
          allowMultipleSubmissions: true,
          enableProgressSave: true,
        },
        distribution: {
          enableSharing: false,
          allowEmbedding: false,
          generateQR: false,
        },
      },
      metadata: {
        deploymentStatus: 'published',
        formCategory: SYSTEM_FORM_CATEGORY,
        systemTarget: SYSTEM_TARGET_USER_PROFILE,
        systemVersion: '1.0.0',
        integrations: ['web', 'mobile'],
      },
    };
  }

  if (target === SYSTEM_TARGET_NODE_PROFILE) {
    return {
      configuration: {
        projectName: 'Node Profile',
        tags: ['system', 'profile', 'node'],
        accessibility: ['api', 'mobile'],
        security: 'private',
        publicSecureMode: 'off',
      },
      elements: getNodeProfileSystemElements(),
      style: 'default',
      wizardMode: false,
      userSettings: {
        behavior: {
          allowMultipleSubmissions: true,
          enableProgressSave: true,
        },
        distribution: {
          enableSharing: false,
          allowEmbedding: false,
          generateQR: false,
        },
      },
      metadata: {
        deploymentStatus: 'published',
        formCategory: SYSTEM_FORM_CATEGORY,
        systemTarget: SYSTEM_TARGET_NODE_PROFILE,
        systemVersion: '1.1.0',
        integrations: ['web', 'mobile'],
      },
    };
  }

  throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported system target: ${target}`);
};

const syncSystemFormTemplateIfNeeded = async (projectForm) => {
  if (!projectForm || projectForm.deletedAt) return projectForm;
  if (projectForm?.metadata?.formCategory !== SYSTEM_FORM_CATEGORY) return projectForm;

  const target = projectForm?.metadata?.systemTarget;
  if (!VALID_SYSTEM_TARGETS.has(target)) return projectForm;

  const template = buildSystemFormTemplate(target);
  const currentVersion = String(projectForm?.metadata?.systemVersion || '');
  const expectedVersion = String(template?.metadata?.systemVersion || '');
  if (currentVersion === expectedVersion) return projectForm;

  projectForm.elements = template.elements;
  projectForm.metadata = {
    ...(projectForm.metadata || {}),
    ...template.metadata,
    deploymentStatus:
      projectForm?.metadata?.deploymentStatus || template.metadata.deploymentStatus,
  };
  projectForm.configuration = {
    ...(projectForm.configuration?.toObject
      ? projectForm.configuration.toObject()
      : projectForm.configuration || {}),
    ...(template.configuration || {}),
  };
  await projectForm.save();
  return projectForm;
};

const bootstrapSystemFormsForTenant = async ({
  tenantId,
  createdBy,
  targets = [SYSTEM_TARGET_USER_PROFILE, SYSTEM_TARGET_NODE_PROFILE],
  force = false,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!createdBy) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'createdBy is required');
  }

  const requestedTargets = Array.from(
    new Set((Array.isArray(targets) ? targets : []).filter((target) => VALID_SYSTEM_TARGETS.has(target)))
  );
  const normalizedTargets =
    requestedTargets.length > 0
      ? requestedTargets
      : [SYSTEM_TARGET_USER_PROFILE, SYSTEM_TARGET_NODE_PROFILE];

  const results = [];

  for (const target of normalizedTargets) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await ProjectForm.findOne({
      tenantId,
      deletedAt: null,
      'metadata.formCategory': SYSTEM_FORM_CATEGORY,
      'metadata.systemTarget': target,
    });

    if (existing && !force) {
      results.push({
        target,
        status: 'exists',
        projectId: existing.projectId,
        publicRef: existing.publicRef,
        shareRef: existing.shareRef,
      });
      // eslint-disable-next-line no-continue
      continue;
    }

    if (existing && force) {
      // eslint-disable-next-line no-await-in-loop
      await existing.softDelete(createdBy);
    }

    const template = buildSystemFormTemplate(target);
    // eslint-disable-next-line no-await-in-loop
    const created = await createProjectForm(template, tenantId, createdBy);
    results.push({
      target,
      status: 'created',
      projectId: created.projectId,
      publicRef: created.publicRef,
      shareRef: created.shareRef,
    });
  }

  return {
    tenantId,
    totalRequested: normalizedTargets.length,
    created: results.filter((item) => item.status === 'created').length,
    existing: results.filter((item) => item.status === 'exists').length,
    results,
  };
};

const submitSystemFormByPublicRef = async ({
  publicRef,
  actorUser,
  targetId = null,
  submissionData = {},
}) => {
  if (!publicRef) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'publicRef is required');
  }
  if (!actorUser?._id || !actorUser?.tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authenticated user is required');
  }

  const projectForm = await ProjectForm.findOne({
    publicRef,
    tenantId: actorUser.tenantId,
    deletedAt: null,
  });

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'System form not found');
  }

  if (projectForm?.metadata?.formCategory !== SYSTEM_FORM_CATEGORY) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This form is not a system form');
  }

  const systemTarget = projectForm?.metadata?.systemTarget;
  if (!VALID_SYSTEM_TARGETS.has(systemTarget)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid system form target');
  }

  const mappedPayload = buildSystemUpdatePayload({
    projectForm,
    submissionData,
  });
  const updatePayload = sanitizeSystemUpdatePayload({
    target: systemTarget,
    payload: mappedPayload,
  });

  if (Object.keys(updatePayload).length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No valid system-bound fields found in submission payload'
    );
  }

  if (systemTarget === SYSTEM_TARGET_USER_PROFILE) {
    const resolvedTargetUserId = targetId || String(actorUser._id);
    const targetUser = await User.findById(resolvedTargetUserId);
    if (!targetUser) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Target user not found');
    }
    if (String(targetUser.tenantId) !== String(actorUser.tenantId)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Target user belongs to another tenant');
    }

    const isSelfUpdate = String(targetUser._id) === String(actorUser._id);
    if (!isSelfUpdate) {
      const canUpdateUser = await hasRequiredPermission(actorUser, 'user:update');
      if (!canUpdateUser) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'You are not authorized to update another user profile'
        );
      }
    }

    const updatedUser = await userService.updateUserById(
      targetUser._id,
      updatePayload,
      actorUser
    );

    logger.info('system_form_submission', {
      tenantId: actorUser.tenantId,
      actorUserId: String(actorUser._id),
      targetType: SYSTEM_TARGET_USER_PROFILE,
      targetId: String(updatedUser._id),
      formRef: publicRef,
      success: true,
    });

    return {
      success: true,
      systemTarget,
      formRef: publicRef,
      targetId: String(updatedUser._id),
      updatedEntity: userService.buildUserResponse(updatedUser),
      message: 'User profile updated successfully via system form',
    };
  }

  if (systemTarget === SYSTEM_TARGET_NODE_PROFILE) {
    if (!targetId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'targetId is required for node profile system form submission'
      );
    }

    const targetNode = await nodeService.getNodeById(targetId, { populate: '' });
    if (String(targetNode.tenantId) !== String(actorUser.tenantId)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Target node belongs to another tenant');
    }

    const hasNodeUpdatePermission = await hasRequiredPermission(actorUser, 'node:update');
    const isAssignedNodeUser = Boolean(
      await Nodes.exists({
        _id: targetNode._id,
        tenantId: actorUser.tenantId,
        users: actorUser._id,
        deletedAt: null,
        isActive: true,
      })
    );

    if (!hasNodeUpdatePermission && !isAssignedNodeUser) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You are not authorized to update node profile'
      );
    }

    const updatedNode = await nodeService.updateNodeById(targetNode._id, updatePayload);

    logger.info('system_form_submission', {
      tenantId: actorUser.tenantId,
      actorUserId: String(actorUser._id),
      targetType: SYSTEM_TARGET_NODE_PROFILE,
      targetId: String(updatedNode._id),
      formRef: publicRef,
      success: true,
    });

    return {
      success: true,
      systemTarget,
      formRef: publicRef,
      targetId: String(updatedNode._id),
      updatedEntity: nodeService.buildNodeResponse(updatedNode),
      message: 'Node profile updated successfully via system form',
    };
  }

  throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported system form target');
};

/**
 * Update project form by project ID
 * @param {string} projectId - The unique project ID
 * @param {Object} updateBody - The update data
 * @param {Object} options - Update options
 * @returns {Promise<ProjectForm>}
 */
const updateProjectFormByProjectId = async (
  projectId,
  updateBody,
  options = {}
) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  return updateProjectFormById(projectForm._id, updateBody, options);
};

/**
 * Delete project form by id (hard delete)
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const deleteProjectFormById = async (projectFormId) => {
  const projectForm = await getProjectFormById(projectFormId);
  await projectForm.deleteOne();
  await fieldCatalogService.removeCatalogForProject(projectForm.projectId);
  return projectForm;
};

/**
 * Soft delete project form by id
 * @param {ObjectId} projectFormId - The project form ID
 * @param {ObjectId} userId - User who deleted it
 * @returns {Promise<ProjectForm>}
 */
const softDeleteProjectFormById = async (projectFormId, userId = null) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.softDelete(userId);
};

/**
 * Delete project form (soft-delete for regular users, permanent for sabyUser)
 * @param {string} projectId - The project ID
 * @param {ObjectId} userId - User who is deleting
 * @param {boolean} permanent - True for permanent deletion (sabyUser only)
 * @returns {Promise<Object>}
 */
const deleteProjectForm = async (projectId, userId, permanent = false) => {
  const projectForm = await ProjectForm.findOne({ projectId, deletedAt: null });

  if (!projectForm) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Module not found or already deleted'
    );
  }

  if (permanent) {
    // PERMANENT DELETE (sabyUser only - checked in controller)
    const result = await projectForm.permanentlyDelete();
    await fieldCatalogService.removeCatalogForProject(projectForm.projectId);
    return result;
  } else {
    // SOFT DELETE (14-day grace period)
    await projectForm.softDelete(userId);

    return {
      deleted: true,
      permanent: false,
      deletedAt: projectForm.deletedAt,
      permanentDeletionDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      message: 'Form soft-deleted. Will be permanently removed in 14 days.',
    };
  }
};

/**
 * Restore soft deleted project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const restoreProjectFormById = async (projectFormId) => {
  const projectForm = await ProjectForm.findById(projectFormId);

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  await syncSystemFormTemplateIfNeeded(projectForm);
  if (!projectForm.deletedAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Module is not deleted');
  }
  return projectForm.restore();
};

/**
 * Get all soft-deleted project forms (within 14-day grace period)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<ProjectForm[]>}
 */
const getDeletedProjectForms = async (tenantId) => {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  return ProjectForm.find({
    tenantId,
    deletedAt: { $gte: fourteenDaysAgo },
  }).sort({ deletedAt: -1 });
};

/**
 * Publish project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const publishProjectForm = async (projectFormId, options = {}) => {
  const projectForm = await getProjectFormById(projectFormId);
  await projectForm.publish(options);
  projectForm.configuration = enrichConfigurationWithAnalysisProfile({
    configuration: projectForm.configuration?.toObject
      ? projectForm.configuration.toObject()
      : projectForm.configuration || {},
    elements: projectForm.elements || [],
    existingProfile: projectForm?.configuration?.analysisProfile || null,
  });
  projectForm.markModified('configuration');
  await projectForm.save();
  return projectForm;
};

/**
 * Unpublish project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const unpublishProjectForm = async (projectFormId) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.unpublish();
};

/**
 * Archive project form
 * @param {ObjectId} projectFormId - The project form ID
 * @returns {Promise<ProjectForm>}
 */
const archiveProjectForm = async (projectFormId) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.archive();
};

/**
 * Increment project form views
 * @param {string} projectId - The unique project ID
 * @returns {Promise<void>}
 */
const incrementProjectViews = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  await projectForm.incrementViews();
};

/**
 * Increment project form submissions
 * @param {string} projectId - The unique project ID
 * @returns {Promise<void>}
 */
const incrementProjectSubmissions = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  await projectForm.incrementSubmissions();
};

/**
 * Get project form analytics
 * @param {string} projectId - The unique project ID
 * @returns {Promise<Object>}
 */
const getProjectAnalytics = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  return {
    projectId: projectForm.projectId,
    projectName: projectForm.configuration.projectName,
    analytics: projectForm.analytics,
    metadata: projectForm.metadata,
    status: projectForm.status,
    createdAt: projectForm.createdAt,
    publishedAt: projectForm.publishedAt,
  };
};

/**
 * Get schema profile for a project/module
 * Combines Mongo form configuration with Postgres field catalog.
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
const getProjectSchemaProfile = async (projectId) => {
  const projectForm = await getProjectFormByProjectId(projectId);
  const configuration = projectForm.configuration?.toObject
    ? projectForm.configuration.toObject()
    : projectForm.configuration || {};
  const analysisProfile =
    configuration.analysisProfile &&
    Object.keys(configuration.analysisProfile).length > 0
      ? configuration.analysisProfile
      : inferAnalysisProfile({
          configuration,
          elements: projectForm.elements || [],
        });

  let catalogFields = [];
  try {
    const result = await postgresPool.query(
      `SELECT field_key, field_label, field_type, is_required, aliases, transformations, metadata
       FROM form_field_catalog
       WHERE project_id = $1
       ORDER BY field_label ASC`,
      [projectId]
    );
    catalogFields = result.rows || [];
  } catch (error) {
    if (error?.code !== '42P01') {
      throw error;
    }
    catalogFields = [];
  }

  const elementMap = new Map();
  (Array.isArray(projectForm.elements) ? projectForm.elements : []).forEach((element) => {
    if (element?.id) {
      elementMap.set(String(element.id), element);
    }
  });

  const fromCatalog = catalogFields.map((field) => {
    const element = elementMap.get(String(field.field_key));
    const semantic = element?.semantic || {};
    return {
      key: field.field_key,
      label: field.field_label,
      type: field.field_type,
      required: Boolean(field.is_required),
      aliases: Array.isArray(field.aliases) ? field.aliases : [],
      transformations: Array.isArray(field.transformations)
        ? field.transformations
        : [],
      semantic: {
        role: semantic.role || null,
        valueType: semantic.valueType || null,
        aggregationAllowed: Array.isArray(semantic.aggregationAllowed)
          ? semantic.aggregationAllowed
          : [],
      },
      metadata: field.metadata || {},
    };
  });

  const inferValueType = (type = '') => {
    const t = String(type || '').toLowerCase();
    if (NUMERIC_TYPES.has(t)) return t === 'currency' ? 'currency' : 'number';
    if (DATE_TYPES.has(t)) return t;
    if (CATEGORICAL_TYPES.has(t)) return 'enum';
    if (TEXT_TYPES.has(t)) return 'text';
    return 'unknown';
  };

  const fromElements = (Array.isArray(projectForm.elements) ? projectForm.elements : [])
    .filter(isCatalogCandidate)
    .map((element) => {
      const type = String(element.type || 'text').toLowerCase();
      const semantic = element.semantic || {};
      return {
        key: element.id,
        label: element?.properties?.label || element.id,
        type,
        required: Boolean(element?.properties?.validation?.required),
        aliases: Array.isArray(element.aliases) ? element.aliases : [],
        transformations: [],
        semantic: {
          role:
            semantic.role ||
            (NUMERIC_TYPES.has(type) ? 'measure' : CATEGORICAL_TYPES.has(type) ? 'dimension' : null),
          valueType: semantic.valueType || inferValueType(type),
          aggregationAllowed: Array.isArray(semantic.aggregationAllowed)
            ? semantic.aggregationAllowed
            : [],
        },
        metadata: element.metadata || {},
      };
    });

  const fields = fromCatalog.length > 0 ? fromCatalog : fromElements;

  return {
    projectId: projectForm.projectId,
    tenantId: projectForm.tenantId,
    projectName: configuration.projectName,
    status: projectForm.status,
    deploymentStatus: projectForm.metadata?.deploymentStatus || null,
    tags: Array.isArray(configuration.tags) ? configuration.tags : [],
    analysisProfile,
    formFieldCount: fields.length,
    fields,
  };
};

/**
 * Bulk operations for project forms
 * @param {Object} operations - The bulk operations to perform
 * @returns {Promise<Object>}
 */
const bulkOperations = async (operations) => {
  const results = {
    success: [],
    errors: [],
  };

  for (const operation of operations) {
    try {
      let result;
      switch (operation.type) {
        case 'delete':
          result = await softDeleteProjectFormById(operation.projectFormId);
          break;
        case 'restore':
          result = await restoreProjectFormById(operation.projectFormId);
          break;
        case 'publish':
          result = await publishProjectForm(operation.projectFormId);
          break;
        case 'archive':
          result = await archiveProjectForm(operation.projectFormId);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      results.success.push({
        projectFormId: operation.projectFormId,
        operation: operation.type,
        result,
      });
    } catch (error) {
      results.errors.push({
        projectFormId: operation.projectFormId,
        operation: operation.type,
        error: error.message,
      });
    }
  }

  return results;
};

/**
 * Search project forms
 * @param {string} query - Search query
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const searchProjectForms = async (query, filter = {}, options = {}) => {
  const searchRegex = new RegExp(query, 'i');

  const searchFilter = {
    ...filter,
    deletedAt: null,
    $or: [
      { 'configuration.projectName': searchRegex },
      { 'configuration.tags': { $in: [searchRegex] } },
      { projectId: searchRegex },
      { shareRef: searchRegex },
      { shareCode: searchRegex },
      { publicRef: searchRegex },
      { formReference: searchRegex },
    ],
  };

  return queryProjectForms(searchFilter, options);
};

module.exports = {
  createProjectForm,
  queryProjectForms,
  getSystemProjectFormForTenant,
  getProjectFormById,
  getProjectFormByProjectId,
  getProjectFormByPublicRef,
  getPublicProjectFormByReference,
  getPublicProjectFormByShortCode,
  buildPublicQrContext,
  getProjectFormsByTenant,
  getProjectFormsByUser,
  duplicateProjectFormByProjectId,
  updateProjectFormById,
  updateProjectFormByProjectId,
  deleteProjectFormById,
  softDeleteProjectFormById,
  restoreProjectFormById,
  deleteProjectForm,
  getDeletedProjectForms,
  publishProjectForm,
  unpublishProjectForm,
  archiveProjectForm,
  incrementProjectViews,
  incrementProjectSubmissions,
  getProjectAnalytics,
  getProjectSchemaProfile,
  bulkOperations,
  searchProjectForms,
  getProjectStorageFolderByProjectId,
  bootstrapSystemFormsForTenant,
  submitSystemFormByPublicRef,
};
