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
        'selecting_project',
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
    metadata: {
      phoneNumber: String,
      firstName: String,
      lastName: String,
      username: String,
      languageCode: String,
      lastActivity: Date,
      sessionStartTime: Date,
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
whatsappSessionSchema.methods.updateActivity = function () {
  this.metadata.lastActivity = new Date();
  return this.save();
};

whatsappSessionSchema.methods.addAnswer = function (step, answer) {
  this.answers.set(step.toString(), answer);
  this.currentStep = step + 1;
  return this.save();
};

whatsappSessionSchema.methods.markReadyToSubmit = function () {
  this.status = 'ready_to_submit';
  return this.save();
};

whatsappSessionSchema.methods.markSubmitted = function () {
  this.status = 'submitted';
  this.submittedAt = new Date();
  return this.save();
};

whatsappSessionSchema.methods.markCompleted = function () {
  this.status = 'completed';
  this.completedAt = new Date();
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
    status: { $in: ['authenticating', 'filling_form', 'ready_to_submit'] },
  });
};

whatsappSessionSchema.statics.cleanupExpiredSessions = function (
  ttlHours = 24
) {
  const cutoffTime = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
  return this.deleteMany({
    lastActivity: { $lt: cutoffTime },
    status: { $in: ['authenticating', 'filling_form'] },
  });
};

const WhatsAppSession = mongoose.model(
  'WhatsAppSession',
  whatsappSessionSchema
);

module.exports = WhatsAppSession;
