const httpStatus = require('http-status');
const mongoose = require('mongoose');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService, subscriptionService } = require('../services');
const copilotActionService = require('../services/copilotAction.service');
const {
  invalidateTenantEntityCaches,
} = require('../services/copilotEntityResolver.service');
const { User, Role } = require('../models');

const invalidateUserResolverCache = async (tenantId) => {
  if (!tenantId) return;
  try {
    await invalidateTenantEntityCaches({
      tenantId: String(tenantId),
      entityType: 'user',
    });
  } catch (_) {
    // non-blocking cache invalidation
  }
};

const assertSeatHeadroom = async (tenantId, seatCount = 1) =>
  subscriptionService.assertSubscriptionLimit({
    tenantId,
    limitKey: 'seats',
    delta: seatCount,
    message:
      seatCount > 1
        ? 'Your current workspace subscription does not have enough seat capacity for this bulk invite. Upgrade billing to add more team members.'
        : 'Your current workspace subscription has reached its seat limit. Upgrade billing to add another team member.',
  });

// Function to create users by owner Profile
const ownerCreate = catchAsync(async (req, res) => {
  req.body.createdBy = req.user._id; // 🔐 enforce ownership context
  await assertSeatHeadroom(req.user.tenantId, 1);
  const user = await userService.ownerCreate(req.body);
  await invalidateUserResolverCache(req.user?.tenantId || user?.tenantId);
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'create_user',
    entityType: 'user',
    entityId: String(user._id || user.id || user.userId || ''),
    payload: {
      source: 'user.controller.ownerCreate',
      email: user.email || null,
    },
    source: 'existing-service',
    priority: 10,
  });
  res.status(httpStatus.CREATED).send(userService.buildUserResponse(user));
});

// Function to create SabyUser (Global Admin)
const createSabyUser = catchAsync(async (req, res) => {
  const user = await userService.createSabyUser(req.body);
  await invalidateUserResolverCache(req.user?.tenantId || user?.tenantId);
  if (req.user?.tenantId) {
    await copilotActionService.recordExistingAction({
      tenantId: req.user.tenantId,
      actorUserId: req.user._id || req.user.id,
      actionType: 'create_user',
      entityType: 'user',
      entityId: String(user._id || user.id || user.userId || ''),
      payload: {
        source: 'user.controller.createSabyUser',
        email: user.email || null,
      },
      source: 'existing-service',
      priority: 10,
    });
  }
  res.status(httpStatus.CREATED).send(userService.buildUserResponse(user));
});

// Function to bulk create users
const bulkCreate = catchAsync(async (req, res) => {
  const createdBy = req.user.id;
  const { tenantId } = req.user;
  await assertSeatHeadroom(tenantId, Array.isArray(req.body) ? req.body.length : 0);
  // Validate that createdBy is a valid ObjectId if required

  // Call the bulkCreate method from the user service
  const {
    success: createdUsers,
    errors,
    summary,
  } = await userService.bulkCreate(req.body, createdBy, tenantId);

  // Return the response
  if (createdUsers.length > 0 || errors.length > 0) {
    if (createdUsers.length > 0) {
      await invalidateUserResolverCache(tenantId);
    }
    return res.status(httpStatus.CREATED).send({
      message: 'Bulk user creation completed',
      createdUsers,
      errors,
      summary,
    });
  }
  // If no users were created or errors exist
  res
    .status(httpStatus.BAD_REQUEST)
    .send({ message: 'No users were created or all had errors', errors });
});

// Function to soft delete users by tenantId and isOwner flag
const bulkDelete = catchAsync(async (req, res) => {
  const { tenantId } = req.body; // Expecting tenantId in the request body

  // Validate if tenantId is provided
  if (!tenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Tenant ID is required for deletion'
    );
  }

  // Call the service to perform the bulk soft delete
  const { successReport, errorReport } =
    await userService.bulkSoftDeleteByTenantId(tenantId);
  if (successReport.length > 0) {
    await invalidateUserResolverCache(tenantId);
  }

  // If no users were soft-deleted, return an error
  if (successReport.length === 0 && errorReport.length === 0) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No users found to soft delete for the provided tenant ID'
    );
  }

  // Return success response with report
  res.status(httpStatus.OK).send({
    message: 'Bulk delete operation completed',
    successReport,
    errorReport,
  });
});

