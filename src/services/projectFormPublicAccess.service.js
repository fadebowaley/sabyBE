const httpStatus = require('http-status');
const jwt = require('jsonwebtoken');
const { randomUUID, randomInt, createHash } = require('crypto');
const validator = require('validator');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');
const logger = require('../config/logger');
const {
  ProjectForm,
  PublicFormAccess,
  User,
  Nodes,
  Counter,
} = require('../models');
const projectFormService = require('./projectForm.service');
const emailService = require('./email.service');
const smsService = require('./sms.service');
const { queueSubmission } = require('./submission.service');
const { buildDeterministicIdempotencyKey } = require('../utils/idempotency');
const {
  normalizePhoneToE164,
  buildPhoneLookupCandidates,
} = require('../utils/phoneNumber');

const ACCESS_TOKEN_TYPE = 'public_form_access';
const OTP_CHALLENGE_TOKEN_TYPE = 'public_form_otp';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;

const isUserActive = (userDoc) =>
  Boolean(userDoc) && userDoc.deletedAt == null && userDoc.status !== false;

const maskEmail = (email) => {
  const value = String(email || '').trim();
  if (!value || !value.includes('@')) return null;
  const [local, domain] = value.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
};

const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const normalizeDeliveryError = (value, fallback = 'Delivery failed') => {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || fallback;
  if (Array.isArray(value)) {
    const flattened = value
      .map((item) => normalizeDeliveryError(item, ''))
      .filter(Boolean)
      .join('; ');
    return flattened || fallback;
  }
  if (typeof value === 'object') {
    if (value.message && typeof value.message === 'string') {
      return value.message;
    }
    if (value.error && typeof value.error === 'string') {
      return value.error;
    }
    try {
      return JSON.stringify(value);
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
};

const buildOtpHash = ({ challengeId, otp }) =>
  createHash('sha256')
    .update(
      `${String(config.publicForm.qrContextSecret || '')}:${String(challengeId)}:${String(
        otp
      )}`
    )
    .digest('hex');

const generateOtpCode = () => String(randomInt(100000, 1000000));

const sanitizeChannel = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized !== 'email' && normalized !== 'phone') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Channel must be either "email" or "phone".'
    );
  }
  return normalized;
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
      candidates: [raw.toLowerCase()],
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
    candidates: buildPhoneLookupCandidates(raw),
  };
};

const verifyPublicQrContextToken = (token, expected) => {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, config.publicForm.qrContextSecret, {
      algorithms: ['HS256'],
      issuer: 'saby-public-form',
      audience: 'saby-public-form-entry',
    });

    if (decoded?.typ !== 'public_qr_context') {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid QR context token type.');
    }

    if (
      expected &&
      ((expected.projectId && decoded.projectId !== expected.projectId) ||
        (expected.tenantId && decoded.tenantId !== expected.tenantId) ||
        (expected.shareRef && decoded.shareRef !== expected.shareRef) ||
        (expected.publicRef && decoded.publicRef !== expected.publicRef))
    ) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'QR context mismatch.');
    }

    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired QR context token.');
  }
};

const resolveSecureForm = async ({ reference, qrContextToken = null }) => {
  const resolved = await projectFormService.getPublicProjectFormByReference(reference);
  const qrContext = projectFormService.buildPublicQrContext(resolved.projectForm, {
    resolvedBy: resolved.resolvedBy,
  });

  if (!['single_qr_passwordless', 'otp'].includes(qrContext.secureMode)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This module is not in secure single-QR passwordless mode.'
    );
  }

  verifyPublicQrContextToken(qrContextToken, {
    projectId: resolved.projectForm.projectId,
    tenantId: resolved.projectForm.tenantId,
    shareRef: resolved.projectForm.shareRef || undefined,
    publicRef: resolved.projectForm.publicRef || undefined,
  });

  return {
    ...resolved,
    qrContext,
  };
};

const findUserForForm = async ({ tenantId, identifier }) => {
  if (identifier.type === 'email') {
    const user = await User.findOne({
      tenantId,
      email: identifier.normalized,
      deletedAt: null,
    });
    return user;
  }

  const user = await User.findOne({
    tenantId,
    phoneNumber: { $in: identifier.candidates },
    deletedAt: null,
  });
  return user;
};

const buildAccessClaims = ({ jti, user, secureForm }) => ({
  typ: ACCESS_TOKEN_TYPE,
  jti,
  sub: String(user._id),
  tenantId: secureForm.projectForm.tenantId,
  projectId: secureForm.projectForm.projectId,
  projectFormId: String(secureForm.projectForm._id),
  publicRef: secureForm.projectForm.publicRef || null,
  shareRef: secureForm.projectForm.shareRef || null,
  secureMode: secureForm.qrContext.secureMode,
  pipelineTarget: secureForm.qrContext.pipelineTarget,
});

const createAccessGrant = async ({
  secureForm,
  user,
  resolvedIdentifier,
  delivery = null,
  metadata = {},
}) => {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const jti = randomUUID();

  const claims = buildAccessClaims({ jti, user, secureForm });
  const token = jwt.sign(claims, config.publicForm.qrContextSecret, {
    algorithm: 'HS256',
    issuer: 'saby-public-form',
    audience: 'saby-public-form-access',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });

  await PublicFormAccess.create({
    jti,
    tokenType: ACCESS_TOKEN_TYPE,
    tenantId: secureForm.projectForm.tenantId,
    projectId: secureForm.projectForm.projectId,
    projectFormId: secureForm.projectForm._id,
    publicRef: secureForm.projectForm.publicRef || null,
    shareRef: secureForm.projectForm.shareRef || null,
    shareCode: secureForm.projectForm.shareCode || null,
    userId: user._id,
    identifierType: resolvedIdentifier.type,
    identifier: resolvedIdentifier.normalized,
    email: user.email || null,
    phoneNumber: user.phoneNumber || null,
    secureMode: secureForm.qrContext.secureMode,
    pipelineTarget: secureForm.qrContext.pipelineTarget,
    schemaVersion: secureForm.qrContext.schemaVersion,
    schemaHash: secureForm.qrContext.schemaHash,
    qrVersion: secureForm.qrContext.qrVersion,
    status: 'issued',
    issuedAt,
    expiresAt,
    delivery: delivery || undefined,
    metadata: {
      resolvedBy: secureForm.resolvedBy,
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    },
  });

  return {
    token,
    issuedAt,
    expiresAt,
    jti,
  };
};

