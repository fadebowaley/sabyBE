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
    id: 'profile_estimated_revenue',
    type: 'currency',
    label: 'Estimated Revenue',
    placeholder: 'Enter estimated revenue',
    bindingPath: 'profile.averageIncome',
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
  makeSystemElement({
    id: 'profile_estimated_customers',
    type: 'number',
    label: 'Estimated Customers',
    placeholder: 'Enter estimated customers',
    bindingPath: 'profile.averageAttendance',
  }),
];

const normalizeSystemFormContract = ({
  body = {},
  existing = null,
  enforceForCreate = false,
}) => {
  const normalized = { ...body };
  const existingMetadata = existing?.metadata || {};
  const existingCategory = existing?.identity?.category || 'standard';
  const incomingCategory = normalized?.identity?.category;
  const category =
    existingCategory === SYSTEM_FORM_CATEGORY
      ? SYSTEM_FORM_CATEGORY
      : incomingCategory || existingCategory;
  const isSystem = category === SYSTEM_FORM_CATEGORY;

  normalized.identity = {
    ...(existing?.identity?.toObject ? existing.identity.toObject() : existing?.identity || {}),
    ...(normalized.identity || {}),
    category,
  };
  if (!normalized.metadata) normalized.metadata = {};

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
  normalized.metadata.formCategory = SYSTEM_FORM_CATEGORY;

  normalized.capabilities = {
    ...defaultCapabilities(),
    ...(existing?.capabilities?.toObject
      ? existing.capabilities.toObject()
      : existing?.capabilities || {}),
    ...(normalized.capabilities || {}),
  };
  normalized.capabilities.experience = {
    ...defaultCapabilities().experience,
    ...(normalized.capabilities.experience || {}),
  };
  normalized.capabilities.experience.security = normalizeSecurityCapabilityMatrix(
    {
      profile: 'private_safe',
      mode: 'private',
      publicSecureMode: 'otp',
      access: {
        whoCanAccess: 'authenticated_users',
        allowedRoles: [],
        allowedUsers: [],
        restrictByLocation: false,
        allowedCountries: [],
      },
      authentication: {
        requireLogin: true,
        allowAnonymous: false,
        requireOtp: true,
      },
      accessCode: {
        code: null,
        hint: null,
        maxAttempts: 5,
        lockoutMinutes: 15,
      },
      submissionProtection: {
        preventDuplicateSubmission: false,
        duplicateCheckField: null,
        rateLimitEnabled: false,
        maxSubmissionsPerUser: null,
      },
      channels: ['web'],
      ...(normalized.capabilities.experience.security || {}),
    },
    defaultCapabilities().experience.security
  );
  normalized.identity.tags = Array.from(
    new Set([...(normalized.identity.tags || []), 'system', 'profile'])
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

const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const VALID_COMPLIANCE_FREQUENCIES = new Set(['daily', 'weekly', 'monthly']);
const VALID_COMPLIANCE_REPORTING_SCOPES = new Set([
  'yearly',
  'monthly',
  'weekly',
  'daily',
  'custom_range',
]);

const clampComplianceInteger = (value, fallback, { min = 1, max = 31 } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
};

const normalizeComplianceNumberList = (values, { min = 0, max = 31 } = {}) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry >= min && entry <= max)
    )
  ).sort((left, right) => left - right);

const buildLegacyWeeklyDaysFromSchedule = ({
  schedule,
  fallbackDays = [],
}) => {
  const normalizedFrequency =
    schedule?.frequency === 'weekly' ? 'weekly' : null;
  if (!normalizedFrequency) {
    return Array.isArray(fallbackDays) ? fallbackDays : [];
  }

  const weekdays = normalizeComplianceNumberList(schedule?.weekly?.weekdays, {
    min: 0,
    max: 6,
  });
  const intervalWeeks = clampComplianceInteger(
    schedule?.weekly?.intervalWeeks,
    1,
    { min: 1, max: 4 }
  );
  const legacyFrequency = intervalWeeks === 2 ? 'biweekly' : 'weekly';

  return weekdays.map((day) => ({
    day,
    name: DAY_LABELS[day] || `Day ${day}`,
    frequency: legacyFrequency,
    occurrences: null,
    enabled: true,
  }));
};

const stripDeprecatedComplianceFields = (value = {}) => {
  const compliance = value && typeof value === 'object' ? { ...value } : {};
  const reportingPeriod =
    compliance.reportingPeriod && typeof compliance.reportingPeriod === 'object'
      ? { ...compliance.reportingPeriod }
      : {};
  const submissionPolicy =
    compliance.submissionPolicy && typeof compliance.submissionPolicy === 'object'
      ? { ...compliance.submissionPolicy }
      : {};
  const enforcement =
    compliance.enforcement && typeof compliance.enforcement === 'object'
      ? { ...compliance.enforcement }
      : {};

  delete reportingPeriod.weekStartsOn;
  delete reportingPeriod.timezone;
  delete submissionPolicy.closeWindowAtPeriodEnd;
  delete enforcement.closeWindowAtPeriodEnd;
  delete compliance.autoLockMonthEnd;

  if (Object.keys(reportingPeriod).length > 0) {
    compliance.reportingPeriod = reportingPeriod;
  }
  if (Object.keys(submissionPolicy).length > 0) {
    compliance.submissionPolicy = submissionPolicy;
  }
  if (Object.keys(enforcement).length > 0) {
    compliance.enforcement = enforcement;
  }

  return compliance;
};

const DEFAULT_COMPLIANCE_CAPABILITY = {
  enabled: false,
  availability: {
    startDate: null,
    endDate: null,
  },
  reportingPeriod: {
    scope: 'monthly',
    weekStartsOn: 1,
    timezone: null,
    defaultYear: null,
    defaultMonth: null,
    customRange: {
      maxDays: null,
    },
  },
  submissionPolicy: {
    maxSubmissionsPerPeriod: 1,
    allowBackdating: false,
    closeWindowAtPeriodEnd: false,
  },
  submissionFrequency: {
    mode: 'daily',
    count: 1,
    weekdays: [],
    monthDates: [],
    intervalWeeks: 1,
    custom: {
      interval: null,
    },
  },
  trackingMode: 'none',
  frequency: 'daily',
  dailyConfig: {
    activeDays: [],
    frequencyPerDay: 1,
    skipWeekends: false,
    skipHolidays: false,
  },
  weeklyConfig: {
    days: [],
  },
  monthlyConfig: {
    dates: [],
    submissionLimitPerDate: 1,
  },
  schedule: {
    frequency: 'daily',
    startDate: null,
    endDate: null,
    daily: {
      weekdays: [],
    },
    weekly: {
      intervalWeeks: 1,
      weekdays: [],
      anchorDate: null,
    },
    monthly: {
      dates: [],
    },
  },
  submissionLimit: {
    count: 1,
    scope: 'occurrence',
  },
  enforcement: {
    allowBackdating: false,
    closeWindowAtPeriodEnd: false,
  },
  requireNodeId: true,
  requireMonth: true,
  trackCompliance: true,
  autoGenerateCalendar: true,
  autoLockMonthEnd: false,
  calendarRequired: false,
  eventTypes: [],
  calendarGeneration: {
    startDate: null,
    endDate: null,
    allowBackdating: false,
    monthsToGenerate: null,
  },
};

const resolveComplianceReportingScope = (value = {}, fallback = 'monthly') => {
  const direct = String(value?.reportingPeriod?.scope || '')
    .trim()
    .toLowerCase();
  if (VALID_COMPLIANCE_REPORTING_SCOPES.has(direct)) {
    return direct;
  }

  const frequency = resolveComplianceScheduleFrequency(value, fallback);
  if (frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly') {
    return frequency;
  }

  return fallback;
};

const resolveComplianceScheduleFrequency = (value = {}, fallback = 'monthly') => {
  const direct = String(value?.schedule?.frequency || '')
    .trim()
    .toLowerCase();
  if (VALID_COMPLIANCE_FREQUENCIES.has(direct)) {
    return direct;
  }

  const trackingMode = String(value?.trackingMode || '')
    .trim()
    .toLowerCase();
  if (trackingMode === 'none') {
    return 'monthly';
  }
  if (VALID_COMPLIANCE_FREQUENCIES.has(trackingMode)) {
    return trackingMode;
  }

  return fallback;
};

