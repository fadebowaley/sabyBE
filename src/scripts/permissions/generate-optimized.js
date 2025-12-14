const fs = require('fs');
const path = require('path');
const glob = require('glob');
const mongoose = require('mongoose');
const Permission = require('../../models/permission.model');
const config = require('../../config/config');
const logger = require('../../config/logger');

/**
 * Optimized Permission Generation Script
 * 
 * Generates permissions using industry-standard Resource:Action format
 * Reduces permission count from 4,742 to ~300 by consolidating path-specific permissions
 */

const HTTP_ACTION_MAP = {
  GET: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

// Standard CRUD actions for all resources
const CORE_ACTIONS = ['create', 'read', 'update', 'delete', 'manage'];

// Extended actions per resource (resource-specific operations)
const EXTENDED_ACTIONS = {
  user: ['import', 'export', 'assign', 'restore'],
  node: ['import', 'activate', 'deactivate', 'move'],
  storage: ['upload', 'download', 'share', 'move', 'copy'],
  auth: ['login', 'register', 'logout', 'refresh', 'verify', 'forgot-password', 'reset-password'],
  projectForm: ['publish', 'archive', 'submit'],
  payment: ['process', 'complete', 'cancel', 'refund'],
  role: ['assign', 'permissions'],
  apiKey: ['regenerate'],
  event: ['import', 'deleteAll'],
  program: ['assign', 'delete-all'],
  report: ['delete-all'],
  settings: ['assign'],
  inmail: ['send', 'draft'],
  level: ['activate', 'deactivate', 'move'],
  department: ['import', 'export'],
  data: ['import', 'export', 'public', 'private'],
  capture: ['bulk-create', 'export'],
  app: ['bulk-create', 'assign', 'toggle-status'],
  admin: ['assign-role'],
  projectFormSubmission: ['status'],
  submission: ['retry'],
  whatsapp: ['send-message', 'restart'],
  telegramWebApp: ['auth', 'submit'],
};

/**
 * Extract resource name from route file path
 */
const extractResource = (filePath) => {
  const filename = path.basename(filePath, '.js');
  const parts = filename.split('.');
  return parts[0]; // e.g., 'user.route.js' -> 'user'
};

/**
 * Normalize path segments to identify resource operations
 */
const normalizePath = (p) => {
  if (!p || p === '/') return '/';
  return p.startsWith('/') ? p : `/${p}`;
};

/**
 * Extract action from path (for extended actions)
 */
const extractExtendedAction = (pathStr, method, resource) => {
  const pathLower = pathStr.toLowerCase();
  const methodUpper = method.toUpperCase();
  
  // Check for extended actions based on path patterns
  const extendedActions = EXTENDED_ACTIONS[resource] || [];
  
  for (const action of extendedActions) {
    const actionLower = action.toLowerCase();
    
    // Match path segments that indicate this action
    if (pathLower.includes(actionLower) || 
        pathLower.includes(actionLower.replace('-', ''))) {
      return action;
    }
  }
  
  // Special path-based actions
  if (pathLower.includes('/bulk-import') || pathLower.includes('/bulk-create')) {
    return 'import';
  }
  if (pathLower.includes('/bulk')) {
    return 'import';
  }
  if (pathLower.includes('/export')) {
    return 'export';
  }
  if (pathLower.includes('/import')) {
    return 'import';
  }
  if (pathLower.includes('/assign')) {
    return 'assign';
  }
  if (pathLower.includes('/activate')) {
    return 'activate';
  }
  if (pathLower.includes('/deactivate')) {
    return 'deactivate';
  }
  if (pathLower.includes('/restore')) {
    return 'restore';
  }
  if (pathLower.includes('/publish')) {
    return 'publish';
  }
  if (pathLower.includes('/archive')) {
    return 'archive';
  }
  if (pathLower.includes('/submit')) {
    return 'submit';
  }
  if (pathLower.includes('/move')) {
    return 'move';
  }
  if (pathLower.includes('/share')) {
    return 'share';
  }
  if (pathLower.includes('/upload')) {
    return 'upload';
  }
  if (pathLower.includes('/download')) {
    return 'download';
  }
  
  return null;
};

/**
 * Generate permission name in Resource:Action format
 */
const generatePermissionName = (resource, action) => {
  return `${resource}:${action}`;
};

/**
 * Collect all paths and methods for a resource-action combination
 */
const collectPathsForPermission = (routes, resource, action) => {
  const paths = [];
  const methods = new Set();
  
  routes.forEach(route => {
    if (route.resource === resource && route.action === action) {
      if (!paths.includes(route.path)) {
        paths.push(route.path);
      }
      methods.add(route.method);
    }
  });
  
  return {
    paths: paths.sort(),
    methods: Array.from(methods).sort()
  };
};

/**
 * Generate optimized permissions from routes
 */
const generateOptimizedPermissions = async ({
  routesDir = 'src/routes',
  snapshotPath,
  shouldSeed = false,
  dryRun = false,
}) => {
  await connectToDB();
  
  const routeFiles = glob.sync(`${routesDir}/**/*.js`);
  const routeData = [];
  
  // Step 1: Collect all route information
  for (const file of routeFiles) {
    try {
      const router = require(path.resolve(file));
      if (!router.stack) continue;
      
      const resource = extractResource(file);
      
      router.stack.forEach((layer) => {
        if (layer.route) {
          const pathStr = normalizePath(layer.route.path);
          const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
          
          methods.forEach((method) => {
            const standardAction = HTTP_ACTION_MAP[method];
            const extendedAction = extractExtendedAction(pathStr, method, resource);
            const action = extendedAction || standardAction;
            
            routeData.push({
              resource,
              action,
              path: pathStr,
              method,
              file,
            });
          });
        }
      });
    } catch (error) {
      logger.warn(`Error processing route file ${file}: ${error.message}`);
    }
  }
  
  // Step 2: Consolidate routes into unique permissions
  const permissionMap = new Map();
  
  routeData.forEach(route => {
    const permName = generatePermissionName(route.resource, route.action);
    
    if (!permissionMap.has(permName)) {
      permissionMap.set(permName, {
        name: permName,
        resource: route.resource,
        action: route.action,
        paths: [],
        methods: new Set(),
        files: new Set(),
      });
    }
    
    const perm = permissionMap.get(permName);
    if (!perm.paths.includes(route.path)) {
      perm.paths.push(route.path);
    }
    perm.methods.add(route.method);
    perm.files.add(route.file);
  });
  
  // Step 3: Generate permission objects
  const permissions = Array.from(permissionMap.values()).map(perm => {
    // Generate description
    const actionDesc = perm.action.charAt(0).toUpperCase() + perm.action.slice(1);
    const resourceDesc = perm.resource.charAt(0).toUpperCase() + perm.resource.slice(1);
    const description = `${actionDesc} ${resourceDesc} resources`;
    
    return {
      name: perm.name,
      resource: perm.resource,
      action: perm.action,
      path: perm.paths[0] || '/', // Primary path
      method: Array.from(perm.methods)[0] || 'GET', // Primary method
      description,
      isWildcard: false,
      isAdminLevel: false,
      // Additional metadata
      paths: perm.paths, // All paths this permission covers
      methods: Array.from(perm.methods), // All methods
    };
  });
  
  // Step 4: Add manage permissions for resources with all CRUD
  const resourcesWithAllCrud = new Set();
  permissions.forEach(perm => {
    if (['create', 'read', 'update', 'delete'].includes(perm.action)) {
      resourcesWithAllCrud.add(perm.resource);
    }
  });
  
  resourcesWithAllCrud.forEach(resource => {
    const hasCreate = permissions.some(p => p.resource === resource && p.action === 'create');
    const hasRead = permissions.some(p => p.resource === resource && p.action === 'read');
    const hasUpdate = permissions.some(p => p.resource === resource && p.action === 'update');
    const hasDelete = permissions.some(p => p.resource === resource && p.action === 'delete');
    
    if (hasCreate && hasRead && hasUpdate && hasDelete) {
      // Check if manage permission already exists
      if (!permissions.some(p => p.resource === resource && p.action === 'manage')) {
        permissions.push({
          name: `${resource}:manage`,
          resource,
          action: 'manage',
          path: '/',
          method: 'ALL',
          description: `Manage all ${resource} resources (create, read, update, delete)`,
          isWildcard: false,
          isAdminLevel: false,
          paths: ['/'],
          methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        });
      }
    }
  });
  
  // Step 5: Sort permissions
  permissions.sort((a, b) => {
    if (a.resource !== b.resource) {
      return a.resource.localeCompare(b.resource);
    }
    return a.action.localeCompare(b.action);
  });
  
  // Step 6: Write snapshot
  const snapshotData = permissions.map(p => ({
    name: p.name,
    resource: p.resource,
    action: p.action,
    path: p.path,
    method: p.method,
    description: p.description,
    isWildcard: p.isWildcard,
    isAdminLevel: p.isAdminLevel,
  }));
  
  writeSnapshot(snapshotData, snapshotPath);
  
  logger.info(`✅ Generated ${permissions.length} optimized permissions`);
  logger.info(`📊 Reduction: ~${Math.round((1 - permissions.length / 4742) * 100)}% from original system`);
  
  if (dryRun) {
    logger.info('💡 Dry run - permissions not seeded');
    return permissions;
  }
  
  if (shouldSeed) {
    await seedPermissions(permissions);
  }
  
  return permissions;
};

/**
 * Seed permissions to database
 */
const seedPermissions = async (permissions) => {
  const existing = await Permission.find({});
  const existingNames = new Set(existing.map(p => p.name));
  
  const newPermissions = permissions.filter(p => !existingNames.has(p.name));
  
  if (newPermissions.length > 0) {
    await Permission.insertMany(newPermissions.map(p => ({
      name: p.name,
      resource: p.resource,
      action: p.action,
      path: p.path,
      method: p.method,
      description: p.description,
      isWildcard: p.isWildcard,
      isAdminLevel: p.isAdminLevel,
    })));
    logger.info(`✅ Seeded ${newPermissions.length} new permissions`);
  } else {
    logger.info('⚠️  No new permissions to seed');
  }
};

/**
 * MongoDB connection
 */
const connectToDB = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB for permission generation');
  } catch (err) {
    logger.error('❌ Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

/**
 * Write snapshot file
 */
const writeSnapshot = (permissions, snapshotPath) => {
  const dir = path.dirname(snapshotPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(snapshotPath, JSON.stringify(permissions, null, 2));
  logger.info(`📸 Snapshot written to ${snapshotPath}`);
};

module.exports = {
  generateOptimizedPermissions,
};

