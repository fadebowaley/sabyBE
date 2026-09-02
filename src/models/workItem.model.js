const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const assigneeSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['user', 'contact'], default: 'user' },
    userId: { type: String },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
  },
  { _id: false }
);

const workItemSchema = mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['event', 'task'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    priority: { type: String, enum: ['low', 'medium', 'high'] },
    assignees: { type: [assigneeSchema], default: [] },
  },
  { timestamps: true }
);

workItemSchema.index({ tenantId: 1, startAt: 1, endAt: 1 });
workItemSchema.plugin(toJSON);
workItemSchema.plugin(paginate);

module.exports = mongoose.model('WorkItem', workItemSchema);
