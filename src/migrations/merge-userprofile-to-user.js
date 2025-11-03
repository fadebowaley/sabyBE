/**
 * Migration Script: Merge UserProfile into User Model
 *
 * This script migrates all UserProfile documents into their corresponding User documents
 * as a nested 'profile' field, eliminating the need for a separate UserProfile collection.
 *
 * Date: October 31, 2025
 * Task: Model Merge - UserProfile → User
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
const migrateUserProfiles = async () => {
  try {
    console.log('\n🚀 Starting UserProfile → User migration...\n');

    // Get direct access to collections
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const userProfilesCollection = db.collection('userprofiles');

    // Get counts
    const totalUsers = await usersCollection.countDocuments();
    const totalProfiles = await userProfilesCollection.countDocuments();

    console.log(`📊 Found ${totalUsers} users`);
    console.log(`📊 Found ${totalProfiles} user profiles\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Get all user profiles
    const profiles = await userProfilesCollection.find({}).toArray();

    console.log(`📦 Processing ${profiles.length} profiles...\n`);

    for (const profile of profiles) {
      try {
        const userId = profile.user;

        if (!userId) {
          console.warn(
            `⚠️  Profile ${profile._id} has no user reference - skipping`
          );
          skipped++;
          continue;
        }

        // Build profile object
        const profileData = {
          title: profile.title || null,
          otherName: profile.otherName || null,
          gender: profile.gender || null,
          dateOfBirth: profile.dateOfBirth || null,
          highestQualification: profile.highestQualification || null,
          professional: profile.professional || null,
          employmentCategory: profile.employmentCategory || null,
          occupation: profile.occupation || null,
          employeeId: profile.employeeId || null,
          maritalStatus: profile.maritalStatus || null,
          spouse: {
            name: profile.spouseName || null,
            phoneNumber: profile.spousePhoneNumber || null,
            dateOfBirth: profile.spouseDateOfBirth || null,
          },
          nextOfKin: {
            name: profile.nextOfKinName || null,
            phoneNumber: profile.nextOfKinPhoneNumber || null,
            relationship: profile.nextOfKinRelationship || null,
          },
          stateOfOrigin: profile.stateOfOrigin || null,
          lgaOfOrigin: profile.lgaOfOrigin || null,
          homeTown: profile.homeTown || null,
          residentialAddress: profile.residentialAddress || null,
          stateOfResidence: profile.stateOfResidence || null,
          lgaOfResidence: profile.lgaOfResidence || null,
        };

        // Update user with profile data
        const result = await usersCollection.updateOne(
          { _id: userId },
          { $set: { profile: profileData } }
        );

        if (result.matchedCount === 0) {
          console.warn(
            `⚠️  User ${userId} not found for profile ${profile._id}`
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
          console.warn(`⚠️  User ${userId} already has profile data`);
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
    const usersWithProfile = await usersCollection.countDocuments({
      profile: { $exists: true },
    });
    console.log(`✅ Users with profile field: ${usersWithProfile}\n`);

    if (migrated > 0) {
      console.log('💡 Next steps:');
      console.log('   1. Verify migrated data in MongoDB');
      console.log('   2. Test user operations with profile data');
      console.log('   3. If successful, delete old userprofiles collection');
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
    const result = await migrateUserProfiles();

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

module.exports = { migrateUserProfiles };
