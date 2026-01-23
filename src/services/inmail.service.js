const httpStatus = require('http-status');
const InMail = require('../models/inmail.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Storage = require('../models/storage.model');
const ApiError = require('../utils/ApiError');

/**
 * Resolve recipients including special groups
 * @param {Array<string>} recipients - Array of user IDs or group identifiers
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Resolved user IDs
 */
const resolveRecipients = async (recipients, tenantId) => {
  console.log('[InMail Service] Resolving recipients:', {
    recipients,
    tenantId,
  });

  const resolvedUserIds = new Set();

  for (const recipient of recipients) {
    // Check if recipient is a special group identifier
    if (typeof recipient === 'string') {
      // Handle 'allofus' - all users in tenant
      if (recipient.toLowerCase() === 'allofus') {
        console.log('[InMail Service] Resolving "allofus" group');
        const allUsers = await User.find({ tenantId, isActive: true }).select(
          '_id'
        );
        allUsers.forEach((user) => resolvedUserIds.add(user._id.toString()));
        console.log(
          `[InMail Service] Resolved ${allUsers.length} users for "allofus"`
        );
        continue;
      }

      // Handle 'alladmins' - all admin users
      if (recipient.toLowerCase() === 'alladmins') {
        console.log('[InMail Service] Resolving "alladmins" group');
        const adminUsers = await User.find({
          tenantId,
          isActive: true,
          $or: [{ isSuper: true }, { isOwner: true }, { isSaby: true }],
        }).select('_id');
        adminUsers.forEach((user) => resolvedUserIds.add(user._id.toString()));
        console.log(
          `[InMail Service] Resolved ${adminUsers.length} admin users`
        );
        continue;
      }

      // Handle 'all+rolename' - all users with specific role
      if (recipient.toLowerCase().startsWith('all+')) {
        const roleName = recipient.substring(4).trim();
        console.log(`[InMail Service] Resolving "all+${roleName}" group`);

        const role = await Role.findOne({
          tenantId,
          name: { $regex: new RegExp(`^${roleName}$`, 'i') },
        });

        if (role) {
          const roleUsers = await User.find({
            tenantId,
            isActive: true,
            roles: role._id,
          }).select('_id');
          roleUsers.forEach((user) => resolvedUserIds.add(user._id.toString()));
          console.log(
            `[InMail Service] Resolved ${roleUsers.length} users for role "${roleName}"`
          );
        } else {
          console.log(`[InMail Service] Role "${roleName}" not found`);
        }
        continue;
      }
    }

    // Regular user ID - validate it exists
    const user = await User.findOne({
      _id: recipient,
      tenantId,
      isActive: true,
    });
    if (user) {
      resolvedUserIds.add(user._id.toString());
    } else {
      console.log(`[InMail Service] User ${recipient} not found or inactive`);
    }
  }

  const resolvedArray = Array.from(resolvedUserIds);
  console.log(
    `[InMail Service] Total resolved recipients: ${resolvedArray.length}`
  );
  return resolvedArray;
};

/**
 * Process attachments - validate and store references
 * @param {Array} attachments - Array of attachment objects
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Processed attachments
 */
const processAttachments = async (attachments, tenantId, userId) => {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  console.log(`[InMail Service] Processing ${attachments.length} attachments`);

  const processedAttachments = [];

  for (const attachment of attachments) {
    // If fileId is provided, verify it exists
    if (attachment.fileId) {
      const file = await Storage.findOne({
        _id: attachment.fileId,
        tenantId,
        userId,
      });

      if (file) {
        processedAttachments.push({
          fileId: file._id,
          url: file.storageUrl,
          filename: file.originalName,
          size: file.fileSize,
          mimeType: file.mimeType,
        });
        console.log(`[InMail Service] Attached file: ${file.originalName}`);
      } else {
        console.log(
          `[InMail Service] File ${attachment.fileId} not found, skipping`
        );
      }
    } else if (attachment.url) {
      // Direct URL provided (legacy support)
      processedAttachments.push({
        url: attachment.url,
        filename: attachment.filename || 'attachment',
        size: attachment.size || 0,
        mimeType: attachment.mimeType || 'application/octet-stream',
      });
    }
  }

  console.log(
    `[InMail Service] Processed ${processedAttachments.length} valid attachments`
  );
  return processedAttachments;
};

/**
 * Create a new message
 * @param {Object} body - Message data
 * @param {Object} user - Current user
 * @returns {Promise<InMail>}
 */
const createMessage = async (body, user) => {
  console.log('[InMail Service] Creating message:', {
    from: user._id,
    subject: body.subject,
  });

  body.tenantId = user.tenantId;
  body.from = user._id;

  // Resolve recipients if provided
  if (body.recipients && body.recipients.length > 0) {
    const resolvedRecipients = await resolveRecipients(
      body.recipients,
      user.tenantId
    );
    body.to = resolvedRecipients;
    body.recipients = resolvedRecipients;
  }

  // Process attachments
  if (body.attachments) {
    body.attachments = await processAttachments(
      body.attachments,
      user.tenantId,
      user._id
    );
  }

  const message = await InMail.create(body);
  console.log('[InMail Service] Message created:', message._id);

  return message.populate('from to', 'firstname lastname email');
};

/**
 * Get message by ID
 * @param {string} id - Message ID
 * @returns {Promise<InMail>}
 */
const getMessageById = async (id) => {
  console.log('[InMail Service] Getting message by ID:', id);

  const message = await InMail.findById(id)
    .populate('from', 'firstname lastname email')
    .populate('to', 'firstname lastname email');

  if (!message) {
    console.log('[InMail Service] Message not found:', id);
  }

  return message;
};

/**
 * Query messages with filters
 * @param {Object} filter - Query filters
 * @param {Object} options - Query options
 * @param {Object} user - Current user
 * @returns {Promise<QueryResult>}
 */
const queryMessages = async (filter, options, user) => {
  console.log('[InMail Service] Querying messages:', {
    filter,
    user: user._id,
  });

  filter.tenantId = user.tenantId;

  // Search functionality
  if (filter.search) {
    filter.$or = [
      { subject: { $regex: filter.search, $options: 'i' } },
      { body: { $regex: filter.search, $options: 'i' } },
    ];
    delete filter.search;
  }

  // Filter by user's messages
  if (filter.inbox) {
    filter.to = user._id;
    filter.status = 'inbox';
    delete filter.inbox;
  }

  if (filter.sent) {
    filter.from = user._id;
    filter.status = 'sent';
    delete filter.sent;
  }

  if (filter.drafts) {
    filter.from = user._id;
    filter.status = 'drafts';
    delete filter.drafts;
  }

  // Set default sorting
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  // Populate user details
  options.populate = 'from,to';

  const result = await InMail.paginate(filter, options);
  console.log(`[InMail Service] Found ${result.results.length} messages`);

  return result;
};

/**
 * Update message
 * @param {string} id - Message ID
 * @param {Object} updateBody - Update data
 * @returns {Promise<InMail>}
 */
const updateMessage = async (id, updateBody) => {
  console.log('[InMail Service] Updating message:', {
    id,
    updates: Object.keys(updateBody),
  });

  const message = await InMail.findById(id);
  if (!message) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  }

  Object.assign(message, updateBody);
  await message.save();

  console.log('[InMail Service] Message updated:', id);
  return message.populate('from to', 'firstname lastname email');
};

