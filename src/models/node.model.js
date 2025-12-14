const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');
const { HaloNCounter } = require('./haloCounter.model');
const hierarchyPlugin = require('./plugins/hierarchy.plugin');

const nodeSchema = mongoose.Schema(
  {
    nodeId: {
      type: String,
      unique: true,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
    level: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Level',
      required: true,
    },
    structure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Structures',
      required: true,
    },
    identity: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Nodes' }],
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nodes',
      default: null,
    },
    name: { type: String, required: true },
    isMain: { type: Boolean, default: false },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    postalCode: { type: String },
    dateOfEstablishment: { type: Date },
    hierarchy: { type: mongoose.Schema.Types.Mixed },
    path: { type: String },
    deletedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    customFieldsVersion: {
      type: Number,
      default: 0,
    },

    // Profile Update Compliance Tracking
    profileUpdateCompliant: {
      type: Boolean,
      default: false,
    },
    profileUpdateCompliantAt: {
      type: Date,
      default: null,
    },
    profileUpdateCompliantBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /**
     * NOTE: The profile fields below are handled through tenant-managed custom fields.
     * Legacy properties kept for backward compatibility:
     * - propertyStatus
     * - estimatedValue
     * - buildingType
     * - facilityStatus
     */
    profile: {
      // Property/Facility information
      propertyStatus: {
        type: String,
        enum: ['Owned', 'Rented', 'Leased', 'Other'],
        default: 'Owned',
      },
      estimatedValue: { type: mongoose.Schema.Types.Decimal128 },
      buildingType: { type: String }, // Auditorium, Hall, Tent, Office, etc.
      facilityStatus: {
        type: String,
        enum: ['Active', 'Inactive', 'Under Construction'],
        default: 'Active',
      },
      // Attendance and Financial metrics
      averageAttendance: {
        type: Number,
        default: 0,
        min: 0,
      },
      averageIncome: {
        type: mongoose.Schema.Types.Decimal128,
        default: 0,
      },
    },
  },
  { timestamps: true }
);

nodeSchema.plugin(toJSON);
nodeSchema.plugin(paginate);
nodeSchema.plugin(tenantPlugin);
nodeSchema.plugin(hierarchyPlugin, { modelName: 'Nodes' });

nodeSchema.index({ tenantId: 1, users: 1 });
nodeSchema.index({ path: 1 });
nodeSchema.index({ deletedAt: 1 });
nodeSchema.index({ structure: 1, level: 1 });

/**
 * @typedef Node
 */

/**
 * Generate a unique Base36 incremental nodeId prefixed with 'HLN-'
 * Example: HLN-00001, HLN-00002, ..., HLN-ZZZZZ
 * @returns {Promise<string>}
 */
