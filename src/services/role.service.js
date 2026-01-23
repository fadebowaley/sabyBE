const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { Role, Permission } = require('../models');
const ApiError = require('../utils/ApiError');
const roleTemplates = require('../utils/role');

/**
 * Create a new role
 * @param {Object} JSON
 * @returns {Promise<Role>}
 */

const getRoleTemplatesByIndustry = async () => {
  try {
    return roleTemplates;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Error creating roles'
    );
  }
};

/**
 * Create a new role
 * @param {Object} roleBody
 * @returns {Promise<Role>}
 */

const createRole = async (roleBody, user) => {
  if (!user?.isOwner && !user?.hasPermissionToCreateRoles) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You are not authorized to create roles'
    );
  }
  // Ensure role name is unique per tenant
  const existing = await Role.findOne({
    name: roleBody.name,
    tenantId: user.tenantId,
  });
  if (existing) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Role name already exists for this tenant'
    );
  }
  console.log('looking up data', user);
  return Role.createRole(roleBody, user);
};

/**
 * Bulk create roles
 * @param {Array<Object>} rolesArray
 * @param {Object} user
 * @returns {Promise<Array<Role>>}
 ***{
  "rolesArray": [
    {
      "name": "Admin",
      "description": "Administrator with full permissions"
    },
    {
      "name": "Editor",
      "description": "Can edit content"
    },
    {
      "name": "Viewer",
      "description": "Can view content"
    }
  ]
}

 */

const bulkCreateRoles = async (rolesArray, user) => {
  try {
    return await Role.bulkCreateRoles(rolesArray, user);
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Error creating roles'
    );
  }
};

/**
 * Query roles with filters and pagination
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */

// const queryRoles = async (filter, options) => {
//   const roles = await Role.paginate(filter, options);
//   return roles;
// };

// const queryRoles = async (filter, options) => {
//   // Aggregation pipeline to count users for each role
//   const roles = await Role.aggregate([
//     {
//       $match: filter, // Match the provided filter
//     },
//     {
//       $lookup: {
//         from: 'users', // The collection name for the User model
//         localField: '_id', // Link Role's _id to User's roles
//         foreignField: 'roles', // The field in User that stores role IDs
//         as: 'users', // Alias for users linked to the role
//       },
//     },
//     {
//       $addFields: {
//         userCount: { $size: '$users' }, // Add a new field with the user count
//       },
//     },
//     {
//       $project: {
//         name: 1, // Include role name
//         userCount: 1, // Include the user count
//         description: 1, // Optionally include role description
//       },
//     },
//     {
//       $sort: {
//         [options.sortBy || 'createdAt']: options.sortBy ? (options.sortBy.includes('desc') ? -1 : 1) : 1, // Sorting logic
//       },
//     },
//     {
//       $skip: (options.page - 1) * options.limit, // Implement pagination skip
//     },
//     {
//       $limit: options.limit, // Implement pagination limit
//     },
//   ]);

//   // Counting the total number of documents
//   const totalResults = await Role.countDocuments(filter);

//   // Calculating total pages
//   const totalPages = Math.ceil(totalResults / options.limit);

//   return {
//     results: roles,
//     page: options.page,
//     limit: options.limit,
//     totalPages,
//     totalResults,
//   };
// };

const queryRoles = async (filter, options) => {
  // Validate and parse page and limit
  const limit =
    options.limit && !isNaN(options.limit) && parseInt(options.limit, 40) > 0
      ? parseInt(options.limit, 40)
      : 40;
  const page =
    options.page && !isNaN(options.page) && parseInt(options.page, 40) > 0
      ? parseInt(options.page, 40)
      : 1;
  const skip = (page - 1) * limit;

  // Apply tenant filtering based on user hierarchy
  const { user } = options;
  if (user?.isSaby) {
    // SabyUser can see all roles across all tenants
    console.log('[queryRoles] SabyUser - showing all roles across all tenants');
    // No additional filtering needed - remove tenant restriction
    delete filter.tenantId;
  } else if (user?.isSuper || user?.isOwner || user?.isAdmin) {
    // SuperUser, Owner, and Admin can only see roles within their tenant
    // Note: requireAccess middleware already validated role:read permission for isAdmin users
    if (user.tenantId) {
      filter.tenantId = user.tenantId;
      let userType = 'Admin';
      if (user.isSuper) {
        userType = 'SuperUser';
      } else if (user.isOwner) {
        userType = 'Owner';
      }
      console.log(
        `[queryRoles] ${userType} - filtering by tenantId: ${user.tenantId}`
      );
    }
  } else {
    // Ordinary users should not have access to role listing
    throw new Error('Insufficient privileges to view role list');
  }

  // Aggregation pipeline to count users for each role
  const roles = await Role.aggregate([
    {
      $match: filter, // Match the provided filter (now includes tenant filtering)
    },
    {
      $lookup: {
        from: 'users', // The collection name for the User model
        localField: '_id', // Link Role's _id to User's roles
        foreignField: 'roles', // The field in User that stores role IDs
        as: 'users', // Alias for users linked to the role
      },
    },
    {
      $addFields: {
        userCount: { $size: '$users' }, // Add a new field with the user count
      },
    },
    {
      $project: {
        name: 1, // Include role name
        userCount: 1, // Include the user count
        description: 1, // Optionally include role description
      },
    },
    {
      $sort: {
        [options.sortBy || 'createdAt']: options.sortBy
          ? options.sortBy.includes('desc')
            ? -1
            : 1
          : 1, // Sorting logic
      },
    },
    {
      $skip: skip, // Implement pagination skip with validated skip value
    },
    {
      $limit: limit, // Implement pagination limit with validated limit value
    },
  ]);

  // Counting the total number of documents (with tenant filtering)
  const totalResults = await Role.countDocuments(filter);

  // Calculating total pages
  const totalPages = Math.ceil(totalResults / limit);

  return {
    results: roles,
    page,
    limit,
    totalPages,
    totalResults,
  };
};

