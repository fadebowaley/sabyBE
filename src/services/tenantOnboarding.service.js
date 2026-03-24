const httpStatus = require('http-status');
const logger = require('../config/logger');
const smsService = require('./sms.service');
const {
  TenantOnboarding,
  User,
  Level,
  Structures,
  Nodes,
  GlobalSettings,
} = require('../models');
const ApiError = require('../utils/ApiError');

const sanitizeText = (value, fallback = '') =>
  String(value == null ? fallback : value).trim();

const DEFAULT_TIMEZONE = 'Africa/Lagos';
const ALLOWED_COMPANY_SIZES = new Set([
  '1-10',
  '11-50',
  '51-200',
  '201-1000',
  '1000+',
  'unspecified',
]);
const ALLOWED_INDUSTRIES = new Set([
  'financial services & fintech',
  'energy, utilities & iot',
  'healthcare & life sciences',
  'government & public sector',
  'retail & commerce',
  'education & research',
  'non-profit & faith-based',
  'other',
]);

const isDuplicateKeyError = (error) =>
  Boolean(error && (error.code === 11000 || /duplicate key/i.test(error.message || '')));

const sanitizePhone = (value) => {
  const raw = sanitizeText(value);
  if (!raw) return '';
  const withLeadingPlus = raw.startsWith('+');
  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) return '';
  return `${withLeadingPlus ? '+' : ''}${digitsOnly.slice(0, 16)}`;
};

const normalizePhoneForVerification = (value) => {
  const sanitized = sanitizePhone(value);
  if (!sanitized) return '';
  const digitsOnly = sanitized.replace(/[^\d]/g, '');
  if (!digitsOnly) return '';
  return String(smsService.formatPhoneNumber(digitsOnly)).replace(/[^\d]/g, '');
};

const sanitizeEmail = (value, fallback = '') => {
  const email = sanitizeText(value, fallback).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};

const sanitizeTimezone = (value, fallback = DEFAULT_TIMEZONE) => {
  const timezone = sanitizeText(value, fallback);
  if (!timezone) return fallback;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return timezone;
  } catch {
    return fallback;
  }
};

const sanitizeIndustry = (value) => {
  const normalized = sanitizeText(value).toLowerCase();
  if (!normalized) return 'Other';
  return ALLOWED_INDUSTRIES.has(normalized)
    ? normalized.replace(/\b\w/g, (char) => char.toUpperCase())
    : 'Other';
};

const sanitizeCompanySize = (value) => {
  const normalized = sanitizeText(value).toLowerCase();
  if (!normalized) return 'unspecified';
  return ALLOWED_COMPANY_SIZES.has(normalized) ? normalized : 'unspecified';
};

const sanitizeBoolean = (value, fallback = false) => {
  if (value == null || value === '') return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['yes', 'true', '1', 'on'].includes(normalized)) return true;
  if (['no', 'false', '0', 'off'].includes(normalized)) return false;
  return Boolean(fallback);
};

const ONBOARDING_DRAFT_PHASES = new Set([
  'question',
  'review',
  'submitting',
  'completed',
]);

const sanitizeDraftPhase = (value) => {
  const phase = String(value || '').trim().toLowerCase();
  return ONBOARDING_DRAFT_PHASES.has(phase) ? phase : 'question';
};

const sanitizeDraftSkipped = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.entries(value).forEach(([key, raw]) => {
    out[String(key)] = Boolean(raw);
  });
  return out;
};

const buildChangedFieldList = (before, after, parentPath = '') => {
  if (!before && !after) return [];
  const beforeObj = before && typeof before === 'object' ? before : {};
  const afterObj = after && typeof after === 'object' ? after : {};
  const keys = Array.from(
    new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])
  );

  return keys.flatMap((key) => {
    const path = parentPath ? `${parentPath}.${key}` : key;
    const left = beforeObj[key];
    const right = afterObj[key];
    const leftIsObject = left && typeof left === 'object' && !Array.isArray(left);
    const rightIsObject = right && typeof right === 'object' && !Array.isArray(right);
    if (leftIsObject || rightIsObject) {
      return buildChangedFieldList(left, right, path);
    }
    return String(left ?? '') === String(right ?? '') ? [] : [path];
  });
};