// Function to restore users by tenantId
const restoreUsers = catchAsync(async (req, res) => {
  const { tenantId } = req.body; // Expecting a single tenantId in the request body

  if (!tenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Tenant ID is required for restoring'
    );
  }
  // Call the restore function in userService
  const { restoredUsers, failedUsers } =
    await userService.restoreUsersByTenantId(tenantId);

  // Check if any users were restored
  if (restoredUsers.length === 0) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No soft-deleted users found with the provided tenant ID'
    );
  }

  await Promise.all(
    restoredUsers.map((restoredUser) =>
      copilotActionService.recordExistingAction({
        tenantId: req.user.tenantId || tenantId,
        actorUserId: req.user._id || req.user.id,
        actionType: 'reactivate_user',
        entityType: 'user',
        entityId: String(restoredUser._id || restoredUser.id || ''),
        payload: {
          source: 'user.controller.restoreUsers',
        },
        source: 'existing-service',
        priority: 8,
      })
    )
  );
  await invalidateUserResolverCache(req.user?.tenantId || tenantId);

  // Return success response with detailed report
  res.status(httpStatus.OK).send({
    message: `${restoredUsers.length} users restored successfully`,
    restoredUsers: restoredUsers.map((user) =>
      userService.buildUserResponse(user)
    ),
    failedUsers,
  });
});

// Function to restore a single user by userId
const restoreUser = catchAsync(async (req, res) => {
  const { userId } = req.params; // Expecting a userId as a URL parameter

  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User ID is required for restoring'
    );
  }

  // Call the restore function in userService
  const { restoredUser, error } = await userService.restoreUserByUserId(userId);

  // Check if the user was restored
  if (error) {
    throw new ApiError(httpStatus.NOT_FOUND, error);
  }

  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId || restoredUser.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'reactivate_user',
    entityType: 'user',
    entityId: String(restoredUser._id || restoredUser.id || userId),
    payload: {
      source: 'user.controller.restoreUser',
    },
    source: 'existing-service',
    priority: 8,
  });
  await invalidateUserResolverCache(req.user?.tenantId || restoredUser?.tenantId);

  // Return success response with the restored user data
  res.status(httpStatus.OK).send({
    message: 'User restored successfully',
    restoredUser: userService.buildUserResponse(restoredUser),
  });
});

// getting all users or users based on tenantid of owner
const getUsers = catchAsync(async (req, res) => {
  const baseFilter = pick(req.query, [
    'firstname',
    'lastname',
    'userId',
    'email',
    'avatar',
  ]);
  const searchTerm = (req.query.search || req.query.q || '').trim();
  const requestedStatus = String(req.query.status || '').trim();
  const requestedRoles = String(req.query.roles || '').trim();
  const andFilters = [];

  if (Object.keys(baseFilter).length > 0) {
    andFilters.push(baseFilter);
  }

  if (requestedStatus) {
    const statusLower = requestedStatus.toLowerCase();
    if (statusLower === 'active') {
      andFilters.push({ deletedAt: null, status: true });
    } else if (statusLower === 'pending') {
      andFilters.push({ deletedAt: null, status: false });
    } else if (statusLower === 'deactivated') {
      andFilters.push({ deletedAt: { $ne: null } });
    }
  }

  if (requestedRoles) {
    let roleIds = [];
    const rawRoleValues = requestedRoles
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const objectIdRoleValues = rawRoleValues.filter((value) =>
      mongoose.Types.ObjectId.isValid(value)
    );
    const roleNameValues = rawRoleValues.filter(
      (value) => !mongoose.Types.ObjectId.isValid(value)
    );

    if (objectIdRoleValues.length > 0) {
      roleIds = roleIds.concat(objectIdRoleValues);
    }

    if (roleNameValues.length > 0) {
      const roleNameFilter = { name: { $in: roleNameValues } };
      if (!req.user?.isSaby && req.user?.tenantId) {
        roleNameFilter.tenantId = req.user.tenantId;
      }
      const matchingRoles = await Role.find(roleNameFilter).select('_id');
      roleIds = roleIds.concat(matchingRoles.map((role) => String(role._id)));
    }

    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length === 0) {
      andFilters.push({ _id: { $in: [] } });
    } else {
      andFilters.push({ roles: { $in: uniqueRoleIds } });
    }
  }

  if (searchTerm) {
    const regex = new RegExp(searchTerm, 'i');
    andFilters.push({
      $or: [
        { firstname: regex },
        { lastname: regex },
        { email: regex },
        { userId: regex },
      ],
    });
  }

  const filter = andFilters.length === 0 ? {} : { $and: andFilters };

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'roles';
  options.user = req.user; // Add the user object to options for tenant filtering and hierarchy
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

// Function to get a particular user (with profile)
const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  res.send(userService.buildUserResponse(user));
});

