const httpStatus = require('http-status');
const Conversation = require('../models/conversation.model');
const User = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { nodeAccessService } = require('./nodeAccess.service');

/**
 * Check if user can access a conversation
 * @param {Object} user - User object
 * @param {Object} conversation - Conversation object
 * @returns {Promise<boolean>} True if user can access
 */
const canAccessConversation = async (user, conversation) => {
  try {
    // Direct messages: check if user is participant
    if (conversation.type === 'direct') {
      return conversation.participants.some(
        (p) => p.toString() === user._id.toString()
      );
    }

    // Node-scoped conversations: check node access
    if (conversation.nodeId) {
      const hasNodeAccess = await nodeAccessService.canUserAccessNode(
        user,
        conversation.nodeId,
        user.tenantId
      );
      if (!hasNodeAccess) {
        return false;
      }
    }

    // Group/channel: check if user is participant
    return conversation.participants.some(
      (p) => p.toString() === user._id.toString()
    );
  } catch (error) {
    logger.error('[Conversation Service] Error checking access:', error);
    return false;
  }
};

/**
 * Create a new conversation
 * @param {Object} user - User object
 * @param {Object} conversationData - Conversation data
 * @param {string} conversationData.type - Conversation type (direct, group, channel)
 * @param {Array<string>} conversationData.participants - Participant user IDs
 * @param {string} conversationData.name - Conversation name (for groups/channels)
 * @param {string} conversationData.description - Description (for groups/channels)
 * @param {string} conversationData.nodeId - Node ID (for node-scoped conversations)
 * @param {Object} conversationData.settings - Conversation settings
 * @returns {Promise<Object>} Created conversation
 */