const buildOtpDelivery = async ({ channel, user, otpCode }) => {
  const delivery = {
    email: { sent: false, error: null },
    sms: { sent: false, error: null },
  };

  if (channel === 'email') {
    if (!user.email) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Selected account has no email address.');
    }
    try {
      await emailService.sendOtpEmail(user.email, otpCode);
      delivery.email.sent = true;
    } catch (error) {
      delivery.email.error = normalizeDeliveryError(
        error?.response?.data || error,
        'Email delivery failed'
      );
      throw new ApiError(httpStatus.BAD_GATEWAY, delivery.email.error);
    }
    return delivery;
  }

  if (!user.phoneNumber) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected account has no phone number.');
  }
  if (!smsService.hasSmsConfig) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'SMS provider is not configured.');
  }

  try {
    await smsService.sendOtpSms({
      phoneNumber: user.phoneNumber,
      otp: otpCode,
    });
    delivery.sms.sent = true;
  } catch (error) {
    const providerError = normalizeDeliveryError(
      error?.response?.data?.message || error?.response?.data || error,
      'SMS delivery failed'
    );
    delivery.sms.error = providerError;
    if (/from cannot be blank/i.test(providerError)) {
      throw new ApiError(
        httpStatus.BAD_GATEWAY,
        'SMS provider sender ID is not configured properly.'
      );
    }
    throw new ApiError(httpStatus.BAD_GATEWAY, providerError);
  }

  return delivery;
};

const buildOtpDeliveryToIdentifier = async ({ channel, identifier, otpCode }) => {
  const delivery = {
    email: { sent: false, error: null },
    sms: { sent: false, error: null },
  };

  if (channel === 'email') {
    try {
      await emailService.sendOtpEmail(identifier, otpCode);
      delivery.email.sent = true;
    } catch (error) {
      delivery.email.error = normalizeDeliveryError(
        error?.response?.data || error,
        'Email delivery failed'
      );
      throw new ApiError(httpStatus.BAD_GATEWAY, delivery.email.error);
    }
    return delivery;
  }

  if (!smsService.hasSmsConfig) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'SMS provider is not configured.');
  }

  try {
    await smsService.sendOtpSms({
      phoneNumber: identifier,
      otp: otpCode,
    });
    delivery.sms.sent = true;
  } catch (error) {
    const providerError = normalizeDeliveryError(
      error?.response?.data?.message || error?.response?.data || error,
      'SMS delivery failed'
    );
    delivery.sms.error = providerError;
    throw new ApiError(httpStatus.BAD_GATEWAY, providerError);
  }

  return delivery;
};

const buildFieldVerificationDestination = ({ channel, identifier }) => ({
  email: channel === 'email' ? maskEmail(identifier) : null,
  phone: channel === 'phone' ? maskPhone(identifier) : null,
});

const ensureProjectFormAccess = async ({ formId, tenantId, projectId = null }) => {
  const filter = {
    deletedAt: null,
  };

  if (/^[0-9a-fA-F]{24}$/.test(String(formId || ''))) {
    filter._id = formId;
  } else {
    filter.formId = String(formId || '').trim();
  }

  if (tenantId) filter.tenantId = String(tenantId);
  if (projectId) filter.projectId = String(projectId);

  const projectForm = await ProjectForm.findOne(filter).lean();
  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found.');
  }

  return projectForm;
};

const createFieldVerificationChallenge = async ({
  projectForm,
  fieldKey,
  channel,
  identifier,
  submissionId = null,
  accessToken = null,
}) => {
  await PublicFormAccess.updateMany(
    {
      tokenType: OTP_CHALLENGE_TOKEN_TYPE,
      tenantId: projectForm.tenantId,
      projectId: projectForm.projectId,
      projectFormId: projectForm._id,
      challengeChannel: channel,
      identifier,
      status: 'issued',
      'metadata.kind': 'field_verification',
      'metadata.fieldKey': fieldKey,
    },
    {
      $set: {
        status: 'expired',
        expiredAt: new Date(),
      },
    }
  );

  const otpCode = generateOtpCode();
  const challengeId = randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + OTP_TTL_SECONDS * 1000);
  const resendAvailableAt = new Date(
    issuedAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000
  );
  const delivery = await buildOtpDeliveryToIdentifier({
    channel,
    identifier,
    otpCode,
  });

  await PublicFormAccess.create({
    jti: challengeId,
    tokenType: OTP_CHALLENGE_TOKEN_TYPE,
    challengeChannel: channel,
    tenantId: projectForm.tenantId,
    projectId: projectForm.projectId,
    projectFormId: projectForm._id,
    publicRef: projectForm.publicRef || null,
    shareRef: projectForm.shareRef || null,
    shareCode: projectForm.shareCode || null,
    userId: null,
    identifierType: channel,
    identifier,
    email: channel === 'email' ? identifier : null,
    phoneNumber: channel === 'phone' ? identifier : null,
    secureMode: 'off',
    pipelineTarget: projectForm.capabilities?.experience?.security?.publicSecureMode || 'public',
    schemaVersion: projectForm.schemaVersion || '2.0.0',
    schemaHash: null,
    qrVersion: 'v2',
    status: 'issued',
    issuedAt,
    expiresAt,
    otpHash: buildOtpHash({ challengeId, otp: otpCode }),
    otpAttempts: 0,
    otpMaxAttempts: OTP_MAX_ATTEMPTS,
    otpResendCount: 0,
    otpResendAvailableAt: resendAvailableAt,
    otpLastSentAt: issuedAt,
    delivery,
    metadata: {
      kind: 'field_verification',
      fieldKey,
      submissionId: submissionId || null,
      accessToken: accessToken || null,
      verified: false,
    },
  });

  return {
    success: true,
    challengeId,
    channel,
    fieldKey,
    expiresAt: expiresAt.toISOString(),
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    destination: buildFieldVerificationDestination({ channel, identifier }),
    channels: delivery,
    ...(config.env !== 'production' ? { debugOtp: otpCode } : {}),
  };
};

const buildMagicLink = ({ canonicalRef, token }) => {
  const base =
    String(config.clientUrl || '').trim().replace(/\/+$/, '') ||
    'https://saby.ai';
  return `${base}/s/${encodeURIComponent(canonicalRef)}?accessToken=${encodeURIComponent(token)}`;
};