const updateUser = catchAsync(async (req, res) => {
  try {
    console.log(
      `🔄 [UserController.updateUser] Updating user ${req.params.userId}`
    );
    console.log(`📊 [UserController.updateUser] Request body:`, req.body);
    console.log(
      `👤 [UserController.updateUser] Current user:`,
      req.user ? `${req.user.firstname} ${req.user.lastname}` : 'No user'
    );

    const user = await userService.updateUserById(
      req.params.userId,
      req.body,
      req.user
    );
    await invalidateUserResolverCache(req.user?.tenantId || user?.tenantId);

    console.log(`✅ [UserController.updateUser] User updated successfully`);
    res.send(userService.buildUserResponse(user));
  } catch (error) {
    console.error(`❌ [UserController.updateUser] Update failed:`, error);
    console.error(`❌ [UserController.updateUser] Error details:`, {
      message: error.message,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
    });
    throw error;
  }
});

const deleteUser = catchAsync(async (req, res) => {
  const deletedUser = await userService.deleteUserById(req.params.userId);
  await invalidateUserResolverCache(req.user?.tenantId || deletedUser?.tenantId);
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'delete_user',
    entityType: 'user',
    entityId: String(req.params.userId),
    payload: {
      source: 'user.controller.deleteUser',
    },
    source: 'existing-service',
    priority: 10,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get user roles
 * @param {Object} req
 * @param {Object} res
 */
const getUserRoles = catchAsync(async (req, res) => {
  const user = await userService.getUserRoles(req.params.userId);
  res.send(user.roles);
});

/**
 * Get user nodes (with profiles)
 * @param {Object} req
 * @param {Object} res
 */
const getUserNodes = catchAsync(async (req, res) => {
  const nodes = await userService.getUserNodes(req.params.userId);

  // Return nodes directly (profile model doesn't exist yet)
  res.send(nodes);
});

/**
 * Update profile update compliance status
 * @param {Object} req
 * @param {Object} res
 */
const updateProfileCompliance = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { profileUpdateCompliant } = req.body;
  const currentUser = req.user;

  if (typeof profileUpdateCompliant !== 'boolean') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'profileUpdateCompliant must be a boolean value'
    );
  }

  const user = await userService.getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // SECURITY: Verify user belongs to same tenant
  if (user.tenantId !== currentUser.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - user belongs to different tenant'
    );
  }

  // Update compliance fields
  user.profileUpdateCompliant = profileUpdateCompliant;
  user.profileUpdateCompliantAt = profileUpdateCompliant ? new Date() : null;
  user.profileUpdateCompliantBy = profileUpdateCompliant
    ? currentUser._id
    : null;

  await user.save();

  res.send({
    success: true,
    data: userService.buildUserResponse(user),
    message: profileUpdateCompliant
      ? 'Profile update marked as compliant'
      : 'Profile update compliance removed',
  });
});

