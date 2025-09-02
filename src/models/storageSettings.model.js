const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const storageSettingsSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    storageQuota: {
      totalQuota: { type: Number, default: 5 * 1024 * 1024 * 1024 }, // 5GB default
      usedStorage: { type: Number, default: 0 },
      fileCount: { type: Number, default: 0 },
      folderCount: { type: Number, default: 0 },
    },
    userLimits: {
      maxFileSize: { type: Number, default: 100 * 1024 * 1024 }, // 100MB
      maxFilesPerUpload: { type: Number, default: 10 },
      allowedFileTypes: { type: [String], default: ['*'] },
      blockedFileTypes: { type: [String], default: ['.exe', '.bat', '.cmd'] },
    },
    features: {
      enableVersioning: { type: Boolean, default: true },
      enableSharing: { type: Boolean, default: true },
      enablePublicLinks: { type: Boolean, default: true },
      enablePasswordProtection: { type: Boolean, default: true },
      enableDownloadTracking: { type: Boolean, default: true },
    },
    security: {
      requireAuth: { type: Boolean, default: true },
      enableEncryption: { type: Boolean, default: false },
      allowExternalSharing: { type: Boolean, default: true },
      maxShareDuration: { type: Number, default: 30 }, // days
    },
    notifications: {
      emailOnUpload: { type: Boolean, default: false },
      emailOnShare: { type: Boolean, default: true },
      emailOnQuotaWarning: { type: Boolean, default: true },
      quotaWarningThreshold: { type: Number, default: 80 }, // percentage
    },
    integrations: {
      awsS3: {
        enabled: { type: Boolean, default: true },
        bucket: String,
        region: String,
        accessKeyId: String,
        secretAccessKey: String,
      },
      googleDrive: {
        enabled: { type: Boolean, default: false },
        clientId: String,
        clientSecret: String,
        refreshToken: String,
        folderId: String,
      },
      uploadThing: {
        enabled: { type: Boolean, default: false },
        secret: String,
        appId: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

storageSettingsSchema.plugin(toJSON);
storageSettingsSchema.plugin(paginate);
storageSettingsSchema.plugin(tenantPlugin);

const StorageSettings = mongoose.model('StorageSettings', storageSettingsSchema);
module.exports = StorageSettings;