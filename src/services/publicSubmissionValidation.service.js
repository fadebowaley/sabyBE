const httpStatus = require('http-status');
const validator = require('validator');
const ApiError = require('../utils/ApiError');
const { PublicFormAccess } = require('../models');
const { postgresPool } = require('../config/postgres');
const projectFormService = require('./projectForm.service');
const projectFormInvoiceService = require('./projectFormInvoice.service');
const publicFormUploadService = require('./publicFormUpload.service');
const {
  normalizePhoneToE164,
} = require('../utils/phoneNumber');

const OTP_CHALLENGE_TOKEN_TYPE = 'public_form_otp';
const PUBLIC_SUBMISSION_RATE_LIMIT_WINDOW_HOURS = 1;
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const normalizePublicSecureMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['link_only', 'otp', 'access_code'].includes(normalized)) {
    return normalized;
  }
  return 'off';
};

const isSecurePublicMode = (value) => normalizePublicSecureMode(value) !== 'off';

const getNormalizedSecurityConfig = (projectForm) => {
  const normalizedForm = projectFormService.normalizeProjectFormRuntimeConfig(projectForm);
  const security = normalizedForm?.capabilities?.experience?.security || {};
  return {
    normalizedForm,
    security,
    secureMode: normalizePublicSecureMode(security?.publicSecureMode),
    channels: Array.isArray(security?.channels)
      ? security.channels
          .map((entry) => String(entry || '').trim().toLowerCase())
          .filter(Boolean)
      : ['web'],
    access: security?.access || {},
    authentication: security?.authentication || {},
    submissionProtection: security?.submissionProtection || {},
  };
};

const extractDuplicateCheckValue = (submissionData, duplicateCheckField) => {
  const fieldKey = String(duplicateCheckField || '').trim();
  if (!fieldKey) return null;
  const rawValue = submissionData?.[fieldKey];
  if (rawValue == null) return null;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    return trimmed || null;
  }
  if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return String(rawValue);
  }
  return null;
};

const normalizeIsoDateLike = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const normalizeMonthLike = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const normalized = normalizeIsoDateLike(raw);
  return normalized ? normalized.slice(0, 7) : null;
};

const normalizeYearLike = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return Number.isFinite(year) ? year : null;
};

const normalizeWeekLike = (value) => {
  const raw = String(value || '').trim();
  return /^\d{4}-W\d{2}$/.test(raw) ? raw : null;
};

const isoWeekToRange = (value) => {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(value || ''));
  if (!match) {
    return { start: null, end: null };
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const day = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
};

const normalizeIntegerList = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry))
    )
  ).sort((left, right) => left - right);
};

const isUploadElement = (element = {}) => {
  const fieldType = String(element?.properties?.fieldType || '')
    .trim()
    .toLowerCase();
  const elementType = String(element?.type || '')
    .trim()
    .toLowerCase();
  return (
    fieldType === 'profile_image_upload' ||
    elementType === 'fileupload' ||
    elementType === 'file'
  );
};

const buildActorScope = (actorContext = {}) => {
  const normalizedIp = String(actorContext?.ip || '').trim() || null;
  const normalizedUserId = String(actorContext?.userId || '').trim() || null;
  const normalizedIdentifier = String(actorContext?.identifier || '').trim().toLowerCase() || null;

  if (normalizedUserId) {
    return {
      kind: 'user',
      userId: normalizedUserId,
      ip: normalizedIp,
      identifier: normalizedIdentifier,
    };
  }

  if (normalizedIdentifier) {
    return {
      kind: 'identifier',
      userId: null,
      ip: normalizedIp,
      identifier: normalizedIdentifier,
    };
  }

  if (normalizedIp) {
    return {
      kind: 'ip',
      userId: null,
      ip: normalizedIp,
      identifier: null,
    };
  }

  return {
    kind: 'anonymous',
    userId: null,
    ip: null,
    identifier: null,
  };
};