const normalizeComplianceCapability = (value = {}, defaults = null) => {
  const resolvedDefaults =
    defaults || DEFAULT_COMPLIANCE_CAPABILITY;
  const source = value && typeof value === 'object' ? value : {};
  const legacyDailyConfig =
    source.dailyConfig && typeof source.dailyConfig === 'object'
      ? source.dailyConfig
      : {};
  const legacyWeeklyConfig =
    source.weeklyConfig && typeof source.weeklyConfig === 'object'
      ? source.weeklyConfig
      : {};
  const legacyMonthlyConfig =
    source.monthlyConfig && typeof source.monthlyConfig === 'object'
      ? source.monthlyConfig
      : {};
  const legacyCalendarGeneration =
    source.calendarGeneration && typeof source.calendarGeneration === 'object'
      ? source.calendarGeneration
      : {};
  const availabilitySource =
    source.availability && typeof source.availability === 'object'
      ? source.availability
      : {};
  const reportingPeriodSource =
    source.reportingPeriod && typeof source.reportingPeriod === 'object'
      ? source.reportingPeriod
      : {};
  const scheduleSource =
    source.schedule && typeof source.schedule === 'object' ? source.schedule : {};
  const submissionLimitSource =
    source.submissionLimit && typeof source.submissionLimit === 'object'
      ? source.submissionLimit
      : {};
  const submissionPolicySource =
    source.submissionPolicy && typeof source.submissionPolicy === 'object'
      ? source.submissionPolicy
      : {};
  const submissionFrequencySource =
    source.submissionFrequency && typeof source.submissionFrequency === 'object'
      ? source.submissionFrequency
      : {};
  const enforcementSource =
    source.enforcement && typeof source.enforcement === 'object'
      ? source.enforcement
      : {};

  const reportingScope = resolveComplianceReportingScope(source);
  const frequency =
    reportingScope === 'daily' || reportingScope === 'weekly' || reportingScope === 'monthly'
      ? reportingScope
      : 'daily';
  const submissionFrequencyModeCandidate = String(
    submissionFrequencySource.mode || source.frequency || 'daily'
  )
    .trim()
    .toLowerCase();
  const submissionFrequencyMode =
    submissionFrequencyModeCandidate === 'once' ||
    submissionFrequencyModeCandidate === 'multiple' ||
    submissionFrequencyModeCandidate === 'daily' ||
    submissionFrequencyModeCandidate === 'weekly' ||
    submissionFrequencyModeCandidate === 'monthly'
      ? submissionFrequencyModeCandidate
      : 'daily';
  const submissionLimitCount = clampComplianceInteger(
    submissionFrequencySource.count ??
    submissionPolicySource.maxSubmissionsPerPeriod ??
      submissionLimitSource.count ??
      legacyMonthlyConfig.submissionLimitPerDate ??
      legacyDailyConfig.frequencyPerDay ??
      1,
    1,
    { min: 1, max: 20 }
  );
  const dailyWeekdays = normalizeComplianceNumberList(
    submissionFrequencySource.weekdays ??
      scheduleSource?.daily?.weekdays ??
      legacyDailyConfig.activeDays,
    { min: 0, max: 6 }
  );
  const weeklyWeekdays = normalizeComplianceNumberList(
    submissionFrequencySource.weekdays ??
      scheduleSource?.weekly?.weekdays ??
      (Array.isArray(legacyWeeklyConfig.days)
        ? legacyWeeklyConfig.days.map((day) => day?.day)
        : []),
    { min: 0, max: 6 }
  );
  const monthlyDates = normalizeComplianceNumberList(
    submissionFrequencySource.monthDates ??
      scheduleSource?.monthly?.dates ??
      legacyMonthlyConfig.dates,
    { min: 1, max: 31 }
  );
  const intervalWeeks = clampComplianceInteger(
    submissionFrequencySource.intervalWeeks ??
      scheduleSource?.weekly?.intervalWeeks ??
      (Array.isArray(legacyWeeklyConfig.days) &&
      legacyWeeklyConfig.days.some((day) => day?.frequency === 'biweekly')
        ? 2
        : 1),
    1,
    { min: 1, max: 4 }
  );
  const startDate =
    typeof availabilitySource.startDate === 'string' && availabilitySource.startDate.trim()
      ? availabilitySource.startDate
      : typeof scheduleSource.startDate === 'string' && scheduleSource.startDate.trim()
        ? scheduleSource.startDate
        : typeof legacyCalendarGeneration.startDate === 'string' &&
            legacyCalendarGeneration.startDate.trim()
          ? legacyCalendarGeneration.startDate
          : null;
  const endDate =
    typeof availabilitySource.endDate === 'string' && availabilitySource.endDate.trim()
      ? availabilitySource.endDate
      : typeof scheduleSource.endDate === 'string' && scheduleSource.endDate.trim()
        ? scheduleSource.endDate
        : typeof legacyCalendarGeneration.endDate === 'string' &&
            legacyCalendarGeneration.endDate.trim()
          ? legacyCalendarGeneration.endDate
          : null;
  const allowBackdating =
    typeof submissionPolicySource.allowBackdating === 'boolean'
      ? submissionPolicySource.allowBackdating
      : typeof enforcementSource.allowBackdating === 'boolean'
        ? enforcementSource.allowBackdating
        : legacyCalendarGeneration.allowBackdating === true;
  const closeWindowAtPeriodEnd = false;
  const weekStartsOn = 1;
  const timezone = null;
  const defaultYear = (() => {
    const raw = Number(reportingPeriodSource.defaultYear);
    return Number.isInteger(raw) && raw >= 2000 && raw <= 2100 ? raw : null;
  })();
  const defaultMonth =
    typeof reportingPeriodSource.defaultMonth === 'string' &&
    /^\d{4}-\d{2}$/.test(reportingPeriodSource.defaultMonth)
      ? reportingPeriodSource.defaultMonth
      : null;
  const customRangeSource =
    reportingPeriodSource.customRange &&
    typeof reportingPeriodSource.customRange === 'object'
      ? reportingPeriodSource.customRange
      : {};
  const customFrequencySource =
    submissionFrequencySource.custom &&
    typeof submissionFrequencySource.custom === 'object'
      ? submissionFrequencySource.custom
      : {};
  const customRangeMaxDays =
    customRangeSource.maxDays == null || customRangeSource.maxDays === ''
      ? null
      : clampComplianceInteger(customRangeSource.maxDays, null, {
          min: 1,
          max: 366,
        });
  const customFrequencyInterval =
    customFrequencySource.interval == null || customFrequencySource.interval === ''
      ? null
      : clampComplianceInteger(customFrequencySource.interval, null, {
          min: 1,
          max: 365,
        });
  const customFrequencyUnit =
    customFrequencySource.unit === 'day' ||
    customFrequencySource.unit === 'week' ||
    customFrequencySource.unit === 'month'
      ? customFrequencySource.unit
      : null;

  const normalizedSchedule = {
    frequency:
      submissionFrequencyMode === 'daily' ||
      submissionFrequencyMode === 'weekly' ||
      submissionFrequencyMode === 'monthly'
        ? submissionFrequencyMode
        : frequency,
    startDate,
    endDate,
    daily: {
      weekdays: dailyWeekdays,
    },
    weekly: {
      intervalWeeks,
      weekdays: weeklyWeekdays,
      anchorDate:
        typeof scheduleSource?.weekly?.anchorDate === 'string' &&
        scheduleSource.weekly.anchorDate.trim()
          ? scheduleSource.weekly.anchorDate
          : startDate,
    },
    monthly: {
      dates: monthlyDates,
    },
  };

  return stripDeprecatedComplianceFields({
    ...resolvedDefaults,
    ...source,
    availability: {
      ...resolvedDefaults.availability,
      ...(availabilitySource || {}),
      startDate,
      endDate,
    },
    reportingPeriod: {
      ...resolvedDefaults.reportingPeriod,
      ...(reportingPeriodSource || {}),
      scope: reportingScope,
      weekStartsOn,
      timezone,
      defaultYear,
      defaultMonth,
      customRange: {
        ...resolvedDefaults.reportingPeriod.customRange,
        ...(customRangeSource || {}),
        maxDays: customRangeMaxDays,
      },
    },
    submissionPolicy: {
      ...resolvedDefaults.submissionPolicy,
      ...(submissionPolicySource || {}),
      maxSubmissionsPerPeriod: submissionLimitCount,
      allowBackdating,
      closeWindowAtPeriodEnd,
    },
    submissionFrequency: {
      ...resolvedDefaults.submissionFrequency,
      ...(submissionFrequencySource || {}),
      mode: submissionFrequencyMode,
      count: submissionLimitCount,
      weekdays:
        submissionFrequencyMode === 'daily' ? dailyWeekdays : weeklyWeekdays,
      monthDates: monthlyDates,
      intervalWeeks,
      custom: {
        ...resolvedDefaults.submissionFrequency.custom,
        ...(customFrequencySource || {}),
        interval: customFrequencyInterval,
        ...(customFrequencyUnit ? { unit: customFrequencyUnit } : {}),
      },
    },
    trackingMode:
      source.enabled === true
        ? submissionFrequencyMode === 'daily' ||
          submissionFrequencyMode === 'weekly' ||
          submissionFrequencyMode === 'monthly'
          ? submissionFrequencyMode
          : reportingScope === 'custom_range'
            ? 'none'
            : reportingScope === 'yearly'
              ? 'monthly'
              : frequency === 'monthly' &&
                  monthlyDates.length === 0 &&
                  reportingScope !== 'monthly'
                ? 'none'
                : frequency
        : String(source.trackingMode || resolvedDefaults.trackingMode || 'none'),
    frequency,
    schedule: normalizedSchedule,
    submissionLimit: {
      count: submissionLimitCount,
      scope: 'occurrence',
      ...(submissionLimitSource || {}),
    },
    enforcement: {
      allowBackdating,
      closeWindowAtPeriodEnd,
      ...(enforcementSource || {}),
    },
    dailyConfig: {
      ...resolvedDefaults.dailyConfig,
      ...legacyDailyConfig,
      activeDays: dailyWeekdays,
      frequencyPerDay: submissionLimitCount,
      skipWeekends: false,
    },
    weeklyConfig: {
      ...resolvedDefaults.weeklyConfig,
      ...legacyWeeklyConfig,
      days: buildLegacyWeeklyDaysFromSchedule({
        schedule: normalizedSchedule,
        fallbackDays: legacyWeeklyConfig.days,
      }),
    },
    monthlyConfig: {
      dates: monthlyDates,
      submissionLimitPerDate: submissionLimitCount,
    },
    trackCompliance:
      typeof source.trackCompliance === 'boolean'
        ? source.trackCompliance
        : resolvedDefaults.trackCompliance,
    calendarGeneration: {
      ...resolvedDefaults.calendarGeneration,
      ...legacyCalendarGeneration,
      startDate,
      endDate,
      allowBackdating,
    },
    autoLockMonthEnd: closeWindowAtPeriodEnd,
  });
};

