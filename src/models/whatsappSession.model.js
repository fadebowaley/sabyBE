const mongoose = require('mongoose');

const whatsappSessionSchema = mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: false, // Optional during authentication
    },
    tenantId: {
      type: String,
      required: false, // Optional during authentication
      index: true,
    },
    projectId: {
      type: String,
      required: false, // Optional during authentication
      index: true,
    },
    formId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'ProjectForm',
      required: false, // Optional during authentication
    },
    status: {
      type: String,
      enum: [
        'authenticating',
        'awaiting_login',
        'awaiting_verification_confirmation',
        'selecting_node',
        'selecting_project',
        'collecting_batch',
        'updating_profile',
        'updating_node',
        'filling_form',
        'ready_to_submit',
        'submitted',
        'completed',
      ],
      default: 'authenticating',
    },
    currentStep: {
      type: Number,
      default: 0,
    },
    answers: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    batchAnswers: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    batchStatus: {
      type: String,
      enum: ['collecting', 'pending_confirmation', 'submitted'],
      default: 'collecting',
    },
    batchMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      phoneNumber: String,
      firstName: String,
      lastName: String,
      username: String,
      languageCode: String,
      lastActivity: Date,
      sessionStartTime: Date,
      profileSnapshot: mongoose.Schema.Types.Mixed,
      lastVerificationPromptAt: Date,
      lastVerificationConfirmedAt: Date,
      nodesCache: [mongoose.Schema.Types.Mixed],
      selectedNode: mongoose.Schema.Types.Mixed,
      selectedNodeAt: Date,
      profileUpdate: mongoose.Schema.Types.Mixed,
      nodeUpdate: mongoose.Schema.Types.Mixed,
      previousStatus: String,
      batchStartedAt: Date,
      batchConfirmedAt: Date,
      batchTemplate: [mongoose.Schema.Types.Mixed],
      loginEmail: String,
      isLoggedIn: {
        type: Boolean,
        default: false,
      },
      authTokens: mongoose.Schema.Types.Mixed,
      lastLoginAt: Date,
      sessionLocked: {
        type: Boolean,
        default: false,
      },
      passcodeAttempts: {
        type: Number,
        default: 0,
      },
      lastPasscodePromptAt: Date,
      pendingOtp: {
        type: Boolean,
        default: false,
      },
      lastOtpSentAt: Date,
      otpDelivery: mongoose.Schema.Types.Mixed,
      accountVerifiedAt: Date,
      menuContext: {
        type: String,
        enum: ['main', 'submenu', null],
        default: null,
      },
      activeSubmenu: {
        type: String,
        default: null,
      },
      awaitingMenuSelection: {
        type: Boolean,
        default: false,
      },
      loginStage: {
        type: String,
        enum: ['password', 'otp', 'passcode', 'complete'],
        default: 'password',
      },
      phoneDigits: String,
      pendingUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      pendingEmail: String,
      pendingTokens: mongoose.Schema.Types.Mixed,
      expectedPasscode: String,
      mustValidatePasscode: {
        type: Boolean,
        default: false,
      },
      passcodeReason: String,
      lastAuthMethod: String,
      forceReloginAfter: Date,
      pendingVerification: mongoose.Schema.Types.Mixed,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
      index: true,
    },
    validationResult: {
      valid: Boolean,
      errors: [String],
      warnings: [String],
    },
    submittedAt: Date,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
whatsappSessionSchema.index({ phoneNumber: 1, tenantId: 1 });
whatsappSessionSchema.index({ userId: 1, projectId: 1 });
whatsappSessionSchema.index({ status: 1, lastActivity: 1 });

// Methods
whatsappSessionSchema.methods.updateActivity = function (
  timestamp = new Date()
) {
  this.metadata.lastActivity = timestamp;
  this.lastActivity = timestamp;
  return this.save();
};

whatsappSessionSchema.methods.addAnswer = function (step, answer) {
  this.answers.set(step.toString(), answer);
  this.batchAnswers.set(step.toString(), answer);
  this.currentStep = step + 1;
  this.markModified('batchAnswers');
  return this.save();
};

whatsappSessionSchema.methods.markReadyToSubmit = function () {
  this.status = 'ready_to_submit';
  this.batchStatus = 'pending_confirmation';
  this.metadata.batchStartedAt = this.metadata.batchStartedAt || new Date();
  this.markModified('batchStatus');
  this.markModified('metadata');
  return this.save();
};

whatsappSessionSchema.methods.markSubmitted = function () {
  this.status = 'submitted';
  this.batchStatus = 'submitted';
  this.submittedAt = new Date();
  this.metadata.batchConfirmedAt = new Date();
  this.markModified('batchStatus');
  this.markModified('metadata');
  return this.save();
};

whatsappSessionSchema.methods.markCompleted = function () {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

whatsappSessionSchema.methods.resetBatch = function () {
  this.batchAnswers.clear();
  this.batchStatus = 'collecting';
  this.batchMeta = {};
  this.metadata.batchStartedAt = null;
  this.metadata.batchConfirmedAt = null;
  this.markModified('batchAnswers');
  this.markModified('batchStatus');
  this.markModified('batchMeta');
  this.markModified('metadata');
  return this.save();
};

// Static methods
whatsappSessionSchema.statics.findByPhoneNumber = function (phoneNumber) {
  return this.findOne({ phoneNumber });
};

whatsappSessionSchema.statics.findActiveByUserId = function (
  userId,
  projectId
) {
  return this.findOne({
    userId,
    projectId,
    status: {
      $in: [
        'authenticating',
        'awaiting_login',
        'collecting_batch',
        'filling_form',
        'ready_to_submit',
      ],
    },
  });
};

whatsappSessionSchema.statics.cleanupExpiredSessions = function (
  ttlMinutes = 15
) {
  const cutoffTime = new Date(Date.now() - ttlMinutes * 60 * 1000);
  return this.deleteMany({
    lastActivity: { $lt: cutoffTime },
    status: {
      $in: [
        'authenticating',
        'awaiting_login',
        'collecting_batch',
        'filling_form',
      ],
    },
  });
};

const WhatsAppSession = mongoose.model(
  'WhatsAppSession',
  whatsappSessionSchema
);

module.exports = WhatsAppSession;
