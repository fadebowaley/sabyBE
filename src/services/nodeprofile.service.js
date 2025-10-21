const httpStatus = require('http-status');
const ChurchProfile = require('../models/nodeprofile');
const ApiError = require('../utils/ApiError');

/**
 * Create a node profile
 * @param {Object} profileBody
 * @returns {Promise<ChurchProfile>}
 */
const createProfile = async (profileBody) => {
  // Check if profile already exists for this node
  const existingProfile = await ChurchProfile.findOne({
    church: profileBody.church,
    tenantId: profileBody.tenantId,
  });

  if (existingProfile) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Profile already exists for this node'
    );
  }

  return ChurchProfile.create(profileBody);
};

/**
 * Get profile by node ID
 * @param {ObjectId} nodeId
 * @returns {Promise<ChurchProfile>}
 */
const getProfileByNodeId = async (nodeId) =>
  ChurchProfile.findOne({ church: nodeId }).populate('church');

/**
 * Get profile by ID
 * @param {ObjectId} id
 * @returns {Promise<ChurchProfile>}
 */
const getProfileById = async (id) => {
  const profile = await ChurchProfile.findById(id).populate('church');
  if (!profile) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Profile not found');
  }
  return profile;
};

/**
 * Update profile by id
 * @param {ObjectId} profileId
 * @param {Object} updateBody
 * @returns {Promise<ChurchProfile>}
 */
const updateProfileById = async (profileId, updateBody) => {
  const profile = await getProfileById(profileId);

  // Define allowed fields for update
  const allowedFields = [
    'dateOfEstablishment',
    'propertyStatus',
    'estimatedValue',
    'buildingType',
    'status',
  ];

  // Only update allowed fields
  Object.keys(updateBody).forEach((key) => {
    if (allowedFields.includes(key)) {
      profile[key] = updateBody[key];
    }
  });

  await profile.save();
  return profile;
};

/**
 * Delete profile by id
 * @param {ObjectId} profileId
 * @returns {Promise<ChurchProfile>}
 */
const deleteProfileById = async (profileId) => {
  const profile = await getProfileById(profileId);
  await profile.remove();
  return profile;
};

/**
 * Create or update profile (upsert)
 * @param {ObjectId} nodeId
 * @param {Object} profileData
 * @returns {Promise<ChurchProfile>}
 */
const upsertProfile = async (nodeId, profileData) => {
  const existingProfile = await ChurchProfile.findOne({
    church: nodeId,
    tenantId: profileData.tenantId,
  });

  if (existingProfile) {
    // Update existing profile
    return updateProfileById(existingProfile._id, profileData);
  }
  // Create new profile
  return createProfile(profileData);
};

module.exports = {
  createProfile,
  getProfileByNodeId,
  getProfileById,
  updateProfileById,
  deleteProfileById,
  upsertProfile,
};