const normalizeWorkflowTriggerValue = (value, fallback = 'submission') => {
  const candidate = String(value || fallback || 'submission').trim().toLowerCase();
  if (candidate === 'submission' || candidate === 'submit') return 'submission';
  if (candidate === 'update') return 'update';
  if (candidate === 'manual') return 'manual';
  return 'submission';
};

const defaultCapabilities = () => ({
  experience: {
    security: {
      enabled: false,
      audience: 'public',
      profile: 'open_public',
      mode: 'public',
      publicSecureMode: 'off',
      channels: ['web'],
      access: {
        whoCanAccess: 'anyone',
        allowedRoles: [],
        allowedUsers: [],
        restrictByLocation: false,
        allowedCountries: [],
        requireNodeAccess: false,
      },
      authentication: {
        method: 'none',
        requireLogin: false,
        allowAnonymous: true,
        requireOtp: false,
      },
      accessCode: {
        code: null,
        hint: null,
        maxAttempts: 5,
        lockoutMinutes: 15,
      },
      submissionProtection: {
        preventDuplicateSubmission: false,
        duplicateCheckField: null,
        rateLimitEnabled: false,
        maxSubmissionsPerUser: null,
      },
    },
    behavior: {
      allowMultipleSubmissions: true,
      enableProgressSave: true,
      autoSave: false,
      submitOnComplete: true,
    },
    previewSubmission: {
      enabled: false,
      layout: 'biodata_document',
      allowEditBeforeSubmit: true,
      showBranding: true,
    },
    distribution: {
      enableSharing: true,
      allowEmbedding: true,
      generateQR: false,
      enableDeepLinking: false,
    },
    notifications: {
      emailOnSubmission: false,
      notifyOwner: true,
      customEmails: [],
      smsNotifications: false,
    },
    compliance: normalizeComplianceCapability(DEFAULT_COMPLIANCE_CAPABILITY),
    workflow: {
      enabled: false,
      approvalMode: 'none',
      triggerOn: 'submission',
      workflows: [],
    },
  },
  transaction: {
    payment: {
      enabled: false,
      mode: 'none',
      currency: null,
      enabledChannels: [],
      defaultChannel: null,
      collectionStage: 'submission',
      settlementType: 'none',
      receivingAccount: null,
      channelConfigs: {},
      policies: {
        requirePaymentBeforeSubmit: false,
        allowPartialPayment: false,
        allowOverpayment: false,
        refundPolicy: 'none',
      },
    },
    remittance: {
      enabled: false,
      accountSource: 'tenant_global',
      specificNodeId: null,
      targetLevelId: null,
      requireNodeAccount: false,
      nodeAccountField: null,
      inheritParentAccount: false,
      settlementRule: {
        mode: 'single',
        splitType: 'selection',
        targets: [],
      },
      routing: {
        byNode: false,
        bySubmissionValue: false,
        fallbackAccountId: null,
      },
    },
    invoice: {
      enabled: false,
      calculationMode: 'none',
      currency: null,
      baseAmount: 0,
      amountSourceField: null,
      lineItemsEnabled: false,
      lineItems: [],
      discountsEnabled: false,
      taxEnabled: false,
      discounts: {
        enabled: false,
        mode: 'none',
        value: 0,
        expression: null,
        conditions: [],
      },
      tax: {
        enabled: false,
        mode: 'none',
        value: 0,
        expression: null,
        conditions: [],
      },
      totals: {
        subtotalExpression: null,
        discountExpression: null,
        taxExpression: null,
        grandTotalExpression: null,
      },
      invoiceNumbering: {
        mode: 'auto',
        prefix: '',
        nextNumber: 1,
      },
      presentation: {
        showPaymentInstructions: true,
        showRemittanceDetails: true,
        showDueDate: true,
        showSubtotal: true,
        showDiscount: true,
        showTax: true,
        showGrandTotal: true,
      },
    },
  },
  automation: {
    rules: [],
    connectedActions: [],
    operationalVisibility: {
      showRunLog: true,
      showStatuses: true,
      showOwners: true,
      showAuditTrail: true,
      showRuleMatches: true,
      showLastRunAt: true,
    },
  },
  });

const deriveEnabledCapabilityFamilies = (capabilities = {}) =>
  Object.entries(capabilities || {})
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([key]) => key);

const LEGACY_RUNTIME_ROOT_FIELDS = new Set([
  'configuration',
  'userSettings',
  'permSettings',
  'paymentConfig',
  'workflows',
  'style',
  'wizardMode',
  'columnSpans',
  'calendar',
  'behaviorHooks',
]);

const stripLegacyRuntimeFields = (value = {}) =>
  Object.fromEntries(
    Object.entries(value || {}).filter(([key]) => !LEGACY_RUNTIME_ROOT_FIELDS.has(key))
  );

const VALID_TRANSACTION_PAYMENT_CHANNELS = new Set([
  'paystack',
  'flutterwave',
  '9psb',
  'premium',
  'sabypay',
]);

const normalizeTransactionPaymentChannel = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!candidate) return null;
  const normalized = candidate === 'sabypipe' ? 'sabypay' : candidate;
  return VALID_TRANSACTION_PAYMENT_CHANNELS.has(normalized) ? normalized : null;
};

const normalizeTransactionCollectionStage = (value, fallback = 'submission') => {
  const candidate = String(value || fallback || 'submission').trim().toLowerCase();
  if (candidate === 'before_approval' || candidate === 'pre_approval') {
    return 'pre_approval';
  }
  if (candidate === 'after_approval' || candidate === 'post_approval') {
    return 'post_approval';
  }
  return 'submission';
};

const normalizeTransactionInvoiceAdjustment = (value = {}, defaults = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const mode = ['none', 'fixed', 'percentage', 'formula'].includes(
    String(source.mode || '').trim().toLowerCase()
  )
    ? String(source.mode).trim().toLowerCase()
    : defaults.mode || 'none';
  return {
    ...defaults,
    ...source,
    enabled: source.enabled === true || mode !== 'none',
    mode,
    value: Math.max(0, Number(source.value || 0)),
    expression:
      typeof source.expression === 'string' && source.expression.trim()
        ? source.expression
        : null,
    conditions: Array.isArray(source.conditions) ? source.conditions : [],
  };
};

const normalizeTransactionInvoice = (value = {}, defaults = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const calculationModeCandidate = String(
    source.calculationMode || defaults.calculationMode || 'none'
  )
    .trim()
    .toLowerCase();
  const calculationMode = ['none', 'fixed', 'line_items', 'rule_based'].includes(
    calculationModeCandidate
  )
    ? calculationModeCandidate
    : 'none';
  const lineItems = Array.isArray(source.lineItems) ? source.lineItems : [];
  const discounts = normalizeTransactionInvoiceAdjustment(
    source.discounts,
    defaults.discounts || {}
  );
  const tax = normalizeTransactionInvoiceAdjustment(
    source.tax,
    defaults.tax || {}
  );

  return {
    ...defaults,
    ...source,
    calculationMode,
    currency:
      typeof source.currency === 'string' && source.currency.trim()
        ? source.currency.trim().toUpperCase()
        : defaults.currency || null,
    baseAmount: Math.max(0, Number(source.baseAmount || 0)),
    amountSourceField:
      typeof source.amountSourceField === 'string' && source.amountSourceField.trim()
        ? source.amountSourceField
        : null,
    lineItemsEnabled:
      calculationMode === 'line_items' || calculationMode === 'rule_based',
    lineItems,
    discountsEnabled: discounts.enabled,
    taxEnabled: tax.enabled,
    discounts,
    tax,
    totals: {
      ...(defaults.totals || {}),
      ...(source.totals || {}),
    },
    invoiceNumbering: {
      ...(defaults.invoiceNumbering || {}),
      ...(source.invoiceNumbering || {}),
      nextNumber: Math.max(
        1,
        Number(source?.invoiceNumbering?.nextNumber || defaults?.invoiceNumbering?.nextNumber || 1)
      ),
    },
    presentation: {
      ...(defaults.presentation || {}),
      ...(source.presentation || {}),
    },
  };
};

