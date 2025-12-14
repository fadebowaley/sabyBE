const httpStatus = require('http-status');
const { BaselineIntelligence, User, Nodes } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { redisClient } = require('../config/redis');
const crypto = require('crypto');
const { 
  analyzeCustomFields, 
  getCustomFieldConfig 
} = require('./customFieldAnalytics.service');
const baselineAnalysisConfigService = require('./baselineAnalysisConfig.service');
const { applyFieldGroups } = require('./fieldGrouping.service');
const { applyCustomCalculations } = require('./customCalculations.service');

// ============================================================================
// OPTIMIZATION: Config Caching (Phase 1)
// Cache tenant configs for 1 hour to reduce database queries
// ============================================================================
const configCache = new Map();

const getConfigsCached = async (tenantId) => {
  const cacheKey = `configs:${tenantId}`;

  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey);
  }

  // Load all configs in parallel
  const [
    userAnalysisConfig,
    nodeAnalysisConfig,
    userCustomFieldConfig,
    nodeCustomFieldConfig,
  ] = await Promise.all([
    baselineAnalysisConfigService.getAnalysisConfig(tenantId, 'user'),
    baselineAnalysisConfigService.getAnalysisConfig(tenantId, 'node'),
    getCustomFieldConfig(tenantId, 'user'),
    getCustomFieldConfig(tenantId, 'node'),
  ]);

  const configs = {
    userAnalysisConfig,
    nodeAnalysisConfig,
    userCustomFieldConfig,
    nodeCustomFieldConfig,
  };

  configCache.set(cacheKey, configs);

  // Cache for 1 hour
  setTimeout(() => configCache.delete(cacheKey), 3600000);

  return configs;
};

// ============================================================================
// OPTIMIZATION: Debounced Network Recomputation (Phase 2)
// Prevent multiple network recomputations for rapid changes
// ============================================================================
const networkRecomputeQueue = new Map();

const scheduleNetworkRecompute = (tenantId, delay = 30000) => {
  // Cancel existing timer if present
  if (networkRecomputeQueue.has(tenantId)) {
    clearTimeout(networkRecomputeQueue.get(tenantId));
  }

  // Schedule new recomputation after delay
  const timeoutId = setTimeout(async () => {
    try {
      logger.info(
        `[Debounced] Recomputing network baseline for tenant ${tenantId}`
      );
      const networkBaselineData = await computeNetworkBaseline(tenantId);
      await saveBaseline(networkBaselineData);
      await invalidateCache(tenantId, null);
      networkRecomputeQueue.delete(tenantId);
    } catch (error) {
      logger.error(
        `Error in debounced network recompute for ${tenantId}:`,
        error
      );
    }
  }, delay);

  networkRecomputeQueue.set(tenantId, timeoutId);
  logger.info(
    `[Debounced] Network recompute scheduled for tenant ${tenantId} in ${delay}ms`
  );
};

/**
 * Baseline Intelligence Service
 * Computes and manages structural analytics for nodes and networks
 */

/**
 * Calculate age from date of birth
 * @param {Date} dateOfBirth
 * @returns {number} age in years
 */
const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

/**
 * Categorize age into groups
 * @param {number} age
 * @param {Array} customGroups - Custom age groups from config (optional)
 * @returns {string} age group key
 */
const categorizeAge = (age, customGroups = null) => {
  if (age === null || age === undefined) return 'unknown';

  // Use custom groups if provided
  if (customGroups && Array.isArray(customGroups) && customGroups.length > 0) {
    for (const group of customGroups) {
      if (age >= group.min && age <= group.max) {
        return group.name.toLowerCase().replace(/\s+/g, ''); // Convert to key format
      }
    }
    // If no custom group matches, fall back to default
  }

  // Default age groups
  if (age <= 18) return 'under18';
  if (age <= 30) return '19to30';
  if (age <= 45) return '31to45';
  if (age <= 60) return '46to60';
  return 'over60';
};

/**
 * Generate hash of source data for change detection
 * @param {Array} users
 * @param {Object} node
 * @returns {string} hash
 */
const generateSourceDataHash = (users, node) => {
  const data = {
    users: users.map((u) => ({
      id: u._id,
      status: u.status,
      gender: u.profile?.gender,
      dateOfBirth: u.profile?.dateOfBirth,
      maritalStatus: u.profile?.maritalStatus,
      roles: u.roles,
      isEmailVerified: u.isEmailVerified,
      isPhoneVerified: u.isPhoneVerified,
      customFields: u.customFields,
      updatedAt: u.updatedAt,
    })),
    node: node
      ? {
          id: node._id,
          profile: node.profile,
          dateOfEstablishment: node.dateOfEstablishment,
          customFields: node.customFields,
          updatedAt: node.updatedAt,
        }
      : null,
  };

  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
};

/**
 * Compute user demographics and composition metrics
 * @param {Array} users - Array of user documents with populated roles
 * @param {Object} analysisConfig - BaselineAnalysisConfig (optional, for backward compatibility)
 * @returns {Object} user metrics
 */