const getOrCreateLevel = async ({ tenantId, levelName, preferredRank = null }) => {
  const normalized = sanitizeText(levelName, 'Headquarters').replace(/\s+/g, ' ');
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const preferredRankValue =
    preferredRank == null || Number.isNaN(Number(preferredRank))
      ? null
      : Number(preferredRank);

  const existingByName = await Level.findOne({
    tenantId,
    deletedAt: null,
    name: { $regex: `^${escaped}$`, $options: 'i' },
  });
  if (existingByName) {
    if (
      preferredRankValue != null &&
      Number(existingByName.rank) !== preferredRankValue
    ) {
      const existingByRank = await Level.findOne({
        tenantId,
        deletedAt: null,
        isSpecial: false,
        rank: preferredRankValue,
      });
      if (existingByRank && String(existingByRank._id) !== String(existingByName._id)) {
        return existingByRank;
      }
      existingByName.rank = preferredRankValue;
      await existingByName.save();
    }
    return existingByName;
  }

  if (preferredRankValue != null) {
    const existingByRank = await Level.findOne({
      tenantId,
      deletedAt: null,
      isSpecial: false,
      rank: preferredRankValue,
    });
    if (existingByRank) {
      return existingByRank;
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const maxRankDoc =
      preferredRankValue == null
        ? await Level.findOne({ tenantId, deletedAt: null }).sort({ rank: -1 }).lean()
        : null;
    const nextRank =
      preferredRankValue != null
        ? preferredRankValue
        : typeof maxRankDoc?.rank === 'number'
          ? Number(maxRankDoc.rank) + 1 + attempt
          : 1 + attempt;

    try {
      const level = await Level.create({
        tenantId,
        name: normalized,
        rank: nextRank,
        isSpecial: false,
        isActive: true,
      });
      return level;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      if (preferredRankValue != null) {
        const existingByRank = await Level.findOne({
          tenantId,
          deletedAt: null,
          isSpecial: false,
          rank: preferredRankValue,
        });
        if (existingByRank) return existingByRank;
      }
      const existing = await Level.findOne({
        tenantId,
        deletedAt: null,
        name: { $regex: `^${escaped}$`, $options: 'i' },
      });
      if (existing) return existing;
    }
  }

  throw new ApiError(
    httpStatus.CONFLICT,
    'Could not create level due to conflicting level names or ranks. Please retry.'
  );
};

const getOrCreateStructureForLevel = async ({ tenantId, levelId, levelName, ownerId }) => {
  let structure = await Structures.findOne({
    tenantId,
    level: levelId,
    isActive: true,
  });
  if (structure) return structure;

  const baseName = sanitizeText(levelName, 'Headquarters');
  let name = `${baseName} Structure`;
  let suffix = 1;
  // Keep name unique per tenant without failing onboarding.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await Structures.findOne({ tenantId, name });
    if (!existing) break;
    if (String(existing.level) === String(levelId)) {
      structure = existing;
      break;
    }
    suffix += 1;
    name = `${baseName} Structure ${suffix}`;
  }
  if (structure) return structure;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      structure = await Structures.create({
        tenantId,
        name,
        level: levelId,
        parent: null,
        isActive: true,
        isSpecial: false,
        type: 'organizational',
        createdBy: ownerId,
      });
      return structure;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      suffix += 1;
      name = `${baseName} Structure ${suffix}`;
      const sameLevelExisting = await Structures.findOne({
        tenantId,
        level: levelId,
        isActive: true,
      });
      if (sameLevelExisting) return sameLevelExisting;
    }
  }

  throw new ApiError(
    httpStatus.CONFLICT,
    'Could not create structure due to name conflict. Please retry.'
  );
};

