const httpStatus = require('http-status');
const { WorkItem, User } = require('../models');
const ApiError = require('../utils/ApiError');

const resolveAssignees = async (assignees, user) => {
  if (!assignees) return undefined;

  const userIds = [
    ...new Set(
      assignees
        .filter((assignee) => assignee.kind !== 'contact')
        .map((assignee) => assignee.userId)
    ),
  ];
  const users = await User.find({
    tenantId: user.tenantId,
    deletedAt: null,
    $or: [{ _id: { $in: userIds } }, { userId: { $in: userIds } }],
  }).select('_id userId firstname lastname email phoneNumber');
  const usersById = new Map();
  users.forEach((member) => {
    const resolved = {
      kind: 'user',
      userId: String(member._id),
      name: [member.firstname, member.lastname].filter(Boolean).join(' '),
      email: member.email || undefined,
      phone: member.phoneNumber || undefined,
    };
    usersById.set(String(member._id), resolved);
    if (member.userId) usersById.set(String(member.userId), resolved);
  });

  if (userIds.some((userId) => !usersById.has(userId))) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'One or more assignees are not active members of this tenant'
    );
  }

  return assignees.map((assignee) => {
    if (assignee.kind === 'contact') {
      return {
        kind: 'contact',
        name: assignee.name,
        email: assignee.email || undefined,
        phone: assignee.phone || undefined,
      };
    }
    return usersById.get(assignee.userId);
  });
};

const createWorkItem = async (body, user) =>
  WorkItem.create({
    ...body,
    ...(body.assignees
      ? { assignees: await resolveAssignees(body.assignees, user) }
      : {}),
    tenantId: user.tenantId,
    createdBy: String(user.id || user._id),
  });

const resolveAssigneeEmails = async (emails = [], user) => {
  const normalizedEmails = emails.map((email) => email.trim().toLowerCase());
  if (new Set(normalizedEmails).size !== normalizedEmails.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Duplicate assignee email');
  }
  if (!normalizedEmails.length) return [];

  const members = await User.find({
    tenantId: user.tenantId,
    deletedAt: null,
    status: true,
    email: { $in: normalizedEmails },
  }).select('_id firstname lastname email phoneNumber');
  const membersByEmail = new Map(
    members.map((member) => [
      member.email.toLowerCase(),
      {
        kind: 'user',
        userId: String(member._id),
        name: [member.firstname, member.lastname].filter(Boolean).join(' '),
        email: member.email,
        phone: member.phoneNumber || undefined,
      },
    ])
  );

  return normalizedEmails.map(
    (email) =>
      membersByEmail.get(email) || {
        kind: 'contact',
        name: email,
        email,
      }
  );
};

const importWorkItems = async (items, user) => {
  const createdBy = String(user.id || user._id);
  const records = await Promise.all(
    items.map(async (item) => {
      const {
        assigneeEmails = [],
        notificationContacts = [],
        ...workItem
      } = item;
      const userAssignees = await resolveAssigneeEmails(assigneeEmails, user);
      return {
        ...workItem,
        assignees: [
          ...userAssignees,
          ...notificationContacts.map((contact) => ({
            kind: 'contact',
            name: contact.name,
            email: contact.email || undefined,
            phone: contact.phone || undefined,
          })),
        ],
        tenantId: user.tenantId,
        createdBy,
      };
    })
  );
  const session = await WorkItem.startSession();
  try {
    let importedItems;
    await session.withTransaction(async () => {
      importedItems = await WorkItem.insertMany(records, {
        ordered: true,
        session,
      });
    });
    return importedItems;
  } finally {
    await session.endSession();
  }
};

const queryWorkItems = ({ from, to, type, status }, user) => {
  const filter = { tenantId: user.tenantId };
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (from || to) {
    filter.startAt = {};
    if (from) filter.startAt.$lte = new Date(to || from);
    if (to) filter.endAt = { $gte: new Date(from || to) };
  }
  return WorkItem.find(filter).sort({ startAt: 1 });
};

const updateWorkItem = async (id, body, user) => {
  const item = await WorkItem.findOne({ _id: id, tenantId: user.tenantId });
  if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Work item not found');
  const { assignees, ...updates } = body;
  Object.assign(item, updates);
  if (assignees) item.assignees = await resolveAssignees(assignees, user);
  await item.save();
  return item;
};

const getWorkItem = async (id, user) => {
  const item = await WorkItem.findOne({ _id: id, tenantId: user.tenantId });
  if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Work item not found');
  return item;
};

const deleteWorkItem = async (id, user) => {
  const item = await WorkItem.findOneAndDelete({
    _id: id,
    tenantId: user.tenantId,
  });
  if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Work item not found');
};

module.exports = {
  createWorkItem,
  importWorkItems,
  queryWorkItems,
  getWorkItem,
  updateWorkItem,
  deleteWorkItem,
};
