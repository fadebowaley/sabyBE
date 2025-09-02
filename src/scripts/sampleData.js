const mongoose = require('mongoose');
const { Level } = require('../models');
const { Structures } = require('../models');
const { Nodes } = require('../models');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/halo', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const createSampleData = async () => {
  try {
    // Create Levels
    const levels = await Level.create([
      { name: 'Headquarters', rank: 1, description: 'Top level organization' },
      { name: 'Region', rank: 2, description: 'Regional office' },
      { name: 'Branch', rank: 3, description: 'Local branch office' },
    ]);

    // Create Structures
    const structures = await Structures.create([
      {
        name: 'HQ Lagos',
        level: levels[0]._id,
        type: 'headquarters',
        description: 'Main headquarters in Lagos',
      },
      {
        name: 'South West Region',
        level: levels[1]._id,
        type: 'region',
        description: 'South West Regional Office',
        parent: null, // Will be updated after HQ is created
      },
      {
        name: 'Ikeja Branch',
        level: levels[2]._id,
        type: 'branch',
        description: 'Ikeja Branch Office',
        parent: null, // Will be updated after Region is created
      },
    ]);

    // Update parent references
    structures[1].parent = structures[0]._id;
    structures[2].parent = structures[1]._id;
    await Promise.all(structures.map((s) => s.save()));

    // Create Nodes
    const nodes = await Nodes.create([
      {
        name: 'HQ Operations',
        level: levels[0]._id,
        structure: structures[0]._id,
        address: '123 Victoria Island',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        postalCode: '101241',
        dateOfEstablishment: new Date('2020-01-01'),
        isMain: true,
      },
      {
        name: 'South West Operations',
        level: levels[1]._id,
        structure: structures[1]._id,
        address: '456 Ibadan Road',
        city: 'Ibadan',
        state: 'Oyo',
        country: 'Nigeria',
        postalCode: '200001',
        dateOfEstablishment: new Date('2020-02-01'),
        parent: null, // Will be updated after HQ node is created
      },
      {
        name: 'Ikeja Operations',
        level: levels[2]._id,
        structure: structures[2]._id,
        address: '789 Allen Avenue',
        city: 'Ikeja',
        state: 'Lagos',
        country: 'Nigeria',
        postalCode: '100001',
        dateOfEstablishment: new Date('2020-03-01'),
        parent: null, // Will be updated after Region node is created
      },
    ]);

    // Update parent references for nodes
    nodes[1].parent = nodes[0]._id;
    nodes[2].parent = nodes[1]._id;
    await Promise.all(nodes.map((n) => n.save()));

    console.log('Sample data created successfully!');
    console.log('Levels:', levels.length);
    console.log('Structures:', structures.length);
    console.log('Nodes:', nodes.length);

    // Print hierarchy information
    console.log('\nHierarchy Information:');
    for (const node of nodes) {
      const ancestors = await Nodes.getAncestors(node._id);
      const descendants = await Nodes.getDescendants(node._id);
      console.log(`\nNode: ${node.name}`);
      console.log('Ancestors:', ancestors.map((a) => a.name).join(' -> '));
      console.log('Descendants:', descendants.map((d) => d.name).join(', '));
    }
  } catch (error) {
    console.error('Error creating sample data:', error);
  } finally {
    mongoose.disconnect();
  }
};

createSampleData();