const countRateLimitedSubmissions = async ({
  tenantId,
  projectId,
  formId,
  actorScope,
  since,
}) => {
  if (!tenantId || !projectId || !formId || !actorScope?.kind || actorScope.kind === 'anonymous') {
    return 0;
  }

  const conditions = [
    'tenant_id = $1',
    'project_id = $2',
    'form_id = $3',
    'submitted_at >= $4',
  ];
  const values = [tenantId, projectId, formId, since];

  if (actorScope.kind === 'user' && actorScope.userId) {
    values.push(actorScope.userId);
    conditions.push(`user_id = $${values.length}`);
  } else if (actorScope.kind === 'identifier' && actorScope.identifier) {
    values.push(actorScope.identifier);
    conditions.push(
      `(LOWER(COALESCE(meta->'publicAccess'->>'identifier', '')) = $${values.length}
        OR LOWER(COALESCE(meta->'requestContext'->>'identifier', '')) = $${values.length})`
    );
  } else if (actorScope.kind === 'ip' && actorScope.ip) {
    values.push(actorScope.ip);
    conditions.push(`COALESCE(meta->'requestContext'->>'ip', '') = $${values.length}`);
  } else {
    return 0;
  }

  const result = await postgresPool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM form_submissions
      WHERE ${conditions.join(' AND ')}
    `,
    values
  );

  return Number(result.rows?.[0]?.count || 0);
};

const countActorSubmissions = async ({
  tenantId,
  projectId,
  formId,
  actorScope,
}) => {
  if (!tenantId || !projectId || !formId || !actorScope?.kind || actorScope.kind === 'anonymous') {
    return 0;
  }

  const conditions = ['tenant_id = $1', 'project_id = $2', 'form_id = $3'];
  const values = [tenantId, projectId, formId];

  if (actorScope.kind === 'user' && actorScope.userId) {
    values.push(actorScope.userId);
    conditions.push(`user_id = $${values.length}`);
  } else if (actorScope.kind === 'identifier' && actorScope.identifier) {
    values.push(actorScope.identifier);
    conditions.push(
      `(LOWER(COALESCE(meta->'publicAccess'->>'identifier', '')) = $${values.length}
        OR LOWER(COALESCE(meta->'requestContext'->>'identifier', '')) = $${values.length})`
    );
  } else if (actorScope.kind === 'ip' && actorScope.ip) {
    values.push(actorScope.ip);
    conditions.push(`COALESCE(meta->'requestContext'->>'ip', '') = $${values.length}`);
  } else {
    return 0;
  }

  const result = await postgresPool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM form_submissions
      WHERE ${conditions.join(' AND ')}
    `,
    values
  );

  return Number(result.rows?.[0]?.count || 0);
};