const createConversation = async (user, conversationData) => {
  try {
    const {
      type,
      participants: participantIds,
      name,
      description,
      avatar,
      nodeId,
      nodeName,
      settings = {},
    } = conversationData;

    // Validate participants
    const participants = [user._id]; // Creator is always a participant

    if (participantIds && participantIds.length > 0) {
      // Verify all participants exist and are in the same tenant
      const users = await User.find({
        _id: { $in: participantIds },
        tenantId: user.tenantId,
        isActive: true,
      });

      // Add valid participants (avoid duplicates)
      users.forEach((participantUser) => {
        if (
          !participants.some(
            (p) => p.toString() === participantUser._id.toString()
          )
        ) {
          participants.push(participantUser._id);
        }
      });
    }

    // For direct messages, ensure exactly 2 participants
    if (type === 'direct' && participants.length !== 2) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Direct messages must have exactly 2 participants'
      );
    }

    // For groups/channels, name is required
    if ((type === 'group' || type === 'channel') && !name) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Name is required for groups and channels'
      );
    }

    // For groups, ensure minimum 2 participants (creator + at least 1 other)
    if (type === 'group' && participants.length < 2) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Groups must have at least 2 participants'
      );
    }

    // For channels, creator can be the only participant initially (public channels)
    // Private channels should have at least 2 participants
    if (type === 'channel' && settings?.isPrivate && participants.length < 2) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Private channels must have at least 2 participants'
      );
    }

    // Verify node access if nodeId is provided
    if (nodeId) {
      const hasNodeAccess = await nodeAccessService.canUserAccessNode(
        user,
        nodeId,
        user.tenantId
      );

      if (!hasNodeAccess) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'You do not have access to this node'
        );
      }
    }

    // Check if direct conversation already exists
    if (type === 'direct' && participants.length === 2) {
      const existingDirect = await Conversation.findOne({
        tenantId: user.tenantId,
        type: 'direct',
        participants: { $all: participants, $size: 2 },
        deletedAt: null,
      });

      if (existingDirect) {
        logger.info(
          `[Conversation Service] Direct conversation already exists: ${existingDirect._id}`
        );
        return existingDirect;
      }
    }

    // Create conversation
    const conversation = await Conversation.create({
      tenantId: user.tenantId,
      type,
      participants,
      name,
      description,
      avatar,
      createdBy: user._id,
      nodeId,
      nodeName,
      settings: {
        isPrivate: settings?.isPrivate !== undefined ? settings.isPrivate : (type === 'channel' ? false : false), // Channels default to public
        allowInvites: settings?.allowInvites !== undefined ? settings.allowInvites : (type === 'channel' ? true : true),
        readOnly: settings?.readOnly || false,
        mutedBy: [],
        admins: type === 'group' || type === 'channel' ? [user._id] : [], // Creator is admin
        moderators: type === 'channel' ? [] : undefined, // Only channels have moderators
        maxParticipants: settings?.maxParticipants || null,
        onlyAdminsCanPost: settings?.onlyAdminsCanPost || false,
      },
      unreadCounts: participants.map((participantId) => ({
        userId: participantId,
        count: 0,
        lastReadAt: new Date(),
      })),
    });

    logger.info({
      event: 'CONVERSATION_CREATED',
      conversationId: conversation._id.toString(),
      userId: user._id.toString(),
      tenantId: user.tenantId,
      type,
      participantCount: conversation.participants.length,
      nodeId: conversation.nodeId || null,
      timestamp: new Date().toISOString(),
    });

    return conversation;
  } catch (error) {
    logger.error({
      event: 'CONVERSATION_CREATE_ERROR',
      userId: user?._id?.toString(),
      tenantId: user?.tenantId,
      type,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

/**
 * Get conversations for a user
 * @param {Object} user - User object
 * @param {Object} filters - Filter criteria
 * @param {string} filters.type - Filter by type (direct, group, channel)
 * @param {string} filters.nodeId - Filter by node ID
 * @param {boolean} filters.isArchived - Filter archived conversations
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated conversations
 */
const getConversations = async (user, filters = {}, options = {}) => {
  try {
    const {
      type,
      nodeId,
      isArchived = false,
      limit = 50,
      page = 1,
      sortBy = 'lastMessageAt:desc',
    } = options;

    // Build filter
    const filter = {
      tenantId: user.tenantId,
      participants: user._id,
      deletedAt: null,
    };

    if (type) {
      filter.type = type;
    }

    if (nodeId) {
      // Verify user has access to this node
      const hasNodeAccess = await nodeAccessService.canUserAccessNode(
        user,
        nodeId,
        user.tenantId
      );

      if (!hasNodeAccess) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'You do not have access to this node'
        );
      }

      filter.nodeId = nodeId;
    } else {
      // Apply node access filter for node-scoped conversations
      // This filters out conversations where user doesn't have node access
      // For owners/supers/saby, this returns the filter unchanged
      // For regular users, it restricts nodeId to accessible nodes
      await nodeAccessService.applyNodeAccessFilter(filter, user, user.tenantId);
    }

    if (isArchived) {
      filter.archivedAt = { $ne: null };
    } else {
      filter.archivedAt = null;
    }

    // Get conversations with pagination
    const result = await Conversation.paginate(filter, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sortBy,
      populate: ['participants', 'lastMessage', 'lastMessageBy', 'createdBy'],
    });

    // Final access check to ensure all returned conversations are accessible
    // (handles edge cases like direct messages)
    const accessibleConversations = [];
    for (const conv of result.results) {
      const hasAccess = await canAccessConversation(user, conv);
      if (hasAccess) {
        accessibleConversations.push(conv);
      }
    }

    return {
      ...result,
      results: accessibleConversations,
      totalResults: accessibleConversations.length,
    };
  } catch (error) {
    logger.error('[Conversation Service] Error getting conversations:', error);
    throw error;
  }
};

/**
 * Get conversation by ID
 * @param {Object} user - User object
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Conversation
 */
const getConversationById = async (user, conversationId) => {
  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      tenantId: user.tenantId,
      deletedAt: null,
    })
      .populate('participants', 'name email avatar')
      .populate('lastMessage')
      .populate('lastMessageBy', 'name email')
      .populate('createdBy', 'name email');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Verify access
    const hasAccess = await canAccessConversation(user, conversation);

    if (!hasAccess) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
    }

    return conversation;
  } catch (error) {
    logger.error('[Conversation Service] Error getting conversation:', error);
    throw error;
  }
};