const mergeProjectFormCapabilities = (sourceCapabilities = {}) => {
  const defaults = defaultCapabilities();
  const experience = sourceCapabilities?.experience || {};
  const security = experience?.security || {};
  const access = security?.access || {};
  const authentication = security?.authentication || {};
  const submissionProtection = security?.submissionProtection || {};
  const behavior = experience?.behavior || {};
  const previewSubmission = experience?.previewSubmission || {};
  const distribution = experience?.distribution || {};
  const notifications = experience?.notifications || {};
  const compliance = experience?.compliance || {};
  const workflow = experience?.workflow || {};

  const transaction = sourceCapabilities?.transaction || {};
  const payment = transaction?.payment || {};
  const paymentPolicies = payment?.policies || {};
  const normalizedPaymentChannels = Array.isArray(payment?.enabledChannels)
    ? Array.from(
        new Set(
          payment.enabledChannels
            .map((entry) => normalizeTransactionPaymentChannel(entry))
            .filter(Boolean)
        )
      )
    : defaults.transaction.payment.enabledChannels;
  const normalizedDefaultPaymentChannel = normalizeTransactionPaymentChannel(
    payment?.defaultChannel
  );
  const remittance = transaction?.remittance || {};
  const remittanceSettlementRule = remittance?.settlementRule || {};
  const remittanceRouting = remittance?.routing || {};
  const invoice = transaction?.invoice || {};

  const automation = sourceCapabilities?.automation || {};
  const automationVisibility = automation?.operationalVisibility || {};

  return {
    ...defaults,
    ...sourceCapabilities,
    experience: {
      ...defaults.experience,
      ...experience,
      security: {
        ...normalizeSecurityCapabilityMatrix(security, defaults.experience.security),
      },
      behavior: {
        ...defaults.experience.behavior,
        ...behavior,
      },
      previewSubmission: {
        ...defaults.experience.previewSubmission,
        ...previewSubmission,
      },
      distribution: {
        ...defaults.experience.distribution,
        ...distribution,
      },
      notifications: {
        ...defaults.experience.notifications,
        ...notifications,
      },
      compliance: normalizeComplianceCapability(
        compliance,
        defaults.experience.compliance
      ),
      workflow: normalizeWorkflowCapability(
        workflow,
        defaults.experience.workflow
      ),
    },
    transaction: {
      ...defaults.transaction,
      ...transaction,
      payment: {
        ...defaults.transaction.payment,
        ...payment,
        mode: payment?.enabled === true ? 'invoice' : 'none',
        enabledChannels: normalizedPaymentChannels,
        defaultChannel:
          normalizedDefaultPaymentChannel &&
          normalizedPaymentChannels.includes(normalizedDefaultPaymentChannel)
            ? normalizedDefaultPaymentChannel
            : normalizedPaymentChannels[0] || null,
        collectionStage: normalizeTransactionCollectionStage(
          payment?.collectionStage,
          defaults.transaction.payment.collectionStage
        ),
        policies: {
          ...defaults.transaction.payment.policies,
          ...paymentPolicies,
        },
      },
      remittance: {
        ...defaults.transaction.remittance,
        ...remittance,
        settlementRule: {
          ...defaults.transaction.remittance.settlementRule,
          ...remittanceSettlementRule,
        },
        routing: {
          ...defaults.transaction.remittance.routing,
          ...remittanceRouting,
        },
      },
      invoice: {
        ...normalizeTransactionInvoice(invoice, defaults.transaction.invoice),
      },
    },
    automation: {
      ...defaults.automation,
      ...automation,
      operationalVisibility: {
        ...defaults.automation.operationalVisibility,
        ...automationVisibility,
      },
    },
  };
};

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

const PUBLIC_SECURE_MODE_VALUES = new Set([
  'off',
  'link_only',
  'otp',
  'access_code',
]);

const SECURITY_AUDIENCE_VALUES = new Set([
  'anyone',
  'authenticated_users',
  'selected_roles',
  'selected_users',
]);

const normalizeSecurityAudience = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (SECURITY_AUDIENCE_VALUES.has(normalized)) {
    return normalized;
  }
  return 'anyone';
};

const normalizePublicSecurityMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (PUBLIC_SECURE_MODE_VALUES.has(normalized)) {
    return normalized;
  }
  return 'off';
};

const dedupeStringArray = (value = [], { lowercase = false } = {}) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .map((entry) => (lowercase ? entry.toLowerCase() : entry))
    )
  );

const collectWorkflowApprovalReferences = (workflowCapability = {}) => {
  const userRefs = new Set();
  const roleRefs = new Set();
  const workflows = Array.isArray(workflowCapability.workflows)
    ? workflowCapability.workflows
    : [];

  workflows.forEach((workflow) => {
    const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
    steps.forEach((step) => {
      dedupeStringArray(step?.assigneeUsers).forEach((entry) => userRefs.add(entry));
      dedupeStringArray(step?.escalationUsers).forEach((entry) => userRefs.add(entry));
      dedupeStringArray(step?.assigneeRoles).forEach((entry) => roleRefs.add(entry));
      dedupeStringArray(step?.escalationRoles).forEach((entry) => roleRefs.add(entry));
      const assigneeRole = String(step?.assigneeRole || '').trim();
      if (assigneeRole) roleRefs.add(assigneeRole);
      const escalateTo = String(step?.sla?.escalateTo || '').trim();
      if (escalateTo) {
        if (step?.escalationType === 'user') {
          userRefs.add(escalateTo);
        } else if (step?.escalationType === 'role') {
          roleRefs.add(escalateTo);
        }
      }
    });
  });

  return {
    userRefs: Array.from(userRefs),
    roleRefs: Array.from(roleRefs),
  };
};

const validateWorkflowApprovalAssignments = async ({
  tenantId,
  actorUserId,
  workspaceId,
  workflowCapability,
}) => {
  const { userRefs, roleRefs } =
    collectWorkflowApprovalReferences(workflowCapability);
  if (userRefs.length === 0 && roleRefs.length === 0) return;

  if (!tenantId || !actorUserId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Tenant and actor are required to validate workflow approvers'
    );
  }

  if (userRefs.length > 0) {
    const { members = [] } =
      await projectFormWorkspaceService.listWorkspaceMembers({
        tenantId,
        userId: actorUserId,
        includeAll: true,
      });
    const scopedMembers = workspaceId
      ? members.filter((member) =>
          Array.isArray(member.assignments)
            ? member.assignments.some(
                (assignment) =>
                  String(assignment?.workspaceId || '') === String(workspaceId)
              )
            : false
        )
      : members;
    const allowedUserIds = new Set(
      scopedMembers
        .map((member) => String(member.userId || '').trim())
        .filter(Boolean)
    );
    const invalidUserRefs = userRefs.filter(
      (entry) => !allowedUserIds.has(entry)
    );

    if (invalidUserRefs.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Workflow approver users must be active members of this workspace'
      );
    }
  }

  if (roleRefs.length > 0) {
    const roles = await Role.find({
      tenantId,
      $or: [
        {
          _id: {
            $in: roleRefs.filter((entry) =>
              mongoose.Types.ObjectId.isValid(entry)
            ),
          },
        },
        { name: { $in: roleRefs } },
      ],
    })
      .select('_id name')
      .lean()
      .exec();
    const allowedRoleRefs = new Set();
    roles.forEach((role) => {
      allowedRoleRefs.add(String(role._id));
      if (role.name) allowedRoleRefs.add(String(role.name));
    });
    const invalidRoleRefs = roleRefs.filter(
      (entry) => !allowedRoleRefs.has(entry)
    );

    if (invalidRoleRefs.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Workflow approver roles must belong to this tenant'
      );
    }
  }
};

const generateAccessCodeValue = () =>
  randomUUID()
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase();

const normalizeAccessCodeValue = (value) => {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .toUpperCase();
  return normalized || null;
};

