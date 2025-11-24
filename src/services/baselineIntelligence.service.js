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
 * @returns {string} age group key
 */
const categorizeAge = (age) => {
  if (age === null || age === undefined) return 'unknown';
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
    users: users.map(u => ({
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
    node: node ? {
      id: node._id,
      profile: node.profile,
      dateOfEstablishment: node.dateOfEstablishment,
      customFields: node.customFields,
      updatedAt: node.updatedAt,
    } : null,
  };
  
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
};

/**
 * Compute user demographics and composition metrics
 * @param {Array} users - Array of user documents with populated roles
 * @returns {Object} user metrics
 */
const computeUserMetrics = async (users) => {
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
    hierarchy: {
      owners: 0,
      supers: 0,
      ordinary: 0,
      sabyUsers: 0,
    },
    roles: [],
    geography: [],
    professional: [],
  };

  if (users.length === 0) return metrics;

  const roleMap = new Map();
  const geoMap = new Map();
  const profMap = new Map();
  let totalAge = 0;
  let ageCount = 0;

  for (const user of users) {
    // Status
    if (user.status) {
      metrics.active++;
    } else {
      metrics.inactive++;
    }

    // Verification
    if (user.isEmailVerified) metrics.verification.email++;
    if (user.isPhoneVerified) metrics.verification.phone++;

    // Gender
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

    // Age
    const age = calculateAge(user.profile?.dateOfBirth);
    if (age !== null) {
      totalAge += age;
      ageCount++;
      const ageGroup = categorizeAge(age);
      metrics.demographics.ageGroups[ageGroup]++;
    } else {
      metrics.demographics.ageGroups.unknown++;
    }

    // Marital Status
    const maritalStatus = user.profile?.maritalStatus?.toLowerCase();
    if (['single', 'married', 'divorced', 'widowed'].includes(maritalStatus)) {
      metrics.demographics.maritalStatus[maritalStatus]++;
    } else {
      metrics.demographics.maritalStatus.unknown++;
    }

    // Hierarchy
    if (user.isSaby) {
      metrics.hierarchy.sabyUsers++;
    } else if (user.isOwner) {
      metrics.hierarchy.owners++;
    } else if (user.isSuper) {
      metrics.hierarchy.supers++;
    } else {
      metrics.hierarchy.ordinary++;
    }

    // Roles
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

    // Geography
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

    // Professional
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

  // Calculate rates and averages
  metrics.verification.emailRate = users.length > 0 ? 
    Math.round((metrics.verification.email / users.length) * 100) : 0;
  metrics.verification.phoneRate = users.length > 0 ? 
    Math.round((metrics.verification.phone / users.length) * 100) : 0;
  metrics.demographics.averageAge = ageCount > 0 ? 
    Math.round(totalAge / ageCount) : 0;

  // Convert maps to arrays
  metrics.roles = Array.from(roleMap.values());
  
  metrics.geography = Array.from(geoMap.entries()).map(([key, count]) => {
    const [state, lga] = key.split('|');
    return { state, lga: lga || null, count };
  });

  metrics.professional = Array.from(profMap.entries()).map(([key, count]) => {
    const [category, occupation] = key.split('|');
    return { category, occupation, count };
  });

  return metrics;
};

/**
 * Compute facility metrics for a node
 * @param {Object} node - Node document
 * @returns {Object} facility metrics
 */
const computeFacilityMetrics = (node) => {
  const establishmentAge = node.dateOfEstablishment ? 
    new Date().getFullYear() - new Date(node.dateOfEstablishment).getFullYear() : 0;

  return {
    propertyStatus: node.profile?.propertyStatus || 'Unknown',
    facilityStatus: node.profile?.facilityStatus || 'Unknown',
    buildingType: node.profile?.buildingType || 'Unknown',
    estimatedValue: node.profile?.estimatedValue || 0,
    establishmentAge,
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
    const query = isObjectId ? 
      { _id: nodeId, tenantId } : 
      { nodeId: nodeId, tenantId };
    
    const node = await Nodes.findOne(query).populate(['level', 'structure', 'users']);

    if (!node) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Node not found');
    }

    // Get users in this node with populated roles
    const users = await User.find({ 
      _id: { $in: node.users },
      tenantId 
    }).populate('roles');

    // Compute metrics
    const userMetrics = await computeUserMetrics(users);
    const facilityMetrics = computeFacilityMetrics(node);

    // Get custom field configurations and analyze custom fields
    const userCustomFieldConfig = await getCustomFieldConfig(tenantId, 'user');
    const nodeCustomFieldConfig = await getCustomFieldConfig(tenantId, 'node');
    
    const userCustomAnalytics = analyzeCustomFields(users, userCustomFieldConfig);
    const nodeCustomAnalytics = analyzeCustomFields([node], nodeCustomFieldConfig);

    const metrics = {
      users: userMetrics,
      facility: facilityMetrics,
      customAnalytics: {
        users: userCustomAnalytics,
        node: nodeCustomAnalytics,
      },
    };

    // Generate source data hash
    const sourceDataHash = generateSourceDataHash(users, node);

    const computationDuration = Date.now() - startTime;
    
    logger.info(`Node baseline computed in ${computationDuration}ms for node ${nodeId}`);

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
 * Compute network-level baseline by aggregating all node baselines
 * @param {string} tenantId 
 * @returns {Promise<Object>} computed network baseline
 */
const computeNetworkBaseline = async (tenantId) => {
  const startTime = Date.now();
  
  try {
    logger.info(`Computing network baseline for tenant ${tenantId}`);

    // Get all nodes in the tenant
    const nodes = await Nodes.find({ 
      tenantId,
      deletedAt: null 
    }).populate(['level', 'structure']);

    // Get all users in the tenant
    const users = await User.find({ 
      tenantId 
    }).populate('roles');

    // Compute aggregated user metrics
    const userMetrics = await computeUserMetrics(users);

    // Compute network-specific metrics
    const networkMetrics = {
      totalNodes: nodes.length,
      activeNodes: nodes.filter(n => n.isActive).length,
      inactiveNodes: nodes.filter(n => !n.isActive).length,
      
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
    };

    // Aggregate node statistics
    const typeMap = new Map();
    const regionMap = new Map();
    const levelSet = new Set();
    let totalDepth = 0;
    let totalAge = 0;
    let ageCount = 0;
    let oldestAge = 0;
    let newestAge = Infinity;

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

      // Regional distribution
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
      networkMetrics.hierarchyStats.maxDepth = Math.max(networkMetrics.hierarchyStats.maxDepth, depth);

      // Establishment stats
      if (node.dateOfEstablishment) {
        const age = new Date().getFullYear() - new Date(node.dateOfEstablishment).getFullYear();
        totalAge += age;
        ageCount++;
        oldestAge = Math.max(oldestAge, age);
        newestAge = Math.min(newestAge, age);
      }
    }

    // Finalize network metrics
    networkMetrics.nodesByType = Array.from(typeMap.entries()).map(([key, count]) => {
      const [structureType, levelName] = key.split('|');
      return { structureType, levelName, count };
    });

    networkMetrics.regionalDistribution = Array.from(regionMap.values());
    
    networkMetrics.hierarchyStats.averageDepth = nodes.length > 0 ? 
      Math.round(totalDepth / nodes.length) : 0;
    networkMetrics.hierarchyStats.totalLevels = levelSet.size;

    networkMetrics.establishmentStats.averageAge = ageCount > 0 ? 
      Math.round(totalAge / ageCount) : 0;
    networkMetrics.establishmentStats.oldestNode = oldestAge;
    networkMetrics.establishmentStats.newestNode = newestAge === Infinity ? 0 : newestAge;

    // Get custom field configurations and analyze custom fields
    const userCustomFieldConfig = await getCustomFieldConfig(tenantId, 'user');
    const nodeCustomFieldConfig = await getCustomFieldConfig(tenantId, 'node');
    
    const userCustomAnalytics = analyzeCustomFields(users, userCustomFieldConfig);
    const nodeCustomAnalytics = analyzeCustomFields(nodes, nodeCustomFieldConfig);

    const metrics = {
      users: userMetrics,
      network: networkMetrics,
      customAnalytics: {
        users: userCustomAnalytics,
        nodes: nodeCustomAnalytics,
      },
    };

    const computationDuration = Date.now() - startTime;
    
    logger.info(`Network baseline computed in ${computationDuration}ms for tenant ${tenantId}`);

    return {
      tenantId,
      nodeId: null,
      type: 'network',
      metrics,
      computationDuration,
    };

  } catch (error) {
    logger.error(`Error computing network baseline for tenant ${tenantId}:`, error);
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
    const cacheKey = baselineData.nodeId ? 
      `baseline:${baselineData.tenantId}:node:${baselineData.nodeId}` :
      `baseline:${baselineData.tenantId}:network`;
    
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
    const cacheKey = nodeId ? 
      `baseline:${tenantId}:node:${nodeId}` :
      `baseline:${tenantId}:network`;
    
    if (redisClient) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug(`Baseline cache hit for ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    // Fallback to database
    const baseline = nodeId ? 
      await BaselineIntelligence.getNodeBaseline(tenantId, nodeId) :
      await BaselineIntelligence.getNetworkBaseline(tenantId);

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
    const cacheKey = nodeId ? 
      `baseline:${tenantId}:node:${nodeId}` :
      `baseline:${tenantId}:network`;
    
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
    logger.info(`Handling user change for user ${user._id} in tenant ${user.tenantId}`);

    // Find nodes this user belongs to
    const nodes = await Nodes.find({ 
      users: user._id,
      tenantId: user.tenantId 
    });

    // Recompute baselines for affected nodes
    for (const node of nodes) {
      const baselineData = await computeNodeBaseline(node.nodeId, user.tenantId);
      await saveBaseline(baselineData);
      await invalidateCache(user.tenantId, node.nodeId);
    }

    // Recompute network baseline
    const networkBaselineData = await computeNetworkBaseline(user.tenantId);
    await saveBaseline(networkBaselineData);
    await invalidateCache(user.tenantId, null);

    logger.info(`User change processed for ${user._id}, affected ${nodes.length} nodes`);
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
    logger.info(`Handling node change for node ${node._id} in tenant ${node.tenantId}`);

    // Recompute baseline for this node
    const baselineData = await computeNodeBaseline(node.nodeId, node.tenantId);
    await saveBaseline(baselineData);
    await invalidateCache(node.tenantId, node.nodeId);

    // Recompute network baseline
    const networkBaselineData = await computeNetworkBaseline(node.tenantId);
    await saveBaseline(networkBaselineData);
    await invalidateCache(node.tenantId, null);

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
      deletedAt: null 
    });

    const results = {
      tenantId,
      nodesProcessed: 0,
      networkProcessed: false,
      errors: [],
      duration: 0,
    };

    // Compute node baselines
    for (const node of nodes) {
      try {
        const baselineData = await computeNodeBaseline(node.nodeId, tenantId);
        await saveBaseline(baselineData);
        results.nodesProcessed++;
      } catch (error) {
        logger.error(`Error computing baseline for node ${node.nodeId}:`, error);
        results.errors.push({
          nodeId: node.nodeId,
          error: error.message,
        });
      }
    }

    // Compute network baseline
    try {
      const networkBaselineData = await computeNetworkBaseline(tenantId);
      await saveBaseline(networkBaselineData);
      results.networkProcessed = true;
    } catch (error) {
      logger.error(`Error computing network baseline for tenant ${tenantId}:`, error);
      results.errors.push({
        type: 'network',
        error: error.message,
      });
    }

    results.duration = Date.now() - startTime;
    
    logger.info(`All baselines computed for tenant ${tenantId} in ${results.duration}ms`);
    
    return results;
  } catch (error) {
    logger.error(`Error computing all baselines for tenant ${tenantId}:`, error);
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
  
  // Utility functions for testing
  computeUserMetrics,
  computeFacilityMetrics,
  calculateAge,
  categorizeAge,
};
