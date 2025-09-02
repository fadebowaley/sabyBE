const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const inmailSchema = mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // userId reference
    to: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }], // array of userId references
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
    attachments: [{ type: String }],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

inmailSchema.plugin(toJSON);
inmailSchema.plugin(paginate);
inmailSchema.plugin(tenantPlugin);

const InMail = mongoose.model('InMail', inmailSchema);
module.exports = InMail;
