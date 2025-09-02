const mongoose = require('mongoose');
const Level = require('../src/models/level.model');
const Structures = require('../src/models/structure.model');
const config = require('../src/config/config');

// Connect to MongoDB
mongoose.connect(config.mongoose.url, config.mongoose.options);

// Wait for connection
mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB');
});

const createDefaultLevels = async (tenantId) => {
  try {
    console.log(`Creating default levels for tenant: ${tenantId}`);

    const defaultLevels = [
      { name: 'Headquarters', description: 'Main headquarters level', rank: 1, tenantId },
      { name: 'Region', description: 'Regional level', rank: 2, tenantId },
      { name: 'Branch', description: 'Branch level', rank: 3, tenantId },
      { name: 'Department', description: 'Department level', rank: 4, tenantId },
    ];

    for (const levelData of defaultLevels) {
      try {
        // Check if level exists with this tenant
        const existingLevel = await Level.findOne({ name: levelData.name, tenantId });
        if (!existingLevel) {
          // Check if level exists without tenant (legacy)
          const legacyLevel = await Level.findOne({ name: levelData.name });
          if (legacyLevel) {
            // Update existing level with tenantId
            legacyLevel.tenantId = tenantId;
            await legacyLevel.save();
            console.log(`Updated existing level with tenantId: ${levelData.name}`);
          } else {
            // Create new level
            const level = new Level(levelData);
            await level.save();
            console.log(`Created level: ${levelData.name}`);
          }
        } else {
          console.log(`Level already exists: ${levelData.name}`);
        }
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate key error - try to update existing
          const existingLevel = await Level.findOne({ name: levelData.name });
          if (existingLevel && !existingLevel.tenantId) {
            existingLevel.tenantId = tenantId;
            await existingLevel.save();
            console.log(`Updated existing level with tenantId: ${levelData.name}`);
          } else {
            console.log(`Level already exists with tenantId: ${levelData.name}`);
          }
        } else {
          console.error(`Error processing level ${levelData.name}:`, error.message);
        }
      }
    }

    console.log('Default levels created successfully!');
  } catch (error) {
    console.error('Error creating default levels:', error);
  }
};

const createDefaultStructures = async (tenantId) => {
  try {
    console.log(`Creating default structures for tenant: ${tenantId}`);

    // First get the levels
    const levels = await Level.find({ tenantId }).sort({ rank: 1 });
    if (levels.length === 0) {
      console.log('No levels found. Please create levels first.');
      return;
    }

    // Create structures for each level
    for (const level of levels) {
      const structureName = `${level.name} Structure`;
      const existingStructure = await Structures.findOne({ name: structureName, tenantId });

      if (!existingStructure) {
        const structureData = {
          name: structureName,
          type: 'administrative',
          level: level._id,
          tenantId,
        };

        const structure = new Structures(structureData);
        await structure.save();
        console.log(`Created structure: ${structureName} for level: ${level.name}`);
      } else {
        console.log(`Structure already exists: ${structureName}`);
      }
    }

    console.log('Default structures created successfully!');
  } catch (error) {
    console.error('Error creating default structures:', error);
  }
};

// Main function
const main = async () => {
  const tenantId = process.argv[2];

  if (!tenantId) {
    console.error('Please provide a tenant ID as an argument');
    console.log('Usage: node create-default-levels.js <tenantId>');
    process.exit(1);
  }

  try {
    // Wait for mongoose connection
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('Connected to MongoDB');

    await createDefaultLevels(tenantId);
    await createDefaultStructures(tenantId);
    console.log('All default data created successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.disconnect();
  }
};

main();
