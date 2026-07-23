const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const workspaceInvitationSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    firstname: {
      type: String,
      trim: true,
      default: '',
    },
    lastname: {
      type: String,
      trim: true,
      default: '',
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: null,
    },
    accessProfileId: {
      type: String,
      enum: ['workspace_owner', 'data_administrator', 'editor', 'viewer'],
      default: 'viewer',
    },
    workspaceRole: {
      type: String,
      enum: ['owner', 'editor', 'viewer'],
      required: true,
    },
    bundleRoleName: {
      type: String,
      default: null,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    invitedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
    resendCount: {
      type: Number,
      default: 0,
    },
    redirectPath: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

workspaceInvitationSchema.plugin(toJSON);
workspaceInvitationSchema.plugin(paginate);
workspaceInvitationSchema.plugin(tenantPlugin);

workspaceInvitationSchema.index(
  { tenantId: 1, workspaceId: 1, email: 1, status: 1 },
  { name: 'workspace_invite_scope_idx' }
);

const WorkspaceInvitation = mongoose.model(
  'WorkspaceInvitation',
  workspaceInvitationSchema
);

module.exports = WorkspaceInvitation;
