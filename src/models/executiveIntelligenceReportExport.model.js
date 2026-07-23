const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const { toJSON, paginate } = require('./plugins');

const executiveIntelligenceReportExportSchema = new mongoose.Schema(
  {
    exportId: {
      type: String,
      unique: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    requestId: {
      type: String,
      required: true,
      index: true,
    },
    reportId: {
      type: String,
      required: true,
      index: true,
    },
    format: {
      type: String,
      enum: ['csv', 'xlsx', 'html', 'pdf', 'docx'],
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      required: true,
      trim: true,
    },
    byteSize: {
      type: Number,
      required: true,
      min: 0,
    },
    storageProvider: {
      type: String,
      enum: ['aws-s3', 'google-drive', 'uploadthing'],
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
    },
    storageUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'deleted'],
      default: 'active',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

executiveIntelligenceReportExportSchema.index({ tenantId: 1, requestId: 1, createdAt: -1 });
executiveIntelligenceReportExportSchema.index({ tenantId: 1, reportId: 1, format: 1 });

executiveIntelligenceReportExportSchema.plugin(toJSON);
executiveIntelligenceReportExportSchema.plugin(paginate);

executiveIntelligenceReportExportSchema.statics.generateExportId = function () {
  return `ei_export_${nanoid(18)}`;
};

executiveIntelligenceReportExportSchema.pre('save', function (next) {
  if (!this.exportId) {
    this.exportId = this.constructor.generateExportId();
  }
  next();
});

const ExecutiveIntelligenceReportExport = mongoose.model(
  'ExecutiveIntelligenceReportExport',
  executiveIntelligenceReportExportSchema
);

module.exports = ExecutiveIntelligenceReportExport;