const sendMagicLinkNotifications = async ({ user, link }) => {
  const delivery = {
    email: { sent: false, error: null },
    sms: { sent: false, error: null },
  };

  const emailJobs = [];
  if (user.email) {
    emailJobs.push(
      emailService
        .sendEmail(
          user.email,
          'Saby secure form access link',
          `Use this secure one-time link to continue your submission: ${link}`
        )
        .then(() => {
          delivery.email.sent = true;
        })
        .catch((error) => {
          delivery.email.error = normalizeDeliveryError(
            error?.response?.data || error,
            'Email delivery failed'
          );
        })
    );
  } else {
    delivery.email.error = 'User has no email';
  }

  if (user.phoneNumber && smsService.hasSmsConfig) {
    try {
      await smsService.sendSms(
        user.phoneNumber,
        `Your Saby secure form link: ${link}`
      );
      delivery.sms.sent = true;
    } catch (error) {
      delivery.sms.error = normalizeDeliveryError(
        error?.response?.data?.message ||
          error?.response?.data ||
          error,
        'SMS delivery failed'
      );
    }
  } else if (!user.phoneNumber) {
    delivery.sms.error = 'User has no phone number';
  } else {
    delivery.sms.error = 'SMS provider not configured';
  }

  if (emailJobs.length > 0) {
    await Promise.all(emailJobs);
  }

  if (!delivery.email.sent && !delivery.sms.sent) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      'Could not deliver secure link via email or SMS.'
    );
  }

  return delivery;
};

const issueAccessLink = async ({ reference, identifier, qrContextToken = null }) => {
  const secureForm = await resolveSecureForm({ reference, qrContextToken });
  const resolvedIdentifier = resolveIdentifier(identifier);
  const user = await findUserForForm({
    tenantId: secureForm.projectForm.tenantId,
    identifier: resolvedIdentifier,
  });

  if (!user || !isUserActive(user)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Account not found or inactive for this module.');
  }

  const { token, expiresAt, jti } = await createAccessGrant({
    secureForm,
    user,
    resolvedIdentifier,
    metadata: { accessMethod: 'magic_link' },
  });

  await PublicFormAccess.updateOne(
    { jti, tokenType: ACCESS_TOKEN_TYPE },
    {
      $set: {
        status: 'verified',
      },
    }
  );

  const magicLink = buildMagicLink({ canonicalRef: secureForm.canonicalRef, token });

  const delivery = await sendMagicLinkNotifications({
    user,
    link: magicLink,
  });
  await PublicFormAccess.updateOne(
    { jti, tokenType: ACCESS_TOKEN_TYPE },
    { $set: { delivery } }
  );

  return {
    success: true,
    secureMode: secureForm.qrContext.secureMode,
    requiresIdentityChallenge: true,
    expiresAt: expiresAt.toISOString(),
    destination: {
      email: delivery.email.sent ? maskEmail(user.email) : null,
      phone: delivery.sms.sent ? maskPhone(user.phoneNumber) : null,
    },
    channels: delivery,
    ...(config.env !== 'production' ? { debugMagicLink: magicLink } : {}),
  };
};

const getOtpChallengeById = async (challengeId) => {
  const challenge = await PublicFormAccess.findOne({
    jti: String(challengeId || '').trim(),
    tokenType: OTP_CHALLENGE_TOKEN_TYPE,
  });
  if (!challenge) {
    throw new ApiError(httpStatus.NOT_FOUND, 'OTP challenge not found.');
  }
  // Backward-compat for older challenge docs created before challengeChannel was introduced.
  if (!challenge.challengeChannel) {
    if (challenge.identifierType === 'email' || challenge.identifierType === 'phone') {
      challenge.challengeChannel = challenge.identifierType;
    } else if (challenge.email) {
      challenge.challengeChannel = 'email';
    } else if (challenge.phoneNumber) {
      challenge.challengeChannel = 'phone';
    } else {
      challenge.challengeChannel = 'email';
    }
  }
  return challenge;
};

const ensureOtpChallengeActive = async (challenge) => {
  const nowMs = Date.now();
  const expiresMs = new Date(challenge.expiresAt).getTime();
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
    challenge.status = 'expired';
    await challenge.save();
    throw new ApiError(httpStatus.BAD_REQUEST, 'OTP has expired. Request a new code.');
  }
  if (challenge.status === 'locked') {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      'Too many invalid attempts. Request a new code.'
    );
  }
  if (challenge.status !== 'issued') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'OTP challenge is no longer active.');
  }
};

const requestAccessCode = async ({
  reference,
  channel,
  identifier,
  qrContextToken = null,
}) => {
  const secureForm = await resolveSecureForm({ reference, qrContextToken });
  const selectedChannel = sanitizeChannel(channel);
  const resolvedIdentifier = resolveIdentifier(identifier, selectedChannel);
  const user = await findUserForForm({
    tenantId: secureForm.projectForm.tenantId,
    identifier: resolvedIdentifier,
  });

  if (!user || !isUserActive(user)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Account not found or inactive for this module.');
  }

  // Invalidate older open OTP challenges for this user+form before issuing a fresh one.
  await PublicFormAccess.updateMany(
    {
      tokenType: OTP_CHALLENGE_TOKEN_TYPE,
      tenantId: secureForm.projectForm.tenantId,
      projectId: secureForm.projectForm.projectId,
      userId: user._id,
      status: 'issued',
    },
    {
      $set: {
        status: 'expired',
        expiredAt: new Date(),
      },
    }
  );

  const otpCode = generateOtpCode();
  const challengeId = randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + OTP_TTL_SECONDS * 1000);
  const resendAvailableAt = new Date(
    issuedAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000
  );

  const delivery = await buildOtpDelivery({
    channel: selectedChannel,
    user,
    otpCode,
  });

  await PublicFormAccess.create({
    jti: challengeId,
    tokenType: OTP_CHALLENGE_TOKEN_TYPE,
    challengeChannel: selectedChannel,
    tenantId: secureForm.projectForm.tenantId,
    projectId: secureForm.projectForm.projectId,
    projectFormId: secureForm.projectForm._id,
    publicRef: secureForm.projectForm.publicRef || null,
    shareRef: secureForm.projectForm.shareRef || null,
    shareCode: secureForm.projectForm.shareCode || null,
    userId: user._id,
    identifierType: resolvedIdentifier.type,
    identifier: resolvedIdentifier.normalized,
    email: user.email || null,
    phoneNumber: user.phoneNumber || null,
    secureMode: secureForm.qrContext.secureMode,
    pipelineTarget: secureForm.qrContext.pipelineTarget,
    schemaVersion: secureForm.qrContext.schemaVersion,
    schemaHash: secureForm.qrContext.schemaHash,
    qrVersion: secureForm.qrContext.qrVersion,
    status: 'issued',
    issuedAt,
    expiresAt,
    otpHash: buildOtpHash({ challengeId, otp: otpCode }),
    otpAttempts: 0,
    otpMaxAttempts: OTP_MAX_ATTEMPTS,
    otpResendCount: 0,
    otpResendAvailableAt: resendAvailableAt,
    otpLastSentAt: issuedAt,
    delivery,
    metadata: {
      resolvedBy: secureForm.resolvedBy,
      accessMethod: 'otp_code',
    },
  });

  return {
    success: true,
    secureMode: secureForm.qrContext.secureMode,
    challengeId,
    channel: selectedChannel,
    expiresAt: expiresAt.toISOString(),
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    destination: {
      email: delivery.email.sent ? maskEmail(user.email) : null,
      phone: delivery.sms.sent ? maskPhone(user.phoneNumber) : null,
    },
    channels: delivery,
    ...(config.env !== 'production'
      ? { debugOtp: otpCode }
      : {}),
  };
};

