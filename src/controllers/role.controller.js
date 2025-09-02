const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { roleService } = require('../services');

//Controller to create Roles
const createRole = catchAsync(async (req, res) => {
  const role = await roleService.createRole(req.body, req.user);
  res.status(httpStatus.CREATED).send(role);
});


//Controller to create bulk roles
const bulkCreateRoles = catchAsync(async (req, res) => {
  const roles = await roleService.bulkCreateRoles(req.body.rolesArray, req.user);
  res.status(httpStatus.CREATED).json({
    message: `${roles.length} roles successfully created.`,
    data: roles,
  });
});


// Controller: deleteAllRoles
const deleteAllRoles = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;
  const result = await roleService.deleteAllRoles(tenantId);
  res.status(httpStatus.OK).json({
    message: result.message,
    deletedCount: result.deletedCount
  });
});


//controller to get Roles
const getRoles = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'isActive']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.user = req.user; // Add the user object to options
  const result = await roleService.queryRoles(filter, options);
  res.send(result);
});


//Controller to get a particular roles
const getRole = catchAsync(async (req, res) => {
  const role = await roleService.getRoleById(req.params.roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  res.send(role);
});

const updateRole = catchAsync(async (req, res) => {
  const updated = await roleService.updateRoleById(req.params.roleId, req.body);
  res.send(updated);
});


const deleteRole = catchAsync(async (req, res) => {
  await roleService.deleteRoleById(req.params.roleId);
  res.status(httpStatus.NO_CONTENT).send();
});



const assignPermissions = catchAsync(async (req, res) => {
  const updatedRole = await roleService.assignPermissions(req.params.roleId, req.body.permissionIds);
  res.send(updatedRole);
});

const getRoleTemplates = catchAsync(async (req, res) => {
  const templates = await roleService.getRoleTemplatesByIndustry();
  res.status(200).json({ industryTemplates: templates });
});


const getPermissionsForRole = catchAsync(async (req, res) => {
  const roleId = req.params.roleId;
  const permissions = await roleService.getPermissionsForRole(roleId);
  res.send({ roleId, permissions });
});

// controllers/roleController.ts

const removePermissionsFromRole = catchAsync(async (req, res) => {
  const { roleId } = req.params;
  const { permissions } = req.body;
  // Ensure the permissions are valid and remove from the role
  const updatedRole = await roleService.removePermissionsFromRole(roleId, permissions);
  res.status(httpStatus.OK).send({
    message: 'Permissions removed successfully',
    role: updatedRole,
  });
});


module.exports = {
  createRole,
  getRoles,
  getRole,
  updateRole,
  deleteRole,
  bulkCreateRoles,
  deleteAllRoles,
  assignPermissions,
  getRoleTemplates,
  getPermissionsForRole,
  removePermissionsFromRole,
};
