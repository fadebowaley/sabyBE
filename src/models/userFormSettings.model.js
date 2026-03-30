const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const userFormSettingsSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      index: true,
      validate: {
        validator: (value) =>
          typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value),
        message: 'Tenant ID must contain only letters, numbers, hyphen, or underscore',
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
const UserFormSettings = mongoose.model(
  'UserFormSettings',
  userFormSettingsSchema
);
module.exports = UserFormSettings;
