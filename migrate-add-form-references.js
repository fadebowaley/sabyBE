/**
 * Migration: Add formReference to existing forms
 * Run this once to add readable references to all existing forms
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Counter = require('./src/models/counter.model');
const ProjectForm = require('./src/models/projectForm.model');

async function migrateFormReferences() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to MongoDB');

    // Find all forms without formReference
    const formsWithoutRef = await ProjectForm.find({
      $or: [
        { formReference: { $exists: false } },
        { formReference: null },
        { formReference: '' },
      ],
    }).sort({ createdAt: 1 }); // Oldest first

    console.log(`📊 Found ${formsWithoutRef.length} forms without references`);

    if (formsWithoutRef.length === 0) {
      console.log('✅ All forms already have references!');
      process.exit(0);
    }

    // Generate and assign references
    for (const form of formsWithoutRef) {
      const formReference = await Counter.generateReference('formReference');
      form.formReference = formReference;
      await form.save();
      console.log(
        `✅ ${form.configuration.projectName}: ${formReference} (${form.projectId})`
      );
    }

    console.log(
      `\n🎉 Migration complete! Added references to ${formsWithoutRef.length} forms`
    );
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateFormReferences();
