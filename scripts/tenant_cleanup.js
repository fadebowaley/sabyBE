const mongoose = require('mongoose');
const config = require('../src/config/config');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Level = require('../src/models/level.model');
const Structures = require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');

/**
 * Tenant-Specific Database Cleanup Script
 * Allows cleaning specific collections for a specific tenant via command-line arguments
 * 
 * Usage:
 *   node scripts/tenant_cleanup.js <tenantId> <collections...>
 *   node scripts/tenant_cleanup.js <tenantId> all
 *   node scripts/tenant_cleanup.js --list-tenants
 *   node scripts/tenant_cleanup.js --help
 */
class TenantDatabaseCleanup {
  constructor(tenantId = null, collections = []) {
    this.tenantId = tenantId;
    this.tenantOwner = null;
    this.collections = collections;
    this.cleanupResults = {
      users: { deleted: 0, errors: 0, details: [] },
      roles: { deleted: 0, errors: 0, details: [] },
      levels: { deleted: 0, errors: 0, details: [] },
      structures: { deleted: 0, errors: 0, details: [] },
      nodes: { deleted: 0, errors: 0, details: [] }
    };
    
    // Define cleanup order (reverse of creation order)
    this.cleanupOrder = ['nodes', 'structures', 'levels', 'users', 'roles'];
    
    // Define available collections
    this.availableCollections = {
      'users': { name: 'Users', description: 'User accounts (except tenant owner)' },
      'roles': { name: 'Roles', description: 'User roles (except Support Agent)' },
      'levels': { name: 'Levels', description: 'Organizational hierarchy levels' },
      'structures': { name: 'Structures', description: 'Organizational structures' },
      'nodes': { name: 'Nodes', description: 'Physical/logical nodes' }
    };
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log('🧹 Tenant-Specific Database Cleanup Tool\n');
    console.log('Usage:');
    console.log('  node scripts/tenant_cleanup.js <tenantId> [collections...]');
    console.log('  node scripts/tenant_cleanup.js <tenantId> all');
    console.log('  node scripts/tenant_cleanup.js --list-tenants');
    console.log('  node scripts/tenant_cleanup.js --help\n');
    
    console.log('Available Collections:');
    Object.entries(this.availableCollections).forEach(([key, info]) => {
      console.log(`  ${key.padEnd(12)} - ${info.description}`);
    });
    
    console.log('\nExamples:');
    console.log('  node scripts/tenant_cleanup.js yawzTWT6ra users roles');
    console.log('  node scripts/tenant_cleanup.js yawzTWT6ra levels structures nodes');
    console.log('  node scripts/tenant_cleanup.js yawzTWT6ra all');
    console.log('  node scripts/tenant_cleanup.js yawzTWT6ra nodes');
    console.log('  node scripts/tenant_cleanup.js --list-tenants');
    
    console.log('\n⚠️  WARNING: This will permanently delete data!');
    console.log('   Always backup your database before running cleanup.');
  }

  /**
   * List all tenants
   */
  async listTenants() {
    try {
      console.log('📊 LISTING ALL TENANTS:\n');

      // Get all tenant owners (users with isOwner: true)
      const owners = await User.find({ isOwner: true }).select('email firstname lastname tenantId createdAt');
      
      if (owners.length === 0) {
        console.log('❌ No tenants found in the database.');
        return;
      }

      console.log('=' .repeat(120));
      console.log('| # | Tenant ID    | Owner Name           | Owner Email              | Users | Roles | Levels | Structures | Nodes | Total |');
      console.log('=' .repeat(120));
      
      for (let i = 0; i < owners.length; i++) {
        const owner = owners[i];
        
        // Count users in this tenant
        const userCount = await User.countDocuments({ tenantId: owner.tenantId });
        const roleCount = await Role.countDocuments({ tenantId: owner.tenantId });
        const levelCount = await Level.countDocuments({ tenantId: owner.tenantId });
        const structureCount = await Structures.countDocuments({ tenantId: owner.tenantId });
        const nodeCount = await Nodes.countDocuments({ tenantId: owner.tenantId });
        const totalRecords = userCount + roleCount + levelCount + structureCount + nodeCount;

        const row = `| ${(i + 1).toString().padStart(2)} | ${owner.tenantId.padEnd(12)} | ${(owner.firstname + ' ' + owner.lastname).padEnd(19)} | ${owner.email.padEnd(24)} | ${userCount.toString().padStart(5)} | ${roleCount.toString().padStart(5)} | ${levelCount.toString().padStart(6)} | ${structureCount.toString().padStart(10)} | ${nodeCount.toString().padStart(5)} | ${totalRecords.toString().padStart(5)} |`;
        console.log(row);
      }
      
      console.log('=' .repeat(120));
      console.log('');
    } catch (error) {
      console.error('❌ Failed to list tenants:', error.message);
    }
  }

