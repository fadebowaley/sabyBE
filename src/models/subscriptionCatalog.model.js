const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const subscriptionCatalogSchema = new mongoose.Schema(
  {
    catalogKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: 'global',
      trim: true,
    },
    catalog: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    updatedBy: {
      type: String,
      default: null,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

subscriptionCatalogSchema.plugin(toJSON);

const SubscriptionCatalog = mongoose.model(
  'SubscriptionCatalog',
  subscriptionCatalogSchema
);

module.exports = SubscriptionCatalog;