const resendAccessCode = async ({ challengeId }) => {
  const challenge = await getOtpChallengeById(challengeId);
  await ensureOtpChallengeActive(challenge);

  const now = Date.now();
  const resendAvailableMs = challenge.otpResendAvailableAt
    ? new Date(challenge.otpResendAvailableAt).getTime()
    : 0;
  if (resendAvailableMs && now < resendAvailableMs) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      `Please wait ${Math.ceil((resendAvailableMs - now) / 1000)}s before requesting another code.`
    );
  }

  const user = await User.findById(challenge.userId);
  if (!user || !isUserActive(user) || String(user.tenantId) !== String(challenge.tenantId)) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Account is not eligible for this module.');
  }

  const otpCode = generateOtpCode();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + OTP_TTL_SECONDS * 1000);
  const resendAvailableAt = new Date(
    issuedAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000
  );
  const delivery = await buildOtpDelivery({
    channel: challenge.challengeChannel || challenge.identifierType,
    user,
    otpCode,
  });

  challenge.otpHash = buildOtpHash({ challengeId: challenge.jti, otp: otpCode });
  challenge.otpAttempts = 0;
  challenge.otpResendCount = Number(challenge.otpResendCount || 0) + 1;
  challenge.otpResendAvailableAt = resendAvailableAt;
  challenge.otpLastSentAt = issuedAt;
  challenge.expiresAt = expiresAt;
  challenge.delivery = delivery;
  challenge.status = 'issued';
  challenge.challengeChannel =
    challenge.challengeChannel ||
    (challenge.identifierType === 'phone' ? 'phone' : 'email');
  await challenge.save();

  return {
    success: true,
    challengeId: challenge.jti,
    channel: challenge.challengeChannel,
    expiresAt: expiresAt.toISOString(),
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    destination: {
      email: delivery.email.sent ? maskEmail(user.email) : null,
      phone: delivery.sms.sent ? maskPhone(user.phoneNumber) : null,
    },
    channels: delivery,
    ...(config.env !== 'production'
      ? { debugOtp: otpCode }
      : {}),
  };
};

const verifyAccessCode = async ({ challengeId, otp }) => {
  const challenge = await getOtpChallengeById(challengeId);
  await ensureOtpChallengeActive(challenge);

  const normalizedOtp = String(otp || '')
    .replace(/\D/g, '')
    .slice(0, 6);
  if (normalizedOtp.length !== 6) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A valid 6-digit code is required.');
  }

  const maxAttempts = Number(challenge.otpMaxAttempts || OTP_MAX_ATTEMPTS);
  const attempts = Number(challenge.otpAttempts || 0);
  if (attempts >= maxAttempts) {
    challenge.status = 'locked';
    challenge.challengeChannel =
      challenge.challengeChannel ||
      (challenge.identifierType === 'phone' ? 'phone' : 'email');
    await challenge.save();
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      'Too many invalid attempts. Request a new code.'
    );
  }

  const expectedHash = buildOtpHash({ challengeId: challenge.jti, otp: normalizedOtp });
  if (!challenge.otpHash || challenge.otpHash !== expectedHash) {
    challenge.otpAttempts = attempts + 1;
    if (challenge.otpAttempts >= maxAttempts) {
      challenge.status = 'locked';
    }
    challenge.challengeChannel =
      challenge.challengeChannel ||
      (challenge.identifierType === 'phone' ? 'phone' : 'email');
    await challenge.save();
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid verification code.');
  }

  const user = await User.findById(challenge.userId);
  if (!user || !isUserActive(user) || String(user.tenantId) !== String(challenge.tenantId)) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Account is not eligible for this module.');
  }

  const projectForm = await ProjectForm.findOne({
    _id: challenge.projectFormId,
    tenantId: challenge.tenantId,
    projectId: challenge.projectId,
    deletedAt: null,
  }).lean();
  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found.');
  }

  const secureForm = {
    projectForm,
    qrContext: projectFormService.buildPublicQrContext(projectForm, {
      resolvedBy: challenge?.metadata?.resolvedBy || 'challenge',
    }),
    resolvedBy: challenge?.metadata?.resolvedBy || 'challenge',
  };

  const resolvedIdentifier = {
    type: challenge.identifierType,
    normalized: challenge.identifier,
    candidates: [challenge.identifier],
  };

  const grant = await createAccessGrant({
    secureForm,
    user,
    resolvedIdentifier,
    metadata: {
      accessMethod: 'otp_code',
      challengeId: challenge.jti,
    },
  });

  challenge.status = 'verified';
  challenge.otpVerifiedAt = new Date();
  challenge.metadata = {
    ...(challenge.metadata || {}),
    accessJti: grant.jti,
  };
  await challenge.save();

  logger.info('[PublicFormAccess] otp verified', {
    tenantId: challenge.tenantId,
    projectId: challenge.projectId,
    challengeId: challenge.jti,
    accessJti: grant.jti,
    identifierType: challenge.identifierType,
  });

  await PublicFormAccess.updateOne(
    { jti: grant.jti, tokenType: ACCESS_TOKEN_TYPE },
    {
      $set: {
        status: 'verified',
        otpVerifiedAt: new Date(),
      },
    }
  );

  const consumed = await consumeAccessLink({ accessToken: grant.token });

  return {
    success: true,
    accessToken: grant.token,
    expiresAt: grant.expiresAt.toISOString(),
    ...consumed,
  };
};

const verifyAccessToken = async (accessToken, options = {}) => {
  const { allowSubmitted = false } = options;
  if (!accessToken) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Access token is required.');
  }

  let decoded;
  try {
    decoded = jwt.verify(accessToken, config.publicForm.qrContextSecret, {
      algorithms: ['HS256'],
      issuer: 'saby-public-form',
      audience: 'saby-public-form-access',
    });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired access token.');
  }

  if (decoded?.typ !== ACCESS_TOKEN_TYPE) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid access token type.');
  }

  const accessDoc = await PublicFormAccess.findOne({
    jti: decoded.jti,
    tokenType: ACCESS_TOKEN_TYPE,
  });
  if (!accessDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Access challenge not found.');
  }

  if (accessDoc.status === 'revoked' || accessDoc.status === 'expired') {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Access token is no longer valid.');
  }
  if (accessDoc.status === 'submitted') {
    accessDoc.metadata = {
      ...(accessDoc.metadata || {}),
      replayFailures:
        Number(accessDoc.metadata?.replayFailures || 0) + 1,
      lastReplayAt: new Date().toISOString(),
    };
    await accessDoc.save();
    logger.warn('[PublicFormAccess] replay detected for submitted token', {
      tenantId: accessDoc.tenantId,
      projectId: accessDoc.projectId,
      accessJti: accessDoc.jti,
      replayFailures: Number(accessDoc.metadata?.replayFailures || 0),
      submittedAt: accessDoc.submittedAt || null,
      selectedNodeId: accessDoc.selectedNodeId || null,
    });
    if (!allowSubmitted) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'This access token has already been used.');
    }

    return {
      decoded,
      accessDoc,
      replayDetected: true,
    };
  }

  const now = Date.now();
  if (new Date(accessDoc.expiresAt).getTime() < now) {
    accessDoc.status = 'expired';
    await accessDoc.save();
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Access token has expired.');
  }

  return {
    decoded,
    accessDoc,
  };
};

