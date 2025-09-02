const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const storageSchema = mongoose.Schema(
  {
    fileId: {
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
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StorageFolder',
      default: null,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      unique: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileExtension: {
      type: String,
      required: true,
    },
    storageProvider: {
      type: String,
      enum: ['aws-s3', 'google-drive', 'uploadthing'],
      default: 'aws-s3',
    },
    storagePath: {
      type: String,
      required: true,
    },
    storageUrl: {
      type: String,
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    shareSettings: {
      isShared: { type: Boolean, default: false },
      shareToken: { type: String, unique: true, sparse: true },
      shareExpiry: { type: Date },
      allowDownload: { type: Boolean, default: true },
      allowPreview: { type: Boolean, default: true },
      password: { type: String },
    },
    metadata: {
      description: String,
      tags: [String],
      customFields: mongoose.Schema.Types.Mixed,
    },
    versions: [{
      versionId: String,
      fileName: String,
      fileSize: Number,
      storageUrl: String,
      createdAt: { type: Date, default: Date.now },
    }],
    status: {
      type: String,
      enum: ['active', 'archived', 'deleted'],
      default: 'active',
    },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

storageSchema.plugin(toJSON);
storageSchema.plugin(paginate);
storageSchema.plugin(tenantPlugin);

storageSchema.index({ tenantId: 1, userId: 1, status: 1 });
storageSchema.index({ originalName: 'text', 'metadata.description': 'text', 'metadata.tags': 'text' });

storageSchema.statics.generateFileId = function () {
  return `FILE-${nanoid(12)}`;
};

storageSchema.statics.generateShareToken = function () {
  return nanoid(32);
};

storageSchema.pre('save', function (next) {
  if (!this.fileId) {
    this.fileId = this.constructor.generateFileId();
  }
  next();
});

const Storage = mongoose.model('Storage', storageSchema);
module.exports = Storage;