const computeUserMetrics = async (users, analysisConfig = null) => {
  const metrics = {
    total: users.length,
    active: 0,
    inactive: 0,
    verification: {
      email: 0,
      phone: 0,
      emailRate: 0,
      phoneRate: 0,
    },
    demographics: {
      gender: {
        male: 0,
        female: 0,
        other: 0,
        unknown: 0,
      },
      ageGroups: {
        under18: 0,
        '19to30': 0,
        '31to45': 0,
        '46to60': 0,
        over60: 0,
        unknown: 0,
      },
      maritalStatus: {
        single: 0,
        married: 0,
        divorced: 0,
        widowed: 0,
        unknown: 0,
      },
      averageAge: 0,
    },
    // Hierarchy removed - we only focus on Role model roles, not system roles
    // hierarchy: {
    //   owners: 0,
    //   supers: 0,
    //   ordinary: 0,
    //   sabyUsers: 0,
    // },
    roles: [],
    geography: [],
    professional: [],
    officeTitles: [], // Office titles distribution (Pastor, HOD, Bishop, etc.)
    qualifications: [], // Academic qualifications distribution
  };

  if (users.length === 0) return metrics;

  // Get essential metrics config (with defaults if not provided)
  const essentialMetrics = analysisConfig?.essentialMetrics || {};
  const demographicsConfig = essentialMetrics.demographics || {
    enabled: true,
    analysis: {},
  };
  // Hierarchy config removed - we only focus on Role model roles, not system roles
  // const hierarchyConfig = essentialMetrics.hierarchy || { enabled: true, analysis: {} };
  const geographyConfig = essentialMetrics.geography || {
    enabled: true,
    analysis: {},
  };
  const professionalConfig = essentialMetrics.professional || {
    enabled: true,
    analysis: {},
  };
  const verificationConfig = essentialMetrics.verification || {
    enabled: true,
    analysis: {},
  };

  // Role mapping and terminology removed - we only focus on Role model roles
  // const roleMapping = hierarchyConfig.analysis?.roleMapping || {};
  // const terminology = hierarchyConfig.analysis?.terminology || {};

  const roleMap = new Map();
  const geoMap = new Map();
  const profMap = new Map();
  const officeTitleMap = new Map();
  const qualificationMap = new Map();
  let totalAge = 0;
  let ageCount = 0;

  for (const user of users) {
    // Status
    if (user.status) {
      metrics.active++;
    } else {
      metrics.inactive++;
    }

    // Verification (only if enabled)
    if (verificationConfig.enabled !== false) {
      if (
        verificationConfig.analysis?.email?.enabled !== false &&
        user.isEmailVerified
      ) {
        metrics.verification.email++;
      }
      if (
        verificationConfig.analysis?.phone?.enabled !== false &&
        user.isPhoneVerified
      ) {
        metrics.verification.phone++;
      }
    }

    // Demographics (only if enabled)
    if (demographicsConfig.enabled !== false) {
      // Gender
      if (demographicsConfig.analysis?.gender?.enabled !== false) {
        const gender = user.profile?.gender?.toLowerCase();
        if (gender === 'male') {
          metrics.demographics.gender.male++;
        } else if (gender === 'female') {
          metrics.demographics.gender.female++;
        } else if (gender === 'other') {
          metrics.demographics.gender.other++;
        } else {
          metrics.demographics.gender.unknown++;
        }
      }

      // Age
      if (demographicsConfig.analysis?.age?.enabled !== false) {
        const age = calculateAge(user.profile?.dateOfBirth);
        if (age !== null) {
          totalAge += age;
          ageCount++;
          // Use custom age groups if configured, otherwise use default
          const ageGroup = categorizeAge(
            age,
            demographicsConfig.analysis?.age?.ageGroups?.customGroups
          );
          metrics.demographics.ageGroups[ageGroup]++;
        } else {
          metrics.demographics.ageGroups.unknown++;
        }
      }

      // Marital Status
      if (demographicsConfig.analysis?.maritalStatus?.enabled !== false) {
        const maritalStatus = user.profile?.maritalStatus?.toLowerCase();
        if (
          ['single', 'married', 'divorced', 'widowed'].includes(maritalStatus)
        ) {
          metrics.demographics.maritalStatus[maritalStatus]++;
        } else {
          metrics.demographics.maritalStatus.unknown++;
        }
      }
    }

    // Hierarchy computation removed - we only focus on Role model roles, not system roles
    // If hierarchy/leadership metrics are needed in the future, they should be calculated
    // based on role mapping configuration in BaselineAnalysisConfig

    // Roles (always computed, but can be filtered later)
    if (user.roles && user.roles.length > 0) {
      for (const role of user.roles) {
        const roleKey = role._id ? role._id.toString() : role.toString();
        const roleName = role.name || 'Unknown Role';

        if (roleMap.has(roleKey)) {
          roleMap.set(roleKey, {
            ...roleMap.get(roleKey),
            count: roleMap.get(roleKey).count + 1,
          });
        } else {
          roleMap.set(roleKey, {
            roleId: role._id || role,
            roleName,
            count: 1,
          });
        }
      }
    }

    // Geography (only if enabled)
    if (geographyConfig.enabled !== false) {
      const state = user.profile?.stateOfResidence;
      const lga = user.profile?.lgaOfResidence;
      if (state) {
        const geoKey = `${state}|${lga || ''}`;
        if (geoMap.has(geoKey)) {
          geoMap.set(geoKey, geoMap.get(geoKey) + 1);
        } else {
          geoMap.set(geoKey, 1);
        }
      }
    }

    // Professional (only if enabled)
    if (professionalConfig.enabled !== false) {
      const occupation = user.profile?.occupation;
      const category = user.profile?.employmentCategory;
      if (occupation || category) {
        const profKey = `${category || 'Unknown'}|${occupation || 'Unknown'}`;
        if (profMap.has(profKey)) {
          profMap.set(profKey, profMap.get(profKey) + 1);
        } else {
          profMap.set(profKey, 1);
        }
      }
    }

    // Office Titles (always computed for dashboard)
    const officeTitle = user.profile?.officeTitle;
    if (officeTitle && typeof officeTitle === 'string' && officeTitle.trim()) {
      const titleKey = officeTitle.trim();
      if (officeTitleMap.has(titleKey)) {
        officeTitleMap.set(titleKey, officeTitleMap.get(titleKey) + 1);
      } else {
        officeTitleMap.set(titleKey, 1);
      }
    }

    // Academic Qualifications (always computed for dashboard)
    const qualification = user.profile?.highestQualification;
    if (
      qualification &&
      typeof qualification === 'string' &&
      qualification.trim()
    ) {
      const qualKey = qualification.trim();
      if (qualificationMap.has(qualKey)) {
        qualificationMap.set(qualKey, qualificationMap.get(qualKey) + 1);
      } else {
        qualificationMap.set(qualKey, 1);
      }
    }
  }

  // Calculate rates and averages (only if enabled)
  if (verificationConfig.enabled !== false) {
    metrics.verification.emailRate =
      users.length > 0
        ? Math.round((metrics.verification.email / users.length) * 100)
        : 0;
    metrics.verification.phoneRate =
      users.length > 0
        ? Math.round((metrics.verification.phone / users.length) * 100)
        : 0;
  }

  if (
    demographicsConfig.enabled !== false &&
    demographicsConfig.analysis?.age?.enabled !== false
  ) {
    metrics.demographics.averageAge =
      ageCount > 0 ? Math.round(totalAge / ageCount) : 0;
  }

  // Convert maps to arrays
  metrics.roles = Array.from(roleMap.values());

  if (geographyConfig.enabled !== false) {
    metrics.geography = Array.from(geoMap.entries()).map(([key, count]) => {
      const [state, lga] = key.split('|');
      return { state, lga: lga || null, count };
    });
  } else {
    metrics.geography = [];
  }

  if (professionalConfig.enabled !== false) {
    metrics.professional = Array.from(profMap.entries()).map(([key, count]) => {
      const [category, occupation] = key.split('|');
      return { category, occupation, count };
    });
  } else {
    metrics.professional = [];
  }

  // Convert office titles map to array, sorted by count descending
  metrics.officeTitles = Array.from(officeTitleMap.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count);

  // Convert qualifications map to array, sorted by count descending
  metrics.qualifications = Array.from(qualificationMap.entries())
    .map(([qualification, count]) => ({ qualification, count }))
    .sort((a, b) => b.count - a.count);

  // Debug logging for office titles and qualifications
  logger.info(
    `[Baseline] Office Titles: ${metrics.officeTitles.length} titles, Qualifications: ${metrics.qualifications.length} qualifications`
  );
  if (metrics.officeTitles.length === 0 && users.length > 0) {
    const sampleUsers = users.slice(0, 5).map((u) => ({
      hasProfile: !!u.profile,
      officeTitle: u.profile?.officeTitle,
    }));
    logger.warn(
      `[Baseline] No office titles found in ${users.length} users. Sample:`,
      JSON.stringify(sampleUsers)
    );
  }
  if (metrics.qualifications.length === 0 && users.length > 0) {
    const sampleUsers = users.slice(0, 5).map((u) => ({
      hasProfile: !!u.profile,
      highestQualification: u.profile?.highestQualification,
    }));
    logger.warn(
      `[Baseline] No qualifications found in ${users.length} users. Sample:`,
      JSON.stringify(sampleUsers)
    );
  }

  // Terminology removed - we only focus on Role model roles, not system roles
  // if (terminology && Object.keys(terminology).length > 0) {
  //   metrics.terminology = terminology;
  // }

  return metrics;
};