const getProjectPublicAccessMetrics = async ({
  tenantId,
  projectId,
  recentWindowHours = 24,
}) => {
  const scope = {
    tokenType: ACCESS_TOKEN_TYPE,
    tenantId: String(tenantId),
    projectId: String(projectId),
  };
  const recentSince = new Date(
    Date.now() - Math.max(1, Number(recentWindowHours || 24)) * 60 * 60 * 1000
  );

  const [
    total,
    statusCountsRaw,
    consumedCount,
    replayFailuresRaw,
    deliveryRaw,
    recentRequests,
    recentSubmissions,
  ] = await Promise.all([
    PublicFormAccess.countDocuments(scope),
    PublicFormAccess.aggregate([
      { $match: scope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PublicFormAccess.countDocuments({
      ...scope,
      consumedAt: { $ne: null },
    }),
    PublicFormAccess.aggregate([
      { $match: scope },
      {
        $group: {
          _id: null,
          replayFailures: {
            $sum: { $ifNull: ['$metadata.replayFailures', 0] },
          },
        },
      },
    ]),
    PublicFormAccess.aggregate([
      { $match: scope },
      {
        $group: {
          _id: null,
          emailSent: {
            $sum: {
              $cond: [{ $eq: ['$delivery.email.sent', true] }, 1, 0],
            },
          },
          smsSent: {
            $sum: {
              $cond: [{ $eq: ['$delivery.sms.sent', true] }, 1, 0],
            },
          },
          emailFailed: {
            $sum: {
              $cond: [{ $eq: ['$delivery.email.sent', false] }, 1, 0],
            },
          },
          smsFailed: {
            $sum: {
              $cond: [{ $eq: ['$delivery.sms.sent', false] }, 1, 0],
            },
          },
        },
      },
    ]),
    PublicFormAccess.countDocuments({
      ...scope,
      createdAt: { $gte: recentSince },
    }),
    PublicFormAccess.countDocuments({
      ...scope,
      submittedAt: { $gte: recentSince },
      status: 'submitted',
    }),
  ]);

  const statusCounts = statusCountsRaw.reduce((acc, row) => {
    if (row?._id) {
      acc[row._id] = row.count;
    }
    return acc;
  }, {});

  const replayFailures = Number(replayFailuresRaw?.[0]?.replayFailures || 0);
  const delivery = deliveryRaw?.[0] || {
    emailSent: 0,
    smsSent: 0,
    emailFailed: 0,
    smsFailed: 0,
  };

  return {
    totalRequests: total,
    linkRequests: total,
    linksConsumed: consumedCount,
    submissionClaims: consumedCount,
    submitSuccess: Number(statusCounts.submitted || 0),
    submitFailed:
      Number(statusCounts.expired || 0) + Number(statusCounts.revoked || 0),
    replayFailures,
    statusCounts: {
      issued: Number(statusCounts.issued || 0),
      verified: Number(statusCounts.verified || 0),
      consumed: Number(statusCounts.consumed || 0),
      submitting: Number(statusCounts.submitting || 0),
      submitted: Number(statusCounts.submitted || 0),
      expired: Number(statusCounts.expired || 0),
      revoked: Number(statusCounts.revoked || 0),
    },
    delivery,
    recent: {
      windowHours: Math.max(1, Number(recentWindowHours || 24)),
      requests: recentRequests,
      submissions: recentSubmissions,
      since: recentSince.toISOString(),
    },
  };
};

const resolveUserAssignedNodes = async ({ tenantId, userId }) => {
  const nodes = await Nodes.find({
    tenantId,
    users: userId,
    deletedAt: null,
    isActive: true,
  })
    .populate('level', 'name rank')
    .select('_id nodeId name level parent')
    .sort({ name: 1 })
    .lean();

  return nodes.map((node) => ({
    id: String(node._id),
    nodeId: node.nodeId || null,
    name: node.name || '',
    parentId: node.parent ? String(node.parent) : null,
    level: node.level
      ? {
          id: String(node.level._id || ''),
          name: node.level.name || null,
          rank:
            typeof node.level.rank === 'number' ? node.level.rank : null,
        }
      : null,
  }));
};

const consumeAccessLink = async ({ accessToken }) => {
  const { decoded, accessDoc } = await verifyAccessToken(accessToken);
  const user = await User.findById(decoded.sub);

  if (!isUserActive(user) || user.tenantId !== decoded.tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Account is not eligible for this module.');
  }

  const nodes = await resolveUserAssignedNodes({
    tenantId: decoded.tenantId,
    userId: user._id,
  });

  if (nodes.length === 0) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'No assigned node found for this account. Contact your administrator.'
    );
  }

  return {
    success: true,
    secureMode: accessDoc.secureMode || 'single_qr_passwordless',
    accessContext: {
      tenantId: decoded.tenantId,
      projectId: decoded.projectId,
      projectFormId: decoded.projectFormId,
      publicRef: decoded.publicRef || null,
      shareRef: decoded.shareRef || null,
      expiresAt: accessDoc.expiresAt,
      requiresNodeSelection: nodes.length > 1,
      autoNodeId: nodes.length === 1 ? nodes[0].id : null,
      status: accessDoc.status,
    },
    user: {
      id: String(user._id),
      firstname: user.firstname || '',
      lastname: user.lastname || '',
      email: user.email || null,
      phoneNumber: user.phoneNumber || null,
    },
    nodes,
  };
};

const resolveAssignedNode = async ({ tenantId, userId, nodeId }) => {
  if (!nodeId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Node selection is required.');
  }

  const filter = {
    tenantId,
    users: userId,
    deletedAt: null,
    isActive: true,
  };

  if (/^[0-9a-fA-F]{24}$/.test(String(nodeId))) {
    filter._id = nodeId;
  } else {
    filter.nodeId = String(nodeId).trim();
  }

  const node = await Nodes.findOne(filter).select('_id nodeId name').lean();
  if (!node) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Selected node is not assigned to your account.'
    );
  }
  return node;
};