/**
 * Update conversation
 * @param {Object} user - User object
 * @param {string} conversationId - Conversation ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} Updated conversation
 */
const updateConversation = async (user, conversationId, updateData) => {
  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      tenantId: user.tenantId,
      deletedAt: null,
    });

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Verify access
    const hasAccess = await canAccessConversation(user, conversation);

    if (!hasAccess) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
    }

    // For groups/channels, check if user is admin/creator before allowing updates
    if (conversation.type === 'group' || conversation.type === 'channel') {
      const isAdmin = conversation.isAdmin(user._id);
      const isCreator =
        conversation.createdBy &&
        conversation.createdBy.toString() === user._id.toString();

      if (!isAdmin && !isCreator) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Only admins can update this conversation'
        );
      }
    }

    // Update fields
    if (updateData.name !== undefined) {
      if (conversation.type === 'group' || conversation.type === 'channel') {
        conversation.name = updateData.name;
      } else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Name can only be updated for groups and channels'
        );
      }
    }

    if (updateData.description !== undefined) {
      if (conversation.type === 'group' || conversation.type === 'channel') {
        conversation.description = updateData.description;
      } else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Description can only be updated for groups and channels'
        );
      }
    }

    if (updateData.avatar !== undefined) {
      if (conversation.type === 'group' || conversation.type === 'channel') {
        conversation.avatar = updateData.avatar;
      } else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Avatar can only be updated for groups and channels'
        );
      }
    }

    if (updateData.settings) {
      // Only allow certain settings to be updated
      if (updateData.settings.isPrivate !== undefined) {
        conversation.settings.isPrivate = updateData.settings.isPrivate;
      }
      if (updateData.settings.allowInvites !== undefined) {
        conversation.settings.allowInvites = updateData.settings.allowInvites;
      }
      if (updateData.settings.readOnly !== undefined) {
        conversation.settings.readOnly = updateData.settings.readOnly;
      }
      if (updateData.settings.onlyAdminsCanPost !== undefined && conversation.type === 'channel') {
        conversation.settings.onlyAdminsCanPost = updateData.settings.onlyAdminsCanPost;
      }
      if (updateData.settings.maxParticipants !== undefined) {
        // Validate maxParticipants
        if (
          updateData.settings.maxParticipants !== null &&
          (updateData.settings.maxParticipants < 2 ||
            updateData.settings.maxParticipants < conversation.participants.length)
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'maxParticipants must be at least 2 and not less than current participant count'
          );
        }
        conversation.settings.maxParticipants =
          updateData.settings.maxParticipants;
      }
      // Note: admins array should be managed via separate endpoints
    }

    if (updateData.metadata) {
      conversation.metadata = {
        ...conversation.metadata,
        ...updateData.metadata,
      };
    }

    await conversation.save();

    logger.info(
      `[Conversation Service] Conversation ${conversationId} updated by user ${user._id}`
    );

    return conversation;
  } catch (error) {
    logger.error('[Conversation Service] Error updating conversation:', error);
    throw error;
  }
};

/**
 * Add participant to conversation
 * @param {Object} user - User object
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID to add
 * @returns {Promise<Object>} Updated conversation
 */