/**
 * Compute facility metrics for a node
 * @param {Object} node - Node document
 * @param {Object} analysisConfig - BaselineAnalysisConfig (optional, for backward compatibility)
 * @returns {Object} facility metrics
 */
const computeFacilityMetrics = (node, analysisConfig = null) => {
  // Get facility config (with defaults if not provided)
  const facilityConfig = analysisConfig?.essentialMetrics?.facility || {
    enabled: true,
    analysis: {},
  };

  // Only compute if enabled
  if (facilityConfig.enabled === false) {
    return {
      propertyStatus: null,
      facilityStatus: null,
      buildingType: null,
      estimatedValue: 0,
      establishmentAge: 0,
      location: {},
      hierarchy: {},
    };
  }

  const establishmentAge = node.dateOfEstablishment
    ? new Date().getFullYear() -
      new Date(node.dateOfEstablishment).getFullYear()
    : 0;

  const metrics = {
    location: {
      city: node.city || '',
      state: node.state || '',
      country: node.country || '',
      postalCode: node.postalCode || '',
    },
    hierarchy: {
      level: node.level?.name || 'Unknown',
      depth: node.path ? node.path.split('/').length : 0,
      parentCount: node.identity ? node.identity.length : 0,
      childCount: 0, // Will be computed separately if needed
    },
  };

  // Only include facility-specific metrics if enabled
  if (facilityConfig.analysis?.propertyStatus?.enabled !== false) {
    metrics.propertyStatus = node.profile?.propertyStatus || 'Unknown';
  }

  if (facilityConfig.analysis?.facilityStatus?.enabled !== false) {
    metrics.facilityStatus = node.profile?.facilityStatus || 'Unknown';
  }

  if (facilityConfig.analysis?.buildingType?.enabled !== false) {
    metrics.buildingType = node.profile?.buildingType || 'Unknown';
  }

  metrics.estimatedValue = node.profile?.estimatedValue || 0;
  metrics.establishmentAge = establishmentAge;

  // Add attendance and income metrics
  metrics.averageAttendance = node.profile?.averageAttendance || 0;
  metrics.averageIncome = node.profile?.averageIncome || 0;

  return metrics;
};

