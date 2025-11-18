const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const optionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const fieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'text',
        'textarea',
        'number',
        'date',
        'boolean',
        'select',
        'multi-select',
        'attachment',
      ],
      default: 'text',
    },
    required: { type: Boolean, default: false },
    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
    options: { type: [optionSchema], default: undefined },
    placeholder: { type: String },
    description: { type: String },
    validation: { type: Map, of: mongoose.Schema.Types.Mixed },
    visibility: {
      roles: [{ type: String }],
    },
    ui: {
      section: { type: String },
      order: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const tenantConfigSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: ['user', 'node'],
      required: true,
    },
    fields: {
      type: [fieldSchema],
      default: [],
    },
    ui: {
      sections: {
        type: [sectionSchema],
        default: [],
      },
    },
    version: {
      type: Number,
      default: 1,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

tenantConfigSchema.index({ tenantId: 1, entityType: 1 }, { unique: true });
tenantConfigSchema.plugin(toJSON);

const TenantConfig = mongoose.model('TenantConfig', tenantConfigSchema);
module.exports = TenantConfig;

