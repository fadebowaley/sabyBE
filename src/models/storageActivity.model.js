const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const storageActivitySchema = mongoose.Schema(
  {
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
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Storage',
      index: true,
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StorageFolder',
      index: true,
    },
    action: {
      type: String,
      enum: [
        'upload', 'download', 'delete', 'share', 'unshare', 
        'move', 'copy', 'rename', 'create_folder', 'delete_folder',
        'update_permissions', 'view', 'preview'
      ],
      required: true,
    },
    details: {
      fileName: String,
      fileSize: Number,
      fromPath: String,
      toPath: String,
      shareToken: String,
      ipAddress: String,
      userAgent: String,
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

storageActivitySchema.plugin(toJSON);
storageActivitySchema.plugin(paginate);
storageActivitySchema.plugin(tenantPlugin);

storageActivitySchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
storageActivitySchema.index({ action: 1, createdAt: -1 });

const StorageActivity = mongoose.model('StorageActivity', storageActivitySchema);
module.exports = StorageActivity;