/**
 * Compute baseline for a specific node
 * @param {string} nodeId
 * @param {string} tenantId
 * @returns {Promise<Object>} computed baseline
 */
const computeNodeBaseline = async (nodeId, tenantId) => {
  const startTime = Date.now();

  try {
    logger.info(`Computing baseline for node ${nodeId} in tenant ${tenantId}`);

    // Get node with populated references
    // Check if nodeId is an ObjectId or a string nodeId
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(nodeId);
    const query = isObjectId
      ? { _id: nodeId, tenantId }
      : { nodeId: nodeId, tenantId };

    const node = await Nodes.findOne(query).populate([
      'level',
      'structure',
      'users',
    ]);

    if (!node) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
    }

    // OPTIMIZATION: Use cached configs (Phase 1)
    const {
      userAnalysisConfig,
      nodeAnalysisConfig,
      userCustomFieldConfig,
      nodeCustomFieldConfig,
    } = await getConfigsCached(tenantId);

    // Get users in this node with populated roles (OPTIMIZATION: Use .lean())
    const users = await User.find({
      _id: { $in: node.users },
      tenantId,
    })
      .populate('roles')
      .lean();

    // Compute metrics with config
    const userMetrics = await computeUserMetrics(users, userAnalysisConfig);
    const facilityMetrics = computeFacilityMetrics(node, nodeAnalysisConfig);

    const userCustomAnalytics = analyzeCustomFields(
      users,
      userCustomFieldConfig
    );
    const nodeCustomAnalytics = analyzeCustomFields(
      [node],
      nodeCustomFieldConfig
    );

    let metrics = {
      users: userMetrics,
      facility: facilityMetrics,
      customAnalytics: {
        users: userCustomAnalytics,
        node: nodeCustomAnalytics,
      },
    };

    // Apply custom calculations if configured
    if (userAnalysisConfig?.globalSettings?.customCalculations) {
      metrics = applyCustomCalculations(
        metrics,
        userAnalysisConfig.globalSettings.customCalculations
      );
    }

    // Apply field groups if configured
    if (userAnalysisConfig?.globalSettings?.fieldGroups) {
      metrics = applyFieldGroups(
        metrics,
        userAnalysisConfig.globalSettings.fieldGroups
      );
    }

    // Generate source data hash
    const sourceDataHash = generateSourceDataHash(users, node);

    const computationDuration = Date.now() - startTime;

    logger.info(
      `Node baseline computed in ${computationDuration}ms for node ${nodeId}`
    );

    return {
      tenantId,
      nodeId: node.nodeId,
      type: 'node',
      metrics,
      sourceDataHash,
      computationDuration,
    };
  } catch (error) {
    logger.error(`Error computing node baseline for ${nodeId}:`, error);
    throw error;
  }
};

/**
 * Helper function to get parent node name
 * @param {Object} node - Node document with populated parent
 * @param {Array} allNodes - All nodes in the tenant (for lookup)
 * @returns {string} Parent node name or 'N/A'
 */
const getParentNodeName = (node, allNodes) => {
  // If parent is populated, return its name
  if (node.parent && typeof node.parent === 'object') {
    return node.parent.name || 'N/A';
  }

  // If parent is an ID, look it up in allNodes
  if (node.parent && typeof node.parent === 'string') {
    const parentNode = allNodes.find(
      (n) => n._id && n._id.toString() === node.parent.toString()
    );
    if (parentNode) {
      return parentNode.name || 'N/A';
    }
  }

  // Check identity array for first parent
  if (
    node.identity &&
    Array.isArray(node.identity) &&
    node.identity.length > 0
  ) {
    const firstParentId = node.identity[0];
    const parentNode = allNodes.find(
      (n) => n._id && n._id.toString() === firstParentId.toString()
    );
    if (parentNode) {
      return parentNode.name || 'N/A';
    }
  }

  return 'N/A';
};

