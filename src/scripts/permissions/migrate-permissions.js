const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Permission = require('../../models/permission.model');
const Role = require('../../models/role.model');
const config = require('../../config/config');
const logger = require('../../config/logger');

/**
 * Permission Migration Script
 * 
 * Migrates from old path-based permissions to new Resource:Action format
 * 
 * Usage:
 *   node src/scripts/permissions/migrate-permissions.js [--dry-run] [--backup]
 */

/**
 * Load comprehensive permission mapping from generated file
 */
const MAPPING_FILE = path.join(__dirname, 'permission-mapping-simple.json');

let PERMISSION_MAPPING = {};

// Load mapping file if it exists
if (fs.existsSync(MAPPING_FILE)) {
  try {
    PERMISSION_MAPPING = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    logger.info(`✅ Loaded ${Object.keys(PERMISSION_MAPPING).length} permission mappings from ${MAPPING_FILE}`);
  } catch (error) {
    logger.warn(`⚠️  Failed to load mapping file: ${error.message}`);
    logger.warn('⚠️  Using fallback mapping. Run generate-mapping.js first for comprehensive mapping.');
    // Fallback to basic mapping if file doesn't exist
    PERMISSION_MAPPING = {
      'create:admin': 'admin:create',
      'view:admin': 'admin:read',
      'update:admin': 'admin:update',
      'delete:admin': 'admin:delete',
      'create:user': 'user:create',
      'view:user': 'user:read',
      'update:user': 'user:update',
      'delete:user': 'user:delete',
    };
  }
} else {
  logger.warn(`⚠️  Mapping file not found at ${MAPPING_FILE}`);
  logger.warn('⚠️  Run: node src/scripts/permissions/generate-mapping.js first');
  // Fallback mapping
  PERMISSION_MAPPING = {
    'create:admin': 'admin:create',
    'view:admin': 'admin:read',
    'update:admin': 'admin:update',
    'delete:admin': 'admin:delete',
  };
}

/**
 * Legacy mapping (kept for reference, but will use loaded mapping above)
 */
const LEGACY_MAPPING = {
  // Admin
  'create:admin': 'admin:create',
  'view:admin': 'admin:read',
  'view:admin::adminId': 'admin:read',
  'view:admin::tenantId': 'admin:read',
  'update:admin::adminId': 'admin:update',
  'delete:admin::adminId': 'admin:delete',
  'delete:admin:all': 'admin:delete',
  
  // User
  'create:user': 'user:create',
  'view:user': 'user:read',
  'view:user::userId': 'user:read',
  'read:user::userId': 'user:read',
  'update:user::userId': 'user:update',
  'delete:user::userId': 'user:delete',
  'create:user:bulk-create': 'user:import',
  'create:user:restore': 'user:restore',
  'create:user::userId': 'user:restore', // restore endpoint
  'assign:roles': 'user:assign',
  
  // Node
  'create:node': 'node:create',
  'view:node': 'node:read',
  'view:node::nodeId': 'node:read',
  'view:node:parent': 'node:read',
  'view:node:children': 'node:read',
  'view:node:path': 'node:read',
  'view:node:type': 'node:read',
  'update:node::nodeId': 'node:update',
  'update:node:move': 'node:move',
  'update:node:activate': 'node:activate',
  'update:node:deactivate': 'node:deactivate',
  'delete:node::nodeId': 'node:delete',
  'create:node:bulk-import': 'node:import',
  
  // Storage
  'create:storage:upload': 'storage:upload',
  'create:storage:upload-multiple': 'storage:upload',
  'view:storage': 'storage:read',
  'view:storage::fileId': 'storage:read',
  'view:storage:download': 'storage:download',
  'delete:storage::fileId': 'storage:delete',
  'create:storage:share': 'storage:share',
  'create:storage:move': 'storage:move',
  'create:storage:copy': 'storage:copy',
  
  // Auth
  'create:auth:register': 'auth:register',
  'create:auth:login': 'auth:login',
  'create:auth:logout': 'auth:logout',
  'create:auth:refresh-tokens': 'auth:refresh',
  'create:auth:forgot-password': 'auth:forgot-password',
  'create:auth:reset-password': 'auth:reset-password',
  'create:auth:verify-email': 'auth:verify',
  'create:auth:verify-otp': 'auth:verify',
  'create:auth:resend-otp': 'auth:verify',
  
  // Project Form
  'create:projectForm': 'projectForm:create',
  'view:projectForm': 'projectForm:read',
  'view:projectForm::projectId': 'projectForm:read',
  'update:projectForm::projectFormId': 'projectForm:update',
  'update:projectForm:publish': 'projectForm:publish',
  'update:projectForm:archive': 'projectForm:archive',
  'create:projectForm:submit': 'projectForm:submit',
  'delete:projectForm::projectFormId': 'projectForm:delete',
  
  // Payment
  'create:payment': 'payment:create',
  'view:payment': 'payment:read',
  'view:payment::paymentId': 'payment:read',
  'update:payment::paymentId': 'payment:update',
  'update:payment:process': 'payment:process',
  'update:payment:complete': 'payment:complete',
  'update:payment:cancel': 'payment:cancel',
  'update:payment:refund': 'payment:refund',
  'delete:payment::paymentId': 'payment:delete',
  
  // Role
  'create:role': 'role:create',
  'view:role': 'role:read',
  'view:role::roleId': 'role:read',
  'update:role::roleId': 'role:update',
  'update:role:permissions': 'role:permissions',
  'delete:role::roleId': 'role:delete',
  
  // Add more mappings as needed...
};

