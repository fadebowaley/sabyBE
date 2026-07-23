const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const tenantKnowledgeArtifactSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    artifactVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    schemaVersion: {
      type: String,
      required: true,
      default: '1.0',
    },
    status: {
      type: String,
      enum: ['building', 'active', 'failed', 'superseded'],
      default: 'building',
      index: true,
    },
    artifact: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
    sourceVersions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    buildMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    buildErrors: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    builtBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

tenantKnowledgeArtifactSchema.index(
  { tenantId: 1, artifactVersion: 1 },
  { unique: true }
);
tenantKnowledgeArtifactSchema.index(
  { tenantId: 1, status: 1, artifactVersion: -1 }
);

tenantKnowledgeArtifactSchema.plugin(toJSON);
tenantKnowledgeArtifactSchema.plugin(paginate);

const TenantKnowledgeArtifact = mongoose.model(
  'TenantKnowledgeArtifact',
  tenantKnowledgeArtifactSchema
);

module.exports = TenantKnowledgeArtifact;