const computeNetworkBaseline = async (tenantId) => {
  const startTime = Date.now();

  try {
    logger.info(`Computing network baseline for tenant ${tenantId}`);

    // OPTIMIZATION: Use cached configs (Phase 1)
    const {
      userAnalysisConfig,
      nodeAnalysisConfig,
      userCustomFieldConfig,
      nodeCustomFieldConfig,
    } = await getConfigsCached(tenantId);

    // OPTIMIZATION: Use projections and .lean() for better performance (Phase 1)
    const nodes = await Nodes.find(
      { tenantId, deletedAt: null },
      {
        nodeId: 1,
        name: 1,
        level: 1,
        structure: 1,
        parent: 1,
        state: 1,
        country: 1,
        path: 1,
        isActive: 1,
        users: 1,
        'profile.averageAttendance': 1,
        'profile.averageIncome': 1,
        'profile.propertyStatus': 1,
        'profile.facilityStatus': 1,
        'profile.buildingType': 1,
        'profile.estimatedValue': 1,
        dateOfEstablishment: 1,
        customFields: 1,
      }
    )
      .populate(['level', 'structure', 'parent'])
      .lean();

    // OPTIMIZATION: Use projections and .lean() for users (Phase 1)
    const users = await User.find({ tenantId })
      .select(
        'status profile roles isEmailVerified isPhoneVerified customFields _id'
      )
      .populate('roles')
      .lean();

    // Compute aggregated user metrics with config
    const userMetrics = await computeUserMetrics(users, userAnalysisConfig);

    // Compute network-specific metrics
    const networkMetrics = {
      totalNodes: nodes.length,
      activeNodes: nodes.filter((n) => n.isActive).length,
      inactiveNodes: nodes.filter((n) => !n.isActive).length,

      nodesByType: [],
      nodesByProperty: {
        owned: 0,
        rented: 0,
        leased: 0,
        other: 0,
      },
      nodesByFacility: {
        active: 0,
        inactive: 0,
        underConstruction: 0,
      },
      regionalDistribution: [],
      stateDistribution: [], // Distribution by state (node.state)
      structureDistribution: [], // Distribution by structure name (node.structure.name)
      hierarchyStats: {
        maxDepth: 0,
        averageDepth: 0,
        totalLevels: 0,
      },
      establishmentStats: {
        averageAge: 0,
        oldestNode: 0,
        newestNode: 0,
      },
      attendance: {
        total: 0,
        average: 0,
        top10: [],
      },
      income: {
        total: 0,
        average: 0,
        top10: [],
      },
    };

    // Aggregate node statistics
    const typeMap = new Map();
    const regionMap = new Map();
    const stateMap = new Map(); // For state distribution
    const structureMap = new Map(); // For structure (family) distribution
    const levelSet = new Set();
    let totalDepth = 0;
    let totalAge = 0;
    let ageCount = 0;
    let oldestAge = 0;
    let newestAge = Infinity;
    let totalAttendance = 0;
    let attendanceCount = 0;
    let totalIncome = 0;
    let incomeCount = 0;
    const attendanceNodes = [];
    const incomeNodes = [];

    for (const node of nodes) {
      // Node types
      const structureType = node.structure?.type || 'unknown';
      const levelName = node.level?.name || 'unknown';
      const typeKey = `${structureType}|${levelName}`;

      if (typeMap.has(typeKey)) {
        typeMap.set(typeKey, typeMap.get(typeKey) + 1);
      } else {
        typeMap.set(typeKey, 1);
      }

      // Property status
      const propertyStatus = node.profile?.propertyStatus?.toLowerCase();
      if (['owned', 'rented', 'leased'].includes(propertyStatus)) {
        networkMetrics.nodesByProperty[propertyStatus]++;
      } else {
        networkMetrics.nodesByProperty.other++;
      }

      // Facility status
      const facilityStatus = node.profile?.facilityStatus?.toLowerCase();
      if (facilityStatus === 'active') {
        networkMetrics.nodesByFacility.active++;
      } else if (facilityStatus === 'inactive') {
        networkMetrics.nodesByFacility.inactive++;
      } else if (facilityStatus === 'under construction') {
        networkMetrics.nodesByFacility.underConstruction++;
      }

      // State distribution (by node.state)
      const state = node.state || 'Unknown';
      if (stateMap.has(state)) {
        stateMap.set(state, stateMap.get(state) + 1);
      } else {
        stateMap.set(state, 1);
      }

      // Structure distribution (by node.structure.name - Node Family)
      const structureName = node.structure?.name || 'Unknown';
      if (structureMap.has(structureName)) {
        structureMap.set(structureName, structureMap.get(structureName) + 1);
      } else {
        structureMap.set(structureName, 1);
      }

      // Regional distribution (for backward compatibility)
      const region = node.state || 'Unknown';
      const country = node.country || 'Unknown';
      const regionKey = `${region}|${country}`;

      if (regionMap.has(regionKey)) {
        const existing = regionMap.get(regionKey);
        regionMap.set(regionKey, {
          ...existing,
          nodes: existing.nodes + 1,
          users: existing.users + (node.users ? node.users.length : 0),
        });
      } else {
        regionMap.set(regionKey, {
          region,
          country,
          nodes: 1,
          users: node.users ? node.users.length : 0,
        });
      }

      // Hierarchy stats
      if (node.level?.name) levelSet.add(node.level.name);
      const depth = node.path ? node.path.split('/').length : 0;
      totalDepth += depth;
      networkMetrics.hierarchyStats.maxDepth = Math.max(
        networkMetrics.hierarchyStats.maxDepth,
        depth
      );

      // Establishment stats
      if (node.dateOfEstablishment) {
        const age =
          new Date().getFullYear() -
          new Date(node.dateOfEstablishment).getFullYear();
        totalAge += age;
        ageCount++;
        oldestAge = Math.max(oldestAge, age);
        newestAge = Math.min(newestAge, age);
      }

      // Attendance stats
      const attendance = node.profile?.averageAttendance || 0;
      if (attendance > 0) {
        totalAttendance += attendance;
        attendanceCount++;
        const parentName = getParentNodeName(node, nodes);
        attendanceNodes.push({
          nodeId: node.nodeId,
          name: node.name,
          levelName: node.level?.name || 'Unknown',
          structureName: node.structure?.name || 'Unknown',
          parentName: parentName, // Parent node name
          attendance,
        });
      }

      // Income stats
      const income = node.profile?.averageIncome;
      if (income) {
        const incomeValue =
          typeof income === 'object' && income.toString
            ? parseFloat(income.toString())
            : parseFloat(income) || 0;
        if (incomeValue > 0) {
          totalIncome += incomeValue;
          incomeCount++;
          const parentName = getParentNodeName(node, nodes);
          incomeNodes.push({
            nodeId: node.nodeId,
            name: node.name,
            levelName: node.level?.name || 'Unknown',
            structureName: node.structure?.name || 'Unknown',
            parentName: parentName, // Parent node name
            income: incomeValue,
          });
        }
      }
    }

    // Finalize network metrics
    networkMetrics.nodesByType = Array.from(typeMap.entries()).map(
      ([key, count]) => {
        const [structureType, levelName] = key.split('|');
        return { structureType, levelName, count };
      }
    );

    networkMetrics.regionalDistribution = Array.from(regionMap.values());

    // State distribution - sorted by count descending
    networkMetrics.stateDistribution = Array.from(stateMap.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);

    // Structure distribution (Node Family) - sorted by count descending
    networkMetrics.structureDistribution = Array.from(structureMap.entries())
      .map(([structureName, count]) => ({ structureName, count }))
      .sort((a, b) => b.count - a.count);

    networkMetrics.hierarchyStats.averageDepth =
      nodes.length > 0 ? Math.round(totalDepth / nodes.length) : 0;
    networkMetrics.hierarchyStats.totalLevels = levelSet.size;

    networkMetrics.establishmentStats.averageAge =
      ageCount > 0 ? Math.round(totalAge / ageCount) : 0;
    networkMetrics.establishmentStats.oldestNode = oldestAge;
    networkMetrics.establishmentStats.newestNode =
      newestAge === Infinity ? 0 : newestAge;

    // Calculate attendance statistics
    networkMetrics.attendance.total = totalAttendance;
    networkMetrics.attendance.average =
      attendanceCount > 0 ? Math.round(totalAttendance / attendanceCount) : 0;
    networkMetrics.attendance.top10 = attendanceNodes
      .sort((a, b) => b.attendance - a.attendance)
      .slice(0, 10)
      .map((node, index) => ({
        rank: index + 1,
        nodeId: node.nodeId,
        name: node.name,
        levelName: node.levelName,
        structureName: node.structureName,
        parentName: node.parentName || 'N/A', // Parent node name
        attendance: node.attendance,
      }));

    // OPTIMIZATION: Single-pass range distribution calculation (Phase 2)
    // Pre-sort once for better performance
    attendanceNodes.sort((a, b) => a.attendance - b.attendance);

    // Initialize ranges with data containers
    const ranges = [
      { label: '< 50', min: 0, max: 49, nodes: [], totalAtt: 0, totalFin: 0 },
      {
        label: '50 - 100',
        min: 50,
        max: 100,
        nodes: [],
        totalAtt: 0,
        totalFin: 0,
      },
      {
        label: '101 - 200',
        min: 101,
        max: 200,
        nodes: [],
        totalAtt: 0,
        totalFin: 0,
      },
      {
        label: '201 - 500',
        min: 201,
        max: 500,
        nodes: [],
        totalAtt: 0,
        totalFin: 0,
      },
      {
        label: '501 - 1,000',
        min: 501,
        max: 1000,
        nodes: [],
        totalAtt: 0,
        totalFin: 0,
      },
      {
        label: '1,001 - 2,000',
        min: 1001,
        max: 2000,
        nodes: [],
        totalAtt: 0,
        totalFin: 0,
      },
      {
        label: '> 2,000',
        min: 2001,
        max: Infinity,
        nodes: [],
        totalAtt: 0,
        totalFin: 0,
      },
    ];

    // Single pass bucketing (O(n) instead of O(n×7))
    for (const node of attendanceNodes) {
      const range = ranges.find(
        (r) => node.attendance >= r.min && node.attendance <= r.max
      );

      if (range) {
        range.nodes.push(node);
        range.totalAtt += node.attendance;

        // Get corresponding income
        const incomeNode = incomeNodes.find((n) => n.nodeId === node.nodeId);
        range.totalFin += incomeNode ? incomeNode.income : 0;
      }
    }

    // Calculate percentages and format output
    const total = attendanceNodes.length;
    networkMetrics.attendance.rangeDistribution = ranges
      .map((r) => ({
        range: r.label,
        min: r.min,
        max: r.max,
        count: r.nodes.length,
        totalAttendance: r.totalAtt,
        totalFinancial: r.totalFin,
        percentage: total > 0 ? (r.nodes.length / total) * 100 : 0,
      }))
      .filter((r) => r.count > 0); // Only include ranges with data

    // Calculate income statistics
    networkMetrics.income.total = totalIncome;
    networkMetrics.income.average =
      incomeCount > 0 ? Math.round(totalIncome / incomeCount) : 0;
    networkMetrics.income.top10 = incomeNodes
      .sort((a, b) => b.income - a.income)
      .slice(0, 10)
      .map((node, index) => ({
        rank: index + 1,
        nodeId: node.nodeId,
        name: node.name,
        levelName: node.levelName,
        structureName: node.structureName,
        parentName: node.parentName || 'N/A', // Parent node name
        income: node.income,
      }));

    // Analyze custom fields (using cached configs from earlier)
    const userCustomAnalytics = analyzeCustomFields(
      users,
      userCustomFieldConfig
    );
    const nodeCustomAnalytics = analyzeCustomFields(
      nodes,
      nodeCustomFieldConfig
    );

    // Debug: Log what's in userMetrics before creating metrics object
    logger.info(
      `[Baseline] userMetrics.officeTitles: ${
        userMetrics.officeTitles?.length || 0
      }, userMetrics.qualifications: ${userMetrics.qualifications?.length || 0}`
    );

    let metrics = {
      users: userMetrics,
      network: networkMetrics,
      customAnalytics: {
        users: userCustomAnalytics,
        nodes: nodeCustomAnalytics,
      },
    };

    // Debug: Log what's in metrics.users after creating metrics object
    logger.info(
      `[Baseline] metrics.users.officeTitles: ${
        metrics.users.officeTitles?.length || 0
      }, metrics.users.qualifications: ${
        metrics.users.qualifications?.length || 0
      }`
    );

    // Apply custom calculations if configured
    if (userAnalysisConfig?.globalSettings?.customCalculations) {
      metrics = applyCustomCalculations(
        metrics,
        userAnalysisConfig.globalSettings.customCalculations
      );
    }

    // Apply field groups if configured
    if (userAnalysisConfig?.globalSettings?.fieldGroups) {
      metrics = applyFieldGroups(
        metrics,
        userAnalysisConfig.globalSettings.fieldGroups
      );
    }

    const computationDuration = Date.now() - startTime;

    logger.info(
      `Network baseline computed in ${computationDuration}ms for tenant ${tenantId}`
    );

    return {
      tenantId,
      nodeId: null,
      type: 'network',
      metrics,
      computationDuration,
    };
  } catch (error) {
    logger.error(
      `Error computing network baseline for tenant ${tenantId}:`,
      error
    );
    throw error;
  }
};