/**
 * Reverse mapping for fallback
 */
const REVERSE_MAPPING = {};
Object.entries(PERMISSION_MAPPING).forEach(([old, newPerm]) => {
  if (!REVERSE_MAPPING[newPerm]) {
    REVERSE_MAPPING[newPerm] = [];
  }
  REVERSE_MAPPING[newPerm].push(old);
});

/**
 * Migrate permissions in database
 */
const migratePermissions = async ({ dryRun = false, backup = false }) => {
  await connectToDB();
  
  logger.info('🔄 Starting permission migration...');
  
  if (backup) {
    logger.info('📦 Creating backup...');
    await createBackup();
  }
  
  // Step 1: Get all existing permissions
  const oldPermissions = await Permission.find({});
  logger.info(`📊 Found ${oldPermissions.length} existing permissions`);
  
  // Step 2: Create new permissions
  const newPermissionMap = new Map();
  const migrationStats = {
    mapped: 0,
    unmapped: 0,
    duplicates: 0,
  };
  
  oldPermissions.forEach(oldPerm => {
    const newName = PERMISSION_MAPPING[oldPerm.name];
    
    if (newName) {
      migrationStats.mapped++;
      
      if (!newPermissionMap.has(newName)) {
        newPermissionMap.set(newName, {
          name: newName,
          resource: extractResource(newName),
          action: extractAction(newName),
          path: oldPerm.path,
          method: oldPerm.method,
          description: generateDescription(newName),
          isWildcard: oldPerm.isWildcard,
          isAdminLevel: oldPerm.isAdminLevel,
          oldNames: [oldPerm.name],
        });
      } else {
        migrationStats.duplicates++;
        const existing = newPermissionMap.get(newName);
        if (!existing.oldNames.includes(oldPerm.name)) {
          existing.oldNames.push(oldPerm.name);
        }
      }
    } else {
      migrationStats.unmapped++;
      logger.warn(`⚠️  No mapping found for: ${oldPerm.name}`);
    }
  });
  
  logger.info(`📈 Migration stats:`);
  logger.info(`   - Mapped: ${migrationStats.mapped}`);
  logger.info(`   - Unmapped: ${migrationStats.unmapped}`);
  logger.info(`   - Duplicates consolidated: ${migrationStats.duplicates}`);
  logger.info(`   - New permissions: ${newPermissionMap.size}`);
  
  if (dryRun) {
    logger.info('💡 Dry run - no changes made');
    return { stats: migrationStats, newPermissions: Array.from(newPermissionMap.values()) };
  }
  
  // Step 3: Create new permissions
  const newPermissions = Array.from(newPermissionMap.values());
  const newPermissionDocs = await Permission.insertMany(
    newPermissions.map(p => ({
      name: p.name,
      resource: p.resource,
      action: p.action,
      path: p.path,
      method: p.method,
      description: p.description,
      isWildcard: p.isWildcard,
      isAdminLevel: p.isAdminLevel,
    })),
    { ordered: false }
  );
  
  logger.info(`✅ Created ${newPermissionDocs.length} new permissions`);
  
  // Step 4: Migrate roles
  await migrateRoles(PERMISSION_MAPPING);
  
  // Step 5: Mark old permissions as deprecated (don't delete yet)
  await Permission.updateMany(
    { name: { $in: Object.keys(PERMISSION_MAPPING) } },
    { $set: { deprecated: true, deprecatedAt: new Date() } }
  );
  
  logger.info('✅ Migration complete!');
  logger.info('⚠️  Old permissions marked as deprecated (not deleted)');
  logger.info('💡 Review and delete deprecated permissions after verification');
  
  return { stats: migrationStats, newPermissions: newPermissionDocs };
};

