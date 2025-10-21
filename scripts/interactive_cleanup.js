const mongoose = require('mongoose');
const inquirer = require('inquirer');
const config = require('../src/config/config');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Level = require('../src/models/level.model');
const Structures = require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');

/**
 * Interactive Database Cleanup Tool
 * Super Admin tool for selective tenant and collection cleanup
 *
 * Features:
 * - List all tenants with owner information
 * - Select specific tenant to operate on
 * - Choose collections to clean
 * - Preview data before deletion
 * - Confirmation prompts
 */
class InteractiveDatabaseCleanup {
  constructor() {
    this.tenantId = null;
    this.tenantOwner = null;
    this.selectedCollections = [];
    this.cleanupResults = {
      users: { deleted: 0, errors: 0, details: [] },
      roles: { deleted: 0, errors: 0, details: [] },
      levels: { deleted: 0, errors: 0, details: [] },
      structures: { deleted: 0, errors: 0, details: [] },
      nodes: { deleted: 0, errors: 0, details: [] },
    };

    // Define cleanup order (reverse of creation order)
    this.cleanupOrder = ['nodes', 'structures', 'levels', 'users', 'roles'];

    // Define available collections
    this.availableCollections = {
      users: {
        name: 'Users',
        description: 'User accounts (except tenant owner)',
      },
      roles: {
        name: 'Roles',
        description: 'User roles (except Support Agent)',
      },
      levels: {
        name: 'Levels',
        description: 'Organizational hierarchy levels',
      },
      structures: {
        name: 'Structures',
        description: 'Organizational structures',
      },
      nodes: { name: 'Nodes', description: 'Physical/logical nodes' },
    };
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      console.log('🧹 Initializing Interactive Database Cleanup...\n');

      // Connect to MongoDB
      await mongoose.connect(config.mongoose.url, config.mongoose.options);
      console.log('✅ Connected to MongoDB\n');
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Get all tenants with their owners
   */
  async getAllTenants() {
    try {
      // Get all tenant owners (users with isOwner: true)
      const owners = await User.find({ isOwner: true }).select(
        'email firstname lastname tenantId createdAt'
      );

      const tenants = [];
      for (const owner of owners) {
        // Count users in this tenant
        const userCount = await User.countDocuments({
          tenantId: owner.tenantId,
        });

        // Count other entities
        const roleCount = await Role.countDocuments({
          tenantId: owner.tenantId,
        });
        const levelCount = await Level.countDocuments({
          tenantId: owner.tenantId,
        });
        const structureCount = await Structures.countDocuments({
          tenantId: owner.tenantId,
        });
        const nodeCount = await Nodes.countDocuments({
          tenantId: owner.tenantId,
        });

        tenants.push({
          tenantId: owner.tenantId,
          ownerEmail: owner.email,
          ownerName: `${owner.firstname} ${owner.lastname}`,
          createdAt: owner.createdAt,
          userCount,
          roleCount,
          levelCount,
          structureCount,
          nodeCount,
          totalRecords:
            userCount + roleCount + levelCount + structureCount + nodeCount,
        });
      }

      return tenants.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    } catch (error) {
      console.error('❌ Failed to get tenants:', error.message);
      throw error;
    }
  }

  /**
   * Display tenants in a formatted table
   */
  displayTenants(tenants) {
    console.log('📊 AVAILABLE TENANTS:\n');
    console.log('='.repeat(120));
    console.log(
      '| # | Tenant ID    | Owner Name           | Owner Email              | Users | Roles | Levels | Structures | Nodes | Total |'
    );
    console.log('='.repeat(120));

    tenants.forEach((tenant, index) => {
      const row = `| ${(index + 1)
        .toString()
        .padStart(2)} | ${tenant.tenantId.padEnd(
        12
      )} | ${tenant.ownerName.padEnd(19)} | ${tenant.ownerEmail.padEnd(
        24
      )} | ${tenant.userCount.toString().padStart(5)} | ${tenant.roleCount
        .toString()
        .padStart(5)} | ${tenant.levelCount
        .toString()
        .padStart(6)} | ${tenant.structureCount
        .toString()
        .padStart(10)} | ${tenant.nodeCount
        .toString()
        .padStart(5)} | ${tenant.totalRecords.toString().padStart(5)} |`;
      console.log(row);
    });

    console.log('='.repeat(120));
    console.log('');
  }

  /**
   * Interactive tenant selection
   */
  async selectTenant() {
    try {
      const tenants = await this.getAllTenants();

      if (tenants.length === 0) {
        console.log('❌ No tenants found in the database.');
        return false;
      }

      this.displayTenants(tenants);

      const choices = tenants.map((tenant, index) => ({
        name: `${tenant.tenantId} - ${tenant.ownerName} (${tenant.ownerEmail}) - ${tenant.totalRecords} records`,
        value: tenant,
      }));

      const { selectedTenant } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedTenant',
          message: 'Select a tenant to operate on:',
          choices,
          pageSize: 10,
        },
      ]);