nodeSchema.statics.generateNodeId = async function () {
  const counter = await HaloNCounter.findOneAndUpdate(
    { name: 'haloNode' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const base36 = counter.seq.toString(36).toUpperCase().padStart(5, '0');
  return `HLN-${base36}`;
};

// Utility function to build hierarchy dynamically based on level names
async function buildHierarchy(node) {
  const identity = [];
  const hierarchy = {};
  const pathParts = [];

  let current = node.parent;

  while (current) {
    const parentNode = await node.constructor
      .findById(current)
      .populate('level');
    if (!parentNode) throw new Error('Invalid parent reference.');

    identity.unshift(parentNode._id);
    if (parentNode.level && parentNode.level.name) {
      hierarchy[parentNode.level.name.toLowerCase()] = parentNode._id;
    }

    pathParts.unshift(parentNode._id.toString());
    current = parentNode.parent;
  }

  pathParts.push(node._id.toString());

  node.identity = identity;
  node.hierarchy = hierarchy;
  node.path = pathParts.join('/');
}

// Pre-save hook for hierarchy construction and nodeId generation
nodeSchema.pre('save', async function (next) {
  try {
    if (this.isModified('level') || this.isModified('structure')) {
      console.log('=== Node Pre-save Debug ===');
      console.log('Node level:', this.level);
      console.log('Node structure:', this.structure);

      const Structure = mongoose.model('Structures');
      const structure = await Structure.findById(this.structure);
      console.log('Found structure:', structure);

      if (!structure) {
        throw new Error('Structure not found');
      }

      console.log('Structure level:', structure.level);
      console.log('Structure level toString():', structure.level.toString());
      console.log('Node level toString():', this.level.toString());
      console.log(
        'Levels match?',
        structure.level.toString() === this.level.toString()
      );

      if (structure.level.toString() !== this.level.toString()) {
        throw new Error('Node level must match structure level');
      }
    }
    // Generate nodeId if not present
    if (!this.nodeId) {
      this.nodeId = await this.constructor.generateNodeId();
    }

    // Build hierarchy
    await buildHierarchy(this);
    next();
  } catch (err) {
    next(err);
  }
});

// Post-save hook for baseline intelligence updates
nodeSchema.post('save', async function(doc) {
  try {
    // Only trigger baseline updates for meaningful changes
    const relevantFields = [
      'profile', 'users', 'dateOfEstablishment', 'isActive', 
      'customFields', 'level', 'structure', 'parent'
    ];
    
    const hasRelevantChanges = this.isNew || relevantFields.some(field => this.isModified(field));
    
    if (hasRelevantChanges) {
      // Import here to avoid circular dependency
      const { baselineIntelligenceService } = require('../services');
      const { batchChangeProcessor } = require('../services');
      
      // Handle baseline updates asynchronously to avoid blocking node operations
      setImmediate(async () => {
        try {
          // Check if this is part of a bulk operation
          const isBulkOperation = process.env.BULK_OPERATION === 'true' || this.isBulkOperation;
          
          if (isBulkOperation && batchChangeProcessor) {
            // Use batch processing for bulk operations
            await batchChangeProcessor.addNodeChange(doc);
          } else {
            // Use immediate processing for single changes
            await baselineIntelligenceService.handleNodeChange(doc);
          }
        } catch (error) {
          console.error('Error updating baseline intelligence after node change:', error);
        }
      });
    }
  } catch (error) {
    console.error('Error in node post-save hook:', error);
  }
});

// Post-remove hook for baseline intelligence updates
nodeSchema.post('remove', async function(doc) {
  try {
    const { baselineIntelligenceService } = require('../services');
    
    setImmediate(async () => {
      try {
        await baselineIntelligenceService.handleNodeChange(doc);
      } catch (error) {
        console.error('Error updating baseline intelligence after node removal:', error);
      }
    });
  } catch (error) {
    console.error('Error in node post-remove hook:', error);
  }
});

// Static method to update parent and re-calculate hierarchy
nodeSchema.statics.updateNodeParent = async function (nodeId, newParentId) {
  const node = await this.findById(nodeId);
  const newParent = newParentId
    ? await this.findById(newParentId).populate('level')
    : null;
  if (!node) throw new Error('Node not found');
  if (newParentId && !newParent) throw new Error('New parent not found');

  node.parent = newParentId || null;
  await buildHierarchy(node);
  await node.save();

  // Update descendants
  const descendants = await this.find({ path: new RegExp(`^${node._id}`) });
  for (const descendant of descendants) {
    await buildHierarchy(descendant);
    await descendant.save();
  }

  return node;
};

// Static method to get a node by its path
nodeSchema.statics.getNodeByPath = async function (path) {
  return this.findOne({ path });
};

nodeSchema.statics.getNodeWithChildren = async function (nodeId) {
  // Find the node with the given ID
  const node = await this.findById(nodeId);
  if (!node) throw new Error('Node not found');

  // Find all child nodes by checking the 'path' field
  return this.find({ path: { $regex: `^${node.path}` } });
};

nodeSchema.statics.getNodeWithParents = async function (nodeId) {
  const node = await this.findById(nodeId);
  if (!node) throw new Error('Node not found');

  const parents = [];
  let current = node.parent;

  while (current) {
    const parentNode = await this.findById(current).populate('level');
    if (!parentNode) break;
    parents.unshift(parentNode); // Insert at the beginning of the array to maintain order
    current = parentNode.parent;
  }

  return [...parents, node]; // Include the node itself as the last "parent"
};

nodeSchema.statics.getAllNodesOrderedByLevel = async function () {
  return this.find().sort({ level: 1, path: 1 }); // Sort by levels first, then path for order within level
};

const Nodes = mongoose.model('Nodes', nodeSchema);
module.exports = Nodes;
