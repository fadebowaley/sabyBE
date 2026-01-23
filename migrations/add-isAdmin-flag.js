#!/usr/bin/env node

/**
 * Migration: Add isAdmin Flag to Users
 * 
 * Adds the isAdmin flag to all existing users
 * isAdmin = false by default (privileged regular user flag)
 * 
 * Run from inside Docker: docker exec saby-backend-local node migrations/add-isAdmin-flag.js
 */

const mongoose = require('mongoose');

async function addAdminFlag() {
  try {
    const MONGODB_URI = process.env.MONGODB_URL || 'mongodb://admin:local_mongo_2025@mongodb:27017/halo-local?authSource=admin&replicaSet=rs0';
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    console.log('📊 Adding isAdmin flag to users collection...\n');

    // Get current user counts
    const totalUsers = await db.collection('users').countDocuments({});
    const usersWithAdmin = await db.collection('users').countDocuments({ isAdmin: { $exists: true } });
    
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Users with isAdmin field: ${usersWithAdmin}`);
    console.log('');

    // Add isAdmin: false to all users that don't have it
    const result = await db.collection('users').updateMany(
      { isAdmin: { $exists: false } },
      { $set: { isAdmin: false } }
    );

    console.log('✅ Migration complete!');
    console.log(`   Modified: ${result.modifiedCount} users`);
    console.log(`   Matched: ${result.matchedCount} users`);
    console.log('');

    // Verify
    const afterCount = await db.collection('users').countDocuments({ isAdmin: { $exists: true } });
    console.log(`   Users with isAdmin field after migration: ${afterCount}`);
    console.log('');

    // Show admin count
    const adminCount = await db.collection('users').countDocuments({ isAdmin: true });
    console.log(`   Users with isAdmin=true: ${adminCount}`);
    console.log('');

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              ✅ isAdmin FLAG ADDED SUCCESSFULLY!             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📝 What isAdmin means:');
    console.log('   • Privileged user above regular users');
    console.log('   • Can access web portal (regular users cannot)');
    console.log('   • Limited permissions (view & create, not delete)');
    console.log('   • Still bound by hierarchical node access');
    console.log('');
    console.log('🎯 User Hierarchy:');
    console.log('   1. isSaby (God mode - all tenants)');
    console.log('   2. isSuper (Super user - all nodes in tenant)');
    console.log('   3. isOwner (Owner - all nodes in tenant)');
    console.log('   4. isAdmin (Admin - portal access, limited permissions) ⭐ NEW');
    console.log('   5. Regular (Basic user - no portal access)');
    console.log('');

    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

addAdminFlag();

