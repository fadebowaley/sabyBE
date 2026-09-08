const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const recipientSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['user', 'contact', 'all', 'role', 'form_submissions'],
      required: true,
    },
    userId: { type: String },
    roleId: { type: String },
    projectId: { type: String },
    formId: { type: String },
    name: { type: String, trim: true, default: '@all' },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    queuedAt: { type: Date, required: true, default: Date.now },
    deliveredAt: { type: Date },
    status: {
      type: String,
      enum: ['queued', 'delivered', 'failed', 'suppressed'],
      required: true,
      default: 'queued',
    },
    jobId: { type: String },
    error: { type: String },
  },
  { _id: false }
);

const recurrenceSchema = new mongoose.Schema(
  {
    frequency: { type: String, enum: ['none', 'yearly'], default: 'none' },
    dstBehavior: {
      type: String,
      enum: ['next-valid-time'],
      default: 'next-valid-time',
    },
  },
  { _id: false }
);

const reminderTriggerSchema = mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    triggerType: { type: String, enum: ['scheduled'], default: 'scheduled' },
    scheduledAt: { type: Date, required: true, index: true },
    timezone: { type: String, required: true, default: 'UTC' },
    recurrence: { type: recurrenceSchema, default: () => ({}) },
    channels: {
      type: [
        {
          type: String,
          enum: ['email', 'sms', 'push', 'in-app', 'whatsapp'],
        },
      ],
      default: ['email'],
    },
    recipients: { type: [recipientSchema], default: [] },
    enabled: { type: Boolean, default: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'queued', 'delivered', 'failed', 'suppressed'],
      default: 'pending',
      index: true,
    },
    deliveryAttempts: { type: [deliverySchema], default: [] },
    lastDeliveredAt: { type: Date },
  },
  { timestamps: true }
);

reminderTriggerSchema.index({ tenantId: 1, status: 1, scheduledAt: 1 });
reminderTriggerSchema.index({ entityType: 1, entityId: 1, status: 1 });
reminderTriggerSchema.plugin(toJSON);
reminderTriggerSchema.plugin(paginate);

module.exports = mongoose.model('ReminderTrigger', reminderTriggerSchema);
