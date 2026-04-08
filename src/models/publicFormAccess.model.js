const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const publicFormAccessSchema = mongoose.Schema(
  {
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    tokenType: {
      type: String,
      default: 'public_form_access',
      index: true,
    },
    challengeChannel: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || value === 'email' || value === 'phone';
        },
        message: '`{VALUE}` is not a valid challenge channel.',
      },
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    projectFormId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectForm',
      index: true,
    },
    publicRef: {
      type: String,
      default: null,
      index: true,
    },
    shareRef: {
      type: String,
      default: null,
      index: true,
    },
    shareCode: {
      type: String,
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    identifierType: {
      type: String,
      enum: ['email', 'phone'],
      required: true,
    },
    identifier: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    phoneNumber: {
      type: String,
      default: null,
      trim: true,
    },
    secureMode: {
      type: String,
      enum: ['off', 'single_qr_passwordless'],
      default: 'single_qr_passwordless',
    },
    pipelineTarget: {
      type: String,
      default: 'postgres_unified',
    },
    schemaVersion: {
      type: String,
      default: '1.0.0',
    },
    schemaHash: {
      type: String,
      default: null,
    },
    qrVersion: {
      type: String,
      default: 'v1',
    },
    status: {
      type: String,
      enum: [
        'issued',
        'consumed',
        'submitted',
        'verified',
        'locked',
        'revoked',
        'expired',
      ],
      default: 'issued',
      index: true,
    },
    issuedAt: {
      type: Date,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    selectedNodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nodes',
      default: null,
    },
    otpHash: {
      type: String,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpMaxAttempts: {
      type: Number,
      default: 5,
    },
    otpResendCount: {
      type: Number,
      default: 0,
    },
    otpResendAvailableAt: {
      type: Date,
      default: null,
    },
    otpLastSentAt: {
      type: Date,
      default: null,
    },
    otpVerifiedAt: {
      type: Date,
      default: null,
    },
    delivery: {
      email: {
        sent: { type: Boolean, default: false },
        error: { type: String, default: null },
      },
      sms: {
        sent: { type: Boolean, default: false },
        error: { type: String, default: null },
      },
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

publicFormAccessSchema.plugin(toJSON);
publicFormAccessSchema.plugin(paginate);

publicFormAccessSchema.index({ tenantId: 1, projectId: 1, status: 1, expiresAt: 1 });
publicFormAccessSchema.index({ userId: 1, projectId: 1, createdAt: -1 });
publicFormAccessSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const PublicFormAccess = mongoose.model('PublicFormAccess', publicFormAccessSchema);

module.exports = PublicFormAccess;
