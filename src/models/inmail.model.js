const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const inmailSchema = mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // userId reference
    to: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }], // array of userId references
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // resolved recipients
    subject: { type: String, required: true },
    body: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
    starred: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['inbox', 'sent', 'drafts', 'starred', 'trash'],
      default: 'inbox',
    },
    channel: { type: String },
    attachments: [
      {
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Storage' },
        url: { type: String },
        filename: { type: String },
        size: { type: Number },
        mimeType: { type: String },
      },
    ],
    readBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes for performance
inmailSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
inmailSchema.index({ tenantId: 1, from: 1, createdAt: -1 });
inmailSchema.index({ tenantId: 1, to: 1, createdAt: -1 });
inmailSchema.index({ subject: 'text', body: 'text' });

inmailSchema.plugin(toJSON);
inmailSchema.plugin(paginate);
inmailSchema.plugin(tenantPlugin);

const InMail = mongoose.model('InMail', inmailSchema);
module.exports = InMail;
