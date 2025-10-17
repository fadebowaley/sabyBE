const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const ChurchProfileSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      index: true,
    },
    // Reference to the church node
    church: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nodes',
      required: true,
    },
    // Additional Information
    dateOfEstablishment: { type: Date },
    propertyStatus: {
      type: String,
      enum: ['Owned', 'Rented', 'Leased', 'Other'],
      default: 'Owned',
    },
    estimatedValue: { type: mongoose.Schema.Types.Decimal128 }, // Precise monetary value
    buildingType: { type: String }, // e.g., "Auditorium", "Hall", "Tent", etc.
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Under Construction'],
      default: 'Active',
    },
  },
  { timestamps: true } // Automatically adds createdAt & updatedAt fields
);

// Add plugins
ChurchProfileSchema.plugin(toJSON);
ChurchProfileSchema.plugin(paginate);
ChurchProfileSchema.plugin(tenantPlugin);

const ChurchProfile = mongoose.model('ChurchProfile', ChurchProfileSchema);
module.exports = ChurchProfile;