  /**
   * Validate arguments
   */
  validateArguments() {
    if (this.collections.includes('--help') || this.collections.includes('-h')) {
      this.showHelp();
      return false;
    }

    if (this.collections.includes('--list-tenants') || this.tenantId === '--list-tenants') {
      return 'list-tenants';
    }

    if (!this.tenantId) {
      console.log('❌ Tenant ID is required.');
      console.log('Use --help for usage information.');
      return false;
    }

    if (this.collections.includes('all')) {
      this.collections = Object.keys(this.availableCollections);
      return true;
    }

    // Validate each collection
    const invalidCollections = this.collections.filter(col => 
      !this.availableCollections[col]
    );

    if (invalidCollections.length > 0) {
      console.log('❌ Invalid collection(s):', invalidCollections.join(', '));
      console.log('\nAvailable collections:', Object.keys(this.availableCollections).join(', '));
      console.log('Use --help for more information.');
      return false;
    }

    return true;
  }

  /**
   * Initialize database connection and validate tenant
   */
  async initialize() {
    try {
      console.log('🧹 Initializing Tenant-Specific Database Cleanup...\n');

      // Connect to MongoDB
      await mongoose.connect(config.mongoose.url, config.mongoose.options);
      console.log('✅ Connected to MongoDB');

      // Skip tenant validation for list-tenants command
      if (this.tenantId === '--list-tenants') {
        return;
      }

      // Validate tenant exists
      const tenantOwner = await User.findOne({ 
        tenantId: this.tenantId,
        isOwner: true 
      });
      
      if (!tenantOwner) {
        throw new Error(`Tenant ID "${this.tenantId}" not found or has no owner`);
      }

      this.tenantOwner = tenantOwner;
      console.log(`   ✅ Tenant ID: ${this.tenantId}`);
      console.log(`   👤 Owner: ${tenantOwner.firstname} ${tenantOwner.lastname} (${tenantOwner.email})`);
      console.log(`   🎯 Target Collections: ${this.collections.join(', ')}`);
      console.log('');

    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Preview data that will be deleted
   */
  async previewData() {
    try {
      console.log('🔍 PREVIEWING DATA TO BE DELETED:\n');
      console.log('=' .repeat(80));

      for (const collection of this.collections) {
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

      console.log('\n' + '=' .repeat(80));
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
          email: { $ne: this.tenantOwner.email }
        });
      case 'roles':
        return await Role.countDocuments({ 
          tenantId: this.tenantId,
          name: { $ne: 'Support Agent' }
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
          email: { $ne: this.tenantOwner.email }
        }).select('email firstname lastname').limit(limit);
      case 'roles':
        return await Role.find({ 
          tenantId: this.tenantId,
          name: { $ne: 'Support Agent' }
        }).select('name description').limit(limit);
      case 'levels':
        return await Level.find({ tenantId: this.tenantId })
          .select('name description rank').limit(limit);
      case 'structures':
        return await Structures.find({ tenantId: this.tenantId })
          .select('name type description').limit(limit);
      case 'nodes':
        return await Nodes.find({ tenantId: this.tenantId })
          .select('name level structure').limit(limit);
      default:
        return [];
    }
  }

  /**
   * Cleanup selected collections
   */
  async cleanupSelectedCollections() {
    console.log('🗑️  CLEANING SELECTED COLLECTIONS\n');

    try {
      // Sort collections by cleanup order
      const orderedCollections = this.cleanupOrder.filter(col => 
        this.collections.includes(col)
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
      console.log(`   ❌ ${collectionInfo.name} cleanup failed: ${error.message}`);
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
            status: 'deleted'
          });
          console.log(`   ✅ Deleted node: ${node.name}`);
        } catch (error) {
          this.cleanupResults.nodes.errors++;
          this.cleanupResults.nodes.details.push({
            name: node.name,
            error: error.message,
            status: 'failed'
          });
          console.log(`   ❌ Failed to delete node "${node.name}": ${error.message}`);
        }
      }

