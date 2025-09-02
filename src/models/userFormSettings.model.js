const mongoose = require('mongoose');
const validator = require('validator');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const userFormSettingsSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      index: true,
      validate: {
        validator: (value) => validator.isAlphanumeric(value),
        message: 'Tenant ID must be alphanumeric',
      },
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    defaultFormSettings: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

// Plugins
userFormSettingsSchema.plugin(toJSON);
userFormSettingsSchema.plugin(paginate);
userFormSettingsSchema.plugin(tenantPlugin);

/**
 * @typedef UserFormSettings
 */
const UserFormSettings = mongoose.model('UserFormSettings', userFormSettingsSchema);
module.exports = UserFormSettings;
