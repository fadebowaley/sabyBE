const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { nodeProfileService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Get node profile by node ID
 */
const getProfileByNode = catchAsync(async (req, res) => {
  console.log(
    '[NODE PROFILE CONTROLLER - GET BY NODE] Node ID:',
    req.params.nodeId,
    'Tenant:',
    req.user.tenantId
  );

  const profile = await nodeProfileService.getProfileByNodeId(
    req.params.nodeId
  );

  if (!profile) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Node profile not found');
  }

  // SECURITY: Verify profile belongs to user's tenant
  if (profile.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - profile belongs to different tenant'
    );
  }

  res.send(profile);
});

/**
 * Create node profile
 */
const createProfile = catchAsync(async (req, res) => {
  console.log(
    '[NODE PROFILE CONTROLLER - CREATE] Creating profile for tenant:',
    req.user.tenantId
  );

  // SECURITY: Add tenantId from authenticated user
  req.body.tenantId = req.user.tenantId;

  const profile = await nodeProfileService.createProfile(req.body);
  res.status(httpStatus.CREATED).send(profile);
});

/**
 * Update node profile
 */
const updateProfile = catchAsync(async (req, res) => {
  console.log(
    '[NODE PROFILE CONTROLLER - UPDATE] Profile ID:',
    req.params.profileId,
    'Tenant:',
    req.user.tenantId
  );

  const profile = await nodeProfileService.getProfileById(req.params.profileId);

  // SECURITY: Verify profile belongs to user's tenant
  if (profile.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - profile belongs to different tenant'
    );
  }

  // SECURITY: Ensure tenantId cannot be changed
  req.body.tenantId = req.user.tenantId;

  const updatedProfile = await nodeProfileService.updateProfileById(
    req.params.profileId,
    req.body
  );
  res.send(updatedProfile);
});

/**
 * Delete node profile
 */
const deleteProfile = catchAsync(async (req, res) => {
  console.log(
    '[NODE PROFILE CONTROLLER - DELETE] Profile ID:',
    req.params.profileId,
    'Tenant:',
    req.user.tenantId
  );

  const profile = await nodeProfileService.getProfileById(req.params.profileId);

  // SECURITY: Verify profile belongs to user's tenant
  if (profile.tenantId !== req.user.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied - profile belongs to different tenant'
    );
  }

  await nodeProfileService.deleteProfileById(req.params.profileId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Create or update node profile
 * If profile exists for node, update it. Otherwise, create it.
 */
const upsertProfile = catchAsync(async (req, res) => {
  console.log(
    '[NODE PROFILE CONTROLLER - UPSERT] Node ID:',
    req.body.church,
    'Tenant:',
    req.user.tenantId
  );

  // SECURITY: Add tenantId from authenticated user
  req.body.tenantId = req.user.tenantId;

  const profile = await nodeProfileService.upsertProfile(
    req.body.church,
    req.body
  );

  res.send(profile);
});

module.exports = {
  getProfileByNode,
  createProfile,
  updateProfile,
  deleteProfile,
  upsertProfile,
};