const addParticipant = async (user, conversationId, userId) => {
  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      tenantId: user.tenantId,
      deletedAt: null,
    });

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Verify access to conversation
    const hasAccess = await canAccessConversation(user, conversation);
    if (!hasAccess) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
    }

    // For direct messages, cannot add participants
    if (conversation.type === 'direct') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot add participants to direct messages'
      );
    }

    // For groups/channels, check permissions
    if (conversation.type === 'group' || conversation.type === 'channel') {
      // Check if user is admin or creator
      const isAdmin = conversation.isAdmin(user._id);
      const isCreator =
        conversation.createdBy &&
        conversation.createdBy.toString() === user._id.toString();

      // Check if invites are allowed
      if (!conversation.settings.allowInvites && !isAdmin && !isCreator) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Invites are not allowed in this conversation'
        );
      }

      // Only admins/creators can add participants (unless allowInvites is true and user is participant)
      if (!isAdmin && !isCreator) {
        if (!conversation.settings.allowInvites) {
          throw new ApiError(
            httpStatus.FORBIDDEN,
            'Only admins can add participants to this conversation'
          );
        }
        // If allowInvites is true, any participant can add others
      }

      // Check max participants limit
      if (
        conversation.settings.maxParticipants &&
        conversation.participants.length >= conversation.settings.maxParticipants
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Conversation has reached maximum participants (${conversation.settings.maxParticipants})`
        );
      }
    }

    // Verify user to add exists and is in same tenant
    const userToAdd = await User.findOne({
      _id: userId,
      tenantId: user.tenantId,
      isActive: true,
    });

    if (!userToAdd) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Check if user is already a participant
    const alreadyParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    );

    if (alreadyParticipant) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'User is already a participant'
      );
    }

    // For node-scoped conversations, verify user to add has node access
    if (conversation.nodeId) {
      const hasNodeAccess = await nodeAccessService.canUserAccessNode(
        userToAdd,
        conversation.nodeId,
        user.tenantId
      );

      if (!hasNodeAccess) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'User does not have access to the node associated with this conversation'
        );
      }
    }

    // Add participant
    await conversation.addParticipant(userId);

    logger.info(
      `[Conversation Service] User ${userId} added to conversation ${conversationId} by user ${user._id}`
    );

    return conversation;
  } catch (error) {
    logger.error('[Conversation Service] Error adding participant:', error);
    throw error;
  }
};

/**
 * Remove participant from conversation
 * @param {Object} user - User object
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID to remove
 * @returns {Promise<Object>} Updated conversation
 */
const removeParticipant = async (user, conversationId, userId) => {
  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      tenantId: user.tenantId,
      deletedAt: null,
    });

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Verify access to conversation
    const hasAccess = await canAccessConversation(user, conversation);
    if (!hasAccess) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
    }

    // For direct messages, cannot remove participants (only leave)
    if (conversation.type === 'direct') {
      if (userId !== user._id.toString()) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cannot remove participants from direct messages'
        );
      }
      // User can leave direct message (though it's unusual)
    }

    // Check if user to remove is a participant
    const isTargetParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    );

    if (!isTargetParticipant) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'User is not a participant in this conversation'
      );
    }

    // For groups/channels, check permissions
    if (conversation.type === 'group' || conversation.type === 'channel') {
      const isAdmin = conversation.isAdmin(user._id);
      const isCreator =
        conversation.createdBy &&
        conversation.createdBy.toString() === user._id.toString();
      const isRemovingSelf = userId === user._id.toString();

      // Users can always remove themselves
      if (isRemovingSelf) {
        // Remove from admins if they were an admin (but not creator)
        if (conversation.isAdmin(userId) && !isCreator) {
          await conversation.removeAdmin(userId).catch(() => {
            // Ignore error if already not admin
          });
        }
      } else {
        // Only admins/creators can remove others
        if (!isAdmin && !isCreator) {
          throw new ApiError(
            httpStatus.FORBIDDEN,
            'Only admins can remove participants from this conversation'
          );
        }

        // Cannot remove creator
        if (
          conversation.createdBy &&
          conversation.createdBy.toString() === userId.toString()
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Cannot remove the creator from the conversation'
          );
        }
      }
    }

    // Remove participant
    await conversation.removeParticipant(userId);

    logger.info({
      event: 'CONVERSATION_PARTICIPANT_REMOVED',
      conversationId: conversationId.toString(),
      removedUserId: userId.toString(),
      removedBy: user._id.toString(),
      tenantId: user.tenantId,
      conversationType: conversation.type,
      participantCount: conversation.participants.length,
      timestamp: new Date().toISOString(),
    });

    return conversation;
  } catch (error) {
    logger.error({
      event: 'CONVERSATION_PARTICIPANT_REMOVE_ERROR',
      conversationId: conversationId?.toString(),
      removedUserId: userId?.toString(),
      removedBy: user?._id?.toString(),
      tenantId: user?.tenantId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

module.exports = {
  createConversation,
  getConversations,
  getConversationById,
  updateConversation,
  addParticipant,
  removeParticipant,
  canAccessConversation,
};