const softDeleteUser = catchAsync(async (req, res) => {
  const { userId } = req.params; // Get the userId from URL parameters
  const { deletedUser, error } = await userService.softDeleteUserById(userId);
  if (error) {
    throw new ApiError(httpStatus.NOT_FOUND, error);
  }
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId || deletedUser.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'deactivate_user',
    entityType: 'user',
    entityId: String(deletedUser._id || deletedUser.id || userId),
    payload: {
      source: 'user.controller.softDeleteUser',
    },
    source: 'existing-service',
    priority: 9,
  });
  await invalidateUserResolverCache(req.user?.tenantId || deletedUser?.tenantId);

  // Return a success response
  res.status(httpStatus.OK).send({
    message: 'User soft deleted successfully',
    deletedUser,
  });
});

const assignRoles = catchAsync(async (req, res) => {
  const userRole = await userService.assignRoles(req.params.id, req.body.roles);
  await invalidateUserResolverCache(req.user?.tenantId || userRole?.tenantId);
  await copilotActionService.recordExistingAction({
    tenantId: req.user.tenantId,
    actorUserId: req.user._id || req.user.id,
    actionType: 'assign_role',
    entityType: 'user_role',
    entityId: String(req.params.id),
    payload: {
      source: 'user.controller.assignRoles',
      roles: req.body.roles || [],
    },
    source: 'existing-service',
    priority: 5,
  });
  res.send(userRole);
});

/**
 * Get profile update leaderboard
 * @route GET /v1/users/profile-update-leaderboard
 */
const getProfileUpdateLeaderboard = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { timeframe = 'all', limit = 50 } = req.query;

  const result = await userService.getProfileUpdateLeaderboard(
    tenantId,
    timeframe,
    parseInt(limit, 10)
  );

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
  });
});

/**
 * Get profile edit statistics
 * @route GET /v1/users/profile-edit-statistics
 */
const getProfileEditStatistics = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  const statistics = await userService.getProfileEditStatistics(tenantId);

  res.status(httpStatus.OK).json({
    success: true,
    data: statistics,
  });
});

/**
 * Change user email address
 * Note: OTP verification must be completed before calling this endpoint
 * @param {Object} req
 * @param {Object} req.user - Authenticated user
 * @param {string} req.body.email - New email address
 * @returns {Object} Updated user
 */
const changeEmail = catchAsync(async (req, res) => {
  const { email } = req.body;
  const userId = req.user._id;

  // Check if email is already taken by another user
  if (await User.isEmailTaken(email, userId)) {
    throw new ApiError(httpStatus.CONFLICT, 'Email already in use');
  }

  // Update user email
  const user = await userService.updateUserById(userId, { email }, req.user);
  await invalidateUserResolverCache(req.user?.tenantId || user?.tenantId);

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Email updated successfully',
    user: userService.buildUserResponse(user),
  });
});

/**
 * Change user phone number
 * Note: OTP verification must be completed before calling this endpoint
 * @param {Object} req
 * @param {Object} req.user - Authenticated user
 * @param {string} req.body.phone - New phone number
 * @returns {Object} Updated user
 */
const changePhone = catchAsync(async (req, res) => {
  const { phone } = req.body;
  const userId = req.user._id;

  // Update user phone
  const user = await userService.updateUserById(
    userId,
    { phoneNumber: phone },
    req.user
  );
  await invalidateUserResolverCache(req.user?.tenantId || user?.tenantId);

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Phone number updated successfully',
    user: userService.buildUserResponse(user),
  });
});

module.exports = {
  ownerCreate,
  createSabyUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  bulkCreate,
  bulkDelete,
  restoreUser,
  restoreUsers,
  softDeleteUser,
  assignRoles,
  getUserRoles,
  getUserNodes,
  updateProfileCompliance,
  getProfileUpdateLeaderboard,
  getProfileEditStatistics,
  changeEmail,
  changePhone,
  // bulk create
};
