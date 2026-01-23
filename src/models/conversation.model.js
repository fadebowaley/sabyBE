const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

const conversationSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    // Type: 'direct' | 'group' | 'channel'
    type: {
      type: String,
      enum: ['direct', 'group', 'channel'],
      required: true,
      index: true,
    },
    // Participants
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    // Channel/Group Info
    name: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Node-Scoped Conversation
    nodeId: {
      type: String,
      index: true,
    },
    nodeName: {
      type: String,
    },
    // Settings
    settings: {
      isPrivate: {
        type: Boolean,
        default: false,
      },
      allowInvites: {
        type: Boolean,
        default: true,
      },
      readOnly: {
        type: Boolean,
        default: false,
      },
      mutedBy: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      // Group/Channel-specific settings
      admins: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      moderators: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      maxParticipants: {
        type: Number,
        default: null, // null = unlimited
      },
      // Channel-specific: Only admins/moderators can post if true
      onlyAdminsCanPost: {
        type: Boolean,
        default: false,
      },
    },
    // Last Activity
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
    },
    lastMessageAt: {
      type: Date,
      index: true,
    },
    lastMessageBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Unread Counts (per user)
    unreadCounts: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        count: {
          type: Number,
          default: 0,
        },
        lastReadAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Metadata
    metadata: {
      tags: [String],
      customFields: mongoose.Schema.Types.Mixed,
    },
    // Soft Delete
    deletedAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for performance
// Query conversations by tenant, participants, and type (most common query)
conversationSchema.index({ tenantId: 1, participants: 1, type: 1 });

// Query node-scoped conversations
conversationSchema.index({ tenantId: 1, nodeId: 1, type: 1 });

// Query conversations sorted by last message (with deletedAt for soft delete filtering)
conversationSchema.index({ tenantId: 1, deletedAt: 1, lastMessageAt: -1 });

// Query unread counts by user
conversationSchema.index({ 'unreadCounts.userId': 1 });

// Text search on name and description
conversationSchema.index({ name: 'text', description: 'text' });

// Public channel discovery - for non-private channels
conversationSchema.index({
  tenantId: 1,
  type: 1,
  'settings.isPrivate': 1,
  deletedAt: 1,
});

// Participant lookup - find conversations for a specific user
conversationSchema.index({
  tenantId: 1,
  participants: 1,
  deletedAt: 1,
  archivedAt: 1,
});

// Plugins
conversationSchema.plugin(toJSON);
conversationSchema.plugin(paginate);
conversationSchema.plugin(tenantPlugin);

// Instance methods
conversationSchema.methods.addParticipant = function (userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    // Initialize unread count for new participant
    this.unreadCounts.push({
      userId,
      count: 0,
      lastReadAt: new Date(),
    });
  }
  return this.save();
};

conversationSchema.methods.removeParticipant = function (userId) {
  this.participants = this.participants.filter(
    (id) => id.toString() !== userId.toString()
  );
  this.unreadCounts = this.unreadCounts.filter(
    (uc) => uc.userId.toString() !== userId.toString()
  );
  return this.save();
};

conversationSchema.methods.updateLastMessage = function (messageId, userId) {
  this.lastMessage = messageId;
  this.lastMessageAt = new Date();
  this.lastMessageBy = userId;
  // Increment unread count for all participants except sender
  this.unreadCounts.forEach((uc) => {
    if (uc.userId.toString() !== userId.toString()) {
      uc.count += 1;
    }
  });
  return this.save();
};

conversationSchema.methods.markAsRead = function (userId) {
  const unreadCount = this.unreadCounts.find(
    (uc) => uc.userId.toString() === userId.toString()
  );
  if (unreadCount) {
    unreadCount.count = 0;
    unreadCount.lastReadAt = new Date();
  } else {
    this.unreadCounts.push({
      userId,
      count: 0,
      lastReadAt: new Date(),
    });
  }
  return this.save();
};

conversationSchema.methods.getUnreadCount = function (userId) {
  const unreadCount = this.unreadCounts.find(
    (uc) => uc.userId.toString() === userId.toString()
  );
  return unreadCount ? unreadCount.count : 0;
};

/**
 * Check if user is an admin of the group/channel
 * @param {ObjectId|String} userId - User ID
 * @returns {boolean}
 */
conversationSchema.methods.isAdmin = function (userId) {
  if (this.type !== 'group' && this.type !== 'channel') {
    return false;
  }
  // Creator is always an admin
  if (this.createdBy && this.createdBy.toString() === userId.toString()) {
    return true;
  }
  // Check if user is in admins array
  return this.settings.admins.some(
    (adminId) => adminId.toString() === userId.toString()
  );
};

/**
 * Check if user is a moderator of the channel
 * @param {ObjectId|String} userId - User ID
 * @returns {boolean}
 */
conversationSchema.methods.isModerator = function (userId) {
  if (this.type !== 'channel') {
    return false;
  }
  // Admins are also moderators
  if (this.isAdmin(userId)) {
    return true;
  }
  // Check if user is in moderators array
  return this.settings.moderators.some(
    (modId) => modId.toString() === userId.toString()
  );
};

/**
 * Check if user can post in the channel
 * @param {ObjectId|String} userId - User ID
 * @returns {boolean}
 */
conversationSchema.methods.canPost = function (userId) {
  // For channels with read-only setting, only admins/moderators can post
  if (this.settings.readOnly || this.settings.onlyAdminsCanPost) {
    return this.isModerator(userId) || this.isAdmin(userId);
  }
  // Otherwise, participants can post
  return this.participants.some((p) => p.toString() === userId.toString());
};

/**
 * Add admin to group/channel
 * @param {ObjectId|String} userId - User ID to make admin
 * @returns {Promise<this>}
 */
conversationSchema.methods.addAdmin = function (userId) {
  if (this.type !== 'group' && this.type !== 'channel') {
    throw new Error('Only groups and channels can have admins');
  }
  if (!this.settings.admins.some((id) => id.toString() === userId.toString())) {
    this.settings.admins.push(userId);
  }
  return this.save();
};

/**
 * Add moderator to channel
 * @param {ObjectId|String} userId - User ID to make moderator
 * @returns {Promise<this>}
 */
conversationSchema.methods.addModerator = function (userId) {
  if (this.type !== 'channel') {
    throw new Error('Only channels can have moderators');
  }
  if (
    !this.settings.moderators.some((id) => id.toString() === userId.toString())
  ) {
    this.settings.moderators.push(userId);
  }
  return this.save();
};

/**
 * Remove moderator from channel
 * @param {ObjectId|String} userId - User ID to remove moderator
 * @returns {Promise<this>}
 */
conversationSchema.methods.removeModerator = function (userId) {
  if (this.type !== 'channel') {
    throw new Error('Only channels can have moderators');
  }
  this.settings.moderators = this.settings.moderators.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

/**
 * Remove admin from group
 * @param {ObjectId|String} userId - User ID to remove admin
 * @returns {Promise<this>}
 */
conversationSchema.methods.removeAdmin = function (userId) {
  if (this.type !== 'group' && this.type !== 'channel') {
    throw new Error('Only groups and channels can have admins');
  }
  // Cannot remove creator as admin
  if (this.createdBy && this.createdBy.toString() === userId.toString()) {
    throw new Error('Cannot remove creator as admin');
  }
  this.settings.admins = this.settings.admins.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
