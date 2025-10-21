const httpStatus = require('http-status');
const { UserProfile } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Get user profile by userId
 * @param {string} userId - User ID
 * @returns {Promise<UserProfile>}
 */
const getUserProfileByUserId = async (userId) =>
  UserProfile.findOne({ user: userId }).populate('user');


/**
 * Upsert user profile (create or update)
 * @param {string} userId - User ID
 * @param {Object} profileData - Profile data
 * @returns {Promise<UserProfile>}
 */

const upsertUserProfile = async (userId, profileData) => {
  const profile = await UserProfile.findOneAndUpdate(
    { user: userId },
    { ...profileData, user: userId },
    { new: true, upsert: true, runValidators: true }
  );
  return profile;
};


/**
 * Delete user profile
 * @param {string} userId - User ID
 * @returns {Promise<UserProfile>}
 */
const deleteUserProfile = async (userId) => {
  const profile = await UserProfile.findOneAndDelete({ user: userId });
  if (!profile) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Profile not found');
  }
  return profile;
};


module.exports = {
  getUserProfileByUserId,
  upsertUserProfile,
  deleteUserProfile,
};
