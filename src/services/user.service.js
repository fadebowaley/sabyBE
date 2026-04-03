const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { User, Role } = require('../models');
const ApiError = require('../utils/ApiError');
const { validateCustomFields } = require('./customField.service');
const { USER_ESSENTIAL_FIELDS } = require('../config/essentials');
const { getUsersInAdminNodeDescendants } = require('./nodeAccess.service');
const { postgresPool } = require('../config/postgres');
const {
  normalizePhoneToE164,
  buildPhoneLookupCandidates,
} = require('../utils/phoneNumber');

const buildUserResponse = (userDoc) => {
  if (!userDoc) {
    return null;
  }
  const plain =
    typeof userDoc.toObject === 'function'
      ? userDoc.toObject({ virtuals: true })
      : userDoc;
  const response = {};

  USER_ESSENTIAL_FIELDS.forEach((field) => {
    if (plain[field] !== undefined) {
      response[field] = plain[field];
    }
  });

  if (response.profile === undefined) {
    response.profile = plain.profile || {};
  }

  if (
    plain.customFields &&
    typeof plain.customFields === 'object' &&
    Object.keys(plain.customFields).length > 0
  ) {
    response.customFields = plain.customFields;
    response.customFieldsVersion = plain.customFieldsVersion || 0;
  }

  return response;
};

const normalizePhoneForWrite = (value) => {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const normalized = normalizePhoneToE164(raw, { allowEmpty: false });
  if (!normalized) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid phone number format. Use a valid local or international number.'
    );
  }
  return normalized;
};

/**
 * Create a user
 * @param {Object} userBody
 * @returns {Promise<User>}
 */

const createUser = async (userBody) => {
  if (
    Object.prototype.hasOwnProperty.call(userBody, 'phone') &&
    !Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')
  ) {
    userBody.phoneNumber = userBody.phone;
  }
  if (Object.prototype.hasOwnProperty.call(userBody, 'phone')) {
    delete userBody.phone;
  }
  if (Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')) {
    userBody.phoneNumber = normalizePhoneForWrite(userBody.phoneNumber);
  }

  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  // Handle customFields validation if provided
  const customFieldsProvided = Object.prototype.hasOwnProperty.call(
    userBody,
    'customFields'
  );
  const customFieldsPayload = customFieldsProvided
    ? userBody.customFields
    : undefined;

  if (customFieldsProvided) {
    delete userBody.customFields;
  }

  // Create user first to get tenantId
  const user = await User.createUser(userBody);

  // Validate and apply customFields if provided
  if (customFieldsProvided) {
    const { values, version } = await validateCustomFields({
      tenantId: user.tenantId,
      entityType: 'user',
      payload: customFieldsPayload,
    });
    user.customFields = values;
    user.customFieldsVersion = version;
    await user.save();
  }

  return user;
};

const ownerCreate = async (userBody) => {
  if (
    Object.prototype.hasOwnProperty.call(userBody, 'phone') &&
    !Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')
  ) {
    userBody.phoneNumber = userBody.phone;
  }
  if (Object.prototype.hasOwnProperty.call(userBody, 'phone')) {
    delete userBody.phone;
  }
  if (Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')) {
    userBody.phoneNumber = normalizePhoneForWrite(userBody.phoneNumber);
  }

  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User Email is already registered'
    );
  }
  console.log('this is owner creatre', userBody);

  // Handle customFields validation if provided
  const customFieldsProvided = Object.prototype.hasOwnProperty.call(
    userBody,
    'customFields'
  );
  const customFieldsPayload = customFieldsProvided
    ? userBody.customFields
    : undefined;

  if (customFieldsProvided) {
    delete userBody.customFields;
  }

  // Create user first to get tenantId
  const user = await User.createUser(userBody);

  // Validate and apply customFields if provided
  if (customFieldsProvided) {
    const { values, version } = await validateCustomFields({
      tenantId: user.tenantId,
      entityType: 'user',
      payload: customFieldsPayload,
    });
    user.customFields = values;
    user.customFieldsVersion = version;
    await user.save();
  }

  return user;
};

