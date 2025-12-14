const fs = require('fs');
const path = require('path');

/**
 * Generate Comprehensive Permission Mapping Table
 * 
 * Analyzes the current permission snapshot and creates a mapping
 * from old format (action:resource) to new format (resource:action)
 */

const PERMISSIONS_SNAPSHOT = path.join(__dirname, 'permissions-snapshot.json');

// Action mapping: old action -> new action
const ACTION_MAP = {
  'view': 'read',
  'create': 'create',
  'update': 'update',
  'delete': 'delete',
  'manage': 'manage',
  'read': 'read', // Some permissions already use 'read'
};

/**
 * Extract resource and action from old permission name
 */
const parseOldPermission = (oldName) => {
  // Handle special cases
  if (oldName === 'all:*' || oldName === '*') {
    return { resource: '*', action: 'all', isSpecial: true };
  }
  
  if (oldName === 'system:health') {
    return { resource: 'system', action: 'read', isSpecial: true };
  }
  
  // Split by colon
  const parts = oldName.split(':');
  
  if (parts.length < 2) {
    return null;
  }
  
  const action = parts[0]; // e.g., 'view', 'create'
  const resourceParts = parts.slice(1); // e.g., ['user'], ['user', 'bulk-create'], ['admin', '', 'adminId']
  
  // Handle path-specific permissions (e.g., 'view:admin::adminId')
  // Remove empty strings and path parameters
  const cleanResourceParts = resourceParts.filter(p => p && !p.startsWith('::'));
  
  // Get base resource (first part)
  let resource = cleanResourceParts[0];
  
  // Handle special resource names
  if (resource === 'eventcalendar') {
    resource = 'eventCalendar';
  } else if (resource === 'baselineintelligence') {
    resource = 'baselineIntelligence';
  } else if (resource === 'projectform') {
    resource = 'projectForm';
  } else if (resource === 'projectformsubmission') {
    resource = 'projectFormSubmission';
  } else if (resource === 'userformsettings') {
    resource = 'userFormSettings';
  } else if (resource === 'storagefolder') {
    resource = 'storageFolder';
  } else if (resource === 'eventconfig') {
    resource = 'eventConfig';
  } else if (resource === 'apikey') {
    resource = 'apiKey';
  } else if (resource === 'telegramwebapp') {
    resource = 'telegramWebApp';
  }
  
  // Handle extended actions (e.g., 'create:user:bulk-create' -> 'user:import')
  const extendedActionMap = {
    'bulk-create': 'import',
    'bulk-import': 'import',
    'import': 'import',
    'export': 'export',
    'assign': 'assign',
    'restore': 'restore',
    'activate': 'activate',
    'deactivate': 'deactivate',
    'move': 'move',
    'upload': 'upload',
    'download': 'download',
    'share': 'share',
    'copy': 'copy',
    'publish': 'publish',
    'archive': 'archive',
    'submit': 'submit',
    'process': 'process',
    'complete': 'complete',
    'cancel': 'cancel',
    'refund': 'refund',
    'regenerate': 'regenerate',
    'deleteAll': 'deleteAll',
    'delete-all': 'deleteAll',
    'toggle-status': 'toggleStatus',
    'assign-role': 'assignRole',
    'send-message': 'sendMessage',
    'forgot-password': 'forgotPassword',
    'reset-password': 'resetPassword',
    'verify-email': 'verify',
    'verify-otp': 'verify',
    'resend-otp': 'verify',
    'refresh-tokens': 'refresh',
    'send': 'send',
    'draft': 'draft',
    'retry': 'retry',
    'public': 'public',
    'private': 'private',
    'permissions': 'permissions',
    'status': 'status',
    'auth': 'auth',
  };
  
  // Check if there's an extended action in the resource parts
  let newAction = ACTION_MAP[action] || action;
  
  // Check for extended actions
  if (cleanResourceParts.length > 1) {
    const extendedAction = cleanResourceParts.slice(1).join('-');
    if (extendedActionMap[extendedAction]) {
      newAction = extendedActionMap[extendedAction];
    }
  }
  
  // Special handling for some permissions
  if (oldName.includes('assign-role')) {
    newAction = 'assignRole';
  } else if (oldName.includes('assign-roles')) {
    newAction = 'assign';
  }
  
  return {
    resource,
    action: newAction,
    oldAction: action,
    isSpecial: false,
  };
};

