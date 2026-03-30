#!/usr/bin/env node
/**
 * Backfill canonical publicRef for existing project forms.
 * Usage:
 *   node src/scripts/migrate-project-form-public-ref.js
 */

const mongoose = require('mongoose');
const config = require('../config/config');
const ProjectForm = require('../models/projectForm.model');

const generateUniquePublicRef = async (projectName = '') => {
  let attempts = 0;
  while (attempts < 10) {
    const candidate = ProjectForm.generatePublicRef(projectName);
    const exists = await ProjectForm.exists({ publicRef: candidate });
    if (!exists) {
      return candidate;
    }
    attempts += 1;
  }
  throw new Error('Failed to generate unique publicRef after multiple attempts');
};

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    // eslint-disable-next-line no-console
    console.log('Connected to MongoDB');

    const indexes = await ProjectForm.collection.indexes();
    const uniqueNameIndexes = indexes.filter(
      (index) =>
        index.unique &&
        index.key &&
        (Object.prototype.hasOwnProperty.call(index.key, 'configuration.projectName') ||
          Object.prototype.hasOwnProperty.call(index.key, 'configuration.projectNameLower'))
    );

    for (const index of uniqueNameIndexes) {
      // eslint-disable-next-line no-console
      console.log(`Dropping obsolete unique index: ${index.name}`);
      // eslint-disable-next-line no-await-in-loop
      await ProjectForm.collection.dropIndex(index.name);
    }

    const forms = await ProjectForm.find({
      $or: [
        { publicRef: { $exists: false } },
        { publicRef: null },
        { publicRef: '' },
      ],
    })
      .select('_id configuration.projectName')
      .sort({ createdAt: 1 });

    // eslint-disable-next-line no-console
    console.log(`Found ${forms.length} forms requiring publicRef backfill`);

    let updated = 0;
    for (const form of forms) {
      const publicRef = await generateUniquePublicRef(
        form?.configuration?.projectName || ''
      );
      await ProjectForm.updateOne({ _id: form._id }, { $set: { publicRef } });
      updated += 1;
      // eslint-disable-next-line no-console
      console.log(`Backfilled ${form._id} -> ${publicRef}`);
    }

    // eslint-disable-next-line no-console
    console.log(`Done. Backfilled ${updated} forms.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

run();
