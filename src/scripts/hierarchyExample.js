// Set NODE_ENV before requiring config
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');
const { Level } = require('../models');
const { Structures } = require('../models');
const { Nodes } = require('../models');

// MongoDB connection
const connectToDB = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Connected to MongoDB for hierarchy example.');
  } catch (err) {
    logger.error('Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

const createHierarchyExample = async () => {
  try {
    // Create or update Levels (including root level 0)
    const levels = await Promise.all([
      Level.findOneAndUpdate(
        { name: 'Root' },
        { name: 'Root', rank: 0, description: 'Root level organization' },
        { upsert: true, new: true }
      ),
      Level.findOneAndUpdate(
        { name: 'Headquarters' },
        {
          name: 'Headquarters',
          rank: 1,
          description: 'Top level organization',
        },
        { upsert: true, new: true }
      ),
      Level.findOneAndUpdate(
        { name: 'Region' },
        { name: 'Region', rank: 2, description: 'Regional office' },
        { upsert: true, new: true }
      ),
      Level.findOneAndUpdate(
        { name: 'Branch' },
        { name: 'Branch', rank: 3, description: 'Local branch office' },
        { upsert: true, new: true }
      ),
    ]);
    logger.info('Created/Updated levels successfully');

    // Create or update Structures with haloIds
    const structureData = [
      {
        name: 'Global Organization',
        level: levels[0]._id,
        type: 'headquarters',
        description: 'Root level organization',
      },
      {
        name: 'HQ Lagos',
        level: levels[1]._id,
        type: 'headquarters',
        description: 'Main headquarters in Lagos',
        parent: null, // Will be updated
      },
      {
        name: 'South West Region',
        level: levels[2]._id,
        type: 'region',
        description: 'South West Regional Office',
        parent: null, // Will be updated
      },
      {
        name: 'Ikeja Branch',
        level: levels[3]._id,
        type: 'branch',
        description: 'Ikeja Branch Office',
        parent: null, // Will be updated
      },
    ];

    // Generate haloIds for structures
    const structures = await Promise.all(
      structureData.map(async (data) => {
        const haloId = await Structures.generateHaloId(data.name);
        return Structures.findOneAndUpdate(
          { name: data.name },
          { ...data, haloId },
          { upsert: true, new: true }
        );
      })
    );
    logger.info('Created/Updated structures successfully');

    // Update parent references for structures
    structures[1].parent = structures[0]._id; // HQ Lagos under Global
    structures[2].parent = structures[1]._id; // South West under HQ
    structures[3].parent = structures[2]._id; // Ikeja under South West
    await Promise.all(structures.map((s) => s.save()));
    logger.info('Updated structure parent references');

    // Create or update Nodes
    const nodeData = [
      {
        name: 'Global Operations',
        level: levels[0]._id,
        structure: structures[0]._id,
        address: '1 Global Plaza',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        postalCode: '100001',
        dateOfEstablishment: new Date('2019-01-01'),
        isMain: true,
      },
      {
        name: 'HQ Operations',
        level: levels[1]._id,
        structure: structures[1]._id,
        address: '123 Victoria Island',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        postalCode: '101241',
        dateOfEstablishment: new Date('2020-01-01'),
        parent: null, // Will be updated
      },
      {
        name: 'South West Operations',
        level: levels[2]._id,
        structure: structures[2]._id,
        address: '456 Ibadan Road',
        city: 'Ibadan',
        state: 'Oyo',
        country: 'Nigeria',
        postalCode: '200001',
        dateOfEstablishment: new Date('2020-02-01'),
        parent: null, // Will be updated
      },
      {
        name: 'Ikeja Operations',
        level: levels[3]._id,
        structure: structures[3]._id,
        address: '789 Allen Avenue',
        city: 'Ikeja',
        state: 'Lagos',
        country: 'Nigeria',
        postalCode: '100001',
        dateOfEstablishment: new Date('2020-03-01'),
        parent: null, // Will be updated
      },
    ];

    // Create or update nodes with nodeIds
    const nodes = await Promise.all(
      nodeData.map(async (data) => {
        // First find if node exists
        const existingNode = await Nodes.findOne({ name: data.name });
        if (existingNode) {
          // If node exists, update it with new data but keep its nodeId
          return Nodes.findOneAndUpdate(
            { name: data.name },
            { ...data, nodeId: existingNode.nodeId },
            { new: true }
          );
        }
        // If node doesn't exist, generate new nodeId
        const nodeId = await Nodes.generateNodeId();
        return Nodes.create({ ...data, nodeId });
      })
    );
    logger.info('Created/Updated nodes successfully');

    // Update parent references for nodes
    nodes[1].parent = nodes[0]._id; // HQ under Global
    nodes[2].parent = nodes[1]._id; // South West under HQ
    nodes[3].parent = nodes[2]._id; // Ikeja under South West
    await Promise.all(nodes.map((n) => n.save()));
    logger.info('Updated node parent references');

    // Demonstrate enhanced hierarchy functionality
    logger.info('\n=== Enhanced Hierarchy Demonstration ===\n');

    // 1. Show complete hierarchy path for Ikeja Operations
    const ikejaNode = nodes[3];
    const ikejaHierarchyPath = await Nodes.getHierarchyPath(ikejaNode._id);
    logger.info('Complete Hierarchy Path for Ikeja Operations:');
    ikejaHierarchyPath.forEach((node) => {
      logger.info(
        `Level: ${node.level}, Name: ${node.name}, Fingerprint: ${node.fingerprint}`
      );
    });

    // 2. Get all nodes at Branch level
    const branchNodes = await Nodes.getNodesByLevel('branch');
    logger.info('\nAll Branch Level Nodes:');
    branchNodes.forEach((node) => {
      logger.info(`Name: ${node.name}, Fingerprint: ${node.fingerprint}`);
    });

    // 3. Show identity and hierarchy information for South West Operations
    const southWestNode = nodes[2];
    logger.info('\nSouth West Operations Details:');
    logger.info('Identity (Ancestor IDs):', southWestNode.identity);
    logger.info('Hierarchy Map:', Object.fromEntries(southWestNode.hierarchy));
    logger.info('Fingerprint:', southWestNode.fingerprint);

    // 4. Demonstrate fingerprint uniqueness
    logger.info('\nNode Fingerprints:');
    for (const node of nodes) {
      logger.info(`${node.name}: ${node.fingerprint}`);
    }

    logger.info('✅ Hierarchy example completed successfully');
  } catch (error) {
    logger.error('Error in hierarchy example:', error);
    throw error;
  }
};

// Main execution
(async () => {
  try {
    await connectToDB();
    await createHierarchyExample();
  } catch (error) {
    logger.error('Script failed:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  }
})();