const normalizeSecurityCapabilityMatrix = (security = {}, defaults = {}) => {
  const access = security?.access || {};
  const authentication = security?.authentication || {};
  const accessCode = security?.accessCode || {};
  const submissionProtection = security?.submissionProtection || {};
  const normalizeAudienceValue = (audience) => {
    const normalized = String(audience || '').trim().toLowerCase();
    if (
      normalized === 'public' ||
      normalized === 'authenticated' ||
      normalized === 'selected_roles' ||
      normalized === 'selected_users'
    ) {
      return normalized;
    }
    if (normalized === 'anyone') return 'public';
    if (normalized === 'authenticated_users') return 'authenticated';
    return 'public';
  };
  const normalizeAuthMethod = (method) => {
    const normalized = String(method || '').trim().toLowerCase();
    if (
      normalized === 'none' ||
      normalized === 'otp' ||
      normalized === 'access_code'
    ) {
      return normalized;
    }
    if (normalized === 'off') return 'none';
    if (normalized === 'link_only') return 'otp';
    return 'none';
  };
  const mapLegacyModeToMethod = (mode) => {
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'otp' || normalized === 'link_only') return 'otp';
    if (normalized === 'access_code') return 'access_code';
    return 'none';
  };
  const mapAudienceToLegacy = (audience) => {
    if (audience === 'public') return 'anyone';
    if (audience === 'selected_roles') return 'selected_roles';
    if (audience === 'selected_users') return 'selected_users';
    return 'authenticated_users';
  };
  const mapMethodToPublicMode = (method) => {
    if (method === 'otp') return 'otp';
    if (method === 'access_code') return 'access_code';
    return 'off';
  };
  const normalized = {
    ...defaults,
    ...security,
    access: {
      ...(defaults.access || {}),
      ...access,
    },
    authentication: {
      ...(defaults.authentication || {}),
      ...authentication,
    },
    accessCode: {
      ...(defaults.accessCode || {}),
      ...accessCode,
    },
    submissionProtection: {
      ...(defaults.submissionProtection || {}),
      ...submissionProtection,
    },
  };

  const legacyAudience = normalizeSecurityAudience(access?.whoCanAccess);
  const initialAudience = normalizeAudienceValue(
    security.audience || legacyAudience
  );
  const initialMethod = normalizeAuthMethod(
    authentication?.method ||
      mapLegacyModeToMethod(security.publicSecureMode)
  );
  const enabled =
    typeof security.enabled === 'boolean'
      ? security.enabled
      : !(initialAudience === 'public' && initialMethod === 'none');

  let audience = initialAudience;
  let method = initialMethod;

  if (!enabled) {
    audience = 'public';
    method = 'none';
  } else if (method === 'access_code') {
    audience = 'public';
  } else {
    if (audience === 'public') {
      audience = 'authenticated';
    }
    method = 'otp';
  }

  const whoCanAccess = mapAudienceToLegacy(audience);
  const publicSecureMode = mapMethodToPublicMode(method);
  const isOpenPublic = !enabled || method === 'access_code';
  const derivedProfile = normalized.access?.restrictByLocation
    ? 'high_security'
    : audience === 'public'
      ? 'open_public'
      : audience === 'selected_roles'
        ? 'restricted_team'
        : audience === 'selected_users'
          ? 'internal_staff'
          : 'private_safe';
  const derivedMode =
    derivedProfile === 'open_public'
      ? 'public'
      : derivedProfile === 'internal_staff'
        ? 'internal'
      : derivedProfile === 'private_safe'
        ? 'private'
        : 'restricted';

  normalized.enabled = enabled;
  normalized.audience = audience;
  normalized.profile = derivedProfile;
  normalized.mode = derivedMode;
  normalized.publicSecureMode = publicSecureMode;
  normalized.access = {
    ...normalized.access,
    whoCanAccess,
    allowedRoles:
      audience === 'selected_roles'
        ? dedupeStringArray(normalized.access?.allowedRoles)
        : [],
    allowedUsers:
      audience === 'selected_users'
        ? dedupeStringArray(normalized.access?.allowedUsers, { lowercase: true })
        : [],
    allowedCountries: dedupeStringArray(normalized.access?.allowedCountries).map((entry) =>
      entry.toUpperCase()
    ),
    restrictByLocation: normalized.access?.restrictByLocation === true,
  };
  normalized.authentication = {
    ...normalized.authentication,
    method,
    requireLogin: enabled && method === 'otp',
    allowAnonymous: isOpenPublic,
    requireOtp: enabled && method === 'otp',
  };
  const normalizedAccessCode = normalizeAccessCodeValue(normalized.accessCode?.code);
  normalized.accessCode = {
    ...normalized.accessCode,
    code:
      publicSecureMode === 'access_code'
        ? normalizedAccessCode || generateAccessCodeValue()
        : normalizedAccessCode,
    hint: normalized.accessCode?.hint
      ? String(normalized.accessCode.hint).trim()
      : null,
    maxAttempts:
      Number.isFinite(Number(normalized.accessCode?.maxAttempts)) &&
      Number(normalized.accessCode.maxAttempts) > 0
        ? Math.min(20, Math.max(1, Number(normalized.accessCode.maxAttempts)))
        : 5,
    lockoutMinutes:
      Number.isFinite(Number(normalized.accessCode?.lockoutMinutes)) &&
      Number(normalized.accessCode.lockoutMinutes) > 0
        ? Math.min(1440, Math.max(1, Number(normalized.accessCode.lockoutMinutes)))
        : 15,
  };
  normalized.submissionProtection = {
    ...normalized.submissionProtection,
    preventDuplicateSubmission:
      normalized.submissionProtection?.preventDuplicateSubmission === true,
    duplicateCheckField: normalized.submissionProtection?.duplicateCheckField
      ? String(normalized.submissionProtection.duplicateCheckField).trim()
      : null,
    rateLimitEnabled: normalized.submissionProtection?.rateLimitEnabled === true,
    maxSubmissionsPerUser:
      Number.isFinite(Number(normalized.submissionProtection?.maxSubmissionsPerUser)) &&
      Number(normalized.submissionProtection.maxSubmissionsPerUser) > 0
        ? Number(normalized.submissionProtection.maxSubmissionsPerUser)
        : null,
  };
  normalized.channels = dedupeStringArray(normalized.channels).filter(
    (channel) => channel === 'web' || channel === 'api' || channel === 'whatsapp'
  ).length
    ? dedupeStringArray(normalized.channels).filter(
        (channel) => channel === 'web' || channel === 'api' || channel === 'whatsapp'
      )
    : ['web'];

  return normalized;
};

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

const normalizeProjectFormRuntimeConfig = (projectFormLike = {}, options = {}) => {
  const rawSource =
    typeof projectFormLike?.toObject === 'function'
      ? projectFormLike.toObject()
      : projectFormLike || {};
  const source = stripLegacyRuntimeFields(rawSource);

  const elements = Array.isArray(source.elements) ? source.elements : [];
  const defaultMappings = defaultSmartMappings();
  const smartMappings = {
    ...defaultMappings,
    ...(source.smartMappings || {}),
    fields: detectSmartMappings(elements, {
      ...defaultMappings.fields,
      ...((source.smartMappings && source.smartMappings.fields) || {}),
    }),
  };

  const normalized = {
    ...source,
    schemaVersion: '2.0.0',
    workspaceId:
      source?.workspaceId || projectFormWorkspaceService.DEFAULT_WORKSPACE_ID,
    identity: {
      name: source?.identity?.name || '',
      description: source?.identity?.description || '',
      category: source?.identity?.category || 'standard',
      tags: normalizeTags(source?.identity?.tags || []),
      status: source?.identity?.status || 'draft',
    },
    layout: {
      style: source?.layout?.style || 'default',
      wizardMode: Boolean(source?.layout?.wizardMode),
      grid: {
        columns: source?.layout?.grid?.columns || 12,
        columnSpans: source?.layout?.grid?.columnSpans || {},
      },
      builder: {
        gridSize: source?.layout?.builder?.gridSize || 12,
        snapToGrid:
          source?.layout?.builder?.snapToGrid !== false,
        showGridLines: Boolean(source?.layout?.builder?.showGridLines),
        autoArrange: Boolean(source?.layout?.builder?.autoArrange),
      },
    },
    capabilities: mergeProjectFormCapabilities(source.capabilities || {}),
    smartMappings,
    analytics: {
      views: Number(source?.analytics?.views || 0),
      submissions: Number(source?.analytics?.submissions || 0),
      lastAccessed: source?.analytics?.lastAccessed || null,
      conversionRate: Number(source?.analytics?.conversionRate || 0),
      profile: source?.analytics?.profile || {},
    },
    ui: {
      theme: source?.ui?.theme || 'default',
      primaryColor: source?.ui?.primaryColor || '#3b82f6',
      secondaryColor: source?.ui?.secondaryColor || '#dbeafe',
      companyLogoUrl: source?.ui?.companyLogoUrl || '',
      conversationTitle: source?.ui?.conversationTitle || '',
      conversationDescription: source?.ui?.conversationDescription || '',
      layout: source?.ui?.layout || 'single',
      showProgressBar: source?.ui?.showProgressBar !== false,
    },
    metadata: {
      ...(source.metadata || {}),
      schemaVersion: '2.0.0',
      enabledCapabilities:
        Array.isArray(source?.metadata?.enabledCapabilities) &&
        source.metadata.enabledCapabilities.length > 0
          ? source.metadata.enabledCapabilities
          : deriveEnabledCapabilityFamilies(source.capabilities || {}),
      systemTarget: source?.metadata?.systemTarget || null,
      systemVersion: source?.metadata?.systemVersion || null,
    },
  };

  if (options.asDocument && projectFormLike && typeof projectFormLike.set === 'function') {
    Object.entries(normalized).forEach(([key, value]) => {
      projectFormLike.set(key, value);
    });
    return projectFormLike;
  }

  return normalized;
};

const applyProjectFormSchemaDefaults = (projectFormLike = {}, options = {}) =>
  normalizeProjectFormRuntimeConfig(projectFormLike, options);

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