/**
 * Delete message (soft delete)
 * @param {string} id - Message ID
 * @returns {Promise<InMail>}
 */
const deleteMessage = async (id) => {
  console.log('[InMail Service] Deleting message:', id);

  const message = await InMail.findById(id);
  if (!message) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  }

  message.status = 'trash';
  message.deletedAt = new Date();
  await message.save();

  console.log('[InMail Service] Message moved to trash:', id);
  return message;
};

/**
 * Send message
 * @param {Object} body - Message data
 * @param {Object} user - Current user
 * @returns {Promise<InMail>}
 */
const sendMessage = async (body, user) => {
  console.log('[InMail Service] Sending message:', {
    from: user._id,
    subject: body.subject,
    recipientCount: body.recipients?.length || 0,
  });

  body.tenantId = user.tenantId;
  body.from = user._id;
  body.status = 'sent';
  body.timestamp = new Date();

  // Resolve recipients
  if (body.recipients && body.recipients.length > 0) {
    const resolvedRecipients = await resolveRecipients(
      body.recipients,
      user.tenantId
    );

    if (resolvedRecipients.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No valid recipients found');
    }

    body.to = resolvedRecipients;
    body.recipients = resolvedRecipients;
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Recipients are required');
  }

  // Process attachments
  if (body.attachments) {
    body.attachments = await processAttachments(
      body.attachments,
      user.tenantId,
      user._id
    );
  }

  const message = await InMail.create(body);
  console.log('[InMail Service] Message sent successfully:', {
    id: message._id,
    recipientCount: message.to.length,
  });

  return message.populate('from to', 'firstname lastname email');
};

/**
 * Save message as draft
 * @param {Object} body - Message data
 * @param {Object} user - Current user
 * @returns {Promise<InMail>}
 */
const saveDraft = async (body, user) => {
  console.log('[InMail Service] Saving draft:', {
    from: user._id,
    subject: body.subject,
  });

  body.tenantId = user.tenantId;
  body.from = user._id;
  body.status = 'drafts';
  body.read = true;

  // Resolve recipients if provided
  if (body.recipients && body.recipients.length > 0) {
    const resolvedRecipients = await resolveRecipients(
      body.recipients,
      user.tenantId
    );
    body.to = resolvedRecipients;
    body.recipients = resolvedRecipients;
  } else {
    body.to = [];
    body.recipients = [];
  }

  // Process attachments
  if (body.attachments) {
    body.attachments = await processAttachments(
      body.attachments,
      user.tenantId,
      user._id
    );
  }

  const message = await InMail.create(body);
  console.log('[InMail Service] Draft saved:', message._id);

  return message.populate('from to', 'firstname lastname email');
};

/**
 * Mark message as read
 * @param {string} messageId - Message ID
 * @param {string} userId - User ID
 * @returns {Promise<InMail>}
 */
const markAsRead = async (messageId, userId) => {
  console.log('[InMail Service] Marking message as read:', {
    messageId,
    userId,
  });

  const message = await InMail.findById(messageId);
  if (!message) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  }

  // Add to readBy array if not already read
  const alreadyRead = message.readBy.some(
    (r) => r.userId.toString() === userId.toString()
  );
  if (!alreadyRead) {
    message.readBy.push({ userId, readAt: new Date() });
    message.read = true;
    await message.save();
    console.log('[InMail Service] Message marked as read');
  }

  return message;
};

/**
 * Get inbox count for user
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Count statistics
 */
const getInboxCount = async (userId, tenantId) => {
  const total = await InMail.countDocuments({
    tenantId,
    to: userId,
    status: 'inbox',
    deletedAt: null,
  });

  const unread = await InMail.countDocuments({
    tenantId,
    to: userId,
    status: 'inbox',
    read: false,
    deletedAt: null,
  });

  console.log('[InMail Service] Inbox count:', { userId, total, unread });

  return { total, unread };
};

module.exports = {
  createMessage,
  getMessageById,
  queryMessages,
  updateMessage,
  deleteMessage,
  sendMessage,
  saveDraft,
  markAsRead,
  getInboxCount,
  resolveRecipients,
  processAttachments,
};
