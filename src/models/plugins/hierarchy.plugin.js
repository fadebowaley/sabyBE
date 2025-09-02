const mongoose = require('mongoose');

/**
 * Plugin to handle hierarchical relationships in models
 * @param {mongoose.Schema} schema - The schema to apply the plugin to
 * @param {Object} options - Plugin options
 * @param {string} options.parentField - The field name for parent reference (default: 'parent')
 * @param {string} options.pathField - The field name for path storage (default: 'path')
 * @param {string} options.modelName - The name of the model for self-referencing
 * @param {string} options.levelField - The field name for level reference (default: 'level')
 */
const hierarchyPlugin = (schema, options = {}) => {
  const parentField = options.parentField || 'parent';
  const pathField = options.pathField || 'path';
  const modelName = options.modelName;
  const levelField = options.levelField || 'level';

  // Add required fields if they don't exist
  if (!schema.path(parentField)) {
    schema.add({
      [parentField]: {
        type: mongoose.Schema.Types.ObjectId,
        ref: modelName,
        default: null,
      },
    });
  }

  if (!schema.path(pathField)) {
    schema.add({
      [pathField]: {
        type: String,
        default: '',
      },
    });
  }

  // Add identity fields
  schema.add({
    identity: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    fingerprint: {
      type: String,
      unique: true,
      sparse: true,
    },
    hierarchy: {
      type: Map,
      of: mongoose.Schema.Types.ObjectId,
      default: new Map(),
    },
  });

  // Pre-save middleware to update path and identity
  schema.pre('save', async function (next) {
    try {
      if (this.isModified(parentField) || this.isModified(levelField)) {
        const Level = mongoose.model('Level');
        const identity = [];
        const hierarchy = new Map();
        let current = this[parentField];
        let pathParts = [];

        // Build identity and hierarchy by traversing up
        while (current) {
          const parent = await this.constructor.findById(current).populate(levelField);
          if (!parent) {
            throw new Error(`Parent ${current} not found`);
          }

          identity.unshift(parent._id);
          pathParts.unshift(parent._id.toString());

          // Add to hierarchy map using level name as key
          if (parent[levelField] && parent[levelField].name) {
            hierarchy.set(parent[levelField].name.toLowerCase(), parent._id);
          }

          current = parent[parentField];
        }

        // Add current node to path
        pathParts.push(this._id.toString());

        // Update fields
        this.identity = identity;
        this.hierarchy = hierarchy;
        this[pathField] = pathParts.join('/');

        // Generate fingerprint
        const level = await Level.findById(this[levelField]);
        if (!level) {
          throw new Error(`Level ${this[levelField]} not found`);
        }

        // Create fingerprint: levelName:path
        this.fingerprint = `${level.name.toLowerCase()}:${this[pathField]}`;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  // Static method to get ancestors
  schema.statics.getAncestors = async function (id) {
    const doc = await this.findById(id);
    if (!doc) return [];
    return this.find({ _id: { $in: doc.identity } }).sort({ [pathField]: 1 });
  };

  // Static method to get descendants
  schema.statics.getDescendants = async function (id) {
    const doc = await this.findById(id);
    if (!doc) return [];
    return this.find({ [pathField]: new RegExp(`^${doc[pathField]}`) });
  };

  // Static method to get siblings
  schema.statics.getSiblings = async function (id) {
    const doc = await this.findById(id);
    if (!doc) return [];
    return this.find({
      [parentField]: doc[parentField],
      _id: { $ne: doc._id },
    });
  };

  // Static method to get nodes by level in hierarchy
  schema.statics.getNodesByLevel = async function (levelName) {
    return this.find({ fingerprint: new RegExp(`^${levelName.toLowerCase()}:`) });
  };

  // Static method to get complete hierarchy path
  schema.statics.getHierarchyPath = async function (id) {
    const doc = await this.findById(id).populate(levelField);
    if (!doc) return null;

    const path = [];
    let current = doc;

    while (current) {
      const level = await mongoose.model('Level').findById(current[levelField]);
      path.unshift({
        id: current._id,
        name: current.name,
        level: level ? level.name : 'unknown',
        fingerprint: current.fingerprint,
      });
      current = current[parentField] ? await this.findById(current[parentField]) : null;
    }

    return path;
  };
};

module.exports = hierarchyPlugin;