const inferAnalysisProfile = ({ identity = {}, elements = [] }) => {
  const tags = normalizeTags(identity.tags || []);
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

const enrichAnalyticsProfile = ({
  identity = {},
  analytics = {},
  elements = [],
  existingProfile = null,
}) => {
  const inferred = inferAnalysisProfile({ identity, elements });
  const explicit = analytics.profile || {};
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
    ...analytics,
    profile: merged,
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

const normalizeWorkflowTriggerOn = (workflows = [], fallbackTriggerOn = 'submission') => {
  if (!Array.isArray(workflows)) return [];

  const createWorkflowId = () =>
    `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const createStepId = (index = 0) =>
    `step_${index + 1}_${Math.random().toString(36).slice(2, 7)}`;
  const normalizedFallbackTriggerOn = normalizeWorkflowTriggerValue(fallbackTriggerOn);

  return workflows.map((workflow) => {
    const triggerOn = normalizeWorkflowTriggerValue(
      workflow?.triggerOn,
      normalizedFallbackTriggerOn
    );
    const steps = Array.isArray(workflow?.steps)
      ? workflow.steps.map((step = {}, index) => {
          const normalizedAssigneeRoles = Array.isArray(step?.assigneeRoles)
            ? step.assigneeRoles
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
            : [];
          const normalizedAssigneeRole =
            normalizedAssigneeRoles[0] || String(step?.assigneeRole || '').trim() || null;

          return {
            ...step,
            id: step?.id || createStepId(index),
            name: step?.name || `Step ${index + 1}`,
            stepOrder:
              Number.isFinite(step?.stepOrder) && step.stepOrder >= 0
                ? step.stepOrder
                : index,
            assigneeRole: normalizedAssigneeRole,
            assigneeRoles: normalizedAssigneeRoles.length
              ? normalizedAssigneeRoles
              : normalizedAssigneeRole
                ? [normalizedAssigneeRole]
                : [],
          };
        })
      : [];

    return {
      ...workflow,
      id: workflow?.id || createWorkflowId(),
      triggerOn,
      steps,
    };
  });
};

const normalizeWorkflowCapability = (value = {}, defaults = null) => {
  const resolvedDefaults = defaults || defaultCapabilities().experience.workflow;
  const source = value && typeof value === 'object' ? value : {};
  const normalizedRootTriggerOn = normalizeWorkflowTriggerValue(
    source.triggerOn,
    resolvedDefaults.triggerOn
  );
  const normalizedWorkflows = normalizeWorkflowTriggerOn(
    Array.isArray(source.workflows) ? source.workflows : resolvedDefaults.workflows,
    normalizedRootTriggerOn
  );
  const canonicalTriggerOn =
    normalizedWorkflows[0]?.triggerOn || normalizedRootTriggerOn;

  return {
    ...resolvedDefaults,
    ...source,
    triggerOn: canonicalTriggerOn,
    workflows: normalizedWorkflows,
  };
};

const isStrictPublicAccessible = (projectForm) => {
  if (!projectForm) return false;
  return (
    projectForm?.identity?.status === 'published' &&
    projectForm?.status === 'active'
  );
};

const sanitizePublicForm = (projectForm) => {
  const source = normalizeProjectFormRuntimeConfig(projectForm);

  const inferSpecialFieldType = (element = {}) => {
    const properties = element.properties || {};
    const explicitFieldType = String(properties.fieldType || '').trim().toLowerCase();
    if (explicitFieldType) return explicitFieldType;

    const elementType = String(element.type || '').trim().toLowerCase();
    const elementId = String(element.id || '').trim().toLowerCase();
    const label = String(element.label || properties.label || '').trim().toLowerCase();
    const fieldKey = String(properties.fieldKey || '').trim().toLowerCase();

    if (
      elementType === 'text' &&
      (fieldKey.includes('membership') ||
        typeof properties.prefix !== 'undefined' ||
        typeof properties.length !== 'undefined' ||
        typeof properties.separator !== 'undefined' ||
        typeof properties.readonlyAfterGenerated !== 'undefined')
    ) {
      return 'generated_id';
    }

    if (
      ['phone', 'phone_number'].includes(elementType) &&
      (typeof properties.otpLength !== 'undefined' ||
        typeof properties.otpExpiryMinutes !== 'undefined' ||
        typeof properties.maxAttempts !== 'undefined' ||
        label.includes('verify') ||
        label.includes('secured') ||
        elementId.includes('secured'))
    ) {
      return 'secured_phone';
    }

    if (
      elementType === 'email' &&
      (typeof properties.otpLength !== 'undefined' ||
        typeof properties.otpExpiryMinutes !== 'undefined' ||
        typeof properties.maxAttempts !== 'undefined' ||
        label.includes('verify') ||
        label.includes('secured') ||
        elementId.includes('secured'))
    ) {
      return 'secured_email';
    }

    if (
      elementType === 'fileupload' &&
      (String(properties.acceptedFormats || '').trim() ||
        label.includes('passport') ||
        label.includes('profile image') ||
        elementId.includes('image'))
    ) {
      return 'profile_image_upload';
    }

    if (
      elementType === 'statement' &&
      (typeof properties.allowEditBeforeSubmit !== 'undefined' ||
        typeof properties.showBranding !== 'undefined' ||
        String(properties.layout || '').trim() ||
        label.includes('submission preview') ||
        label.includes('preview your submission'))
    ) {
      return 'submission_preview_step';
    }

    return '';
  };

  const safeElements = Array.isArray(source.elements)
    ? source.elements.map((element = {}) => {
        const properties = element.properties || {};
        const inferredFieldType = inferSpecialFieldType(element);
        return {
          id: element.id,
          type: element.type,
          properties: {
            ...properties,
            ...(inferredFieldType ? { fieldType: inferredFieldType } : {}),
            helpText:
              properties.helpText ||
              properties.validation?.helpText ||
              undefined,
          },
        };
      })
    : [];
  const safeCapabilities = {
    ...(source.capabilities || defaultCapabilities()),
  };
  if (safeCapabilities?.experience?.security?.accessCode) {
    safeCapabilities.experience = {
      ...(safeCapabilities.experience || {}),
      security: {
        ...(safeCapabilities.experience?.security || {}),
        accessCode: {
          ...safeCapabilities.experience.security.accessCode,
          code: undefined,
        },
      },
    };
  }

  return {
    _id: source._id || null,
    formId: source.formId || source._id || null,
    projectId: source.projectId || null,
    tenantId: source.tenantId || null,
    shareRef: source.shareRef || null,
    shareCode: source.shareCode || null,
    publicRef: source.publicRef,
    formReference: source.formReference || null,
    identity: {
      name: source.identity?.name || '',
      description: source.identity?.description || '',
      category: source.identity?.category || 'standard',
      tags: Array.isArray(source.identity?.tags) ? source.identity.tags : [],
      status: source.identity?.status || 'draft',
    },
    elements: safeElements,
    layout: {
      style: source.layout?.style || 'default',
      wizardMode: Boolean(source.layout?.wizardMode),
      grid: {
        columns: source.layout?.grid?.columns || 12,
        columnSpans: source.layout?.grid?.columnSpans || {},
      },
    },
    capabilities: safeCapabilities,
    ui: source.ui || {},
    metadata: {
      enabledCapabilities: Array.isArray(source.metadata?.enabledCapabilities)
        ? source.metadata.enabledCapabilities
        : [],
      elementsCount:
        source.metadata?.elementsCount ||
        safeElements.length,
      hasValidation: Boolean(source.metadata?.hasValidation),
      lastModified: source.metadata?.lastModified || source.updatedAt || null,
      formCategory: source.metadata?.formCategory || null,
      systemTarget: source.metadata?.systemTarget || null,
      systemVersion: source.metadata?.systemVersion || null,
      schemaVersion: '2.0.0',
    },
  };
};

const resolvePublicSecureMode = (projectForm) => {
  if (projectForm?.identity?.category === SYSTEM_FORM_CATEGORY) {
    return 'otp';
  }
  return normalizePublicSecurityMode(
    projectForm?.capabilities?.experience?.security?.publicSecureMode || 'off'
  );
};

const buildSchemaHash = (projectForm) => {
  const payload = {
    projectId: projectForm?.projectId || '',
    publicRef: projectForm?.publicRef || '',
    shareRef: projectForm?.shareRef || '',
    version: projectForm?.schemaVersion || '2.0.0',
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
  const requiresIdentityChallenge =
    secureMode === 'otp' || secureMode === 'access_code';
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
    deploymentStatus: projectForm?.identity?.status || null,
    status: projectForm?.status || null,
    security: projectForm?.capabilities?.experience?.security?.mode || null,
    publicSecureMode: secureMode,
    pipelineTarget: 'postgres_unified',
    schemaVersion: projectForm?.schemaVersion || '2.0.0',
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
    projectForm?.identity?.name
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
    projectForm?.identity?.name
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
  normalizedBody = normalizeSystemFormContract({
    body: normalizedBody,
    existing: null,
    enforceForCreate: true,
  });
  normalizedBody.capabilities = {
    ...defaultCapabilities(),
    ...(normalizedBody.capabilities || {}),
  };
  normalizedBody.capabilities.experience.workflow = normalizeWorkflowCapability(
    normalizedBody?.capabilities?.experience?.workflow || {},
    defaultCapabilities().experience.workflow
  );
  normalizedBody.analytics = enrichAnalyticsProfile({
    identity: normalizedBody.identity || {},
    analytics: normalizedBody.analytics || {},
    elements: normalizedBody.elements || [],
  });
  normalizedBody = applyProjectFormSchemaDefaults(normalizedBody);

  const workspaceId = await projectFormWorkspaceService.resolveWorkspaceForFormWrite({
    tenantId,
    actorUserId: options.actorUserId || createdBy,
    workspaceId: normalizedBody.workspaceId || options.workspaceId,
  });
  normalizedBody.workspaceId = workspaceId;
  await validateWorkflowApprovalAssignments({
    tenantId,
    actorUserId: options.actorUserId || createdBy,
    workspaceId,
    workflowCapability: normalizedBody?.capabilities?.experience?.workflow,
  });

  const projectForm = await ProjectForm.createProjectForm(
    normalizedBody,
    tenantId,
    createdBy
  );

  await fieldCatalogService.syncCatalogFromForm(projectForm);
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
  createdBy = null,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  if (!VALID_SYSTEM_TARGETS.has(target)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid system form target');
  }

  const filter = {
    tenantId,
    deletedAt: null,
    'metadata.systemTarget': target,
    $or: [
      { 'identity.category': SYSTEM_FORM_CATEGORY },
      { 'metadata.formCategory': SYSTEM_FORM_CATEGORY },
    ],
  };

  let projectForm = await ProjectForm.findOne(filter);

  if (!projectForm) {
    const template = buildSystemFormTemplate(target);
    try {
      projectForm = await createProjectForm(template, tenantId, createdBy);
      await projectForm.publish();
    } catch (err) {
      if (err.code === 11000) {
        // Race condition — another request created it first.
        projectForm = await ProjectForm.findOne(filter);
        if (!projectForm) {
          throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to resolve system form');
        }
      } else {
        throw err;
      }
    }
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
 * Supports canonical publicRef, human-readable formReference (formId, e.g. #SB-000001)
 * and legacy projectId.
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
    // Resolve by human-readable formReference (formId). Normalize the optional
    // "#" prefix so both "SB-000001" and "#SB-000001" resolve.
    const bareRef = String(reference || '').trim().replace(/^#/, '');
    if (bareRef) {
      const candidates = Array.from(new Set([bareRef, `#${bareRef}`]));
      projectForm = await ProjectForm.findOne({
        formReference: { $in: candidates },
        deletedAt: null,
      });
      if (projectForm) resolvedBy = 'formReference';
    }
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
    $nor: [
      { 'identity.category': SYSTEM_FORM_CATEGORY },
      { 'metadata.formCategory': SYSTEM_FORM_CATEGORY },
    ],
  };

  return queryProjectForms(tenantFilter, options);
};

