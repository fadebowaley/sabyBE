const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { userProfileService } = require('../services');

/**
 * Get user profile by userId
 */
const getUserProfile = catchAsync(async (req, res) => {
  const profile = await userProfileService.getUserProfileByUserId(
    req.params.userId
  );
  if (!profile) {
    // Return empty profile structure
    return res.send({ user: req.params.userId, profile: null });
  }
  res.send(profile);
});

/**
 * Create or update user profile
 */
const upsertUserProfile = catchAsync(async (req, res) => {
  const profile = await userProfileService.upsertUserProfile(
    req.params.userId,
    req.body
  );
  res.send(profile);
});

/**
 * Delete user profile
 */
const deleteUserProfile = catchAsync(async (req, res) => {
  await userProfileService.deleteUserProfile(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getUserProfile,
  upsertUserProfile,
  deleteUserProfile,
};