/**
 * Generate new permission name
 */
const generateNewPermissionName = (parsed) => {
  if (parsed.isSpecial) {
    if (parsed.resource === '*' && parsed.action === 'all') {
      return '*'; // Keep wildcard as-is
    }
    return `${parsed.resource}:${parsed.action}`;
  }
  
  return `${parsed.resource}:${parsed.action}`;
};

/**
 * Generate comprehensive mapping
 */
const generateMapping = () => {
  console.log('📖 Reading permissions snapshot...');
  const snapshotData = JSON.parse(fs.readFileSync(PERMISSIONS_SNAPSHOT, 'utf8'));
  
  console.log(`📊 Found ${snapshotData.length} permissions to map`);
  
  const mapping = {};
  const reverseMapping = {}; // New -> [Old1, Old2, ...]
  const unmapped = [];
  const stats = {
    total: snapshotData.length,
    mapped: 0,
    unmapped: 0,
    duplicates: 0,
  };
  
  snapshotData.forEach((perm) => {
    const oldName = perm.name;
    const parsed = parseOldPermission(oldName);
    
    if (!parsed) {
      unmapped.push(oldName);
      stats.unmapped++;
      return;
    }
    
    const newName = generateNewPermissionName(parsed);
    
    // Add to mapping
    mapping[oldName] = newName;
    stats.mapped++;
    
    // Track reverse mapping (multiple old permissions -> one new permission)
    if (!reverseMapping[newName]) {
      reverseMapping[newName] = [];
    }
    reverseMapping[newName].push(oldName);
    
    // Count duplicates (multiple old permissions mapping to same new permission)
    if (reverseMapping[newName].length > 1) {
      stats.duplicates++;
    }
  });
  
  // Generate output
  const output = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    stats,
    mapping,
    reverseMapping,
    unmapped,
  };
  
  // Write mapping file
  const mappingPath = path.join(__dirname, 'permission-mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(output, null, 2));
  console.log(`✅ Mapping written to ${mappingPath}`);
  
  // Write simplified mapping for migration script
  const simplifiedMappingPath = path.join(__dirname, 'permission-mapping-simple.json');
  fs.writeFileSync(simplifiedMappingPath, JSON.stringify(mapping, null, 2));
  console.log(`✅ Simplified mapping written to ${simplifiedMappingPath}`);
  
  // Print summary
  console.log('\n📈 Mapping Summary:');
  console.log(`   Total permissions: ${stats.total}`);
  console.log(`   Mapped: ${stats.mapped}`);
  console.log(`   Unmapped: ${stats.unmapped}`);
  console.log(`   Duplicates consolidated: ${stats.duplicates}`);
  console.log(`   Unique new permissions: ${Object.keys(reverseMapping).length}`);
  
  if (unmapped.length > 0) {
    console.log('\n⚠️  Unmapped permissions:');
    unmapped.forEach(perm => console.log(`   - ${perm}`));
  }
  
  // Show top consolidated permissions
  console.log('\n🔗 Top Consolidated Permissions:');
  const topConsolidated = Object.entries(reverseMapping)
    .filter(([_, oldPerms]) => oldPerms.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);
  
  topConsolidated.forEach(([newPerm, oldPerms]) => {
    console.log(`   ${newPerm} <- ${oldPerms.length} old permissions`);
    oldPerms.slice(0, 3).forEach(old => console.log(`      - ${old}`));
    if (oldPerms.length > 3) {
      console.log(`      ... and ${oldPerms.length - 3} more`);
    }
  });
  
  return output;
};

// Run if called directly
if (require.main === module) {
  try {
    generateMapping();
    console.log('\n✅ Mapping generation complete!');
  } catch (error) {
    console.error('❌ Error generating mapping:', error);
    process.exit(1);
  }
}

module.exports = { generateMapping, parseOldPermission, generateNewPermissionName };