      this.tenantId = selectedTenant.tenantId;
      this.tenantOwner = selectedTenant;

      console.log(`\n✅ Selected Tenant: ${this.tenantId}`);
      console.log(
        `   Owner: ${this.tenantOwner.ownerName} (${this.tenantOwner.ownerEmail})`
      );
      console.log(`   Total Records: ${this.tenantOwner.totalRecords}\n`);

      return true;
    } catch (error) {
      console.error('❌ Tenant selection failed:', error.message);
      return false;
    }
  }

  /**
   * Interactive collection selection
   */
  async selectCollections() {
    try {
      const choices = Object.entries(this.availableCollections).map(
        ([key, info]) => ({
          name: `${key} - ${info.description}`,
          value: key,
          checked: false,
        })
      );

      const { collections } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'collections',
          message: 'Select collections to clean:',
          choices,
          validate: (input) => {
            if (input.length === 0) {
              return 'Please select at least one collection.';
            }
            return true;
          },
        },
      ]);

      this.selectedCollections = collections;

      console.log(`\n✅ Selected Collections: ${collections.join(', ')}\n`);
      return true;
    } catch (error) {
      console.error('❌ Collection selection failed:', error.message);
      return false;
    }
  }

  /**
   * Preview data that will be deleted
   */
  async previewData() {
    try {
      console.log('🔍 PREVIEWING DATA TO BE DELETED:\n');
      console.log('='.repeat(80));

      for (const collection of this.selectedCollections) {
        const count = await this.getCollectionCount(collection);
        const sample = await this.getCollectionSample(collection);

        console.log(`\n📁 ${collection.toUpperCase()}:`);
        console.log(`   Total Records: ${count}`);

        if (sample.length > 0) {
          console.log(`   Sample Records:`);
          sample.forEach((item, index) => {
            const name = item.name || item.email || item._id;
            console.log(`     ${index + 1}. ${name}`);
          });
          if (count > sample.length) {
            console.log(`     ... and ${count - sample.length} more`);
          }
        }
      }

      console.log(`\n${'='.repeat(80)}`);
      return true;
    } catch (error) {
      console.error('❌ Preview failed:', error.message);
      return false;
    }
  }

  /**
   * Get count of records in a collection
   */
  async getCollectionCount(collection) {
    switch (collection) {
      case 'users':
        return await User.countDocuments({
          tenantId: this.tenantId,
          email: { $ne: this.tenantOwner.ownerEmail },
        });
      case 'roles':
        return await Role.countDocuments({
          tenantId: this.tenantId,
          name: { $ne: 'Support Agent' },
        });
      case 'levels':
        return await Level.countDocuments({ tenantId: this.tenantId });
      case 'structures':
        return await Structures.countDocuments({ tenantId: this.tenantId });
      case 'nodes':
        return await Nodes.countDocuments({ tenantId: this.tenantId });
      default:
        return 0;
    }
  }

  /**
   * Get sample records from a collection
   */
  async getCollectionSample(collection, limit = 5) {
    switch (collection) {
      case 'users':
        return await User.find({
          tenantId: this.tenantId,
          email: { $ne: this.tenantOwner.ownerEmail },
        })
          .select('email firstname lastname')
          .limit(limit);
      case 'roles':
        return await Role.find({
          tenantId: this.tenantId,
          name: { $ne: 'Support Agent' },
        })
          .select('name description')
          .limit(limit);
      case 'levels':
        return await Level.find({ tenantId: this.tenantId })
          .select('name description rank')
          .limit(limit);
      case 'structures':
        return await Structures.find({ tenantId: this.tenantId })
          .select('name type description')
          .limit(limit);
      case 'nodes':
        return await Nodes.find({ tenantId: this.tenantId })
          .select('name level structure')
          .limit(limit);
      default:
        return [];
    }
  }

  /**
   * Final confirmation
   */
  async confirmCleanup() {
    try {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: `⚠️  Are you sure you want to delete data from tenant "${this.tenantId}"? This action cannot be undone!`,
          default: false,
        },
      ]);

      return confirmed;
    } catch (error) {
      console.error('❌ Confirmation failed:', error.message);
      return false;
    }
  }

  /**
   * Cleanup selected collections
   */
  async cleanupSelectedCollections() {
    console.log('🗑️  CLEANING SELECTED COLLECTIONS\n');

    try {
      // Sort collections by cleanup order
      const orderedCollections = this.cleanupOrder.filter((col) =>
        this.selectedCollections.includes(col)
      );

      for (const collection of orderedCollections) {
        await this.cleanupCollection(collection);
      }

      console.log('✅ Selected collections cleanup completed successfully!\n');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Cleanup a specific collection
   */
  async cleanupCollection(collectionName) {
    const collectionInfo = this.availableCollections[collectionName];
    console.log(`🗑️  Cleaning up ${collectionInfo.name}...`);

    try {
      switch (collectionName) {
        case 'users':
          await this.cleanupUsers();
          break;
        case 'roles':
          await this.cleanupRoles();
          break;
        case 'levels':
          await this.cleanupLevels();
          break;
        case 'structures':
          await this.cleanupStructures();
          break;
        case 'nodes':
          await this.cleanupNodes();
          break;
        default:
          console.log(`   ❌ Unknown collection: ${collectionName}`);
      }
    } catch (error) {
      console.log(
        `   ❌ ${collectionInfo.name} cleanup failed: ${error.message}`
      );
    }
  }

  /**
   * Cleanup Nodes
   */
  async cleanupNodes() {
    try {
      const nodes = await Nodes.find({ tenantId: this.tenantId });

      for (const node of nodes) {
        try {
          await Nodes.deleteNodeById(node._id, this.tenantId);
          this.cleanupResults.nodes.deleted++;
          this.cleanupResults.nodes.details.push({
            name: node.name,
            id: node._id,
            status: 'deleted',
          });
          console.log(`   ✅ Deleted node: ${node.name}`);
        } catch (error) {
          this.cleanupResults.nodes.errors++;
          this.cleanupResults.nodes.details.push({
            name: node.name,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to delete node "${node.name}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Nodes: ${this.cleanupResults.nodes.deleted} deleted, ${this.cleanupResults.nodes.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Nodes cleanup failed: ${error.message}`);
    }
  }

  /**
   * Cleanup Structures
   */
  async cleanupStructures() {
    try {
      const structures = await Structures.find({ tenantId: this.tenantId });

      for (const structure of structures) {
        try {
          await Structures.deleteStructure(structure._id);
          this.cleanupResults.structures.deleted++;
          this.cleanupResults.structures.details.push({
            name: structure.name,
            id: structure._id,
            status: 'deleted',
          });
          console.log(`   ✅ Deleted structure: ${structure.name}`);
        } catch (error) {
          this.cleanupResults.structures.errors++;
          this.cleanupResults.structures.details.push({
            name: structure.name,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to delete structure "${structure.name}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Structures: ${this.cleanupResults.structures.deleted} deleted, ${this.cleanupResults.structures.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Structures cleanup failed: ${error.message}`);
    }
  }

  /**
   * Cleanup Levels
   */
  async cleanupLevels() {
    try {
      const levels = await Level.find({ tenantId: this.tenantId });

      for (const level of levels) {
        try {
          await Level.findByIdAndDelete(level._id);
          this.cleanupResults.levels.deleted++;
          this.cleanupResults.levels.details.push({
            name: level.name,
            id: level._id,
            status: 'deleted',
          });
          console.log(`   ✅ Deleted level: ${level.name}`);
        } catch (error) {
          this.cleanupResults.levels.errors++;
          this.cleanupResults.levels.details.push({
            name: level.name,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to delete level "${level.name}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Levels: ${this.cleanupResults.levels.deleted} deleted, ${this.cleanupResults.levels.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Levels cleanup failed: ${error.message}`);
    }
  }

  /**
   * Cleanup Users (except tenant owner)
   */
  async cleanupUsers() {
    try {
      const users = await User.find({
        tenantId: this.tenantId,
        email: { $ne: this.tenantOwner.ownerEmail },
      });

      for (const user of users) {
        try {
          user.deletedAt = new Date();
          await user.save();
          this.cleanupResults.users.deleted++;
          this.cleanupResults.users.details.push({
            email: user.email,
            id: user._id,
            status: 'deleted',
          });
          console.log(`   ✅ Deleted user: ${user.email}`);
        } catch (error) {
          this.cleanupResults.users.errors++;
          this.cleanupResults.users.details.push({
            email: user.email,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to delete user "${user.email}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Users: ${this.cleanupResults.users.deleted} deleted, ${this.cleanupResults.users.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Users cleanup failed: ${error.message}`);
    }
  }

  /**
   * Cleanup Roles (except Support Agent)
   */
  async cleanupRoles() {
    try {
      const roles = await Role.find({
        tenantId: this.tenantId,
        name: { $ne: 'Support Agent' },
      });

      for (const role of roles) {
        try {
          await Role.findByIdAndDelete(role._id);
          this.cleanupResults.roles.deleted++;
          this.cleanupResults.roles.details.push({
            name: role.name,
            id: role._id,
            status: 'deleted',
          });
          console.log(`   ✅ Deleted role: ${role.name}`);
        } catch (error) {
          this.cleanupResults.roles.errors++;
          this.cleanupResults.roles.details.push({
            name: role.name,
            error: error.message,
            status: 'failed',
          });
          console.log(
            `   ❌ Failed to delete role "${role.name}": ${error.message}`
          );
        }
      }

      console.log(
        `   📊 Roles: ${this.cleanupResults.roles.deleted} deleted, ${this.cleanupResults.roles.errors} errors\n`
      );
    } catch (error) {
      console.log(`   ❌ Roles cleanup failed: ${error.message}`);
    }
  }

  /**
   * Generate cleanup report
   */
  generateReport() {
    console.log('📊 INTERACTIVE CLEANUP SUMMARY REPORT\n');
    console.log('='.repeat(60));
    console.log(`Tenant ID: ${this.tenantId}`);
    console.log(
      `Owner: ${this.tenantOwner.ownerName} (${this.tenantOwner.ownerEmail})`
    );
    console.log('='.repeat(60));

    // Only show results for collections that were processed
    this.selectedCollections.forEach((collection) => {
      const result = this.cleanupResults[collection];
      console.log(`\n${collection.toUpperCase()}:`);
      console.log(`  🗑️  Deleted: ${result.deleted}`);
      console.log(`  ❌ Errors: ${result.errors}`);
      console.log(`  📁 Total: ${result.deleted + result.errors}`);
    });

    const totalDeleted = this.selectedCollections.reduce(
      (sum, col) => sum + this.cleanupResults[col].deleted,
      0
    );
    const totalErrors = this.selectedCollections.reduce(
      (sum, col) => sum + this.cleanupResults[col].errors,
      0
    );

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TOTAL: ${totalDeleted} deleted, ${totalErrors} errors`);
    console.log('='.repeat(60));

    if (totalErrors === 0) {
      console.log('🎉 Interactive cleanup completed successfully!');
    } else {
      console.log('⚠️  Some cleanup errors occurred. Check the details above.');
    }
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
 * Main interactive cleanup function
 */
async function runInteractiveCleanup() {
  const cleanup = new InteractiveDatabaseCleanup();

  try {
    // Initialize
    await cleanup.initialize();

    // Step 1: Select tenant
    const tenantSelected = await cleanup.selectTenant();
    if (!tenantSelected) {
      console.log('❌ No tenant selected. Exiting...');
      return;
    }

    // Step 2: Select collections
    const collectionsSelected = await cleanup.selectCollections();
    if (!collectionsSelected) {
      console.log('❌ No collections selected. Exiting...');
      return;
    }

    // Step 3: Preview data
    const previewShown = await cleanup.previewData();
    if (!previewShown) {
      console.log('❌ Preview failed. Exiting...');
      return;
    }

    // Step 4: Final confirmation
    const confirmed = await cleanup.confirmCleanup();
    if (!confirmed) {
      console.log('❌ Cleanup cancelled by user.');
      return;
    }

    // Step 5: Execute cleanup
    await cleanup.cleanupSelectedCollections();

    // Step 6: Generate report
    cleanup.generateReport();
  } catch (error) {
    console.error('❌ Interactive cleanup failed:', error.message);
  } finally {
    await cleanup.cleanup();
  }
}

// Run interactive cleanup if this file is executed directly
if (require.main === module) {
  runInteractiveCleanup();
}

module.exports = InteractiveDatabaseCleanup;
