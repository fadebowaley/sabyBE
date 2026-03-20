const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const tenantOnboardingSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    company: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      industry: { type: String, default: '' },
      size: { type: String, default: '' },
      timezone: { type: String, default: '' },
      country: { type: String, default: '' },
      state: { type: String, default: '' },
      city: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    owner: {
      roleTitle: { type: String, default: '' },
      phoneNumber: { type: String, default: '' },
    },
    node: {
      rootNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Nodes' },
      rootNodeName: { type: String, default: '' },
      rootLevelName: { type: String, default: '' },
      rootNodeAddress: { type: String, default: '' },
      nodeStructures: { type: Boolean, default: false },
    },
    draftProgress: {
      currentIndex: { type: Number, default: 0 },
      phase: {
        type: String,
        enum: ['question', 'review', 'submitting', 'completed'],
        default: 'question',
      },
      skipped: { type: mongoose.Schema.Types.Mixed, default: {} },
      lastSavedAt: { type: Date, default: Date.now },
    },
    completedAt: { type: Date, default: null },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

tenantOnboardingSchema.plugin(toJSON);

module.exports = mongoose.model('TenantOnboarding', tenantOnboardingSchema);