/**
 * Migrate roles to use new permissions
 */
const migrateRoles = async (mapping) => {
  logger.info('🔄 Migrating roles...');
  
  const roles = await Role.find({}).populate('permissions');
  let migratedCount = 0;
  
  for (const role of roles) {
    const oldPermissionNames = role.permissions.map(p => p.name);
    const newPermissionNames = oldPermissionNames.map(name => mapping[name] || name);
    const uniqueNewNames = [...new Set(newPermissionNames)];
    
    // Find new permission IDs
    const newPermissions = await Permission.find({
      name: { $in: uniqueNewNames }
    });
    
    if (newPermissions.length !== uniqueNewNames.length) {
      const foundNames = newPermissions.map(p => p.name);
      const missing = uniqueNewNames.filter(name => !foundNames.includes(name));
      logger.warn(`⚠️  Role "${role.name}" has unmapped permissions: ${missing.join(', ')}`);
    }
    
    role.permissions = newPermissions.map(p => p._id);
    await role.save();
    migratedCount++;
  }
  
  logger.info(`✅ Migrated ${migratedCount} roles`);
};

/**
 * Extract resource from permission name
 */
const extractResource = (permName) => {
  const parts = permName.split(':');
  return parts[0];
};

/**
 * Extract action from permission name
 */
const extractAction = (permName) => {
  const parts = permName.split(':');
  return parts[1] || 'read';
};

/**
 * Generate description for permission
 */
const generateDescription = (permName) => {
  const [resource, action] = permName.split(':');
  const actionDesc = action.charAt(0).toUpperCase() + action.slice(1);
  const resourceDesc = resource.charAt(0).toUpperCase() + resource.slice(1);
  return `${actionDesc} ${resourceDesc} resources`;
};

/**
 * Create backup of current permissions
 */
const createBackup = async () => {
  const permissions = await Permission.find({});
  const backupPath = `backups/permissions-${Date.now()}.json`;
  const fs = require('fs');
  const path = require('path');
  
  const backupDir = path.dirname(backupPath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  fs.writeFileSync(backupPath, JSON.stringify(permissions, null, 2));
  logger.info(`📦 Backup created: ${backupPath}`);
};

/**
 * MongoDB connection
 */
const connectToDB = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');
  } catch (err) {
    logger.error('❌ Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

// Main execution
if (require.main === module) {
  const args = require('minimist')(process.argv.slice(2));
  const dryRun = args['dry-run'] || args.dryRun || false;
  const backup = args.backup || false;
  
  migratePermissions({ dryRun, backup })
    .then(() => {
      logger.info('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = {
  migratePermissions,
  PERMISSION_MAPPING,
};

