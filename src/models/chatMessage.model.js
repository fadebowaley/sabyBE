const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const chatMessageSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    // Conversation/Thread Management
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      index: true,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
    },
    // Sender/Recipients
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    to: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Node-Scoped Conversations
    nodeId: {
      type: String,
      index: true,
    },
    // Message Content
    messageType: {
      type: String,
      enum: ['text', 'file', 'image', 'system', 'location'],
      default: 'text',
    },
    content: {
      type: String,
      required: true,
    },
    // Rich Content
    metadata: {
      mentions: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      urls: [String],
      location: {
        lat: Number,
        lng: Number,
        address: String,
      },
      poll: {
        question: String,
        options: [String],
        votes: [
          {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User',
            },
            optionIndex: Number,
          },
        ],
      },
    },
    // Attachments (enhanced)
    attachments: [
      {
        fileId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Storage',
        },
        url: String,
        filename: String,
        size: Number,
        mimeType: String,
        thumbnailUrl: String,
        width: Number,
        height: Number,
      },
    ],
    // Delivery Status
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    deliveryReceipts: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        status: {
          type: String,
          enum: ['sent', 'delivered', 'read'],
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Engagement
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        emoji: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Threading
    isThreadStarter: {
      type: Boolean,
      default: false,
    },
    threadMessageCount: {
      type: Number,
      default: 0,
    },
    // Moderation
    editedAt: Date,
    editedHistory: [
      {
        content: String,
        editedAt: Date,
      },
    ],
    isPinned: {
      type: Boolean,
      default: false,
    },
    pinnedAt: Date,
    // Soft Delete
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Indexes for performance
// Primary conversation query (most frequent) - get messages in a conversation
chatMessageSchema.index({ conversationId: 1, createdAt: -1 });

// User's unread messages - find messages user hasn't read
chatMessageSchema.index({
  'to': 1,
  'readBy.userId': 1,
  createdAt: -1,
});

// Alternative unread index - check if user has read (via readBy array)
chatMessageSchema.index({
  conversationId: 1,
  'readBy.userId': 1,
  createdAt: -1,
});

// Node-scoped conversations - get messages in node-scoped conversations
chatMessageSchema.index({ tenantId: 1, nodeId: 1, createdAt: -1 });

// Thread replies - get replies in a thread
chatMessageSchema.index({ threadId: 1, createdAt: 1 });

// Message search - full-text search on content (with mentions for better search)
chatMessageSchema.index({ content: 'text', 'metadata.mentions': 1 });

// Delivery receipts tracking - track delivery status
chatMessageSchema.index({
  'deliveryReceipts.userId': 1,
  'deliveryReceipts.status': 1,
});

// Reactions - query messages by reactions
chatMessageSchema.index({
  'reactions.userId': 1,
  createdAt: -1,
});

// Sender messages - get all messages from a user
chatMessageSchema.index({ from: 1, createdAt: -1 });

// Soft delete filtering - exclude deleted messages efficiently
chatMessageSchema.index({ conversationId: 1, deletedAt: 1, createdAt: -1 });

// TTL index for message retention (1 year)
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

// Plugins
chatMessageSchema.plugin(toJSON);
chatMessageSchema.plugin(paginate);
chatMessageSchema.plugin(tenantPlugin);

// Instance methods
chatMessageSchema.methods.markAsDelivered = function (userId) {
  const existingReceipt = this.deliveryReceipts.find(
    (receipt) => receipt.userId.toString() === userId.toString()
  );

  if (existingReceipt) {
    existingReceipt.status = 'delivered';
    existingReceipt.timestamp = new Date();
  } else {
    this.deliveryReceipts.push({
      userId,
      status: 'delivered',
      timestamp: new Date(),
    });
  }

  // Update message status if all recipients have received
  const allDelivered = this.to.every((recipientId) =>
    this.deliveryReceipts.some(
      (receipt) =>
        receipt.userId.toString() === recipientId.toString() &&
        receipt.status !== 'sent'
    )
  );

  if (allDelivered && this.status === 'sent') {
    this.status = 'delivered';
  }

  return this.save();
};

chatMessageSchema.methods.markAsRead = function (userId) {
  // Add to readBy if not already present
  const alreadyRead = this.readBy.some(
    (read) => read.userId.toString() === userId.toString()
  );

  if (!alreadyRead) {
    this.readBy.push({
      userId,
      readAt: new Date(),
    });
  }

  // Update delivery receipt
  const existingReceipt = this.deliveryReceipts.find(
    (receipt) => receipt.userId.toString() === userId.toString()
  );

  if (existingReceipt) {
    existingReceipt.status = 'read';
    existingReceipt.timestamp = new Date();
  } else {
    this.deliveryReceipts.push({
      userId,
      status: 'read',
      timestamp: new Date(),
    });
  }

  // Update message status if all recipients have read
  const allRead = this.to.every((recipientId) =>
    this.deliveryReceipts.some(
      (receipt) =>
        receipt.userId.toString() === recipientId.toString() &&
        receipt.status === 'read'
    )
  );

  if (allRead) {
    this.status = 'read';
  }

  return this.save();
};

chatMessageSchema.methods.addReaction = function (userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    (reaction) => reaction.userId.toString() !== userId.toString()
  );

  // Add new reaction
  this.reactions.push({
    userId,
    emoji,
    createdAt: new Date(),
  });

  return this.save();
};

chatMessageSchema.methods.removeReaction = function (userId) {
  this.reactions = this.reactions.filter(
    (reaction) => reaction.userId.toString() !== userId.toString()
  );
  return this.save();
};

chatMessageSchema.methods.edit = function (newContent) {
  // Save previous content to history
  if (this.content) {
    if (!this.editedHistory) {
      this.editedHistory = [];
    }
    this.editedHistory.push({
      content: this.content,
      editedAt: this.editedAt || this.createdAt,
    });
  }

  this.content = newContent;
  this.editedAt = new Date();
  return this.save();
};

chatMessageSchema.methods.softDelete = function (userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;