const getOrCreateRootNode = async ({
  tenantId,
  levelId,
  structureId,
  nodeName,
  nodeAddress,
  nodeStructures,
  country,
  state,
  city,
}) => {
  const existing = await Nodes.findOne({
    tenantId,
    parent: null,
    deletedAt: null,
  }).sort({ createdAt: 1 });

  if (existing) {
    existing.name = sanitizeText(nodeName, existing.name);
    existing.level = levelId;
    existing.structure = structureId;
    existing.address = sanitizeText(nodeAddress, existing.address || '');
    existing.country = sanitizeText(country, existing.country || '');
    existing.state = sanitizeText(state, existing.state || '');
    existing.city = sanitizeText(city, existing.city || '');
    existing.nodeStructures = sanitizeBoolean(
      nodeStructures,
      existing.nodeStructures || false
    );
    existing.isMain = true;
    existing.isActive = true;
    await existing.save();
    return existing;
  }

  const node = await Nodes.create({
    tenantId,
    level: levelId,
    structure: structureId,
    parent: null,
    name: sanitizeText(nodeName, 'Main Office'),
    isMain: true,
    isActive: true,
    address: sanitizeText(nodeAddress),
    country: sanitizeText(country),
    state: sanitizeText(state),
    city: sanitizeText(city),
    nodeStructures: sanitizeBoolean(nodeStructures, false),
  });
  return node;
};

const getOnboardingStatus = async ({ userId }) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const isOwner = Boolean(user.isOwner || user.isSuper || user.isSaby);
  if (!isOwner) {
    return {
      requiresOnboarding: false,
      completed: true,
      reason: 'owner_only',
      profile: null,
    };
  }

  const tenantId = user.tenantId;
  const profile = await TenantOnboarding.findOne({ tenantId }).lean();
  const settings = await GlobalSettings.findOne({ tenantId }).lean();
  const rootNode = await Nodes.findOne({
    tenantId,
    parent: null,
    deletedAt: null,
  })
    .select('_id name level address city state country nodeStructures')
    .populate('level', 'name rank')
    .lean();

  let resolvedCompanyName = sanitizeText(
    profile?.company?.name,
    sanitizeText(settings?.organizationName)
  );
  const hasCompanyName =
    Boolean(resolvedCompanyName) && resolvedCompanyName !== 'Default Organization Name';
  const hasRootNode = Boolean(rootNode?._id);
  let completed = hasCompanyName && hasRootNode;

  // Legacy tenants created before onboarding rollout may have rich tenant data
  // (users/nodes) but no onboarding profile company name yet.
  if (!completed && hasRootNode && !hasCompanyName) {
    const [userCount, nodeCount] = await Promise.all([
      User.countDocuments({ tenantId, deletedAt: null }),
      Nodes.countDocuments({ tenantId, deletedAt: null }),
    ]);
    const hasLegacyConfiguredTenant = Number(userCount || 0) > 1 || Number(nodeCount || 0) > 1;
    if (hasLegacyConfiguredTenant) {
      completed = true;
      resolvedCompanyName = sanitizeText(rootNode?.name, 'Organization');
    }
  }

  return {
    requiresOnboarding: true,
    completed,
    profile: {
      company: {
        name: resolvedCompanyName,
        email: sanitizeEmail(profile?.company?.email, settings?.contactEmail || ''),
        phone: sanitizePhone(profile?.company?.phone || settings?.contactPhone || ''),
        industry: sanitizeIndustry(profile?.company?.industry),
        size: sanitizeCompanySize(profile?.company?.size),
        timezone: sanitizeTimezone(
          profile?.company?.timezone,
          settings?.timezone || DEFAULT_TIMEZONE
        ),
        country: sanitizeText(profile?.company?.country),
        state: sanitizeText(profile?.company?.state),
        city: sanitizeText(profile?.company?.city),
        address: sanitizeText(profile?.company?.address),
      },
      owner: {
        phoneNumber: sanitizePhone(profile?.owner?.phoneNumber || user.phoneNumber || ''),
        roleTitle: sanitizeText(profile?.owner?.roleTitle, user?.profile?.officeTitle || 'Owner'),
      },
      node: {
        rootNodeId: rootNode?._id ? String(rootNode._id) : '',
        rootNodeName: sanitizeText(profile?.node?.rootNodeName, rootNode?.name || ''),
        rootLevelName: sanitizeText(
          profile?.node?.rootLevelName,
          rootNode?.level?.name || 'Headquarters'
        ),
        rootNodeAddress: sanitizeText(
          profile?.node?.rootNodeAddress,
          rootNode?.address || profile?.company?.address || ''
        ),
        nodeStructures: sanitizeBoolean(
          profile?.node?.nodeStructures,
          rootNode?.nodeStructures || false
        ),
      },
      draftProgress: {
        currentIndex: Number(profile?.draftProgress?.currentIndex || 0),
        phase: sanitizeDraftPhase(profile?.draftProgress?.phase || 'question'),
        skipped: sanitizeDraftSkipped(profile?.draftProgress?.skipped),
        lastSavedAt: profile?.draftProgress?.lastSavedAt || profile?.updatedAt || null,
      },
    },
  };
};