const getValueByPath = (source, path) => {
  const segments = String(path || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return undefined;

  let cursor = source;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[segment];
  }
  return cursor;
};

const normalizePrefillValue = (value, elementType = '') => {
  if (value == null) return '';

  const type = String(elementType || '').toLowerCase();

  if (value instanceof Date) {
    if (type === 'date') return value.toISOString().slice(0, 10);
    if (type === 'time') return value.toISOString().slice(11, 16);
    if (type === 'datetime' || type === 'datetime-local') {
      return value.toISOString().slice(0, 16);
    }
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizePrefillValue(item, elementType));
  }

  if (typeof value === 'object') {
    if (typeof value.toString === 'function') {
      const asString = value.toString();
      if (asString && asString !== '[object Object]') return asString;
    }
    return '';
  }

  return value;
};

const buildSystemPrefillData = ({ projectForm, source }) => {
  const prefillData = {};
  const elements = Array.isArray(projectForm?.elements) ? projectForm.elements : [];
  elements.forEach((element = {}) => {
    const elementId = element?.id;
    const bindingPath = element?.metadata?.bindingPath;
    if (!elementId || !bindingPath) return;
    const rawValue = getValueByPath(source, bindingPath);
    if (rawValue === undefined) return;
    prefillData[elementId] = normalizePrefillValue(rawValue, element?.type);
  });
  return prefillData;
};

const getSystemFormPrefillByAccess = async ({ accessToken, nodeId = null }) => {
  const { decoded, accessDoc, replayDetected = false } = await verifyAccessToken(accessToken, {
    allowSubmitted: true,
  });
  if (replayDetected) {
    return {
      success: true,
      alreadySubmitted: true,
      status: String(accessDoc.metadata?.submissionStatus || 'submitted'),
      jobId: accessDoc.metadata?.submissionJobId || null,
      projectId: decoded.projectId,
      submittedAt: accessDoc.submittedAt || null,
      node: accessDoc.selectedNodeId
        ? {
            id: String(accessDoc.selectedNodeId),
            nodeId: null,
            name: '',
          }
        : null,
    };
  }
  if (!['verified', 'consumed', 'submitting'].includes(accessDoc.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Access link must be verified before loading form prefill.'
    );
  }

  const user = await User.findById(decoded.sub);
  if (!isUserActive(user) || user.tenantId !== decoded.tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Account is not eligible for this module.');
  }

  const projectForm = await ProjectForm.findOne({
    _id: decoded.projectFormId,
    tenantId: decoded.tenantId,
    projectId: decoded.projectId,
    deletedAt: null,
  }).lean();
  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found.');
  }

  const isSystemForm = projectForm?.metadata?.formCategory === 'system';
  const systemTarget = projectForm?.metadata?.systemTarget || null;
  if (!isSystemForm || !systemTarget) {
    return {
      success: true,
      systemTarget: null,
      prefillData: {},
    };
  }

  if (systemTarget === 'user_profile') {
    return {
      success: true,
      systemTarget,
      prefillData: buildSystemPrefillData({ projectForm, source: user.toObject() }),
      target: {
        userId: String(user._id),
      },
    };
  }

  if (systemTarget === 'node_profile') {
    let resolvedNodeId = nodeId || null;
    if (!resolvedNodeId && accessDoc.selectedNodeId) {
      resolvedNodeId = String(accessDoc.selectedNodeId);
    }
    if (!resolvedNodeId) {
      const assignedNodes = await resolveUserAssignedNodes({
        tenantId: decoded.tenantId,
        userId: user._id,
      });
      if (assignedNodes.length === 1) {
        resolvedNodeId = assignedNodes[0].id;
      }
    }
    if (!resolvedNodeId) {
      return {
        success: true,
        systemTarget,
        prefillData: {},
        target: null,
      };
    }

    const node = await resolveAssignedNode({
      tenantId: decoded.tenantId,
      userId: user._id,
      nodeId: resolvedNodeId,
    });
    const nodeDoc = await Nodes.findById(node._id).lean();
    if (!nodeDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Assigned node not found.');
    }

    accessDoc.selectedNodeId = node._id;
    await accessDoc.save();

    return {
      success: true,
      systemTarget,
      prefillData: buildSystemPrefillData({ projectForm, source: nodeDoc }),
      target: {
        nodeId: String(node._id),
        nodeReference: node.nodeId || null,
        nodeName: node.name || '',
      },
    };
  }

  return {
    success: true,
    systemTarget,
    prefillData: {},
  };
};