      console.log(`   📊 Nodes: ${this.cleanupResults.nodes.deleted} deleted, ${this.cleanupResults.nodes.errors} errors\n`);
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
            status: 'deleted'
          });
          console.log(`   ✅ Deleted structure: ${structure.name}`);
        } catch (error) {
          this.cleanupResults.structures.errors++;
          this.cleanupResults.structures.details.push({
            name: structure.name,
            error: error.message,
            status: 'failed'
          });
          console.log(`   ❌ Failed to delete structure "${structure.name}": ${error.message}`);
        }
      }

      console.log(`   📊 Structures: ${this.cleanupResults.structures.deleted} deleted, ${this.cleanupResults.structures.errors} errors\n`);
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
            status: 'deleted'
          });
          console.log(`   ✅ Deleted level: ${level.name}`);
        } catch (error) {
          this.cleanupResults.levels.errors++;
          this.cleanupResults.levels.details.push({
            name: level.name,
            error: error.message,
            status: 'failed'
          });
          console.log(`   ❌ Failed to delete level "${level.name}": ${error.message}`);
        }
      }

      console.log(`   📊 Levels: ${this.cleanupResults.levels.deleted} deleted, ${this.cleanupResults.levels.errors} errors\n`);
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
        email: { $ne: this.tenantOwner.email }
      });
      
      for (const user of users) {
        try {
          user.deletedAt = new Date();
          await user.save();
          this.cleanupResults.users.deleted++;
          this.cleanupResults.users.details.push({
            email: user.email,
            id: user._id,
            status: 'deleted'
          });
          console.log(`   ✅ Deleted user: ${user.email}`);
        } catch (error) {
          this.cleanupResults.users.errors++;
          this.cleanupResults.users.details.push({
            email: user.email,
            error: error.message,
            status: 'failed'
          });
          console.log(`   ❌ Failed to delete user "${user.email}": ${error.message}`);
        }
      }

      console.log(`   📊 Users: ${this.cleanupResults.users.deleted} deleted, ${this.cleanupResults.users.errors} errors\n`);
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
        name: { $ne: 'Support Agent' }
      });
      
      for (const role of roles) {
        try {
          await Role.findByIdAndDelete(role._id);
          this.cleanupResults.roles.deleted++;
          this.cleanupResults.roles.details.push({
            name: role.name,
            id: role._id,
            status: 'deleted'
          });
          console.log(`   ✅ Deleted role: ${role.name}`);
        } catch (error) {
          this.cleanupResults.roles.errors++;
          this.cleanupResults.roles.details.push({
            name: role.name,
            error: error.message,
            status: 'failed'
          });
          console.log(`   ❌ Failed to delete role "${role.name}": ${error.message}`);
        }
      }

      console.log(`   📊 Roles: ${this.cleanupResults.roles.deleted} deleted, ${this.cleanupResults.roles.errors} errors\n`);
    } catch (error) {
      console.log(`   ❌ Roles cleanup failed: ${error.message}`);
    }
  }

  /**
   * Generate cleanup report
   */
  generateReport() {
    console.log('📊 TENANT-SPECIFIC CLEANUP SUMMARY REPORT\n');
    console.log('=' .repeat(60));
    console.log(`Tenant ID: ${this.tenantId}`);
    console.log(`Owner: ${this.tenantOwner.firstname} ${this.tenantOwner.lastname} (${this.tenantOwner.email})`);
    console.log('=' .repeat(60));
    
    // Only show results for collections that were processed
    this.collections.forEach(collection => {
      const result = this.cleanupResults[collection];
      console.log(`\n${collection.toUpperCase()}:`);
      console.log(`  🗑️  Deleted: ${result.deleted}`);
      console.log(`  ❌ Errors: ${result.errors}`);
      console.log(`  📁 Total: ${result.deleted + result.errors}`);
    });

    const totalDeleted = this.collections.reduce((sum, col) => 
      sum + this.cleanupResults[col].deleted, 0
    );
    const totalErrors = this.collections.reduce((sum, col) => 
      sum + this.cleanupResults[col].errors, 0
    );
    
    console.log('\n' + '=' .repeat(60));
    console.log(`TOTAL: ${totalDeleted} deleted, ${totalErrors} errors`);
    console.log('=' .repeat(60));
    
    if (totalErrors === 0) {
      console.log('🎉 Tenant-specific cleanup completed successfully!');
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
 * Main cleanup function
 */
async function runTenantCleanup() {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('❌ No arguments provided.');
    console.log('Use --help for usage information.');
    process.exit(1);
  }

  const tenantId = args[0];
  const collections = args.slice(1);
  
  const cleanup = new TenantDatabaseCleanup(tenantId, collections);
  
  // Validate arguments
  const validation = cleanup.validateArguments();
  if (validation === false) {
    process.exit(1);
  }
  
  if (validation === 'list-tenants') {
    try {
      await cleanup.initialize();
      await cleanup.listTenants();
    } catch (error) {
      console.error('❌ Failed to list tenants:', error.message);
    } finally {
      await cleanup.cleanup();
    }
    return;
  }

  try {
    // Initialize
    await cleanup.initialize();

    // Show warning
    console.log('⚠️  WARNING: This will delete data from the following collections:');
    cleanup.collections.forEach(col => {
      const info = cleanup.availableCollections[col];
      console.log(`   - ${info.name}: ${info.description}`);
    });
    console.log('');

    // Preview data
    await cleanup.previewData();

    // Cleanup selected collections
    await cleanup.cleanupSelectedCollections();

    // Generate report
    cleanup.generateReport();

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  } finally {
    await cleanup.cleanup();
  }
}

// Run cleanup if this file is executed directly
if (require.main === module) {
  runTenantCleanup();
}

module.exports = TenantDatabaseCleanup;
