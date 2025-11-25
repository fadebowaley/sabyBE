const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const config = require('../src/config/config');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Level = require('../src/models/level.model');
const Structures = require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');

const DEFAULT_OPTIONS = {
  tenantEmail: null,
  csvDir: path.join(__dirname, 'migration_data'),
  rolesFile: 'roles.csv',
  usersFile: 'users.csv',
  levelsFile: 'levels.csv',
  structuresFile: 'structures.csv',
  nodesFile: 'nodes.csv',
  userNodesFile: 'user_nodes.csv',
};

function resolvePath(baseDir, fileName) {
  if (!fileName) return null;
  if (path.isAbsolute(fileName)) return fileName;
  return path.join(baseDir, fileName);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--tenantEmail' && args[i + 1]) {
      options.tenantEmail = args[i + 1];
      i += 1;
    } else if (arg === '--csvDir' && args[i + 1]) {
      options.csvDir = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else if (arg === '--rolesFile' && args[i + 1]) {
      options.rolesFile = args[i + 1];
      i += 1;
    } else if (arg === '--usersFile' && args[i + 1]) {
      options.usersFile = args[i + 1];
      i += 1;
    } else if (arg === '--levelsFile' && args[i + 1]) {
      options.levelsFile = args[i + 1];
      i += 1;
    } else if (arg === '--structuresFile' && args[i + 1]) {
      options.structuresFile = args[i + 1];
      i += 1;
    } else if (arg === '--nodesFile' && args[i + 1]) {
      options.nodesFile = args[i + 1];
      i += 1;
    } else if (arg === '--userNodesFile' && args[i + 1]) {
      options.userNodesFile = args[i + 1];
      i += 1;
    }
  }

  if (!options.tenantEmail) {
    console.error('❌  Missing required flag: --tenantEmail <email>');
    process.exit(1);
  }

  options.csvDir = path.resolve(options.csvDir);
  return options;
}

/**
 * Comprehensive Data Migration Script
 * Handles migration in the correct order:
 * 1. Role, User
 * 2. Structure, Level and Node
 */
class DataMigrationManager {
  constructor(options = DEFAULT_OPTIONS) {
    this.options = options;
    this.tenantId = null;
    this.createdBy = null;
    this.fileConfig = {
      roles: resolvePath(this.options.csvDir, this.options.rolesFile),
      users: resolvePath(this.options.csvDir, this.options.usersFile),
      levels: resolvePath(this.options.csvDir, this.options.levelsFile),
      structures: resolvePath(
        this.options.csvDir,
        this.options.structuresFile
      ),
      nodes: resolvePath(this.options.csvDir, this.options.nodesFile),
      userNodes: resolvePath(
        this.options.csvDir,
        this.options.userNodesFile
      ),
    };
    this.migrationResults = {
      roles: { created: 0, errors: 0, details: [] },
      users: { created: 0, errors: 0, details: [] },
      levels: { created: 0, errors: 0, details: [] },
      structures: { created: 0, errors: 0, details: [] },
      nodes: { created: 0, errors: 0, details: [] },
      userNodes: { created: 0, attached: 0, errors: 0, details: [] },
    };
  }

  /**
   * Initialize database connection and get tenant context
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Data Migration...\n');

      // Connect to MongoDB
      await mongoose.connect(config.mongoose.url, config.mongoose.options);
      console.log('✅ Connected to MongoDB');

      // Get tenant context from provided email
      const tenantOwner = await User.findOne({ email: this.options.tenantEmail });
      if (!tenantOwner) {
        throw new Error(`${this.options.tenantEmail} not found in database`);
      }

      this.tenantId = tenantOwner.tenantId;
      this.createdBy = tenantOwner._id;

      console.log(`   ✅ Tenant ID: ${this.tenantId}`);
      console.log(`   ✅ Created By: ${this.createdBy}`);
      console.log('');
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Phase 1: Migrate Roles and Users
   */
  async migrateRolesAndUsers() {
    console.log('📋 PHASE 1: Migrating Roles and Users\n');

    try {
      // 1.1 Migrate Roles
      await this.migrateRoles();

      // 1.2 Migrate Users
      await this.migrateUsers();

      console.log('✅ Phase 1 completed successfully!\n');
    } catch (error) {
      console.error('❌ Phase 1 failed:', error.message);
      throw error;
    }
  }

