const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const storageFolderSchema = mongoose.Schema(
  {
    folderId: {
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
    ownerType: {
      type: String,
      enum: ['user', 'tenant', 'submission', 'node'],
      default: 'user',
      index: true,
    },
    ownerId: {
      type: String,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['private', 'tenant', 'restricted', 'public_share'],
      default: 'private',
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parentFolder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StorageFolder',
      default: null,
    },
    path: {
      type: String,
      required: false,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    shareSettings: {
      isShared: { type: Boolean, default: false },
      shareToken: { type: String, unique: true, sparse: true },
      shareExpiry: { type: Date },
      allowUpload: { type: Boolean, default: false },
      password: { type: String },
    },
    metadata: {
      description: String,
      color: { type: String, default: '#1976d2' },
      icon: String,
    },
    permissions: [
      {
        subjectType: {
          type: String,
          enum: ['user', 'role', 'node'],
          default: 'user',
        },
        subjectId: { type: String, required: true },
        permission: {
          type: String,
          enum: ['read', 'write', 'admin'],
          default: 'read',
        },
      },
    ],
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

storageFolderSchema.plugin(toJSON);
storageFolderSchema.plugin(paginate);
storageFolderSchema.plugin(tenantPlugin);

storageFolderSchema.index({ tenantId: 1, userId: 1, parentFolder: 1 });
storageFolderSchema.index({ path: 1 });

storageFolderSchema.statics.generateFolderId = function () {
  return `FOLDER-${nanoid(12)}`;
};

storageFolderSchema.statics.generateShareToken = function () {
  return nanoid(32);
};

storageFolderSchema.pre('save', function (next) {
  if (!this.folderId) {
    this.folderId = this.constructor.generateFolderId();
  }
  if (!this.ownerId && this.userId) {
    this.ownerId = String(this.userId);
  }
  if (!this.createdBy && this.userId) {
    this.createdBy = this.userId;
  }
  if (!this.visibility) {
    this.visibility = this.shareSettings?.isShared ? 'public_share' : 'private';
  }

  // Generate path - set default if not provided
  if (
    !this.path ||
    this.isModified('name') ||
    this.isModified('parentFolder')
  ) {
    this.path = this.parentFolder
      ? `${this.parentFolder.path}/${this.name}`
      : `/${this.name}`;
  }

  next();
});

const StorageFolder = mongoose.model('StorageFolder', storageFolderSchema);
module.exports = StorageFolder;