const countCompliancePeriodSubmissions = async ({
  tenantId,
  projectId,
  formId,
  actorScope,
  periodKey,
}) => {
  const normalizedPeriodKey = String(periodKey || '').trim();
  if (
    !tenantId ||
    !projectId ||
    !formId ||
    !normalizedPeriodKey ||
    !actorScope?.kind ||
    actorScope.kind === 'anonymous' ||
    actorScope.kind === 'ip'
  ) {
    return 0;
  }

  const conditions = [
    'tenant_id = $1',
    'project_id = $2',
    'form_id = $3',
    `COALESCE(meta->'compliance'->'reportingContext'->>'periodKey', '') = $4`,
  ];
  const values = [tenantId, projectId, formId, normalizedPeriodKey];

  if (actorScope.kind === 'user' && actorScope.userId) {
    values.push(actorScope.userId);
    conditions.push(`user_id = $${values.length}`);
  } else if (actorScope.kind === 'identifier' && actorScope.identifier) {
    values.push(actorScope.identifier);
    conditions.push(
      `(LOWER(COALESCE(meta->'publicAccess'->>'identifier', '')) = $${values.length}
        OR LOWER(COALESCE(meta->'requestContext'->>'identifier', '')) = $${values.length})`
    );
  } else {
    return 0;
  }

  const result = await postgresPool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM form_submissions
      WHERE ${conditions.join(' AND ')}
    `,
    values
  );

  return Number(result.rows?.[0]?.count || 0);
};

const hasDuplicateSubmission = async ({
  tenantId,
  projectId,
  formId,
  duplicateCheckField,
  duplicateValue,
}) => {
  if (!tenantId || !projectId || !formId || !duplicateCheckField || duplicateValue == null) {
    return false;
  }

  const result = await postgresPool.query(
    `
      SELECT 1
      FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND form_id = $3
        AND COALESCE(data->>$4, data->'structured'->>$4) = $5
      LIMIT 1
    `,
    [tenantId, projectId, formId, duplicateCheckField, String(duplicateValue)]
  );

  return result.rows.length > 0;
};

const assertPublicRouteAllowed = ({
  secureMode,
  routeType,
  channels,
  access = {},
}) => {
  const normalizedRouteType = String(routeType || 'public_standard').trim().toLowerCase();
  const supportsWeb = channels.length === 0 || channels.includes('web');

  if (!supportsWeb) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'This form is not configured for web-based public submissions.'
    );
  }

  if (access?.restrictByLocation === true) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Location-restricted public submissions are not supported in this runtime yet.'
    );
  }

  if (isSecurePublicMode(secureMode) && normalizedRouteType !== 'public_secure') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'This form requires a verified secure access session before submission.'
    );
  }
};

const enforceSubmissionProtection = async ({
  normalizedProjectForm,
  submissionData,
  submissionProtection = {},
  actorContext = {},
}) => {
  const tenantId = String(normalizedProjectForm?.tenantId || '').trim();
  const projectId = String(normalizedProjectForm?.projectId || '').trim();
  const formId = String(
    normalizedProjectForm?.formId ||
      normalizedProjectForm?.projectId ||
      normalizedProjectForm?._id ||
      ''
  ).trim();

  if (!tenantId || !projectId || !formId) {
    return;
  }

  if (submissionProtection?.preventDuplicateSubmission === true) {
    const duplicateCheckField = String(submissionProtection?.duplicateCheckField || '').trim();
    const duplicateValue = extractDuplicateCheckValue(submissionData, duplicateCheckField);
    if (duplicateCheckField && duplicateValue != null) {
      const alreadyExists = await hasDuplicateSubmission({
        tenantId,
        projectId,
        formId,
        duplicateCheckField,
        duplicateValue,
      });

      if (alreadyExists) {
        throw new ApiError(
          httpStatus.CONFLICT,
          'A submission with the same protected field value already exists.'
        );
      }
    }
  }

  const rateLimitEnabled = submissionProtection?.rateLimitEnabled === true;
  const maxSubmissionsPerUser = Number(submissionProtection?.maxSubmissionsPerUser || 0);
  if (!rateLimitEnabled || !Number.isFinite(maxSubmissionsPerUser) || maxSubmissionsPerUser < 1) {
    return;
  }

  const actorScope = buildActorScope(actorContext);
  if (actorScope.kind === 'anonymous') {
    return;
  }

  const since = new Date(
    Date.now() - PUBLIC_SUBMISSION_RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000
  );
  const count = await countRateLimitedSubmissions({
    tenantId,
    projectId,
    formId,
    actorScope,
    since,
  });

  if (count >= maxSubmissionsPerUser) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      'Submission rate limit reached for this form. Please try again later.'
    );
  }
};

const enforceBehaviorRules = async ({
  normalizedProjectForm,
  behavior = {},
  actorContext = {},
}) => {
  if (behavior?.allowMultipleSubmissions !== false) {
    return;
  }

  const tenantId = String(normalizedProjectForm?.tenantId || '').trim();
  const projectId = String(normalizedProjectForm?.projectId || '').trim();
  const formId = String(
    normalizedProjectForm?.formId ||
      normalizedProjectForm?.projectId ||
      normalizedProjectForm?._id ||
      ''
  ).trim();

  if (!tenantId || !projectId || !formId) {
    return;
  }

  const actorScope = buildActorScope(actorContext);
  if (actorScope.kind === 'anonymous') {
    return;
  }

  const existingCount = await countActorSubmissions({
    tenantId,
    projectId,
    formId,
    actorScope,
  });

  if (existingCount > 0) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'Multiple submissions are disabled for this form.'
    );
  }
};

const enforceTransactionRuntimeSupport = ({ normalizedProjectForm }) => {
  const support = projectFormInvoiceService.inspectPublicInvoiceSupport(normalizedProjectForm);
  if (!support.supported) {
    throw new ApiError(httpStatus.BAD_REQUEST, support.message);
  }
};

const resolveIdentifier = (identifier, channel = null) => {
  const raw = String(identifier || '').trim();
  if (!raw) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Identifier is required.');
  }

  if (validator.isEmail(raw)) {
    if (channel && channel !== 'email') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Selected channel is phone but identifier is an email.'
      );
    }
    return {
      type: 'email',
      normalized: raw.toLowerCase(),
    };
  }

  const normalizedPhone = normalizePhoneToE164(raw, { allowEmpty: false });
  if (!normalizedPhone) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Identifier must be a valid email or phone number.'
    );
  }

  if (channel && channel !== 'phone') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Selected channel is email but identifier is a phone number.'
    );
  }

  return {
    type: 'phone',
    normalized: normalizedPhone,
  };
};

const normalizeAcceptedImageTypes = (value) => {
  const raw = String(value || '').trim();
  const primaryParts = raw
    ? raw.split(/[,\n|]+/).map((entry) => entry.trim()).filter(Boolean)
    : [];
  const tokens = primaryParts.flatMap((entry) => {
    if (entry.toLowerCase().startsWith('image/')) {
      return [entry.toLowerCase()];
    }
    return entry
      .split('/')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  });

  const mapped = tokens
    .map((token) => {
      if (token === 'jpg' || token === 'jpeg') return 'image/jpeg';
      if (token === 'png') return 'image/png';
      if (token === 'webp') return 'image/webp';
      if (token.startsWith('image/')) return token;
      return null;
    })
    .filter(Boolean);

  return mapped.length > 0
    ? Array.from(new Set(mapped))
    : ['image/jpeg', 'image/png', 'image/webp'];
};

const resolvePublicSubmissionMode = (projectForm) => {
  const { normalizedForm, secureMode } = getNormalizedSecurityConfig(projectForm);
  if (
    normalizedForm?.metadata?.formCategory === 'system' ||
    normalizedForm?.identity?.category === 'system'
  ) {
    return 'system_direct_update';
  }

  if (isSecurePublicMode(secureMode)) {
    return 'public_secure';
  }

  return 'public_standard';
};

const validateSpecialFieldSubmission = async ({
  projectForm,
  submissionData,
  metadata = {},
  accessToken = null,
}) => {
  if (!projectForm || !submissionData || typeof submissionData !== 'object') {
    return submissionData;
  }

  const normalizedForm = projectFormService.normalizeProjectFormRuntimeConfig(projectForm);
  const elements = Array.isArray(normalizedForm.elements) ? normalizedForm.elements : [];
  const normalizedSubmissionData = {
    ...submissionData,
  };
  const verificationState =
    metadata && typeof metadata === 'object' && metadata.verificationState
      ? metadata.verificationState
      : {};
  const previewSubmissionConfig =
    normalizedForm?.capabilities?.experience?.previewSubmission || {};
  const complianceConfig =
    normalizedForm?.capabilities?.experience?.compliance || {};

  if (previewSubmissionConfig?.enabled && metadata?.previewSubmissionConfirmed !== true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Submission preview must be acknowledged before final submission.'
    );
  }

  if (complianceConfig?.enabled === true) {
    const submissionFrequencyModeCandidate = String(
      complianceConfig?.submissionFrequency?.mode || metadata?.compliance?.submissionFrequencyMode || 'daily'
    )
      .trim()
      .toLowerCase();
    if (submissionFrequencyModeCandidate === 'custom') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Custom compliance frequency is not supported in the public conversational runtime.'
      );
    }

    const reportingContext =
      metadata?.compliance?.reportingContext &&
      typeof metadata.compliance.reportingContext === 'object'
        ? metadata.compliance.reportingContext
        : {};
    const reportingScope = String(
      complianceConfig?.reportingPeriod?.scope ||
        metadata?.compliance?.reportingScope ||
        'daily'
    )
      .trim()
      .toLowerCase();
    const availabilityStart = normalizeIsoDateLike(
      complianceConfig?.availability?.startDate || complianceConfig?.schedule?.startDate
    );
    const availabilityEnd = normalizeIsoDateLike(
      complianceConfig?.availability?.endDate || complianceConfig?.schedule?.endDate
    );
    const allowBackdating =
      complianceConfig?.submissionPolicy?.allowBackdating === true ||
      complianceConfig?.enforcement?.allowBackdating === true;
    const submissionFrequencyMode = (() => {
      const candidate = String(
        complianceConfig?.submissionFrequency?.mode ||
          metadata?.compliance?.submissionFrequencyMode ||
          'monthly'
      )
        .trim()
        .toLowerCase();
      return ['once', 'multiple', 'daily', 'weekly', 'monthly', 'custom'].includes(
        candidate
      )
        ? candidate
        : 'monthly';
    })();
    const submissionFrequencyWeekdays = normalizeIntegerList(
      complianceConfig?.submissionFrequency?.weekdays
    );
    const submissionFrequencyMonthDates = normalizeIntegerList(
      complianceConfig?.submissionFrequency?.monthDates
    );
    const selectedDate = normalizeIsoDateLike(
      reportingContext.selectedDate ||
        metadata?.compliance?.eventDate ||
        metadata?.compliance?.submissionDate ||
        reportingContext.selectedRangeStart
    );
    const selectedMonth =
      normalizeMonthLike(reportingContext.selectedMonth || metadata?.compliance?.month) ||
      (selectedDate ? selectedDate.slice(0, 7) : null);
    const selectedYear =
      normalizeYearLike(reportingContext.selectedYear || metadata?.compliance?.year) ||
      (selectedDate ? Number(selectedDate.slice(0, 4)) : null);
    const selectedWeek = normalizeWeekLike(reportingContext.selectedWeek);
    const rangeStart = normalizeIsoDateLike(
      reportingContext.selectedRangeStart || complianceConfig?.availability?.startDate
    );
    const rangeEnd = normalizeIsoDateLike(
      reportingContext.selectedRangeEnd || complianceConfig?.availability?.endDate
    );
    const configuredYear =
      normalizeYearLike(complianceConfig?.reportingPeriod?.defaultYear) || selectedYear;
    const configuredMonth =
      normalizeMonthLike(complianceConfig?.reportingPeriod?.defaultMonth) || selectedMonth;
    const rejectIfOutside = (dateValue) => {
      if (!dateValue) return;
      if (availabilityStart && dateValue < availabilityStart) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Selected reporting period is before the allowed start date.'
        );
      }
      if (availabilityEnd && dateValue > availabilityEnd) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Selected reporting period is after the allowed end date.'
        );
      }
      if (!allowBackdating) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const candidate = new Date(`${dateValue}T00:00:00Z`);
        if (candidate < today) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Backdated submissions are not allowed for this form.'
          );
        }
      }
    };
    const rejectIfInvalidWeekday = (dateValue, label) => {
      if (!dateValue || submissionFrequencyWeekdays.length === 0) {
        return;
      }
      const weekday = new Date(`${dateValue}T00:00:00Z`).getUTCDay();
      if (!submissionFrequencyWeekdays.includes(weekday)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${label} accepts ${submissionFrequencyWeekdays
            .map((day) => DAY_LABELS[day] || `Day ${day}`)
            .join(', ')}.`
        );
      }
    };
    const rejectIfInvalidMonthDate = (dateValue) => {
      if (!dateValue || submissionFrequencyMonthDates.length === 0) {
        return;
      }
      const dayOfMonth = Number(dateValue.slice(8, 10));
      if (!submissionFrequencyMonthDates.includes(dayOfMonth)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `This monthly schedule accepts day ${submissionFrequencyMonthDates.join(', ')} only.`
        );
      }
    };

    if (reportingScope === 'yearly') {
      if (!selectedDate) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'A reporting date is required.');
      }
      if (configuredYear && Number(selectedDate.slice(0, 4)) !== configuredYear) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Reporting date must fall inside ${configuredYear}.`
        );
      }
      rejectIfOutside(selectedDate);
      if (submissionFrequencyMode === 'daily' || submissionFrequencyMode === 'weekly') {
        rejectIfInvalidWeekday(selectedDate, 'This reporting schedule');
      }
      if (submissionFrequencyMode === 'monthly') {
        rejectIfInvalidMonthDate(selectedDate);
      }
    } else if (reportingScope === 'monthly') {
      if (!selectedDate) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'A reporting date is required.');
      }
      if (configuredMonth && selectedDate.slice(0, 7) !== configuredMonth) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Reporting date must fall inside ${configuredMonth}.`
        );
      }
      rejectIfOutside(selectedDate);
      if (submissionFrequencyMode === 'daily' || submissionFrequencyMode === 'weekly') {
        rejectIfInvalidWeekday(selectedDate, 'This reporting schedule');
      }
      if (submissionFrequencyMode === 'monthly') {
        rejectIfInvalidMonthDate(selectedDate);
      }
    } else if (reportingScope === 'weekly') {
      if (!selectedDate) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'A reporting date is required.');
      }
      rejectIfOutside(selectedDate);
      if (submissionFrequencyMode === 'daily' || submissionFrequencyMode === 'weekly') {
        rejectIfInvalidWeekday(selectedDate, 'This weekly schedule');
      }
      if (submissionFrequencyMode === 'monthly') {
        rejectIfInvalidMonthDate(selectedDate);
      }
    } else if (reportingScope === 'custom_range') {
      if (!selectedDate) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'A reporting date is required.'
        );
      }
      if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'This reporting range is not configured correctly.'
        );
      }
      rejectIfOutside(selectedDate);
      if (submissionFrequencyMode === 'daily' || submissionFrequencyMode === 'weekly') {
        rejectIfInvalidWeekday(selectedDate, 'This reporting schedule');
      }
      if (submissionFrequencyMode === 'monthly') {
        rejectIfInvalidMonthDate(selectedDate);
      }
    } else {
      if (!selectedDate) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'A reporting date is required.');
      }
      rejectIfOutside(selectedDate);
      if (submissionFrequencyMode === 'daily') {
        rejectIfInvalidWeekday(selectedDate, 'This daily schedule');
      }
      if (submissionFrequencyMode === 'monthly') {
        rejectIfInvalidMonthDate(selectedDate);
      }
    }
  }

  for (const element of elements) {
    const fieldId = String(element?.id || '').trim();
    const fieldType = String(element?.properties?.fieldType || '')
      .trim()
      .toLowerCase();

    if (!fieldId) continue;

    if (isUploadElement(element)) {
      const required = Boolean(
        element?.properties?.required || element?.properties?.validation?.required
      );
      const rawValue = normalizedSubmissionData[fieldId];

      if (rawValue === undefined || rawValue === null || rawValue === '') {
        if (required) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `${element?.properties?.label || fieldId} is required.`
          );
        }
        continue;
      }

      if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} must be a valid file upload payload.`
        );
      }

      const uploadConfig = publicFormUploadService.resolveFieldConfig(
        normalizedForm,
        fieldId
      );
      const fileType = String(rawValue.type || rawValue.mimeType || '')
        .trim()
        .toLowerCase();
      const fileName = String(rawValue.name || rawValue.filename || '').trim();
      const fileUrl = String(rawValue.url || '').trim();
      const fileKey = String(rawValue.key || rawValue.storagePath || '').trim();
      const fileSize = Number(rawValue.size || 0);
      const width = rawValue.width == null ? null : Number(rawValue.width);
      const height = rawValue.height == null ? null : Number(rawValue.height);
      const uploadId = String(rawValue.uploadId || '').trim();

      if (uploadId) {
        const resolvedUpload = await publicFormUploadService.resolveUploadForSubmission({
          uploadId,
          projectForm: normalizedForm,
          fieldId,
          reference:
            metadata?.publicAccess?.reference ||
            metadata?.reference ||
            null,
          accessToken,
          sessionKey:
            metadata?.uploadSessionKey ||
            metadata?.requestContext?.uploadSessionKey ||
            null,
        });

        normalizedSubmissionData[fieldId] = resolvedUpload.value;
        continue;
      }

      if (!fileName || !fileType || !fileUrl || !fileKey) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} is missing uploaded file metadata.`
        );
      }

      if (
        uploadConfig.acceptedMimeTypes.length > 0 &&
        !publicFormUploadService.isMimeTypeAllowed(
          fileType,
          uploadConfig.acceptedMimeTypes,
          fileName
        )
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} must use one of the supported file formats.`
        );
      }

      if (
        !Number.isFinite(fileSize) ||
        fileSize <= 0 ||
        fileSize > uploadConfig.maxSizeBytes
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} exceeds the allowed file size.`
        );
      }

      if (uploadConfig.isProfileImageField) {
        if (
          (width !== null && (!Number.isFinite(width) || width <= 0)) ||
          (height !== null && (!Number.isFinite(height) || height <= 0))
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `${element?.properties?.label || fieldId} has invalid image dimensions.`
          );
        }
      }

      continue;
    }

    if (!['secured_phone', 'secured_email'].includes(fieldType)) {
      continue;
    }

    const required = Boolean(
      element?.properties?.required || element?.properties?.validation?.required
    );
    const rawValue = submissionData[fieldId];
    const submittedValue = String(rawValue || '').trim();

    if (!submittedValue) {
      if (required) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} is required.`
        );
      }
      continue;
    }

    const state = verificationState?.[fieldId];
    if (!state?.verified || !state?.challengeId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${element?.properties?.label || fieldId} must be verified before submission.`
      );
    }

    const expectedChannel = fieldType === 'secured_phone' ? 'phone' : 'email';
    const normalizedIdentifier = resolveIdentifier(submittedValue, expectedChannel).normalized;
    const challenge = await PublicFormAccess.findOne({
      jti: String(state.challengeId).trim(),
      tokenType: OTP_CHALLENGE_TOKEN_TYPE,
      status: 'verified',
      projectFormId: normalizedForm._id,
      challengeChannel: expectedChannel,
      identifier: normalizedIdentifier,
      'metadata.kind': 'field_verification',
      'metadata.fieldKey':
        String(element?.properties?.fieldKey || fieldId).trim() || fieldId,
    }).lean();

    if (!challenge) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${element?.properties?.label || fieldId} verification is invalid or expired.`
      );
    }

    if (accessToken && challenge?.metadata?.accessToken) {
      const expectedToken = String(challenge.metadata.accessToken || '').trim();
      if (expectedToken && expectedToken !== String(accessToken).trim()) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} verification does not match this secure session.`
        );
      }
    }
  }

  return normalizedSubmissionData;
};

