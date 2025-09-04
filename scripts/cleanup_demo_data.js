const mongoose = require('mongoose');
const config = require('../src/config/config');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Level = require('../src/models/level.model');
const Structures = require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');

/**
 * Cleanup Demo Data Script
 * Safely removes all demo/test data from the database
 */
class DatabaseCleanup {
  constructor() {
    this.tenantId = null;
    this.cleanupResults = {
      users: { deleted: 0, errors: 0, details: [] },
      roles: { deleted: 0, errors: 0, details: [] },
      levels: { deleted: 0, errors: 0, details: [] },
      structures: { deleted: 0, errors: 0, details: [] },
      nodes: { deleted: 0, errors: 0, details: [] }
    };
  }

  /**
   * Initialize database connection and get tenant context
   */
  async initialize() {
    try {
      console.log('🧹 Initializing Database Cleanup...\n');

      // Connect to MongoDB
      await mongoose.connect(config.mongoose.url, config.mongoose.options);
      console.log('✅ Connected to MongoDB');

      // Get tenant context from fadebowaley@gmail.com
      const fadebowale = await User.findOne({ email: 'fadebowaley@gmail.com' });
      if (!fadebowale) {
        throw new Error('fadebowaley@gmail.com not found in database');
      }

      this.tenantId = fadebowale.tenantId;
      console.log(`   ✅ Tenant ID: ${this.tenantId}`);
      console.log('');

    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Cleanup all demo data in reverse order of creation
   */
  async cleanupAllDemoData() {
    console.log('🗑️  CLEANING UP DEMO DATA\n');

    try {
      // Cleanup in reverse order to maintain referential integrity
      await this.cleanupNodes();
      await this.cleanupStructures();
      await this.cleanupLevels();
      await this.cleanupUsers();
      await this.cleanupRoles();

      console.log('✅ Demo data cleanup completed successfully!\n');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Cleanup Nodes (delete first due to dependencies)
   */
  async cleanupNodes() {
    console.log('1️⃣ Cleaning up Nodes...');
    
    try {
      // Find all nodes for this tenant
      const nodes = await Nodes.find({ tenantId: this.tenantId });
      
      for (const node of nodes) {
        try {
          // Soft delete the node
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
    console.log('2️⃣ Cleaning up Structures...');
    
    try {
      // Find all structures for this tenant
      const structures = await Structures.find({ tenantId: this.tenantId });
      
      for (const structure of structures) {
        try {
          // Delete the structure
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
    console.log('3️⃣ Cleaning up Levels...');
    
    try {
      // Find all levels for this tenant
      const levels = await Level.find({ tenantId: this.tenantId });
      
      for (const level of levels) {
        try {
          // Delete the level
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
   * Cleanup Users (except fadebowaley@gmail.com)
   */
  async cleanupUsers() {
    console.log('4️⃣ Cleaning up Users...');
    
    try {
      // Find all users for this tenant except the main user
      const users = await User.find({ 
        tenantId: this.tenantId,
        email: { $ne: 'fadebowaley@gmail.com' }
      });
      
      for (const user of users) {
        try {
          // Soft delete the user
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
   * Cleanup Roles (except Support Agent which was created earlier)
   */
  async cleanupRoles() {
    console.log('5️⃣ Cleaning up Roles...');
    
    try {
      // Find all roles for this tenant except Support Agent
      const roles = await Role.find({ 
        tenantId: this.tenantId,
        name: { $ne: 'Support Agent' }
      });
      
      for (const role of roles) {
        try {
          // Delete the role
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
    console.log('📊 CLEANUP SUMMARY REPORT\n');
    console.log('=' .repeat(50));
    
    Object.entries(this.cleanupResults).forEach(([entity, result]) => {
      console.log(`${entity.toUpperCase()}:`);
      console.log(`  🗑️  Deleted: ${result.deleted}`);
      console.log(`  ❌ Errors: ${result.errors}`);
      console.log(`  📁 Total: ${result.deleted + result.errors}`);
      console.log('');
    });

    const totalDeleted = Object.values(this.cleanupResults).reduce((sum, r) => sum + r.deleted, 0);
    const totalErrors = Object.values(this.cleanupResults).reduce((sum, r) => sum + r.errors, 0);
    
    console.log('=' .repeat(50));
    console.log(`TOTAL: ${totalDeleted} deleted, ${totalErrors} errors`);
    console.log('=' .repeat(50));
    
    if (totalErrors === 0) {
      console.log('🎉 Database is now clean and ready for real data!');
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
async function runCleanup() {
  const cleanup = new DatabaseCleanup();
  
  try {
    // Initialize
    await cleanup.initialize();

    // Confirm cleanup
    console.log('⚠️  WARNING: This will delete ALL demo data from the database!');
    console.log('   This includes:');
    console.log('   - All demo users (except fadebowaley@gmail.com)');
    console.log('   - All demo roles (except Support Agent)');
    console.log('   - All demo levels');
    console.log('   - All demo structures');
    console.log('   - All demo nodes');
    console.log('');
    console.log('   The database will be ready for real data migration.');
    console.log('');

    // Cleanup all demo data
    await cleanup.cleanupAllDemoData();

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
  runCleanup();
}

module.exports = DatabaseCleanup;