/**
 * Get a role by its ID
 * @param {ObjectId} id
 * @param {Object} user - Current user for tenant filtering
 * @returns {Promise<Role>}
 */

const getRoleById = async (id, user = null) => {
  const query = { _id: id };

  // Apply tenant filtering if user is provided
  if (user && !user.isSaby) {
    if (user.tenantId) {
      query.tenantId = user.tenantId;
    }
  }

  return Role.findOne(query);
};

/**
 * Update a role by its ID
 * @param {ObjectId} roleId
 * @param {Object} updateBody
 * @param {Object} user - Current user for tenant filtering
 * @returns {Promise<Role>}
 */

const updateRoleById = async (roleId, updateBody, user = null) => {
  const role = await getRoleById(roleId, user);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  Object.assign(role, updateBody);
  await role.save();
  return role;
};

/**
 * Delete a role by its ID
 * @param {ObjectId} roleId
 * @param {Object} user - Current user for tenant filtering
 * @returns {Promise<Role>}
 */

const deleteRoleById = async (roleId, user = null) => {
  const role = await getRoleById(roleId, user);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  console.log('Deleting this roles:', role);

  await role.remove();
  return role;
};

/**
 * Delete all roles for a specific tenant
 * @param {string} tenantId
 * @returns {Promise<void>}
 */

// Service: deleteAllRoles
const deleteAllRoles = async (tenantId) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required');
  }
  try {
    // Perform the deletion
    const result = await Role.deleteMany({ tenantId });
    // If no roles were deleted, throw a not found error
    if (result.deletedCount === 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'No roles found for this tenant'
      );
    }
    // Return the result with the number of deleted roles
    return {
      message: `${result.deletedCount} roles successfully deleted.`,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Error deleting roles',
      error
    );
  }
};

const getPermissionsForRole = async (roleId) => {
  const role = await Role.findById(roleId).populate('permissions');
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  return role.permissions;
};

/**
 * Assign permissions to a role
 * @param {ObjectId} roleId
 * @param {Array<string>} permissions
 * @returns {Promise<Role>}
 */

const assignPermissions = async (roleId, inputPermissions) => {
  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }

  // Normalize input to array
  const incoming = Array.isArray(inputPermissions)
    ? inputPermissions
    : [inputPermissions];

  // Ensure all are valid ObjectIds
  const validObjectIds = incoming.filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (validObjectIds.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No valid permission IDs provided'
    );
  }
  // Get valid permission IDs from DB
  const validPermissions = await Permission.find(
    { _id: { $in: validObjectIds } },
    '_id'
  );
  const validIds = validPermissions.map((p) => p._id.toString());
  // Merge with existing, remove duplicates
  const current = role.permissions.map((p) => p.toString());
  const merged = Array.from(new Set([...current, ...validIds]));
  // Only update if there are new additions
  if (merged.length !== current.length) {
    role.permissions = merged;
    await role.save();
  }

  return role;
};

// services/roleService.ts
const removePermissionsFromRole = async (roleId, inputPermissions) => {
  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }

  // Normalize input to array (whether it's a single permission or an array of permissions)
  const permissionsToRemove = Array.isArray(inputPermissions)
    ? inputPermissions
    : [inputPermissions];

  // Ensure all permissions are valid ObjectIds
  const validObjectIds = permissionsToRemove.filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );

  if (validObjectIds.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No valid permission IDs provided'
    );
  }

  // Get the current permissions of the role
  const currentPermissions = role.permissions.map((p) => p.toString());

  // Filter out the permissions to remove
  const updatedPermissions = currentPermissions.filter(
    (perm) => !validObjectIds.includes(perm)
  );

  // Only update if the permissions list has changed
  if (updatedPermissions.length !== currentPermissions.length) {
    role.permissions = updatedPermissions;
    await role.save();
  }

  return role;
};

module.exports = {
  createRole,
  queryRoles,
  getRoleById,
  updateRoleById,
  deleteRoleById,
  assignPermissions,
  bulkCreateRoles,
  deleteAllRoles,
  getRoleTemplatesByIndustry,
  getPermissionsForRole,
  removePermissionsFromRole,
};