const enforceComplianceSubmissionLimits = async ({
  normalizedProjectForm,
  metadata = {},
  secureMode = 'off',
  actorContext = {},
}) => {
  const complianceConfig = normalizedProjectForm?.capabilities?.experience?.compliance || {};
  if (complianceConfig?.enabled !== true) {
    return;
  }

  const submissionLimit = Math.max(
    0,
    Number(
      complianceConfig?.submissionPolicy?.maxSubmissionsPerPeriod ||
        complianceConfig?.submissionFrequency?.count ||
        0
    )
  );
  if (!Number.isFinite(submissionLimit) || submissionLimit < 1) {
    return;
  }

  if (normalizePublicSecureMode(secureMode) !== 'otp') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Compliance submission limits require OTP-authenticated public access.'
    );
  }

  const actorScope = buildActorScope(actorContext);
  if (
    (actorScope.kind !== 'user' || !actorScope.userId) &&
    (actorScope.kind !== 'identifier' || !actorScope.identifier)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Compliance submission limits require an authenticated public access session.'
    );
  }

  const reportingContext =
    metadata?.compliance?.reportingContext && typeof metadata.compliance.reportingContext === 'object'
      ? metadata.compliance.reportingContext
      : {};
  const selectedDate = normalizeIsoDateLike(
    reportingContext.selectedDate ||
      metadata?.compliance?.eventDate ||
      metadata?.compliance?.submissionDate
  );
  const selectedMonth =
    normalizeMonthLike(reportingContext.selectedMonth || metadata?.compliance?.month) ||
    (selectedDate ? selectedDate.slice(0, 7) : null);
  const selectedYear =
    normalizeYearLike(reportingContext.selectedYear || metadata?.compliance?.year) ||
    (selectedDate ? Number(selectedDate.slice(0, 4)) : null);
  const selectedWeek = normalizeWeekLike(reportingContext.selectedWeek);
  const selectedRangeStart = normalizeIsoDateLike(
    reportingContext.selectedRangeStart || complianceConfig?.availability?.startDate
  );
  const selectedRangeEnd = normalizeIsoDateLike(
    reportingContext.selectedRangeEnd || complianceConfig?.availability?.endDate
  );
  const reportingScope = String(
    complianceConfig?.reportingPeriod?.scope || metadata?.compliance?.reportingScope || 'daily'
  )
    .trim()
    .toLowerCase();
  const periodKey =
    String(reportingContext.periodKey || '').trim() ||
    (reportingScope === 'yearly' && selectedYear
      ? String(selectedYear)
      : reportingScope === 'monthly' && selectedMonth
        ? selectedMonth
        : reportingScope === 'weekly' && selectedWeek
          ? selectedWeek
          : reportingScope === 'custom_range' && selectedRangeStart && selectedRangeEnd
            ? `${selectedRangeStart}:${selectedRangeEnd}`
            : selectedDate || selectedMonth || (selectedYear ? String(selectedYear) : ''));

  if (!periodKey) {
    return;
  }

  const tenantId = String(normalizedProjectForm?.tenantId || '').trim();
  const projectId = String(normalizedProjectForm?.projectId || '').trim();
  const formId = String(
    normalizedProjectForm?.formId ||
      normalizedProjectForm?.projectId ||
      normalizedProjectForm?._id ||
      ''
  ).trim();

  if (!tenantId || !projectId || !formId) {
    return;
  }

  const existingCount = await countCompliancePeriodSubmissions({
    tenantId,
    projectId,
    formId,
    actorScope,
    periodKey,
  });

  if (existingCount >= submissionLimit) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'Submission limit reached for this reporting period.'
    );
  }
};

