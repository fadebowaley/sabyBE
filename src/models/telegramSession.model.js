const mongoose = require('mongoose');

const telegramSessionSchema = mongoose.Schema(
  {
    chatId: {
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
telegramSessionSchema.index({ chatId: 1, tenantId: 1 });
telegramSessionSchema.index({ userId: 1, projectId: 1 });
telegramSessionSchema.index({ status: 1, lastActivity: 1 });

// Methods
telegramSessionSchema.methods.updateActivity = function () {
  this.metadata.lastActivity = new Date();
  return this.save();
};

telegramSessionSchema.methods.addAnswer = function (step, answer) {
  this.answers.set(step.toString(), answer);
  this.currentStep = step + 1;
  return this.save();
};

telegramSessionSchema.methods.markReadyToSubmit = function () {
  this.status = 'ready_to_submit';
  return this.save();
};

telegramSessionSchema.methods.markSubmitted = function () {
  this.status = 'submitted';
  this.submittedAt = new Date();
  return this.save();
};

telegramSessionSchema.methods.markCompleted = function () {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// Static methods
telegramSessionSchema.statics.findByChatId = function (chatId) {
  return this.findOne({ chatId });
};

telegramSessionSchema.statics.findActiveByUserId = function (
  userId,
  projectId
) {
  return this.findOne({
    userId,
    projectId,
    status: { $in: ['authenticating', 'filling_form', 'ready_to_submit'] },
  });
};

telegramSessionSchema.statics.cleanupExpiredSessions = function (
  ttlHours = 24
) {
  const cutoffTime = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
  return this.deleteMany({
    lastActivity: { $lt: cutoffTime },
    status: { $in: ['authenticating', 'filling_form'] },
  });
};

const TelegramSession = mongoose.model(
  'TelegramSession',
  telegramSessionSchema
);

module.exports = TelegramSession;
