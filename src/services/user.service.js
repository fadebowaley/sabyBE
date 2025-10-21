const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { User, Role } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a user
 * @param {Object} userBody
 * @returns {Promise<User>}
 */

const createUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  return User.createUser(userBody);
};

const ownerCreate = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User Email is already registered'
    );
  }
  console.log('this is owner creatre', userBody);
  return User.createUser(userBody);
};

/**
 * Create a SabyUser (Global Admin)
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createSabyUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User Email is already registered'
    );
  }

  // Check if SabyUser already exists
  const existingSabyUser = await User.findOne({ isSaby: true });
  if (existingSabyUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only one SabyUser can exist in the system'
    );
  }

  userBody.isSaby = true;
  userBody.isSuper = true;
  userBody.isOwner = true;

  console.log('Creating SabyUser:', userBody);
  return User.createUser(userBody);
};

// const bulkCreate = async (usersBody) => {
//   const createdUsers = []; // To hold successfully created users
//   const errors = []; // To hold errors (e.g., duplicate emails)

//   for (let userData of usersBody) {
//     // Check if email already exists
//     const existingUser = await User.findOne({ email: userData.email });
//     if (existingUser) {
//       // Skip this user and add to errors report
//       errors.push({
//         email: userData.email,
//         error: 'User Email is already registered',
//       });
//       continue; // Skip this user and move to the next
//     }

//     try {
//       // Create the user using the User model's static method
//       const createdUser = await User.createBulk([userData]);
//       createdUsers.push(createdUser[0]); // Push the created user into the success report
//     } catch (error) {
//       // Handle other errors that may occur during creation (e.g., validation errors)
//       errors.push({
//         email: userData.email,
//         error: error.message || 'Unknown error occurred',
//       });
//     }
//   }
//   // Return the result with created users and errors
//   return {
//     createdUsers,
//     errors,
//   };
// };

const bulkCreate = async (usersBody, createdBy, tenantId) =>
  await User.createBulk(usersBody, createdBy, tenantId);

const bulkSoftDeleteByTenantId = async (tenantId) => {
  // Initialize an array to store success and error results
  const successReport = [];
  const errorReport = [];

  // Fetch users by tenantId, excluding those already soft-deleted
  const usersToDelete = await User.find({
    tenantId,
    deletedAt: { $exists: false },
  });

  // Iterate through each user and attempt the soft delete
  for (const user of usersToDelete) {
    try {
      // Perform soft delete by setting the `deletedAt` field
      const result = await User.updateOne(
        { _id: user._id },
        { $set: { deletedAt: new Date() } }
      );

      if (result.modifiedCount > 0) {
        // If the user was successfully soft deleted, add to the success report
        successReport.push({ userId: user.userId, email: user.email });
      } else {
        // If no user was deleted, add to the error report
        errorReport.push({
          userId: user.userId,
          email: user.email,
          error: 'Failed to delete',
        });
      }
    } catch (error) {
      // Catch any errors and add them to the error report
      errorReport.push({
        userId: user.userId,
        email: user.email,
        error: error.message,
      });
    }
  }

  return { successReport, errorReport };
};

const restoreUsersByTenantId = async (tenantId) => {
  try {
    // Find soft-deleted users with the provided tenantId
    const usersToRestore = await User.find({
      tenantId,
      deletedAt: { $ne: null },
    });
    const restoredUsers = [];
    const failedUsers = [];

    for (const user of usersToRestore) {
      try {
        // Restore the user
        user.deletedAt = null; // Nullify the deletedAt field to restore the user
        await user.save();
        restoredUsers.push(user);
      } catch (error) {
        // Capture the error if restoring a user fails
        failedUsers.push({ userId: user.userId, error: error.message });
      }
    }

    return { restoredUsers, failedUsers };
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error during restore: ${error.message}`
    );
  }
};

const restoreUserByUserId = async (userId) => {
  try {
    // Find the soft-deleted user by userId
    const user = await User.findOne({ _id: userId, deletedAt: { $ne: null } });

    if (!user) {
      // If user is not found or is not soft-deleted, throw an error
      return { error: 'User not found or already restored' };
    }

    // Restore the user by nullifying the deletedAt field
    user.deletedAt = null;

    // Save the user back to the database
    await user.save();

    return { restoredUser: user };
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error during restore: ${error.message}`
    );
  }
};

/**
 * Query for users with hierarchy ordering
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {Object} [options.user] - Current user for tenant filtering
 * @returns {Promise<QueryResult>}
 */