/**
 * Create a SabyUser (Global Admin)
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createSabyUser = async (userBody) => {
  if (
    Object.prototype.hasOwnProperty.call(userBody, 'phone') &&
    !Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')
  ) {
    userBody.phoneNumber = userBody.phone;
  }
  if (Object.prototype.hasOwnProperty.call(userBody, 'phone')) {
    delete userBody.phone;
  }
  if (Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')) {
    userBody.phoneNumber = normalizePhoneForWrite(userBody.phoneNumber);
  }

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

  // Handle customFields validation if provided
  const customFieldsProvided = Object.prototype.hasOwnProperty.call(
    userBody,
    'customFields'
  );
  const customFieldsPayload = customFieldsProvided
    ? userBody.customFields
    : undefined;

  if (customFieldsProvided) {
    delete userBody.customFields;
  }

  // Create user first to get tenantId
  const user = await User.createUser(userBody);

  // Validate and apply customFields if provided
  if (customFieldsProvided) {
    const { values, version } = await validateCustomFields({
      tenantId: user.tenantId,
      entityType: 'user',
      payload: customFieldsPayload,
    });
    user.customFields = values;
    user.customFieldsVersion = version;
    await user.save();
  }

  return user;
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
  const deletedActorIds = [];

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
        deletedActorIds.push(String(user._id));
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

  if (deletedActorIds.length > 0) {
    await cleanupCopilotChatLogsForUsers({
      tenantId,
      actorIds: deletedActorIds,
    });
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
        user.status = true; // Reactivation should mark account active
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
    user.status = true; // Reactivation should mark account active

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
      const userType = user.isSuper ? 'SuperUser' : 'Owner';
      console.log(
        `[queryUsers] ${userType} - filtering by tenantId: ${user.tenantId}`
      );
    }
  } else if (user?.isAdmin) {
    // Admin users can only see users assigned to descendant nodes (children) of their assigned nodes
    // Note: requireAccess middleware already validated user:read permission for isAdmin users
    if (user.tenantId) {
      filter.tenantId = user.tenantId;
      console.log(
        `[queryUsers] Admin - filtering by users in descendant nodes for tenantId: ${user.tenantId}`
      );

      // Get user IDs assigned to descendant nodes
      const descendantUserIds = await getUsersInAdminNodeDescendants(
        user,
        user.tenantId
      );

      if (descendantUserIds.length === 0) {
        // No users found in descendant nodes - return empty result
        console.log(
          '[queryUsers] Admin user has no users in descendant nodes - returning empty result'
        );
        filter._id = { $in: [] }; // Impossible filter - no results
      } else {
        // Filter to only users assigned to descendant nodes
        filter._id = { $in: descendantUserIds };
        console.log(
          `[queryUsers] Admin - filtering to ${descendantUserIds.length} users in descendant nodes`
        );
      }
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

  if (result.results && result.results.length > 0) {
    result.results = result.results.map((user) => buildUserResponse(user));
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
  const candidates = buildPhoneLookupCandidates(phoneNumber);
  let user = null;
  if (candidates.length > 0) {
    console.log(`[getUserByPhone] Trying candidates: ${candidates.join(', ')}`);
    user = await User.findOne({ phoneNumber: { $in: candidates } });
  }
  if (user) {
    console.log(`[getUserByPhone] Found user: ${user.email}`);
    return user;
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

  const customFieldsProvided = Object.prototype.hasOwnProperty.call(
    updateBody,
    'customFields'
  );
  const customFieldsPayload = customFieldsProvided
    ? updateBody.customFields
    : undefined;
  if (customFieldsProvided) {
    delete updateBody.customFields;
  }

  // Normalize legacy phone payloads to canonical top-level user.phoneNumber.
  if (
    Object.prototype.hasOwnProperty.call(updateBody, 'phone') &&
    !Object.prototype.hasOwnProperty.call(updateBody, 'phoneNumber')
  ) {
    updateBody.phoneNumber = updateBody.phone;
  }
  if (Object.prototype.hasOwnProperty.call(updateBody, 'phone')) {
    delete updateBody.phone;
  }
  // Backward compatibility: accept legacy profile.phoneNumber but persist canonically on user.phoneNumber.
  if (
    updateBody.profile &&
    typeof updateBody.profile === 'object' &&
    Object.prototype.hasOwnProperty.call(updateBody.profile, 'phoneNumber') &&
    !Object.prototype.hasOwnProperty.call(updateBody, 'phoneNumber')
  ) {
    updateBody.phoneNumber = updateBody.profile.phoneNumber;
    delete updateBody.profile.phoneNumber;
  }
  if (Object.prototype.hasOwnProperty.call(updateBody, 'phoneNumber')) {
    updateBody.phoneNumber = normalizePhoneForWrite(updateBody.phoneNumber);
  }

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
      updateBody.isSuper !== undefined ||
      updateBody.isAdmin !== undefined)
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

    // Admin privilege management
    if (updateBody.isAdmin !== undefined) {
      console.log(
        `👔 [UserService.updateUserById] Admin privilege change: ${user.isAdmin} → ${updateBody.isAdmin}`
      );

      // Owner, SuperUser, or SabyUser can manage Admin privilege
      if (!currentUser.isOwner && !currentUser.isSuper && !currentUser.isSaby) {
        console.warn(
          `⚠️ [UserService.updateUserById] Unauthorized Admin management attempt by ${currentUser.firstname} ${currentUser.lastname}`
        );
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Only Owner, SuperUser, or SabyUser can manage Admin privileges'
        );
      }

      // Cannot promote SabyUser, SuperUser, or Owner to Admin (they already have higher privileges)
      if (
        updateBody.isAdmin === true &&
        (user.isSaby || user.isSuper || user.isOwner)
      ) {
        console.warn(
          `⚠️ [UserService.updateUserById] Cannot add Admin flag to user with higher privileges`
        );
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Cannot add Admin privilege to SabyUser, SuperUser, or Owner'
        );
      }

      console.log(
        `✅ [UserService.updateUserById] Admin privilege change authorized`
      );
    }
  }

  // Separate user fields from profile fields
  const userFields = [
    'firstname',
    'lastname',
    'email',
    'phoneNumber',
    'password',
    'userId',
    'isSaby',
    'isSuper',
    'isOwner',
    'isAdmin',
    'status',
    'isActive',
    'isEmailVerified',
    'otpVerified',
    'otp',
    'otpExpires',
    'roles',
    'tenantId',
    'profileUpdateCompliant',
    'profileUpdateCompliantAt',
    'profileUpdateCompliantBy',
    'profileLastEditedAt',
    'profileEditCount',
  ];

  const profileFields = [
    'title',
    'otherName',
    'gender',
    'dateOfBirth',
    'highestQualification',
    'professional',
    'maritalStatus',
    'stateOfOrigin',
    'lgaOfOrigin',
    'homeTown',
    'spouseName',
    'spousePhoneNumber',
    'spouseDateOfBirth',
    'nextOfKinName',
    'nextOfKinPhoneNumber',
    'nextOfKinRelationship',
    'residentialAddress',
    'stateOfResidence',
    'lgaOfResidence',
    'employmentCategory',
    'occupation',
    'employeeId',
    'officeTitle',
  ];

  // Extract user-specific fields and profile fields
  const userUpdate = {};
  const profileUpdate = {};

  // Handle nested profile object
  if (updateBody.profile && typeof updateBody.profile === 'object') {
    Object.keys(updateBody.profile).forEach((key) => {
      if (profileFields.includes(key)) {
        profileUpdate[key] = updateBody.profile[key];
      }
    });
    // Remove profile from updateBody to avoid processing it again
    delete updateBody.profile;
  }

  // Handle top-level profile fields
  Object.keys(updateBody).forEach((key) => {
    if (userFields.includes(key)) {
      userUpdate[key] = updateBody[key];
    } else if (profileFields.includes(key)) {
      profileUpdate[key] = updateBody[key];
    }
  });

  console.log(
    `📝 [UserService.updateUserById] User fields to update:`,
    Object.keys(userUpdate)
  );
  console.log(
    `📝 [UserService.updateUserById] Profile fields to update:`,
    Object.keys(profileUpdate)
  );

  // Perform the update
  console.log(`💾 [UserService.updateUserById] Applying updates to user...`);
  try {
    // Only update fields that are present in userUpdate
    Object.keys(userUpdate).forEach((key) => {
      user[key] = userUpdate[key];
    });

    if (customFieldsProvided) {
      const { values, version } = await validateCustomFields({
        tenantId: user.tenantId,
        entityType: 'user',
        payload: customFieldsPayload,
      });
      user.customFields = values;
      user.customFieldsVersion = version;
    }

    // Update profile if profile fields exist (BEFORE saving)
    if (Object.keys(profileUpdate).length > 0) {
      console.log(
        `📝 [UserService.updateUserById] Updating profile fields:`,
        Object.keys(profileUpdate)
      );
      // Initialize profile object if it doesn't exist
      if (!user.profile) {
        user.profile = {};
      }
      // Update profile fields
      Object.keys(profileUpdate).forEach((key) => {
        user.profile[key] = profileUpdate[key];
      });
      // Mark profile as modified for Mongoose to save it
      user.markModified('profile');
      console.log(
        `✅ [UserService.updateUserById] Profile fields updated successfully`
      );
    }

    // Track profile edits if profile fields were updated
    if (Object.keys(profileUpdate).length > 0) {
      user.profileLastEditedAt = new Date();
      user.profileEditCount = (user.profileEditCount || 0) + 1;
      console.log(
        `📝 [UserService.updateUserById] Profile edit tracked: count=${user.profileEditCount}, lastEdited=${user.profileLastEditedAt}`
      );
    }

    await user.save();
    console.log(
      `✅ [UserService.updateUserById] User updated successfully: ${user.firstname} ${user.lastname}`
    );
    console.log(
      `🎖️ [UserService.updateUserById] New privileges: isSaby=${user.isSaby}, isSuper=${user.isSuper}, isOwner=${user.isOwner}`
    );

    // Trigger compliance recalculation if profile was updated
    // This runs asynchronously to avoid blocking the response
    if (Object.keys(profileUpdate).length > 0) {
      setImmediate(async () => {
        try {
          const { complianceService } = require('./');
          const complianceScore =
            await complianceService.calculateComplianceScore(
              user._id.toString(),
              null,
              user.tenantId
            );
          logger.info(
            `✅ [UserService.updateUserById] Compliance recalculated for ${user.firstname} ${user.lastname}: overall=${complianceScore.overallCompliance}%, isCompliant=${complianceScore.isCompliant}`
          );
        } catch (error) {
          logger.error(
            `❌ [UserService.updateUserById] Error recalculating compliance for ${user._id}:`,
            error
          );
          // Don't throw - compliance recalculation failure shouldn't break profile update
        }
      });
    }

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

const cleanupCopilotChatLogsForUsers = async ({ tenantId, actorIds = [] }) => {
  if (!tenantId) return { threadsDeleted: 0, turnsDeleted: 0, skipped: true };
  const normalizedActorIds = Array.isArray(actorIds)
    ? actorIds
        .map((value) => String(value || '').trim())
        .filter((value) => Boolean(value))
    : [];

  try {
    if (normalizedActorIds.length > 0) {
      const threadDelete = await postgresPool.query(
        `DELETE FROM copilot.chat_threads
          WHERE tenant_id = $1
            AND actor_id = ANY($2::text[])`,
        [String(tenantId), normalizedActorIds]
      );
      const turnDelete = await postgresPool.query(
        `DELETE FROM copilot.chat_turn_logs
          WHERE tenant_id = $1
            AND actor_id = ANY($2::text[])`,
        [String(tenantId), normalizedActorIds]
      );
      return {
        threadsDeleted: Number(threadDelete.rowCount || 0),
        turnsDeleted: Number(turnDelete.rowCount || 0),
        skipped: false,
      };
    }

    const threadDelete = await postgresPool.query(
      `DELETE FROM copilot.chat_threads WHERE tenant_id = $1`,
      [String(tenantId)]
    );
    const turnDelete = await postgresPool.query(
      `DELETE FROM copilot.chat_turn_logs WHERE tenant_id = $1`,
      [String(tenantId)]
    );
    return {
      threadsDeleted: Number(threadDelete.rowCount || 0),
      turnsDeleted: Number(turnDelete.rowCount || 0),
      skipped: false,
    };
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('relation') && message.includes('does not exist')) {
      return { threadsDeleted: 0, turnsDeleted: 0, skipped: true };
    }
    console.warn(
      '[UserService.cleanupCopilotChatLogsForUsers] Failed to cleanup chat logs:',
      error?.message || error
    );
    return { threadsDeleted: 0, turnsDeleted: 0, skipped: true };
  }
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
  await cleanupCopilotChatLogsForUsers({
    tenantId: user.tenantId,
    actorIds: [user._id || userId],
  });
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

    await cleanupCopilotChatLogsForUsers({
      tenantId: user.tenantId,
      actorIds: [user._id || userId],
    });

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

/**
 * Get profile update leaderboard
 * Ranks users by most recent profile updates
 * @param {string} tenantId
 * @param {string} timeframe - 'all', '24h', '7d', '30d'
 * @param {number} limit
 * @returns {Promise<Object>}
 */