const submitWithAccess = async ({
  accessToken,
  nodeId,
  submissionData,
  submittedAt = null,
  metadata = {},
}) => {
  if (!submissionData || typeof submissionData !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'submissionData is required.');
  }

  const { decoded, accessDoc, replayDetected = false } = await verifyAccessToken(accessToken, {
    allowSubmitted: true,
  });
  if (replayDetected) {
    return {
      success: true,
      alreadySubmitted: true,
      status: String(accessDoc.metadata?.submissionStatus || 'submitted'),
      jobId: accessDoc.metadata?.submissionJobId || null,
      projectId: decoded.projectId,
      submittedAt: accessDoc.submittedAt || null,
      node: accessDoc.selectedNodeId
        ? {
            id: String(accessDoc.selectedNodeId),
            nodeId: null,
            name: '',
          }
        : null,
    };
  }
  if (!['verified', 'consumed'].includes(accessDoc.status)) {
    if (accessDoc.status === 'submitting') {
      return {
        success: true,
        processing: true,
        status: 'submitting',
        jobId: accessDoc.metadata?.submissionJobId || null,
        projectId: decoded.projectId,
        submittedAt: accessDoc.submittedAt || null,
        node: accessDoc.selectedNodeId
          ? {
              id: String(accessDoc.selectedNodeId),
              nodeId: null,
              name: '',
            }
          : null,
      };
    }
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Access link must be verified before submission.'
    );
  }

  const user = await User.findById(decoded.sub);
  if (!isUserActive(user) || user.tenantId !== decoded.tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Account is not eligible for this module.');
  }

  const projectForm = await ProjectForm.findOne({
    _id: decoded.projectFormId,
    tenantId: decoded.tenantId,
    projectId: decoded.projectId,
    deletedAt: null,
  }).lean();

  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found.');
  }

  await validateSpecialFieldSubmission({
    projectForm,
    submissionData,
    metadata: metadata || {},
    accessToken,
  });

  const claimTime = new Date();
  const claimedAccessDoc = await PublicFormAccess.findOneAndUpdate(
    {
      _id: accessDoc._id,
      status: { $in: ['verified', 'consumed'] },
      submittedAt: null,
    },
    {
      $set: {
        status: 'submitting',
        consumedAt: accessDoc.consumedAt || claimTime,
        'metadata.submissionClaimedAt': claimTime.toISOString(),
      },
    },
    { new: true }
  );

  if (!claimedAccessDoc) {
    const latestAccessDoc = await PublicFormAccess.findById(accessDoc._id);
    if (latestAccessDoc?.status === 'submitted') {
      return {
        success: true,
        alreadySubmitted: true,
        status: String(latestAccessDoc.metadata?.submissionStatus || 'submitted'),
        jobId: latestAccessDoc.metadata?.submissionJobId || null,
        projectId: decoded.projectId,
        submittedAt: latestAccessDoc.submittedAt || null,
        node: latestAccessDoc.selectedNodeId
          ? {
              id: String(latestAccessDoc.selectedNodeId),
              nodeId: null,
              name: '',
            }
          : null,
      };
    }
    if (latestAccessDoc?.status === 'submitting') {
      return {
        success: true,
        processing: true,
        status: 'submitting',
        jobId: latestAccessDoc.metadata?.submissionJobId || null,
        projectId: decoded.projectId,
        submittedAt: latestAccessDoc.submittedAt || null,
        node: latestAccessDoc.selectedNodeId
          ? {
              id: String(latestAccessDoc.selectedNodeId),
              nodeId: null,
              name: '',
            }
          : null,
      };
    }
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Access link is no longer available for submission.'
    );
  }

  const isSystemForm = projectForm?.metadata?.formCategory === 'system';
  const systemTarget = projectForm?.metadata?.systemTarget || null;

  if (isSystemForm) {
    let targetId = null;
    let selectedNode = null;

    if (systemTarget === 'node_profile') {
      selectedNode = await resolveAssignedNode({
        tenantId: decoded.tenantId,
        userId: user._id,
        nodeId,
      });
      targetId = String(selectedNode._id);
    } else if (systemTarget === 'user_profile') {
      targetId = String(user._id);
    }

    const result = await projectFormService.submitSystemFormByPublicRef({
      publicRef: projectForm.publicRef,
      actorUser: user,
      targetId,
      submissionData,
    });

    claimedAccessDoc.status = 'submitted';
    claimedAccessDoc.submittedAt = new Date();
    if (selectedNode?._id) {
      claimedAccessDoc.selectedNodeId = selectedNode._id;
    }
    claimedAccessDoc.metadata = {
      ...(claimedAccessDoc.metadata || {}),
      submissionStatus: 'completed',
    };
    await claimedAccessDoc.save();
    logger.info('[PublicFormAccess] system form submitted', {
      tenantId: decoded.tenantId,
      projectId: decoded.projectId,
      accessJti: claimedAccessDoc.jti,
      submittedAt: claimedAccessDoc.submittedAt,
      selectedNodeId: selectedNode?._id ? String(selectedNode._id) : null,
      systemTarget,
    });

    return {
      success: true,
      status: 'completed',
      mode: 'system_direct_update',
      projectId: decoded.projectId,
      systemTarget,
      node: selectedNode
        ? {
            id: String(selectedNode._id),
            nodeId: selectedNode.nodeId || null,
            name: selectedNode.name || '',
          }
        : null,
      result,
    };
  }

  const node = await resolveAssignedNode({
    tenantId: decoded.tenantId,
    userId: user._id,
    nodeId,
  });

  const queuePayload = {
    tenantId: decoded.tenantId,
    projectId: decoded.projectId,
    project_name: projectForm?.identity?.name || null,
    project_category: Array.isArray(projectForm?.identity?.tags)
      ? projectForm.identity.tags[0] || null
      : null,
    formId: projectForm.formId || projectForm.projectId,
    nodeId: String(node._id),
    node_name: node.name || null,
    node_reference: node.nodeId || null,
    form_reference: projectForm.formReference || null,
    userId: String(user._id),
    payload: submissionData,
    source: 'public_secure_qr',
    meta: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      publicAccess: {
        mode: claimedAccessDoc.secureMode,
        jti: claimedAccessDoc.jti,
        shareRef: claimedAccessDoc.shareRef || null,
        publicRef: claimedAccessDoc.publicRef || null,
      },
    },
  };

  if (submittedAt) {
    queuePayload.event_date = submittedAt;
  }

  if (projectForm.capabilities?.experience?.compliance?.enabled) {
    queuePayload.perm_enabled = true;
    const payloadMonth =
      queuePayload.payload?.month ||
      queuePayload.payload?.reportingMonth ||
      queuePayload.meta?.month ||
      null;
    const payloadYear =
      queuePayload.payload?.year ||
      queuePayload.payload?.reportingYear ||
      queuePayload.meta?.year ||
      null;
    if (payloadMonth) queuePayload.month = String(payloadMonth);
    if (payloadYear) queuePayload.year = String(payloadYear);
  }

  queuePayload.idempotency_key = buildDeterministicIdempotencyKey({
    tenant_id: queuePayload.tenantId,
    project_id: queuePayload.projectId,
    form_id: queuePayload.formId,
    node_id: queuePayload.nodeId,
    event_date: queuePayload.event_date,
    submitter_id: queuePayload.userId,
    payload: queuePayload.payload,
  });

  const queueResult = await queueSubmission(queuePayload);

  claimedAccessDoc.status = 'submitted';
  claimedAccessDoc.submittedAt = new Date();
  claimedAccessDoc.selectedNodeId = node._id;
  claimedAccessDoc.metadata = {
    ...(claimedAccessDoc.metadata || {}),
    submissionJobId: queueResult.jobId,
    submissionStatus: queueResult.status,
  };
  await claimedAccessDoc.save();
  logger.info('[PublicFormAccess] submission accepted', {
    tenantId: decoded.tenantId,
    projectId: decoded.projectId,
    accessJti: claimedAccessDoc.jti,
    submittedAt: claimedAccessDoc.submittedAt,
    selectedNodeId: String(node._id),
    submissionJobId: queueResult.jobId,
    submissionStatus: queueResult.status,
    idempotencyKey: queuePayload.idempotency_key,
  });

  try {
    await projectFormService.incrementProjectSubmissions(decoded.projectId);
  } catch (error) {
    logger.warn('[PublicFormAccess] failed to increment submissions counter', {
      projectId: decoded.projectId,
      error: error?.message,
    });
  }

  return {
    success: true,
    status: queueResult.status,
    jobId: queueResult.jobId,
    projectId: decoded.projectId,
    node: {
      id: String(node._id),
      nodeId: node.nodeId || null,
      name: node.name || '',
    },
  };
};