const runPublicPreSubmitPipeline = async ({
  projectForm,
  submissionData,
  metadata = {},
  accessToken = null,
  routeType = 'public_standard',
  actorContext = {},
}) => {
  if (!submissionData || typeof submissionData !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'submissionData is required.');
  }

  const {
    normalizedForm: normalizedProjectForm,
    secureMode,
    channels,
    access,
    submissionProtection,
  } = getNormalizedSecurityConfig(projectForm);
  const behavior = normalizedProjectForm?.capabilities?.experience?.behavior || {};

  assertPublicRouteAllowed({
    secureMode,
    routeType,
    channels,
    access,
  });

  const validatedSubmissionData = await validateSpecialFieldSubmission({
    projectForm: normalizedProjectForm,
    submissionData,
    metadata,
    accessToken,
  });

  await enforceComplianceSubmissionLimits({
    normalizedProjectForm,
    metadata,
    secureMode,
    actorContext,
  });

  enforceTransactionRuntimeSupport({
    normalizedProjectForm,
  });

  await enforceSubmissionProtection({
    normalizedProjectForm,
    submissionData,
    submissionProtection,
    actorContext,
  });

  await enforceBehaviorRules({
    normalizedProjectForm,
    behavior,
    actorContext,
  });

  return {
    projectForm: normalizedProjectForm,
    submissionData: validatedSubmissionData || submissionData,
    submissionMode: resolvePublicSubmissionMode(normalizedProjectForm),
    routeType: String(routeType || 'public_standard'),
  };
};

module.exports = {
  getNormalizedSecurityConfig,
  isSecurePublicMode,
  normalizePublicSecureMode,
  resolvePublicSubmissionMode,
  buildActorScope,
  countRateLimitedSubmissions,
  countActorSubmissions,
  countCompliancePeriodSubmissions,
  enforceSubmissionProtection,
  enforceBehaviorRules,
  enforceComplianceSubmissionLimits,
  enforceTransactionRuntimeSupport,
  validateSpecialFieldSubmission,
  runPublicPreSubmitPipeline,
};
