/**
 * Migration Script: Merge ChurchProfile (NodeProfile) into Node Model
 *
 * This script migrates all ChurchProfile documents into their corresponding Node documents
 * as a nested 'profile' field, eliminating the need for a separate ChurchProfile collection.
 *
 * Date: October 31, 2025
 * Task: Model Merge - ChurchProfile → Node
 */

const mongoose = require('mongoose');
const config = require('../config/config');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Migration function
const migrateChurchProfiles = async () => {
  try {
    console.log('\n🚀 Starting ChurchProfile → Node migration...\n');

    // Get direct access to collections
    const db = mongoose.connection.db;
    const nodesCollection = db.collection('nodes');
    const churchProfilesCollection = db.collection('churchprofiles');

    // Get counts
    const totalNodes = await nodesCollection.countDocuments();
    const totalProfiles = await churchProfilesCollection.countDocuments();

    console.log(`📊 Found ${totalNodes} nodes`);
    console.log(`📊 Found ${totalProfiles} church profiles\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Get all church profiles
    const profiles = await churchProfilesCollection.find({}).toArray();

    console.log(`📦 Processing ${profiles.length} profiles...\n`);

    for (const profile of profiles) {
      try {
        const nodeId = profile.church;

        if (!nodeId) {
          console.warn(
            `⚠️  Profile ${profile._id} has no church reference - skipping`
          );
          skipped++;
          continue;
        }

        // Build profile object
        const profileData = {
          propertyStatus: profile.propertyStatus || 'Owned',
          estimatedValue: profile.estimatedValue || null,
          buildingType: profile.buildingType || null,
          facilityStatus: profile.status || 'Active', // Map old 'status' to 'facilityStatus'
        };

        // Update node with profile data
        // Note: Don't overwrite dateOfEstablishment as it already exists in Node model
        const result = await nodesCollection.updateOne(
          { _id: nodeId },
          { $set: { profile: profileData } }
        );

        if (result.matchedCount === 0) {
          console.warn(
            `⚠️  Node ${nodeId} not found for profile ${profile._id}`
          );
          skipped++;
        } else if (result.modifiedCount > 0) {
          migrated++;
          if (migrated % 10 === 0) {
            console.log(
              `   Progress: ${migrated}/${profiles.length} profiles migrated`
            );
          }
        } else {
          console.warn(`⚠️  Node ${nodeId} already has profile data`);
          skipped++;
        }
      } catch (error) {
        console.error(
          `❌ Error migrating profile ${profile._id}:`,
          error.message
        );
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${migrated}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('='.repeat(60) + '\n');

    // Verify migration
    const nodesWithProfile = await nodesCollection.countDocuments({
      profile: { $exists: true },
    });
    console.log(`✅ Nodes with profile field: ${nodesWithProfile}\n`);

    if (migrated > 0) {
      console.log('💡 Next steps:');
      console.log('   1. Verify migrated data in MongoDB');
      console.log('   2. Test node operations with profile data');
      console.log('   3. If successful, delete old churchprofiles collection');
      console.log('   4. Update frontend to use new structure\n');
    }

    return { migrated, skipped, errors };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    const result = await migrateChurchProfiles();

    if (result.errors === 0) {
      console.log('🎉 Migration completed successfully!\n');
      process.exit(0);
    } else {
      console.log(`⚠️  Migration completed with ${result.errors} errors\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { migrateChurchProfiles };