const saveOnboardingDraft = async ({ userId, payload }) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!(user.isOwner || user.isSuper || user.isSaby)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only tenant owner accounts can save onboarding draft.'
    );
  }

  const tenantId = user.tenantId;
  const existing = await TenantOnboarding.findOne({ tenantId }).lean();
  const incomingForm = payload?.form || {};
  const owner = incomingForm.owner || {};
  const company = incomingForm.company || {};
  const node = incomingForm.node || {};

  const fallbackCompany = existing?.company || {};
  const fallbackOwner = existing?.owner || {};
  const fallbackNode = existing?.node || {};

  const draftProgress = {
    currentIndex: Math.max(0, Number(payload?.currentIndex || 0)),
    phase: sanitizeDraftPhase(payload?.phase || 'question'),
    skipped: sanitizeDraftSkipped(payload?.skipped),
    lastSavedAt: new Date(),
  };

  const nextDoc = await TenantOnboarding.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        ownerUserId: user._id,
        company: {
          name: sanitizeText(company.name, fallbackCompany.name || ''),
          email: sanitizeEmail(company.email, fallbackCompany.email || user.email || ''),
          phone: sanitizePhone(company.phone || fallbackCompany.phone || ''),
          industry: sanitizeIndustry(company.industry || fallbackCompany.industry || ''),
          size: sanitizeCompanySize(company.size || fallbackCompany.size || ''),
          timezone: sanitizeTimezone(
            company.timezone || fallbackCompany.timezone || DEFAULT_TIMEZONE,
            DEFAULT_TIMEZONE
          ),
          country: sanitizeText(company.country, fallbackCompany.country || ''),
          state: sanitizeText(company.state, fallbackCompany.state || ''),
          city: sanitizeText(company.city, fallbackCompany.city || ''),
          address: sanitizeText(company.address, fallbackCompany.address || ''),
        },
        owner: {
          roleTitle: sanitizeText(owner.roleTitle, fallbackOwner.roleTitle || 'Owner'),
          phoneNumber: sanitizePhone(owner.phoneNumber || fallbackOwner.phoneNumber || ''),
        },
        node: {
          rootNodeId: fallbackNode.rootNodeId || null,
          rootNodeName: sanitizeText(node.rootNodeName, fallbackNode.rootNodeName || ''),
          rootLevelName: sanitizeText(node.rootLevelName, fallbackNode.rootLevelName || 'Headquarters'),
          rootNodeAddress: sanitizeText(
            node.rootNodeAddress,
            fallbackNode.rootNodeAddress || fallbackCompany.address || ''
          ),
          nodeStructures: sanitizeBoolean(
            node.nodeStructures,
            fallbackNode.nodeStructures || false
          ),
        },
        draftProgress,
      },
      $inc: { version: 1 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return {
    ok: true,
    tenantId,
    draftProgress: nextDoc?.draftProgress || draftProgress,
    updatedAt: nextDoc?.updatedAt || new Date(),
  };
};