/**
 * List publicly accessible project forms for a tenant, exposed to API-key
 * clients. Returns compact, sanitized summaries (no element definitions,
 * internal metadata, or workspace/access details).
 * @param {string} tenantId - Tenant to list forms for
 * @param {Object} [filter={}] - Additional filters (status, identity.status, ...)
 * @param {Object} [options={}] - Query options (limit, page, sortBy)
 * @returns {Promise<QueryResult>}
 */
const listPublicProjectFormsByTenant = async (tenantId, filter = {}, options = {}) => {
  const tenantFilter = {
    ...filter,
    tenantId,
    deletedAt: null,
    $nor: [
      { 'identity.category': SYSTEM_FORM_CATEGORY },
      { 'metadata.formCategory': SYSTEM_FORM_CATEGORY },
    ],
  };

  const result = await queryProjectForms(tenantFilter, {
    limit: options.limit || 50,
    page: options.page || 1,
    sortBy: options.sortBy || 'createdAt:desc',
    select:
      'projectId formReference shareRef publicRef tenantId identity.name identity.description identity.status status elements capabilities createdAt updatedAt',
  });

  const results = (result.results || []).map((projectForm) => {
    const isPublic = isStrictPublicAccessible(projectForm);
    const secureMode = String(
      projectForm?.capabilities?.experience?.security?.mode || 'off'
    ).toLowerCase();
    return {
      projectId: projectForm.projectId,
      formReference: projectForm.formReference || null,
      shareRef: projectForm.shareRef || null,
      publicRef: projectForm.publicRef || null,
      tenantId: projectForm.tenantId,
      name: projectForm?.identity?.name || projectForm?.identity?.title || '',
      description: projectForm?.identity?.description || '',
      status: projectForm?.identity?.status || projectForm?.status || 'draft',
      formStatus: projectForm?.status || 'inactive',
      secureMode,
      publicAccessible: isPublic,
      elementCount: Array.isArray(projectForm?.elements)
        ? projectForm.elements.length
        : 0,
      createdAt: projectForm.createdAt,
      updatedAt: projectForm.updatedAt,
    };
  });

  return {
    ...result,
    results,
  };
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
  const baseProjectName = sourceObj?.identity?.name || sourceObj?.projectId || 'Module';
  const duplicateName = String(name || '').trim() || `${baseProjectName} Copy`;

  const duplicatePayload = {
    schemaVersion: '2.0.0',
    identity: {
      ...(sourceObj.identity || {}),
      name: duplicateName,
      status: 'draft',
    },
    elements: Array.isArray(sourceObj.elements) ? sourceObj.elements : [],
    layout: sourceObj.layout || {},
    capabilities: sourceObj.capabilities || defaultCapabilities(),
    smartMappings: sourceObj.smartMappings || defaultSmartMappings(),
    analytics: sourceObj.analytics || {},
    ui: sourceObj.ui || {},
    metadata: {
      ...(sourceObj.metadata || {}),
      schemaVersion: '2.0.0',
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
const performProjectFormUpdateById = async (
  projectFormId,
  updateBody,
  options = {}
) => {
  let normalizedUpdateBody = { ...updateBody };
  if (updateBody?.capabilities?.experience?.workflow) {
    normalizedUpdateBody.capabilities = normalizedUpdateBody.capabilities || {};
    normalizedUpdateBody.capabilities.experience =
      normalizedUpdateBody.capabilities.experience || {};
    normalizedUpdateBody.capabilities.experience.workflow = normalizeWorkflowCapability(
      updateBody.capabilities.experience.workflow,
      defaultCapabilities().experience.workflow
    );
  }
  const projectForm = await getProjectFormById(projectFormId);
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
    const currentVersion = String(projectForm?.schemaVersion || '2.0.0');
    const [major = 2, minor = 0, patch = 0] = currentVersion
      .split('.')
      .map((part) => Number(part) || 0);
    normalizedUpdateBody.metadata.schemaVersion = `${major}.${minor}.${patch + 1}`;
  }

  const mergedElements = Array.isArray(normalizedUpdateBody.elements)
    ? normalizedUpdateBody.elements
    : projectForm.elements || [];
  const mergedIdentity = {
    ...(projectForm.identity?.toObject
      ? projectForm.identity.toObject()
      : projectForm.identity || {}),
    ...(normalizedUpdateBody.identity || {}),
  };
  const mergedAnalytics = enrichAnalyticsProfile({
    identity: mergedIdentity,
    analytics: {
      ...(projectForm.analytics?.toObject
        ? projectForm.analytics.toObject()
        : projectForm.analytics || {}),
      ...(normalizedUpdateBody.analytics || {}),
    },
    elements: mergedElements,
    existingProfile: projectForm?.analytics?.profile || null,
  });
  normalizedUpdateBody = applyProjectFormSchemaDefaults({
    ...(projectForm?.toObject ? projectForm.toObject() : projectForm),
    ...normalizedUpdateBody,
    identity: mergedIdentity,
    analytics: mergedAnalytics,
    elements: mergedElements,
    capabilities: {
      ...(projectForm.capabilities?.toObject
        ? projectForm.capabilities.toObject()
        : projectForm.capabilities || {}),
      ...(normalizedUpdateBody.capabilities || {}),
    },
    layout: {
      ...(projectForm.layout?.toObject
        ? projectForm.layout.toObject()
        : projectForm.layout || {}),
      ...(normalizedUpdateBody.layout || {}),
    },
    ui: {
      ...(projectForm.ui?.toObject
        ? projectForm.ui.toObject()
        : projectForm.ui || {}),
      ...(normalizedUpdateBody.ui || {}),
    },
    metadata: {
      ...(projectForm.metadata?.toObject
        ? projectForm.metadata.toObject()
        : projectForm.metadata || {}),
      ...(normalizedUpdateBody.metadata || {}),
    },
  });

  await validateWorkflowApprovalAssignments({
    tenantId: projectForm.tenantId,
    actorUserId: options.actorUserId,
    workspaceId: normalizedUpdateBody.workspaceId || projectForm.workspaceId,
    workflowCapability: normalizedUpdateBody?.capabilities?.experience?.workflow,
  });

  Object.assign(projectForm, normalizedUpdateBody);
  await projectForm.save();

  if (options.populate) {
    await projectForm.populate(options.populate);
  }

  await fieldCatalogService.syncCatalogFromForm(projectForm);
  return projectForm;
};

const isMongooseVersionError = (error) =>
  Boolean(
    error &&
      (error.name === 'VersionError' ||
        String(error?.message || '').includes('No matching document found for id'))
  );

/**
 * Update a project form by ID.
 *
 * Autosave issues rapid overlapping PATCH requests. Because the update is a
 * load-then-save cycle, Mongoose's optimistic concurrency version key (__v)
 * can be stale by the time save() runs, throwing a VersionError ("No matching
 * document found for id ... version ..."). We retry with a fresh read so the
 * last writer wins instead of surfacing a 500.
 */
const updateProjectFormById = async (projectFormId, updateBody, options = {}) => {
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await performProjectFormUpdateById(projectFormId, updateBody, options);
    } catch (error) {
      if (!isMongooseVersionError(error) || attempt >= maxAttempts) {
        throw error;
      }
      lastError = error;
      logger.warn(
        { projectFormId, attempt, message: error.message },
        'Project form update hit a version conflict; retrying with a fresh read'
      );
    }
  }
  throw lastError;
};