const queryUsers = async (filter, options) => {
  const { user } = options;

  // Apply tenant filtering based on user hierarchy
  if (user?.isSaby) {
    // SabyUser can see all users across all tenants
    console.log('[queryUsers] SabyUser - showing all users across all tenants');
    // No additional filtering needed - remove tenant restriction
    delete filter.tenantId;
  } else if (user?.isSuper || user?.isOwner) {
    // SuperUser and Owner can only see users within their tenant
    if (user.tenantId) {
      filter.tenantId = user.tenantId;
      console.log(
        `[queryUsers] SuperUser/Owner - filtering by tenantId: ${user.tenantId}`
      );
    }
  } else {
    // Ordinary users should not have access to user listing
    throw new Error('Insufficient privileges to view user list');
  }

  // Set default sorting by hierarchy if no custom sort is provided
  if (!options.sortBy) {
    // Custom sort: SabyUser (1) → SuperUser (2) → Owner (3) → OrdinaryUser (4)
    // We'll handle this in post-processing since MongoDB can't easily sort by computed hierarchy
    options.sortBy = 'createdAt:desc'; // Default fallback
  }

  const result = await User.paginate(filter, options);

  // Sort results by hierarchy after pagination
  if (result.results && result.results.length > 0) {
    result.results.sort((a, b) => {
      const hierarchyA = getUserHierarchyLevel(a);
      const hierarchyB = getUserHierarchyLevel(b);

      // Primary sort: by hierarchy level (ascending - SabyUser first)
      if (hierarchyA !== hierarchyB) {
        return hierarchyA - hierarchyB;
      }

      // Secondary sort: by name within same hierarchy level
      const nameA = `${a.firstname} ${a.lastname}`.toLowerCase();
      const nameB = `${b.firstname} ${b.lastname}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  return result;
};

/**
 * Get hierarchy level for sorting
 * @param {Object} user - User object
 * @returns {number} 1=SabyUser, 2=SuperUser, 3=Owner, 4=OrdinaryUser
 */
const getUserHierarchyLevel = (user) => {
  if (user.isSaby) return 1;
  if (user.isSuper) return 2;
  if (user.isOwner) return 3;
  return 4;
};

/**
 * Get user by id
 * @param {ObjectId} id
 * @returns {Promise<User>}
 */

const getUserById = async (id) => User.findById(id);

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User>}
 */

const getUserByEmail = async (email) => User.findOne({ email });

/**
 * Get user by phone number (handles + and no +, trims spaces)
 * @param {string} phoneNumber
 * @returns {Promise<User>}
 */
const getUserByPhone = async (phoneNumber) => {
  if (!phoneNumber) return null;
  const normalized = phoneNumber.replace(/[\s\-\(\)]/g, '');
  let user = null;
  console.log(`[getUserByPhone] Trying as-is: ${normalized}`);
  user = await User.findOne({ phoneNumber: normalized });
  if (user) {
    console.log(`[getUserByPhone] Found as-is: ${user.email}`);
    return user;
  }
  if (!normalized.startsWith('+')) {
    console.log(`[getUserByPhone] Trying with +: +${normalized}`);
    user = await User.findOne({ phoneNumber: `+${normalized}` });
    if (user) {
      console.log(`[getUserByPhone] Found with +: ${user.email}`);
      return user;
    }
  }
  if (normalized.startsWith('+')) {
    console.log(
      `[getUserByPhone] Trying without +: ${normalized.substring(1)}`
    );
    user = await User.findOne({ phoneNumber: normalized.substring(1) });
    if (user) {
      console.log(`[getUserByPhone] Found without +: ${user.email}`);
      return user;
    }
  }
  if (normalized.length > 10) {
    const last10 = normalized.slice(-10);
    console.log(`[getUserByPhone] Trying last 10 digits: ${last10}`);
    user = await User.findOne({ phoneNumber: last10 });
    if (user) {
      console.log(`[getUserByPhone] Found last 10: ${user.email}`);
      return user;
    }
  }
  console.log(`[getUserByPhone] No user found for: ${phoneNumber}`);
  return null;
};

/**
 * Update user by id with privilege validation
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @param {Object} currentUser - User performing the update (optional)
 * @returns {Promise<User>}
 */

const updateUserById = async (userId, updateBody, currentUser = null) => {
  console.log(`🔄 [UserService.updateUserById] Updating user ${userId}...`);
  console.log(
    `📊 [UserService.updateUserById] Update body:`,
    JSON.stringify(updateBody, null, 2)
  );
  console.log(
    `👤 [UserService.updateUserById] Current user:`,
    currentUser
      ? `${currentUser.firstname} ${currentUser.lastname} (ID: ${currentUser._id})`
      : 'System'
  );
  console.log(
    `🔑 [UserService.updateUserById] Current user privileges:`,
    currentUser
      ? {
          isSaby: currentUser.isSaby,
          isSuper: currentUser.isSuper,
          isOwner: currentUser.isOwner,
        }
      : 'No current user'
  );

  const user = await User.findById(userId);

  if (!user) {
    console.error(`❌ [UserService.updateUserById] User not found: ${userId}`);
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  console.log(
    `👤 [UserService.updateUserById] Target user: ${user.firstname} ${user.lastname} (ID: ${user._id})`
  );
  console.log(
    `🎖️ [UserService.updateUserById] Current privileges: isSaby=${user.isSaby}, isSuper=${user.isSuper}, isOwner=${user.isOwner}`
  );

  // Privilege update validation if currentUser is provided
  if (
    currentUser &&
    (updateBody.isSaby !== undefined ||
      updateBody.isOwner !== undefined ||
      updateBody.isSuper !== undefined)
  ) {
    console.log(
      `🔒 [UserService.updateUserById] Privilege change detected, validating authorization...`
    );

    // Prevent self-modification
    if (user._id.toString() === currentUser._id.toString()) {
      console.warn(
        `⚠️ [UserService.updateUserById] Self-modification attempt blocked`
      );
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Cannot modify your own privileges'
      );
    }

    // SabyUser privilege management
    if (updateBody.isSaby !== undefined) {
      console.log(
        `👑 [UserService.updateUserById] SabyUser privilege change: ${user.isSaby} → ${updateBody.isSaby}`
      );

      // Only SabyUser can manage isSaby flag
      if (!currentUser.isSaby) {
        console.warn(
          `⚠️ [UserService.updateUserById] Unauthorized SabyUser management attempt by ${currentUser.firstname} ${currentUser.lastname}`
        );
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Only SabyUser can manage SabyUser privileges'
        );
      }

      // If promoting to SabyUser, check uniqueness
      if (updateBody.isSaby === true) {
        console.log(
          `⬆️ [UserService.updateUserById] Promoting to SabyUser, checking uniqueness...`
        );
        const existingSabyUser = await User.findOne({
          isSaby: true,
          _id: { $ne: userId },
        });
        if (existingSabyUser) {
          console.error(
            `❌ [UserService.updateUserById] SabyUser already exists: ${existingSabyUser.firstname} ${existingSabyUser.lastname}`
          );
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Only one SabyUser can exist in the system'
          );
        }
        // Auto-promote to SuperUser and Owner when becoming SabyUser
        updateBody.isSuper = true;
        updateBody.isOwner = true;
        console.log(
          `✅ [UserService.updateUserById] Auto-granting SuperUser + Owner with SabyUser promotion`
        );
      }

      // If demoting from SabyUser, keep SuperUser and Owner flags
      if (updateBody.isSaby === false && user.isSaby === true) {
        console.log(
          `⬇️ [UserService.updateUserById] Demoting from SabyUser - keeping SuperUser and Owner privileges`
        );
      }
    }

    // Owner privilege management
    if (updateBody.isOwner !== undefined) {
      console.log(
        `🎖️ [UserService.updateUserById] Owner privilege change: ${user.isOwner} → ${updateBody.isOwner}`
      );

      // SuperUser or SabyUser can manage Owner privilege
      if (!currentUser.isSuper && !currentUser.isSaby) {
        console.warn(
          `⚠️ [UserService.updateUserById] Unauthorized Owner management attempt by ${currentUser.firstname} ${currentUser.lastname}`
        );
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Only SuperUser or SabyUser can manage Owner privileges'
        );
      }

      // Cannot demote a SabyUser's Owner flag independently
      if (user.isSaby && updateBody.isOwner === false) {
        console.error(
          `❌ [UserService.updateUserById] Cannot remove Owner from SabyUser`
        );
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cannot remove Owner privilege from SabyUser. Demote from SabyUser first.'
        );
      }

      console.log(
        `✅ [UserService.updateUserById] Owner privilege change authorized`
      );
    }

    // SuperUser privilege management
    if (updateBody.isSuper !== undefined) {
      console.log(
        `🛡️ [UserService.updateUserById] SuperUser privilege change: ${user.isSuper} → ${updateBody.isSuper}`
      );

      // Only SabyUser can manage SuperUser privilege
      if (!currentUser.isSaby) {
        console.warn(
          `⚠️ [UserService.updateUserById] Unauthorized SuperUser management attempt by ${currentUser.firstname} ${currentUser.lastname}`
        );
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Only SabyUser can manage SuperUser privileges'
        );
      }

      console.log(
        `✅ [UserService.updateUserById] SuperUser privilege change authorized`
      );
    }
  }

  // Perform the update
  console.log(`💾 [UserService.updateUserById] Applying updates to user...`);
  try {
    Object.assign(user, updateBody);
    await user.save();
    console.log(
      `✅ [UserService.updateUserById] User updated successfully: ${user.firstname} ${user.lastname}`
    );
    console.log(
      `🎖️ [UserService.updateUserById] New privileges: isSaby=${user.isSaby}, isSuper=${user.isSuper}, isOwner=${user.isOwner}`
    );
    return user;
  } catch (error) {
    console.error(`❌ [UserService.updateUserById] Save failed:`, error);
    console.error(`❌ [UserService.updateUserById] Error details:`, {
      message: error.message,
      name: error.name,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue,
    });
    throw error;
  }
};

/**
 * Get user roles with populated role details
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User with populated roles
 */
const getUserRoles = async (userId) => {
  const user = await User.findById(userId).populate(
    'roles',
    'name description permissions'
  );

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  return user;
};

/**
 * Get user nodes where user is a member
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of nodes where user is a member
 */
const getUserNodes = async (userId) => {
  const Nodes = require('../models/node.model');
  const nodes = await Nodes.find({ users: userId })
    .populate('level', 'name description rank')
    .populate('structure', 'name description')
    .select(
      'nodeId name address city state country isMain isActive level structure users'
    );

  return nodes;
};

/**
 * Delete user by id
 * @param {ObjectId} userId
 * @returns {Promise<User>}
 */

const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  await user.remove();
  return user;
};

const softDeleteUserById = async (userId) => {
  try {
    // Fetch the user by userId, ensuring they haven't already been soft-deleted
    const user = await User.findById(userId);

    if (!user) {
      // If the user doesn't exist, throw an error
      return { error: 'User not found' };
    }

    // Check if the user is already soft-deleted
    if (user.deletedAt) {
      return { error: 'User is already soft-deleted' };
    }

    // Perform the soft delete by setting the deletedAt field to the current date
    user.deletedAt = new Date();

    // Save the updated user
    await user.save();

    return { deletedUser: user };
  } catch (error) {
    // Handle errors that might occur
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error during soft delete: ${error.message}`
    );
  }
};

const assignRoles = async (userId, inputRoles) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Normalize input to array
  const incoming = Array.isArray(inputRoles) ? inputRoles : [inputRoles];

  // Validate ObjectIds
  const validObjectIds = incoming.filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (validObjectIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No valid Role IDs provided');
  }

  // Check which ones actually exist in the Role collection
  const rolesInDb = await Role.find({ _id: { $in: validObjectIds } }, '_id');
  const validRoleIds = rolesInDb.map((r) => r._id.toString());

  // Merge with existing user roles (assumes user.roles exists as an array of ObjectIds)
  const existingRoles = (user.roles || []).map((r) => r.toString());
  const mergedRoles = Array.from(new Set([...existingRoles, ...validRoleIds]));

  // Only update if there are new additions
  if (mergedRoles.length !== existingRoles.length) {
    user.roles = mergedRoles;
    await user.save();
  }

  return user;
};

module.exports = {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
  ownerCreate,
  createSabyUser,
  bulkCreate,
  bulkSoftDeleteByTenantId,
  restoreUserByUserId,
  restoreUsersByTenantId,
  softDeleteUserById,
  assignRoles,
  getUserByPhone,
  getUserRoles,
  getUserNodes,
};
