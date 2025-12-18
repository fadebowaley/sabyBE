const httpStatus = require('http-status');
const mongoose = require('mongoose');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService } = require('../services');
const { User } = require('../models');
const Role = mongoose.model('Role');

// Function to create users by owner Profile
const ownerCreate = catchAsync(async (req, res) => {
  req.body.createdBy = req.user._id; // 🔐 enforce ownership context
  const user = await userService.ownerCreate(req.body);
  res.status(httpStatus.CREATED).send(userService.buildUserResponse(user));
});

// Function to create SabyUser (Global Admin)
const createSabyUser = catchAsync(async (req, res) => {
  const user = await userService.createSabyUser(req.body);
  res.status(httpStatus.CREATED).send(userService.buildUserResponse(user));
});

// Function to bulk create users
const bulkCreate = catchAsync(async (req, res) => {
  const createdBy = req.user.id;
  const { tenantId } = req.user;
  // Validate that createdBy is a valid ObjectId if required

  // Call the bulkCreate method from the user service
  const {
    success: createdUsers,
    errors,
    summary,
  } = await userService.bulkCreate(req.body, createdBy, tenantId);

  // Return the response
  if (createdUsers.length > 0 || errors.length > 0) {
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

  // Return success response with the restored user data
  res.status(httpStatus.OK).send({
    message: 'User restored successfully',
    restoredUser: userService.buildUserResponse(restoredUser),
  });
});

// getting all users or users based on tenantid of owner
const getUsers = catchAsync(async (req, res) => {
  let filter = {};
  const searchTerm = (req.query.search || req.query.q || '').trim();

  // Process status filter first (before search, so it's preserved)
  const statusParam = req.query.status;
  if (statusParam) {
    if (statusParam === 'Active') {
      filter.status = true;
      filter.deletedAt = null; // Active users are not deleted
    } else if (statusParam === 'Pending') {
      filter.status = false;
      filter.deletedAt = null; // Pending users are not deleted
    } else if (statusParam === 'Deactivated') {
      // Deactivated users are soft-deleted
      filter.deletedAt = { $ne: null };
    }
  }

  // Process role filter
  const rolesParam = req.query.roles;
  if (rolesParam) {
    // Lookup role by name within the user's tenant
    const tenantId = req.user?.tenantId;
    const role = await Role.findOne({
      name: rolesParam,
      ...(tenantId && !req.user?.isSaby ? { tenantId } : {}), // Apply tenant filter unless SabyUser
    });

    if (role) {
      // Users have roles as an array, so use $in operator to match
      filter.roles = { $in: [role._id] };
    } else {
      // If role not found, set impossible condition to return empty results
      filter._id = { $in: [] }; // This will match no users
    }
  }

  // Handle search term - if present, use it for text search, otherwise use specific field filters
  if (searchTerm) {
    // If search term exists, use regex OR search (original behavior)
    const regex = new RegExp(searchTerm, 'i'); // case-insensitive
    filter = {
      ...filter, // Preserve status and role filters
      $or: [
        { firstname: regex },
        { lastname: regex },
        { email: regex },
        { userId: regex },
      ],
    };
  } else {
    // If no search term, use specific field filters
    const fieldFilters = pick(req.query, [
      'firstname',
      'lastname',
      'userId',
      'email',
      'avatar',
    ]);
    filter = {
      ...filter, // Preserve status and role filters
      ...fieldFilters,
    };
  }

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
  await userService.deleteUserById(req.params.userId);
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
  // Return a success response
  res.status(httpStatus.OK).send({
    message: 'User soft deleted successfully',
    deletedUser,
  });
});

const assignRoles = catchAsync(async (req, res) => {
  const userRole = await userService.assignRoles(req.params.id, req.body.roles);
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
 * Change user email after OTP verification
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (from auth middleware)
 * @param {string} req.body.email - New email address
 * @param {string} req.body.otp - OTP code for verification
 * @returns {Object} {success: true, message: string, user: Object}
 * @example
 * PATCH /users/change-email
 * {
 *   "email": "newemail@example.com",
 *   "otp": "123456"
 * }
 */
const changeEmail = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Verify OTP using current email
  const { authService } = require('../services');
  const { success } = await authService.verifyOtp(user.email, otp, false);

  if (!success) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired OTP');
  }

  // Check if email already exists for another user
  const existingUser = await User.findOne({
    email,
    _id: { $ne: user._id },
  });
  if (existingUser) {
    throw new ApiError(httpStatus.CONFLICT, 'Email already in use');
  }

  // Update email
  user.email = email;
  user.isEmailVerified = false; // Require re-verification
  user.otp = null;
  user.otpExpires = null;
  await user.save();

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Email updated successfully',
    user: userService.buildUserResponse(user),
  });
});

/**
 * Change user phone number after OTP verification
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (from auth middleware)
 * @param {string} req.body.phone - New phone number
 * @param {string} req.body.otp - OTP code for verification
 * @returns {Object} {success: true, message: string, user: Object}
 * @example
 * PATCH /users/change-phone
 * {
 *   "phone": "+1234567890",
 *   "otp": "123456"
 * }
 */
const changePhone = catchAsync(async (req, res) => {
  const { phone, otp } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Verify OTP - for phone change, we verify using the user's email
  // (since OTP was sent to phone but stored in user model with email context)
  // Note: This assumes OTP is stored in user model. If phone-specific OTP storage
  // is needed, that would require model changes.
  const { authService } = require('../services');
  const { success } = await authService.verifyOtp(user.email, otp, false);

  if (!success) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired OTP');
  }

  // Check if phone already exists for another user
  const existingUser = await User.findOne({
    phoneNumber: phone,
    _id: { $ne: user._id },
  });
  if (existingUser) {
    throw new ApiError(httpStatus.CONFLICT, 'Phone number already in use');
  }

  // Update phone
  user.phoneNumber = phone;
  user.isPhoneVerified = false; // Require re-verification
  user.otp = null;
  user.otpExpires = null;
  await user.save();

  res.status(httpStatus.OK).send({
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
  changeEmail,
  changePhone,
  // bulk create
};