const completeOnboarding = async ({ userId, payload }) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!(user.isOwner || user.isSuper || user.isSaby)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only tenant owner accounts can complete onboarding.'
    );
  }

  const tenantId = user.tenantId;
  const company = payload.company || {};
  const owner = payload.owner || {};
  const node = payload.node || {};

  const companyName = sanitizeText(company.name);
  if (!companyName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Company name is required.');
  }

  const rootNodeName = sanitizeText(node.rootNodeName, `${companyName} HQ`);
  const rootLevelName = sanitizeText(node.rootLevelName, 'Headquarters');
  const rootNodeAddress = sanitizeText(node.rootNodeAddress, company.address || '');
  const nodeStructures = sanitizeBoolean(node.nodeStructures, false);
  const sanitizedTimezone = sanitizeTimezone(company.timezone, DEFAULT_TIMEZONE);
  const sanitizedIndustry = sanitizeIndustry(company.industry);
  const sanitizedCompanySize = sanitizeCompanySize(company.size);
  const sanitizedOwnerPhone = sanitizePhone(owner.phoneNumber);
  const sanitizedCompanyPhone = sanitizePhone(company.phone);
  const sanitizedCompanyEmail = sanitizeEmail(company.email, user.email || '');
  const onboardingPhoneOtp = user?.customFields?.onboarding?.phoneOtp || null;
  if (sanitizedOwnerPhone) {
    const ownerDigits = normalizePhoneForVerification(sanitizedOwnerPhone);
    const verifiedDigits = normalizePhoneForVerification(onboardingPhoneOtp?.phoneNumber || '');
    if (!onboardingPhoneOtp?.verified || !verifiedDigits || verifiedDigits !== ownerDigits) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Phone verification is required before saving onboarding setup.'
      );
    }
  }

  const previousProfile = await TenantOnboarding.findOne({ tenantId }).lean();
  const previousSettings = await GlobalSettings.findOne({ tenantId }).lean();
  const previousRootNode = await Nodes.findOne({
    tenantId,
    parent: null,
    deletedAt: null,
  })
    .select('_id name level address city state country nodeStructures')
    .populate('level', 'name')
    .lean();

  const level = await getOrCreateLevel({
    tenantId,
    levelName: rootLevelName,
    preferredRank: 0,
  });
  const structure = await getOrCreateStructureForLevel({
    tenantId,
    levelId: level._id,
    levelName: level.name,
    ownerId: user._id,
  });
  const rootNode = await getOrCreateRootNode({
    tenantId,
    levelId: level._id,
    structureId: structure._id,
    nodeName: rootNodeName,
    nodeAddress: rootNodeAddress,
    nodeStructures,
    country: company.country,
    state: company.state,
    city: company.city,
  });

  const ownerAlreadyAssigned = (rootNode.users || []).some(
    (id) => String(id) === String(user._id)
  );
  if (!ownerAlreadyAssigned) {
    rootNode.users = [...(rootNode.users || []), user._id];
    await rootNode.save();
  }

  user.phoneNumber = sanitizeText(sanitizedOwnerPhone, user.phoneNumber || '');
  user.profile = user.profile || {};
  user.profile.officeTitle = sanitizeText(owner.roleTitle, user.profile.officeTitle || 'Owner');
  if (sanitizeText(company.address)) {
    user.profile.residentialAddress = sanitizeText(company.address);
  }
  await user.save();

  await GlobalSettings.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        organizationName: companyName,
        contactEmail: sanitizedCompanyEmail,
        contactPhone: sanitizeText(sanitizedCompanyPhone, user.phoneNumber || ''),
        timezone: sanitizedTimezone,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const profile = await TenantOnboarding.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        ownerUserId: user._id,
        company: {
          name: companyName,
          email: sanitizedCompanyEmail,
          phone: sanitizedCompanyPhone,
          industry: sanitizedIndustry,
          size: sanitizedCompanySize,
          timezone: sanitizedTimezone,
          country: sanitizeText(company.country),
          state: sanitizeText(company.state),
          city: sanitizeText(company.city),
          address: sanitizeText(company.address),
        },
        owner: {
          roleTitle: sanitizeText(owner.roleTitle, 'Owner'),
          phoneNumber: sanitizedOwnerPhone,
        },
        node: {
          rootNodeId: rootNode._id,
          rootNodeName,
          rootLevelName: level.name,
          rootNodeAddress,
          nodeStructures,
        },
        draftProgress: {
          currentIndex: 0,
          phase: 'completed',
          skipped: {},
          lastSavedAt: new Date(),
        },
        completedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const onboardingBefore = {
    company: {
      name: sanitizeText(
        previousProfile?.company?.name,
        previousSettings?.organizationName || ''
      ),
      email: sanitizeText(previousProfile?.company?.email, previousSettings?.contactEmail || ''),
      phone: sanitizeText(previousProfile?.company?.phone, previousSettings?.contactPhone || ''),
      industry: sanitizeText(previousProfile?.company?.industry),
      size: sanitizeText(previousProfile?.company?.size),
      timezone: sanitizeText(previousProfile?.company?.timezone, previousSettings?.timezone || ''),
      country: sanitizeText(previousProfile?.company?.country),
      state: sanitizeText(previousProfile?.company?.state),
      city: sanitizeText(previousProfile?.company?.city),
      address: sanitizeText(previousProfile?.company?.address),
    },
    owner: {
      phoneNumber: sanitizeText(previousProfile?.owner?.phoneNumber, user.phoneNumber || ''),
      roleTitle: sanitizeText(previousProfile?.owner?.roleTitle, user?.profile?.officeTitle || ''),
    },
    node: {
      rootNodeName: sanitizeText(previousProfile?.node?.rootNodeName, previousRootNode?.name || ''),
      rootLevelName: sanitizeText(
        previousProfile?.node?.rootLevelName,
        previousRootNode?.level?.name || ''
      ),
      rootNodeAddress: sanitizeText(
        previousProfile?.node?.rootNodeAddress,
        previousRootNode?.address || ''
      ),
      nodeStructures: sanitizeBoolean(
        previousProfile?.node?.nodeStructures,
        previousRootNode?.nodeStructures || false
      ),
    },
  };

  const onboardingAfter = {
    company: {
      name: companyName,
      email: sanitizedCompanyEmail,
      phone: sanitizedCompanyPhone,
      industry: sanitizedIndustry,
      size: sanitizedCompanySize,
      timezone: sanitizedTimezone,
      country: sanitizeText(company.country),
      state: sanitizeText(company.state),
      city: sanitizeText(company.city),
      address: sanitizeText(company.address),
    },
    owner: {
      phoneNumber: sanitizedOwnerPhone,
      roleTitle: sanitizeText(owner.roleTitle, 'Owner'),
    },
    node: {
      rootNodeName,
      rootLevelName: level.name,
      rootNodeAddress,
      nodeStructures,
    },
  };

  const changedFields = buildChangedFieldList(onboardingBefore, onboardingAfter);

  logger.info('[TenantOnboarding] onboarding_completed', {
    event: 'tenant_onboarding_completed',
    tenantId,
    userId: String(user._id),
    timestamp: new Date().toISOString(),
    changedFields,
    rootNodeId: String(rootNode._id),
    rootLevelId: String(level._id),
    structureId: String(structure._id),
  });

  return {
    tenantId,
    completed: true,
    companyName,
    rootNode: {
      id: String(rootNode._id),
      name: rootNode.name,
      levelName: level.name,
    },
    profile,
  };
};

module.exports = {
  getOnboardingStatus,
  saveOnboardingDraft,
  completeOnboarding,
};