const buildSystemFormTemplate = (target) => {
  if (target === SYSTEM_TARGET_USER_PROFILE) {
    return {
      schemaVersion: '2.0.0',
      identity: {
        name: 'User Profile',
        description: '',
        category: SYSTEM_FORM_CATEGORY,
        tags: ['system', 'profile', 'user'],
        status: 'published',
      },
      elements: getUserProfileSystemElements(),
      layout: {
        style: 'default',
        wizardMode: false,
        grid: { columns: 12, columnSpans: {} },
        builder: {},
      },
      capabilities: {
        ...defaultCapabilities(),
        experience: {
          ...defaultCapabilities().experience,
          security: {
            profile: 'private_safe',
            mode: 'private',
            publicSecureMode: 'otp',
            access: {
              whoCanAccess: 'authenticated_users',
              allowedRoles: [],
              allowedUsers: [],
              restrictByLocation: false,
              allowedCountries: [],
            },
            authentication: {
              requireLogin: true,
              allowAnonymous: false,
              requireOtp: true,
            },
            submissionProtection: {
              preventDuplicateSubmission: false,
              duplicateCheckField: null,
              rateLimitEnabled: false,
              maxSubmissionsPerUser: null,
            },
            channels: ['web'],
          },
          behavior: {
            allowMultipleSubmissions: true,
            enableProgressSave: true,
            autoSave: false,
            submitOnComplete: true,
          },
          distribution: {
            enableSharing: false,
            allowEmbedding: false,
            generateQR: false,
            enableDeepLinking: false,
          },
          workflow: {
            enabled: false,
            approvalMode: 'none',
            triggerOn: 'submission',
            steps: [],
            workflows: [],
          },
        },
      },
      smartMappings: defaultSmartMappings(),
      analytics: {
        profile: inferAnalysisProfile({
          identity: { tags: ['system', 'profile', 'user'] },
          elements: getUserProfileSystemElements(),
        }),
      },
      ui: {},
      metadata: {
        systemTarget: SYSTEM_TARGET_USER_PROFILE,
        systemVersion: '1.0.0',
        integrations: ['web', 'mobile'],
        schemaVersion: '2.0.0',
      },
    };
  }

  if (target === SYSTEM_TARGET_NODE_PROFILE) {
    return {
      schemaVersion: '2.0.0',
      identity: {
        name: 'Node Profile',
        description: '',
        category: SYSTEM_FORM_CATEGORY,
        tags: ['system', 'profile', 'node'],
        status: 'published',
      },
      elements: getNodeProfileSystemElements(),
      layout: {
        style: 'default',
        wizardMode: false,
        grid: { columns: 12, columnSpans: {} },
        builder: {},
      },
      capabilities: {
        ...defaultCapabilities(),
        experience: {
          ...defaultCapabilities().experience,
          security: {
            profile: 'private_safe',
            mode: 'private',
            publicSecureMode: 'otp',
            access: {
              whoCanAccess: 'authenticated_users',
              allowedRoles: [],
              allowedUsers: [],
              restrictByLocation: false,
              allowedCountries: [],
            },
            authentication: {
              requireLogin: true,
              allowAnonymous: false,
              requireOtp: true,
            },
            submissionProtection: {
              preventDuplicateSubmission: false,
              duplicateCheckField: null,
              rateLimitEnabled: false,
              maxSubmissionsPerUser: null,
            },
            channels: ['web'],
          },
          behavior: {
            allowMultipleSubmissions: true,
            enableProgressSave: true,
            autoSave: false,
            submitOnComplete: true,
          },
          distribution: {
            enableSharing: false,
            allowEmbedding: false,
            generateQR: false,
            enableDeepLinking: false,
          },
          workflow: {
            enabled: false,
            approvalMode: 'none',
            triggerOn: 'submission',
            steps: [],
            workflows: [],
          },
        },
      },
      smartMappings: defaultSmartMappings(),
      analytics: {
        profile: inferAnalysisProfile({
          identity: { tags: ['system', 'profile', 'node'] },
          elements: getNodeProfileSystemElements(),
        }),
      },
      ui: {},
      metadata: {
        systemTarget: SYSTEM_TARGET_NODE_PROFILE,
        systemVersion: '1.2.0',
        integrations: ['web', 'mobile'],
        schemaVersion: '2.0.0',
      },
    };
  }

  throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported system target: ${target}`);
};

const syncSystemFormTemplateIfNeeded = async (projectForm) => {
  if (!projectForm || projectForm.deletedAt) return projectForm;
  const isSystemForm =
    projectForm?.identity?.category === SYSTEM_FORM_CATEGORY ||
    projectForm?.metadata?.formCategory === SYSTEM_FORM_CATEGORY;
  if (!isSystemForm) return projectForm;

  const target = projectForm?.metadata?.systemTarget;
  if (!VALID_SYSTEM_TARGETS.has(target)) return projectForm;

  const tenantId = projectForm.tenantId;

  // Clean up duplicate system forms for this tenant+target (can happen from
  // concurrent bootstrap calls before the unique index existed, or from
  // bootstrap --force which soft-deletes the old form and creates a new one).
  // We look at ALL docs (including soft-deleted) because the manual unique
  // index on tenantId+formCategory+systemTarget is not partial on deletedAt.
  const dups = await ProjectForm.find({
    tenantId,
    'metadata.systemTarget': target,
    _id: { $ne: projectForm._id },
    $or: [
      { 'identity.category': SYSTEM_FORM_CATEGORY },
      { 'metadata.formCategory': SYSTEM_FORM_CATEGORY },
    ],
  }).lean();

  if (dups.length > 0) {
    const dupIds = dups.map((d) => d._id);
    await ProjectForm.deleteMany({ _id: { $in: dupIds } });
    logger.warn(
      `Cleaned up ${dupIds.length} system form(s) for tenant=${tenantId} target=${target}`
    );
  }

  const template = buildSystemFormTemplate(target);
  const currentVersion = String(projectForm?.metadata?.systemVersion || '');
  const expectedVersion = String(template?.metadata?.systemVersion || '');
  const ensureSystemFormIsLive = async () => {
    let changed = false;

    if (projectForm?.metadata?.formCategory !== SYSTEM_FORM_CATEGORY) {
      projectForm.metadata = {
        ...(projectForm.metadata?.toObject
          ? projectForm.metadata.toObject()
          : projectForm.metadata || {}),
        formCategory: SYSTEM_FORM_CATEGORY,
      };
      changed = true;
    }

    if (
      String(projectForm?.identity?.status || '').toLowerCase() !== 'published' ||
      String(projectForm?.status || '').toLowerCase() !== 'active'
    ) {
      await projectForm.publish();
      changed = true;
    } else if (changed) {
      await projectForm.save();
    }

    return projectForm;
  };

  if (currentVersion === expectedVersion) {
    return ensureSystemFormIsLive();
  }

  projectForm.elements = template.elements;
  projectForm.metadata = {
    ...(projectForm.metadata || {}),
    ...template.metadata,
  };
  projectForm.identity = {
    ...(projectForm.identity?.toObject
      ? projectForm.identity.toObject()
      : projectForm.identity || {}),
    ...(template.identity || {}),
    status: projectForm?.identity?.status || template.identity.status,
  };
  projectForm.layout = template.layout;
  projectForm.capabilities = template.capabilities;
  projectForm.smartMappings = template.smartMappings;
  projectForm.analytics = template.analytics;
  projectForm.ui = template.ui;
  await projectForm.save();
  return ensureSystemFormIsLive();
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
    const systemFilter = {
      tenantId,
      deletedAt: null,
      'metadata.systemTarget': target,
      $or: [
        { 'identity.category': SYSTEM_FORM_CATEGORY },
        { 'metadata.formCategory': SYSTEM_FORM_CATEGORY },
      ],
    };

    // eslint-disable-next-line no-await-in-loop
    const existing = await ProjectForm.findOne(systemFilter);

    if (existing && !force) {
      // eslint-disable-next-line no-await-in-loop
      const canonical = await getSystemProjectFormForTenant({
        tenantId,
        target,
        syncTemplate: true,
        createdBy,
      });
      // eslint-disable-next-line no-await-in-loop
      await canonical.publish();
      results.push({
        target,
        status: 'exists',
        id: String(canonical._id || canonical.id || ''),
        projectId: canonical.projectId,
        publicRef: canonical.publicRef,
        shareRef: canonical.shareRef,
      });
      // eslint-disable-next-line no-continue
      continue;
    }

    if (existing && force) {
      // eslint-disable-next-line no-await-in-loop
      const forceForms = await ProjectForm.find(systemFilter);
      // eslint-disable-next-line no-restricted-syntax
      for (const form of forceForms) {
        // eslint-disable-next-line no-await-in-loop
        await form.softDelete(createdBy);
      }
    }

    const template = buildSystemFormTemplate(target);
    // eslint-disable-next-line no-await-in-loop
    const created = await createProjectForm(template, tenantId, createdBy);
    // eslint-disable-next-line no-await-in-loop
    await created.publish();
    results.push({
      target,
      status: 'created',
      id: String(created._id || created.id || ''),
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
  projectForm.analytics = enrichAnalyticsProfile({
    identity: projectForm.identity?.toObject
      ? projectForm.identity.toObject()
      : projectForm.identity || {},
    analytics: projectForm.analytics?.toObject
      ? projectForm.analytics.toObject()
      : projectForm.analytics || {},
    elements: projectForm.elements || [],
    existingProfile: projectForm?.analytics?.profile || null,
  });
  projectForm.markModified('analytics');
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
    projectName: projectForm.identity?.name,
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
  const identity = projectForm.identity?.toObject
    ? projectForm.identity.toObject()
    : projectForm.identity || {};
  const analysisProfile =
    projectForm.analytics?.profile &&
    Object.keys(projectForm.analytics.profile).length > 0
      ? projectForm.analytics.profile
      : inferAnalysisProfile({
          identity,
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
    projectName: identity.name,
    status: projectForm.status,
    deploymentStatus: projectForm.identity?.status || null,
    tags: Array.isArray(identity.tags) ? identity.tags : [],
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
      { 'identity.name': searchRegex },
      { 'identity.tags': { $in: [searchRegex] } },
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
  normalizeComplianceCapability,
  normalizeProjectFormRuntimeConfig,
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
  listPublicProjectFormsByTenant,
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
