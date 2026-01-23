const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Script to update route files to use new permission format
 *
 * Usage:
 *   node src/scripts/permissions/update-routes.js [--dry-run] [--file=path/to/file]
 */

// Load permission mapping
const MAPPING_FILE = path.join(__dirname, 'permission-mapping-simple.json');
let PERMISSION_MAPPING = {};

if (fs.existsSync(MAPPING_FILE)) {
  PERMISSION_MAPPING = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
  console.log(
    `✅ Loaded ${Object.keys(PERMISSION_MAPPING).length} permission mappings`
  );
} else {
  console.warn(`⚠️  Mapping file not found. Run generate-mapping.js first.`);
  process.exit(1);
}

// Common permission patterns to replace
const COMMON_REPLACEMENTS = [
  // requireAccess patterns
  {
    pattern:
      /requireAccess\(['"](view|create|update|delete|read|manage):(\w+)(?:::\w+)?['"]\)/g,
    replacer: (match, action, resource) => {
      const actionMap = {
        view: 'read',
        read: 'read',
        create: 'create',
        update: 'update',
        delete: 'delete',
        manage: 'manage',
      };
      const newAction = actionMap[action] || action;
      return `requireAccess('${resource}:${newAction}')`;
    },
  },
  // auth() patterns
  {
    pattern:
      /auth\(['"](view|create|update|delete|read|manage):(\w+)(?:::\w+)?['"]\)/g,
    replacer: (match, action, resource) => {
      const actionMap = {
        view: 'read',
        read: 'read',
        create: 'create',
        update: 'update',
        delete: 'delete',
        manage: 'manage',
      };
      const newAction = actionMap[action] || action;
      return `auth('${resource}:${newAction}')`;
    },
  },
  // Special cases with extended actions
  {
    pattern: /requireAccess\(['"]create:(\w+):bulk-create['"]\)/g,
    replacer: (match, resource) => `requireAccess('${resource}:import')`,
  },
  {
    pattern: /auth\(['"]create:(\w+):bulk-create['"]\)/g,
    replacer: (match, resource) => `auth('${resource}:import')`,
  },
  {
    pattern: /requireAccess\(['"]create:(\w+):restore['"]\)/g,
    replacer: (match, resource) => `requireAccess('${resource}:restore')`,
  },
  {
    pattern: /auth\(['"]create:(\w+):restore['"]\)/g,
    replacer: (match, resource) => `auth('${resource}:restore')`,
  },
  {
    pattern: /auth\(['"]assign:roles['"]\)/g,
    replacer: () => `auth('user:assign')`,
  },
  {
    pattern: /requireAccess\(['"]assign:roles['"]\)/g,
    replacer: () => `requireAccess('user:assign')`,
  },
];

/**
 * Update a single route file
 */
const updateRouteFile = (filePath, dryRun = false) => {
  console.log(`\n📝 Processing: ${filePath}`);

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let changes = 0;

  // Apply common replacements
  COMMON_REPLACEMENTS.forEach(({ pattern, replacer }) => {
    const matches = content.match(pattern);
    if (matches) {
      content = content.replace(pattern, replacer);
      changes += matches.length;
    }
  });

  // Apply mapping for any remaining old format permissions
  Object.entries(PERMISSION_MAPPING).forEach(([oldPerm, newPerm]) => {
    // Escape special regex characters
    const escapedOld = oldPerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Replace in requireAccess
    const requireAccessPattern = new RegExp(
      `requireAccess\\(['"]${escapedOld}['"]\\)`,
      'g'
    );
    if (requireAccessPattern.test(content)) {
      content = content.replace(
        requireAccessPattern,
        `requireAccess('${newPerm}')`
      );
      changes++;
    }

    // Replace in auth()
    const authPattern = new RegExp(`auth\\(['"]${escapedOld}['"]\\)`, 'g');
    if (authPattern.test(content)) {
      content = content.replace(authPattern, `auth('${newPerm}')`);
      changes++;
    }
  });

  if (content !== originalContent) {
    if (dryRun) {
      console.log(`   ✅ Would update ${changes} permission(s)`);
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`   ✅ Updated ${changes} permission(s)`);
    }
    return true;
  } else {
    console.log(`   ⏭️  No changes needed`);
    return false;
  }
};

/**
 * Main function
 */
const updateRoutes = async ({ dryRun = false, file = null }) => {
  const routesDir = path.join(__dirname, '../../routes/v1');

  let files = [];
  if (file) {
    // Update specific file
    const filePath = path.isAbsolute(file) ? file : path.join(routesDir, file);
    if (fs.existsSync(filePath)) {
      files = [filePath];
    } else {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
  } else {
    // Update all route files
    files = glob.sync(`${routesDir}/*.route.js`);
  }

  console.log(`\n🔍 Found ${files.length} route file(s) to process`);
  if (dryRun) {
    console.log('💡 DRY RUN MODE - No files will be modified\n');
  }

  let updatedCount = 0;
  files.forEach((filePath) => {
    if (updateRouteFile(filePath, dryRun)) {
      updatedCount++;
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${files.length}`);
  console.log(`   Files ${dryRun ? 'would be ' : ''}updated: ${updatedCount}`);

  if (dryRun) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
};

// Main execution
if (require.main === module) {
  const args = require('minimist')(process.argv.slice(2));
  const dryRun = args['dry-run'] || args.dryRun || false;
  const file = args.file || args.f || null;

  updateRoutes({ dryRun, file })
    .then(() => {
      console.log('\n✅ Route update complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Route update failed:', error);
      process.exit(1);
    });
}

module.exports = { updateRoutes, updateRouteFile };