const getProfileUpdateLeaderboard = async (
  tenantId,
  timeframe = 'all',
  limit = 50
) => {
  try {
    // Build date filter based on timeframe
    const dateFilter = {};
    const now = new Date();

    if (timeframe === '24h') {
      dateFilter.updatedAt = {
        $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      };
    } else if (timeframe === '7d') {
      dateFilter.updatedAt = {
        $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      };
    } else if (timeframe === '30d') {
      dateFilter.updatedAt = {
        $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      };
    }

    // Get users sorted by most recent profile update
    const users = await User.find({
      tenantId,
      ...dateFilter,
      profile: { $exists: true, $ne: null },
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    // Get nodes for users
    const { Nodes } = require('../models');
    const userIds = users.map((u) => u._id);
    const nodes = await Nodes.find({
      tenantId,
      users: { $in: userIds },
      deletedAt: null,
    })
      .populate('level', 'name')
      .lean();

    // Create node map by user
    const nodeMapByUser = new Map();
    for (const node of nodes) {
      for (const userId of node.users || []) {
        const userIdStr = userId.toString();
        if (!nodeMapByUser.has(userIdStr)) {
          nodeMapByUser.set(userIdStr, node);
        }
      }
    }

    // Build leaderboard
    const leaderboard = users.map((user, index) => {
      const userIdStr = user._id.toString();
      const userNode = nodeMapByUser.get(userIdStr);

      const diffInMs = now.getTime() - new Date(user.updatedAt).getTime();
      const daysAgo = Math.floor(diffInMs / (24 * 60 * 60 * 1000));

      return {
        rank: index + 1,
        id: userIdStr,
        userId: user.userId || user.haloId || userIdStr,
        fullName: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
        email: user.email,
        phoneNumber: user.phoneNumber || '',
        avatar: user.avatar || '',
        nodeName: userNode?.name || null,
        nodeLevel: userNode?.level?.name || null,
        profileUpdatedAt: user.updatedAt,
        profileUpdateCompliant: user.profileUpdateCompliant || false,
        profileUpdateCompliantAt: user.profileUpdateCompliantAt || null,
        daysAgo,
      };
    });

    // Calculate stats
    const allUsers = await User.find({ tenantId }).lean();
    const last24h = allUsers.filter(
      (u) =>
        u.updatedAt &&
        new Date(u.updatedAt).getTime() >= now.getTime() - 24 * 60 * 60 * 1000
    ).length;
    const last7d = allUsers.filter(
      (u) =>
        u.updatedAt &&
        new Date(u.updatedAt).getTime() >=
          now.getTime() - 7 * 24 * 60 * 60 * 1000
    ).length;
    const last30d = allUsers.filter(
      (u) =>
        u.updatedAt &&
        new Date(u.updatedAt).getTime() >=
          now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).length;

    return {
      leaderboard,
      stats: {
        totalUpdates: allUsers.length,
        last24Hours: last24h,
        last7Days: last7d,
        last30Days: last30d,
        averageUpdateTime: 0,
      },
    };
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to get profile update leaderboard'
    );
  }
};

/**
 * Get profile edit statistics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Profile edit statistics
 */
const getProfileEditStatistics = async (tenantId) => {
  try {
    const users = await User.find({ tenantId }).lean();

    const totalUsers = users.length;
    const usersWithEdits = users.filter(
      (u) => u.profileEditCount && u.profileEditCount > 0
    ).length;
    const usersWithoutEdits = totalUsers - usersWithEdits;

    // Calculate average edit count
    const totalEdits = users.reduce(
      (sum, u) => sum + (u.profileEditCount || 0),
      0
    );
    const averageEdits = usersWithEdits > 0 ? totalEdits / usersWithEdits : 0;

    // Get recent edits (last 24 hours, 7 days, 30 days)
    const now = new Date();
    const last24h = users.filter(
      (u) =>
        u.profileLastEditedAt &&
        new Date(u.profileLastEditedAt).getTime() >=
          now.getTime() - 24 * 60 * 60 * 1000
    ).length;
    const last7d = users.filter(
      (u) =>
        u.profileLastEditedAt &&
        new Date(u.profileLastEditedAt).getTime() >=
          now.getTime() - 7 * 24 * 60 * 60 * 1000
    ).length;
    const last30d = users.filter(
      (u) =>
        u.profileLastEditedAt &&
        new Date(u.profileLastEditedAt).getTime() >=
          now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).length;

    // Get users with most edits
    const topEditors = users
      .filter((u) => u.profileEditCount && u.profileEditCount > 0)
      .sort((a, b) => (b.profileEditCount || 0) - (a.profileEditCount || 0))
      .slice(0, 10)
      .map((u) => ({
        id: u._id.toString(),
        name: `${u.firstname || ''} ${u.lastname || ''}`.trim(),
        email: u.email,
        editCount: u.profileEditCount || 0,
        lastEditedAt: u.profileLastEditedAt || null,
      }));

    return {
      totalUsers,
      usersWithEdits,
      usersWithoutEdits,
      editRate: totalUsers > 0 ? (usersWithEdits / totalUsers) * 100 : 0,
      totalEdits,
      averageEdits: Math.round(averageEdits * 100) / 100,
      recentEdits: {
        last24Hours: last24h,
        last7Days: last7d,
        last30Days: last30d,
      },
      topEditors,
    };
  } catch (error) {
    logger.error('Error getting profile edit statistics:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to get profile edit statistics'
    );
  }
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
  buildUserResponse,
  getProfileUpdateLeaderboard,
  getProfileEditStatistics,
};