/**
 * Save baseline to database and cache
 * @param {Object} baselineData
 * @param {Array} insights
 * @returns {Promise<Object>} saved baseline
 */
const saveBaseline = async (baselineData, insights = []) => {
  try {
    // Save to MongoDB
    const baseline = await BaselineIntelligence.upsertBaseline(
      baselineData.tenantId,
      baselineData.nodeId,
      baselineData.type,
      baselineData.metrics,
      insights,
      {
        computedBy: 'system',
        duration: baselineData.computationDuration,
        sourceDataHash: baselineData.sourceDataHash,
      }
    );

    // Cache in Redis
    const cacheKey = baselineData.nodeId
      ? `baseline:${baselineData.tenantId}:node:${baselineData.nodeId}`
      : `baseline:${baselineData.tenantId}:network`;

    if (redisClient) {
      await redisClient.setex(cacheKey, 3600, JSON.stringify(baseline)); // 1 hour TTL
    }

    return baseline;
  } catch (error) {
    logger.error('Error saving baseline:', error);
    throw error;
  }
};

/**
 * Get baseline from cache or database
 * @param {string} tenantId
 * @param {string} nodeId - null for network baseline
 * @returns {Promise<Object>} baseline data
 */
const getBaseline = async (tenantId, nodeId = null) => {
  try {
    // Try cache first
    const cacheKey = nodeId
      ? `baseline:${tenantId}:node:${nodeId}`
      : `baseline:${tenantId}:network`;

    if (redisClient) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug(`Baseline cache hit for ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    // Fallback to database
    const baseline = nodeId
      ? await BaselineIntelligence.getNodeBaseline(tenantId, nodeId)
      : await BaselineIntelligence.getNetworkBaseline(tenantId);

    // Cache the result
    if (baseline && redisClient) {
      await redisClient.setex(cacheKey, 3600, JSON.stringify(baseline));
    }

    return baseline;
  } catch (error) {
    logger.error('Error getting baseline:', error);
    throw error;
  }
};

/**
 * Invalidate cache for baseline
 * @param {string} tenantId
 * @param {string} nodeId - null for network baseline
 */
const invalidateCache = async (tenantId, nodeId = null) => {
  try {
    const cacheKey = nodeId
      ? `baseline:${tenantId}:node:${nodeId}`
      : `baseline:${tenantId}:network`;

    if (redisClient) {
      await redisClient.del(cacheKey);
      logger.debug(`Invalidated cache for ${cacheKey}`);
    }
  } catch (error) {
    logger.error('Error invalidating cache:', error);
  }
};

/**
 * Handle user change event (called from user model hooks)
 * @param {Object} user - User document
 */
const handleUserChange = async (user) => {
  try {
    logger.info(
      `Handling user change for user ${user._id} in tenant ${user.tenantId}`
    );

    // Find nodes this user belongs to
    const nodes = await Nodes.find({
      users: user._id,
      tenantId: user.tenantId,
    }).lean();

    // OPTIMIZATION: Parallel processing for affected nodes (Phase 1)
    await Promise.all(
      nodes.map(async (node) => {
        try {
          const baselineData = await computeNodeBaseline(
            node.nodeId,
            user.tenantId
          );
          await saveBaseline(baselineData);
          await invalidateCache(user.tenantId, node.nodeId);
        } catch (error) {
          logger.error(
            `Error computing baseline for node ${node.nodeId}:`,
            error
          );
        }
      })
    );

    // OPTIMIZATION: Debounced network recomputation (Phase 2)
    // Instead of immediate recomputation, schedule it with 30s delay
    // This batches multiple rapid changes into a single recomputation
    scheduleNetworkRecompute(user.tenantId, 30000);

    logger.info(
      `User change processed for ${user._id}, affected ${nodes.length} nodes`
    );
  } catch (error) {
    logger.error(`Error handling user change for ${user._id}:`, error);
  }
};

/**
 * Handle node change event (called from node model hooks)
 * @param {Object} node - Node document
 */
const handleNodeChange = async (node) => {
  try {
    logger.info(
      `Handling node change for node ${node._id} in tenant ${node.tenantId}`
    );

    // Recompute baseline for this node
    const baselineData = await computeNodeBaseline(node.nodeId, node.tenantId);
    await saveBaseline(baselineData);
    await invalidateCache(node.tenantId, node.nodeId);

    // OPTIMIZATION: Debounced network recomputation (Phase 2)
    // Schedule network recompute instead of immediate execution
    scheduleNetworkRecompute(node.tenantId, 30000);

    logger.info(`Node change processed for ${node._id}`);
  } catch (error) {
    logger.error(`Error handling node change for ${node._id}:`, error);
  }
};

/**
 * Compute all baselines for a tenant (manual trigger)
 * @param {string} tenantId
 * @returns {Promise<Object>} computation summary
 */
const computeAllBaselinesForTenant = async (tenantId) => {
  const startTime = Date.now();

  try {
    logger.info(`Computing all baselines for tenant ${tenantId}`);

    // Get all nodes in tenant
    const nodes = await Nodes.find({
      tenantId,
      deletedAt: null,
    });

    const results = {
      tenantId,
      nodesProcessed: 0,
      networkProcessed: false,
      errors: [],
      duration: 0,
    };

    // OPTIMIZATION: Parallel batch processing (Phase 1)
    // Process nodes in batches of 10 concurrently instead of sequentially
    const BATCH_SIZE = 10;

    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (node) => {
          try {
            const baselineData = await computeNodeBaseline(
              node.nodeId,
              tenantId
            );
            await saveBaseline(baselineData);
            results.nodesProcessed++;
          } catch (error) {
            logger.error(
              `Error computing baseline for node ${node.nodeId}:`,
              error
            );
            results.errors.push({
              nodeId: node.nodeId,
              error: error.message,
            });
          }
        })
      );

      // Log progress
      logger.info(
        `Processed ${Math.min(i + BATCH_SIZE, nodes.length)}/${
          nodes.length
        } nodes`
      );
    }

    // Compute network baseline
    try {
      const networkBaselineData = await computeNetworkBaseline(tenantId);
      await saveBaseline(networkBaselineData);
      results.networkProcessed = true;
    } catch (error) {
      logger.error(
        `Error computing network baseline for tenant ${tenantId}:`,
        error
      );
      results.errors.push({
        type: 'network',
        error: error.message,
      });
    }

    results.duration = Date.now() - startTime;

    logger.info(
      `All baselines computed for tenant ${tenantId} in ${results.duration}ms`
    );

    return results;
  } catch (error) {
    logger.error(
      `Error computing all baselines for tenant ${tenantId}:`,
      error
    );
    throw error;
  }
};

module.exports = {
  computeNodeBaseline,
  computeNetworkBaseline,
  saveBaseline,
  getBaseline,
  invalidateCache,
  handleUserChange,
  handleNodeChange,
  computeAllBaselinesForTenant,

  // Optimization functions
  scheduleNetworkRecompute,
  getConfigsCached,

  // Utility functions for testing
  computeUserMetrics,
  computeFacilityMetrics,
  calculateAge,
  categorizeAge,
};