const requestFieldVerificationCode = async ({
  formId,
  fieldKey,
  channel,
  identifier,
  submissionId = null,
  accessToken = null,
}) => {
  const selectedChannel = sanitizeChannel(channel);
  const normalizedIdentifier = resolveIdentifier(identifier, selectedChannel);
  const projectForm = await ensureProjectFormAccess({
    formId,
  });

  return createFieldVerificationChallenge({
    projectForm,
    fieldKey: String(fieldKey || '').trim(),
    channel: selectedChannel,
    identifier: normalizedIdentifier.normalized,
    submissionId,
    accessToken,
  });
};

const verifyFieldVerificationCode = async ({ challengeId, otp }) => {
  const challenge = await getOtpChallengeById(challengeId);
  await ensureOtpChallengeActive(challenge);

  if (challenge?.metadata?.kind !== 'field_verification') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This challenge is not a field verification request.');
  }

  const normalizedOtp = String(otp || '')
    .replace(/\D/g, '')
    .slice(0, 6);
  if (normalizedOtp.length < 4) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A valid verification code is required.');
  }

  const maxAttempts = Number(challenge.otpMaxAttempts || OTP_MAX_ATTEMPTS);
  const attempts = Number(challenge.otpAttempts || 0);
  if (attempts >= maxAttempts) {
    challenge.status = 'locked';
    await challenge.save();
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      'Too many invalid attempts. Request a new code.'
    );
  }

  const expectedHash = buildOtpHash({ challengeId: challenge.jti, otp: normalizedOtp });
  if (!challenge.otpHash || challenge.otpHash !== expectedHash) {
    challenge.otpAttempts = attempts + 1;
    if (challenge.otpAttempts >= maxAttempts) {
      challenge.status = 'locked';
    }
    await challenge.save();
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid verification code.');
  }

  challenge.status = 'verified';
  challenge.otpVerifiedAt = new Date();
  challenge.metadata = {
    ...(challenge.metadata || {}),
    verified: true,
    verifiedAt: new Date().toISOString(),
  };
  await challenge.save();

  return {
    success: true,
    verified: true,
    fieldKey: String(challenge.metadata?.fieldKey || ''),
    challengeId: challenge.jti,
    identifier: challenge.identifier,
    channel: challenge.challengeChannel || challenge.identifierType,
    verifiedAt: challenge.otpVerifiedAt,
    submissionId: challenge.metadata?.submissionId || null,
  };
};

const generateFormFieldId = async ({
  formId,
  tenantId,
  projectId,
  fieldKey,
  prefix = 'MEM',
  separator = '-',
  length = 6,
}) => {
  const projectForm = await ensureProjectFormAccess({
    formId,
    tenantId,
    projectId,
  });

  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!normalizedFieldKey) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'fieldKey is required.');
  }

  const counterName = [
    'membership',
    String(projectForm.tenantId),
    String(projectForm.projectId),
    String(projectForm._id),
    normalizedFieldKey,
  ].join(':');

  const seq = await Counter.getNextSequence(counterName);
  const digits = Math.max(1, Math.min(12, Number(length || 6)));
  const paddedNumber = String(seq).padStart(digits, '0');
  const trimmedPrefix = String(prefix || '').trim();
  const trimmedSeparator = String(separator || '');
  const value = trimmedPrefix
    ? `${trimmedPrefix}${trimmedSeparator}${paddedNumber}`
    : paddedNumber;

  return {
    success: true,
    formId: String(projectForm._id),
    fieldKey: normalizedFieldKey,
    value,
    sequence: seq,
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

  return mapped.length > 0 ? Array.from(new Set(mapped)) : ['image/jpeg', 'image/png', 'image/webp'];
};

const validateSpecialFieldSubmission = async ({
  projectForm,
  submissionData,
  metadata = {},
  accessToken = null,
}) => {
  if (!projectForm || !submissionData || typeof submissionData !== 'object') {
    return;
  }

  const elements = Array.isArray(projectForm.elements) ? projectForm.elements : [];
  const verificationState =
    metadata && typeof metadata === 'object' && metadata.verificationState
      ? metadata.verificationState
      : {};
  const previewSubmissionConfig =
    projectForm?.capabilities?.experience?.previewSubmission || {};

  if (previewSubmissionConfig?.enabled && metadata?.previewSubmissionConfirmed !== true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Submission preview must be acknowledged before final submission.'
    );
  }

  for (const element of elements) {
    const fieldId = String(element?.id || '').trim();
    const fieldType = String(element?.properties?.fieldType || '')
      .trim()
      .toLowerCase();

    if (!fieldId) {
      continue;
    }

    if (fieldType === 'profile_image_upload') {
      const required = Boolean(
        element?.properties?.required || element?.properties?.validation?.required
      );
      const rawValue = submissionData[fieldId];

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
          `${element?.properties?.label || fieldId} must be a valid image upload payload.`
        );
      }

      const acceptedTypes = normalizeAcceptedImageTypes(element?.properties?.acceptedFormats);
      const maxSizeMB = Math.max(1, Number(element?.properties?.maxSizeMB || 5));
      const fileType = String(rawValue.type || '').trim().toLowerCase();
      const fileName = String(rawValue.name || '').trim();
      const fileUrl = String(rawValue.url || '').trim();
      const fileKey = String(rawValue.key || '').trim();
      const fileSize = Number(rawValue.size || 0);
      const width = rawValue.width == null ? null : Number(rawValue.width);
      const height = rawValue.height == null ? null : Number(rawValue.height);

      if (!fileName || !fileType || !fileUrl || !fileKey) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} is missing uploaded image metadata.`
        );
      }

      if (!acceptedTypes.includes(fileType)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} must use one of the supported image formats.`
        );
      }

      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxSizeMB * 1024 * 1024) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} exceeds the allowed image size.`
        );
      }

      if ((width !== null && (!Number.isFinite(width) || width <= 0)) ||
          (height !== null && (!Number.isFinite(height) || height <= 0))) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${element?.properties?.label || fieldId} has invalid image dimensions.`
        );
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
      projectFormId: projectForm._id,
      challengeChannel: expectedChannel,
      identifier: normalizedIdentifier,
      'metadata.kind': 'field_verification',
      'metadata.fieldKey': String(element?.properties?.fieldKey || fieldId).trim() || fieldId,
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
};

module.exports = {
  issueAccessLink,
  requestAccessCode,
  resendAccessCode,
  verifyAccessCode,
  consumeAccessLink,
  getSystemFormPrefillByAccess,
  submitWithAccess,
  getProjectPublicAccessMetrics,
  requestFieldVerificationCode,
  verifyFieldVerificationCode,
  generateFormFieldId,
  validateSpecialFieldSubmission,
};
