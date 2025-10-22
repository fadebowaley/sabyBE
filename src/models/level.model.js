const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const levelSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    rank: { type: Number, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// add plugin that converts mongoose to json
levelSchema.plugin(toJSON);
levelSchema.plugin(paginate);
levelSchema.plugin(tenantPlugin);

/**
 * @typedef NodeLevel
 */

// Multi-tenant unique indexes
// Each tenant can have their own "Level 0", "Level 1", etc.
levelSchema.index(
  { tenantId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

levelSchema.index(
  { tenantId: 1, rank: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

/**
 * Static method to create a new level
 * @param {Object} levelBody
 * @returns {Promise<NodeLevel>}
 */

levelSchema.statics.getLevelsByHierarchy = async function (
  tenantId,
  hierarchy
) {
  return this.find({ tenantId, rank: hierarchy });
};

// Add this static method (optional)
levelSchema.statics.getOrderedLevels = async function () {
  return this.find().sort({ rank: 1 });
};

const Level = mongoose.model('Level', levelSchema);
module.exports = Level;
