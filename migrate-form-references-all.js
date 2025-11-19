/**
 * Migration: Add formReference to ALL existing forms
 * This version bypasses tenant filtering
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function migrateAllFormReferences() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to MongoDB');

    // Get direct access to collections (bypass Mongoose middleware)
    const db = mongoose.connection.db;
    const formsCollection = db.collection('projectforms');
    const countersCollection = db.collection('counters');

    // Find all forms without formReference
    const formsWithoutRef = await formsCollection
      .find({
        $or: [
          { formReference: { $exists: false } },
          { formReference: null },
          { formReference: '' }
        ]
      })
      .sort({ createdAt: 1 })
      .toArray();

    console.log(`📊 Found ${formsWithoutRef.length} forms without references`);

    if (formsWithoutRef.length === 0) {
      console.log('✅ All forms already have references!');
      process.exit(0);
    }

    // Generate and assign references
    for (const form of formsWithoutRef) {
      // Increment counter
      const counter = await countersCollection.findOneAndUpdate(
        { _id: 'formReference' },
        { 
          $inc: { seq: 1 },
          $setOnInsert: { prefix: 'SB', digits: 6 }
        },
        { upsert: true, returnDocument: 'after' }
      );

      const seq = counter.value || counter.seq || 1;
      const prefix = counter.value?.prefix || counter.prefix || 'SB';
      const digits = counter.value?.digits || counter.digits || 6;
      const paddedNumber = String(seq).padStart(digits, '0');
      const formReference = `#${prefix}-${paddedNumber}`;

      // Update form with reference
      await formsCollection.updateOne(
        { _id: form._id },
        { $set: { formReference } }
      );

      console.log(`✅ ${form.configuration?.projectName || 'Unnamed'}: ${formReference} (${form.projectId})`);
    }

    console.log(`\n🎉 Migration complete! Added references to ${formsWithoutRef.length} forms`);
    
    // Show final counter state
    const finalCounter = await countersCollection.findOne({ _id: 'formReference' });
    console.log(`\n📊 Final counter state:`, finalCounter);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateAllFormReferences();