  /**
   * Phase 2: Migrate Levels, Structures, and Nodes
   */
  async migrateLevelsStructuresAndNodes() {
    console.log('📋 PHASE 2: Migrating Levels, Structures, and Nodes\n');

    try {
      // 2.1 Migrate Levels
      await this.migrateLevels();

      // 2.2 Migrate Structures
      await this.migrateStructures();

      // 2.3 Migrate Nodes
      await this.migrateNodes();

      console.log('✅ Phase 2 completed successfully!\n');
    } catch (error) {
      console.error('❌ Phase 2 failed:', error.message);
      throw error;
    }
  }

  /**
   * Migrate Roles from CSV
   */
  async migrateRoles() {
    console.log('1️⃣ Migrating Roles...');

    try {
      const rolesData = await this.readCSV('roles');

      for (const roleData of rolesData) {
        try {
          // Check if role already exists
          const existingRole = await Role.findOne({
            name: roleData.name,
            tenantId: this.tenantId,
          });

          if (existingRole) {
            console.log(
              `   ⚠️  Role "${roleData.name}" already exists, skipping...`
            );
            continue;
          }

          // Create role
          const role = await Role.createRole(
            {
              roleName: roleData.name,
              roleDescription: roleData.description || '',
            },
            {
              tenantId: this.tenantId,
              userId: this.createdBy.toString(),
            }
          );

          this.migrationResults.roles.created++;
          this.migrationResults.roles.details.push({
            name: role.name,
            id: role._id,
            status: 'created',
          });

          console.log(`   ✅ Created role: ${role.name}`);
        } catch (error) {
          this.migrationResults.roles.errors++;
          this.migrationResults.roles.details.push({
            name: roleData.name,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to create role "${roleData.name}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Roles: ${this.migrationResults.roles.created} created, ${this.migrationResults.roles.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Roles migration failed: ${error.message}`);
    }
  }

  /**
   * Migrate Users from CSV
   */
  async migrateUsers() {
    console.log('2️⃣ Migrating Users...');

    try {
      const usersData = await this.readCSV('users');

      for (const userData of usersData) {
        try {
          // Check if user already exists
          const existingUser = await User.findOne({ email: userData.email });
          if (existingUser) {
            console.log(
              `   ⚠️  User ${userData.email} already exists, skipping...`
            );
            continue;
          }

          // Get role IDs
          const roleNames = userData.roles
            ? userData.roles.split(',').map((r) => r.trim())
            : [];
          const roles = await Role.find({
            name: { $in: roleNames },
            tenantId: this.tenantId,
          });

          // Create user
          const user = await User.createUser({
            ...userData,
            roles: roles.map((r) => r._id),
            createdBy: this.createdBy,
            tenantId: this.tenantId,
          });

          this.migrationResults.users.created++;
          this.migrationResults.users.details.push({
            email: user.email,
            id: user._id,
            status: 'created',
          });

          console.log(`   ✅ Created user: ${user.email}`);
        } catch (error) {
          this.migrationResults.users.errors++;
          this.migrationResults.users.details.push({
            email: userData.email,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to create user ${userData.email}: ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Users: ${this.migrationResults.users.created} created, ${this.migrationResults.users.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Users migration failed: ${error.message}`);
    }
  }

  /**
   * Migrate Levels from CSV
   */
  async migrateLevels() {
    console.log('1️⃣ Migrating Levels...');

    try {
      const levelsData = await this.readCSV('levels');

      for (const levelData of levelsData) {
        try {
          // Check if level already exists
          const existingLevel = await Level.findOne({
            name: levelData.name,
            tenantId: this.tenantId,
          });

          if (existingLevel) {
            console.log(
              `   ⚠️  Level "${levelData.name}" already exists, skipping...`
            );
            continue;
          }

          // Create level
          const level = new Level({
            name: levelData.name,
            description: levelData.description || '',
            rank: parseInt(levelData.rank),
            tenantId: this.tenantId,
          });

          await level.save();

          this.migrationResults.levels.created++;
          this.migrationResults.levels.details.push({
            name: level.name,
            id: level._id,
            status: 'created',
          });

          console.log(
            `   ✅ Created level: ${level.name} (rank: ${level.rank})`
          );
        } catch (error) {
          this.migrationResults.levels.errors++;
          this.migrationResults.levels.details.push({
            name: levelData.name,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to create level "${levelData.name}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Levels: ${this.migrationResults.levels.created} created, ${this.migrationResults.levels.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Levels migration failed: ${error.message}`);
    }
  }

  /**
   * Migrate Structures from CSV
   */
  async migrateStructures() {
    console.log('2️⃣ Migrating Structures...');

    try {
      const structuresData = await this.readCSV('structures');

      for (const structureData of structuresData) {
        try {
          // Check if structure already exists
          const existingStructure = await Structures.findOne({
            name: structureData.name,
            tenantId: this.tenantId,
          });

          if (existingStructure) {
            console.log(
              `   ⚠️  Structure "${structureData.name}" already exists, skipping...`
            );
            continue;
          }

          // Get level ID
          const level = await Level.findOne({
            name: structureData.level,
            tenantId: this.tenantId,
          });
          if (!level) {
            throw new Error(`Level "${structureData.level}" not found`);
          }

          // Get parent structure if specified
          let parent = null;
          if (structureData.parent) {
            parent = await Structures.findOne({
              name: structureData.parent,
              tenantId: this.tenantId,
            });
            if (!parent) {
              throw new Error(
                `Parent structure "${structureData.parent}" not found`
              );
            }
          }

          // Create structure
          const structure = new Structures({
            name: structureData.name,
            code: structureData.code || '',
            type: structureData.type || 'administrative',
            level: level._id,
            parent: parent ? parent._id : null,
            description: structureData.description || '',
            tenantId: this.tenantId,
            createdBy: this.createdBy,
          });

          await structure.save();

          this.migrationResults.structures.created++;
          this.migrationResults.structures.details.push({
            name: structure.name,
            id: structure._id,
            status: 'created',
          });

          console.log(`   ✅ Created structure: ${structure.name}`);
        } catch (error) {
          this.migrationResults.structures.errors++;
          this.migrationResults.structures.details.push({
            name: structureData.name,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to create structure "${structureData.name}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Structures: ${this.migrationResults.structures.created} created, ${this.migrationResults.structures.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Structures migration failed: ${error.message}`);
    }
  }

  /**
   * Migrate Nodes from CSV
   */
  async migrateNodes() {
    console.log('3️⃣ Migrating Nodes...');

    try {
      const nodesData = await this.readCSV('nodes');

      for (const nodeData of nodesData) {
        try {
          // Check if node already exists
          const existingNode = await Nodes.findOne({
            name: nodeData.name,
            tenantId: this.tenantId,
          });

          if (existingNode) {
            console.log(
              `   ⚠️  Node "${nodeData.name}" already exists, skipping...`
            );
            continue;
          }

          // Get level ID
          const level = await Level.findOne({
            name: nodeData.level,
            tenantId: this.tenantId,
          });
          if (!level) {
            throw new Error(`Level "${nodeData.level}" not found`);
          }

          // Get structure ID
          const structure = await Structures.findOne({
            name: nodeData.structure,
            tenantId: this.tenantId,
          });
          if (!structure) {
            throw new Error(`Structure "${nodeData.structure}" not found`);
          }

          // Get parent node if specified
          let parent = null;
          if (nodeData.parent) {
            parent = await Nodes.findOne({
              name: nodeData.parent,
              tenantId: this.tenantId,
            });
            if (!parent) {
              throw new Error(`Parent node "${nodeData.parent}" not found`);
            }
          }

          // Get user IDs if specified
          let users = [];
          if (nodeData.users) {
            const userEmails = nodeData.users.split(',').map((e) => e.trim());
            const userDocs = await User.find({
              email: { $in: userEmails },
              tenantId: this.tenantId,
            });
            users = userDocs.map((u) => u._id);
          }

          // Create node
          const node = new Nodes({
            name: nodeData.name,
            level: level._id,
            structure: structure._id,
            parent: parent ? parent._id : null,
            users,
            address: nodeData.address || '',
            city: nodeData.city || '',
            state: nodeData.state || '',
            country: nodeData.country || '',
            postalCode: nodeData.postalCode || '',
            dateOfEstablishment: nodeData.dateOfEstablishment
              ? new Date(nodeData.dateOfEstablishment)
              : null,
            isMain: nodeData.isMain === 'true',
            tenantId: this.tenantId,
          });

          await node.save();

          this.migrationResults.nodes.created++;
          this.migrationResults.nodes.details.push({
            name: node.name,
            id: node._id,
            status: 'created',
          });

          console.log(`   ✅ Created node: ${node.name}`);
        } catch (error) {
          this.migrationResults.nodes.errors++;
          this.migrationResults.nodes.details.push({
            name: nodeData.name,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to create node "${nodeData.name}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Nodes: ${this.migrationResults.nodes.created} created, ${this.migrationResults.nodes.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Nodes migration failed: ${error.message}`);
    }
  }

  /**
   * Attach users to nodes from CSV
   */
  async migrateUserNodeLinks() {
    if (!this.fileConfig.userNodes) {
      console.log('🔗 Skipping user-node mapping (no file configured)');
      return;
    }

    console.log('🔗 Attaching Users to Nodes...');

    try {
      const links = await this.readCSV('userNodes');
      if (!links.length) {
        console.log('   ⚠️  No user-node mapping data found, skipping...\n');
        return;
      }

      for (const link of links) {
        try {
          const email = link.email?.trim().toLowerCase();
          const nodeName = link.nodeName?.trim();
          if (!email || !nodeName) continue;

          const user = await User.findOne({ email, tenantId: this.tenantId });
          if (!user) {
            throw new Error(`User ${email} not found`);
          }

          const node = await Nodes.findOne({
            name: nodeName,
            tenantId: this.tenantId,
          });
          if (!node) {
            throw new Error(`Node "${nodeName}" not found`);
          }

          await Nodes.updateOne(
            { _id: node._id },
            { $addToSet: { users: user._id } }
          );

          this.migrationResults.userNodes.attached += 1;
          this.migrationResults.userNodes.created += 1;
        } catch (error) {
          this.migrationResults.userNodes.errors += 1;
          this.migrationResults.userNodes.details.push({
            email: link.email,
            nodeName: link.nodeName,
            error: error.message,
          });
          console.log(
            `   ❌ Failed to attach ${link.email} to ${link.nodeName}: ${error.message}`
          );
        }
      }

      console.log(
        `   📊 User-Node Links: ${this.migrationResults.userNodes.attached} attached, ${this.migrationResults.userNodes.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ User-node mapping failed: ${error.message}`);
    }
  }

  /**
   * Read CSV file
   */
  async readCSV(key) {
    return new Promise((resolve, reject) => {
      const results = [];
      const fileName = this.fileConfig[key] || key;

      if (!fileName) {
        resolve([]);
        return;
      }

      const filePath = resolvePath(this.options.csvDir, fileName);

      if (!fs.existsSync(filePath)) {
        console.log(`   ⚠️  File ${fileName} not found, skipping...`);
        resolve([]);
        return;
      }

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  /**
   * Generate migration report
   */
  generateReport() {
    console.log('📊 MIGRATION SUMMARY REPORT\n');
    console.log('='.repeat(50));

    Object.entries(this.migrationResults).forEach(([entity, result]) => {
      console.log(`${entity.toUpperCase()}:`);
      console.log(`  ✅ Created: ${result.created}`);
      console.log(`  ❌ Errors: ${result.errors}`);
      console.log(`  📁 Total: ${result.created + result.errors}`);
      console.log('');
    });

    const totalCreated = Object.values(this.migrationResults).reduce(
      (sum, r) => sum + r.created,
      0
    );
    const totalErrors = Object.values(this.migrationResults).reduce(
      (sum, r) => sum + r.errors,
      0
    );

    console.log('='.repeat(50));
    console.log(`TOTAL: ${totalCreated} created, ${totalErrors} errors`);
    console.log(
      `User-Node Links: ${this.migrationResults.userNodes.attached} attached, ${this.migrationResults.userNodes.errors} errors`
    );

    console.log('='.repeat(50));
  }

  /**
   * Cleanup
   */
  async cleanup() {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

/**
 * Main migration function
 */
async function runMigration(options) {
  const migrationManager = new DataMigrationManager(options);

  try {
    // Initialize
    await migrationManager.initialize();

    // Phase 1: Roles and Users
    await migrationManager.migrateRolesAndUsers();

    // Phase 2: Levels, Structures, and Nodes
    await migrationManager.migrateLevelsStructuresAndNodes();
    await migrationManager.migrateUserNodeLinks();

    // Generate report
    migrationManager.generateReport();

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await migrationManager.cleanup();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  const options = parseArgs();
  runMigration(options);
}

module.exports = DataMigrationManager;
