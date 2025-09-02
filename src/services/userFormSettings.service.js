const httpStatus = require('http-status');
const { UserFormSettings, User } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create user form settings
 * @param {Object} settingsBody
 * @returns {Promise<UserFormSettings>}
 */
const createUserFormSettings = async (settingsBody) => {
  // Check if settings already exist for this user
  const existingSettings = await UserFormSettings.findOne({ user: settingsBody.user });
  if (existingSettings) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Form settings already exist for this user');
  }

  // Verify user exists
  const user = await User.findById(settingsBody.user);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  return UserFormSettings.create(settingsBody);
};

/**
 * Query for user form settings
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUserFormSettings = async (filter, options) => {
  const settings = await UserFormSettings.paginate(filter, options);
  return settings;
};

/**
 * Get user form settings by id
 * @param {ObjectId} id
 * @returns {Promise<UserFormSettings>}
 */
const getUserFormSettingsById = async (id) => {
  return UserFormSettings.findById(id).populate('user');
};

/**
 * Get user form settings by user id
 * @param {ObjectId} userId
 * @returns {Promise<UserFormSettings>}
 */
const getUserFormSettingsByUserId = async (userId) => {
  return UserFormSettings.findOne({ user: userId }).populate('user');
};

/**
 * Update user form settings by id
 * @param {ObjectId} settingsId
 * @param {Object} updateBody
 * @returns {Promise<UserFormSettings>}
 */
const updateUserFormSettingsById = async (settingsId, updateBody) => {
  const settings = await getUserFormSettingsById(settingsId);
  if (!settings) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User form settings not found');
  }

  Object.assign(settings, updateBody);
  await settings.save();
  return settings;
};

/**
 * Update user form settings by user id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<UserFormSettings>}
 */
const updateUserFormSettingsByUserId = async (userId, updateBody) => {
  const settings = await getUserFormSettingsByUserId(userId);
  if (!settings) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User form settings not found');
  }

  Object.assign(settings, updateBody);
  await settings.save();
  return settings;
};

/**
 * Delete user form settings by id
 * @param {ObjectId} settingsId
 * @returns {Promise<UserFormSettings>}
 */
const deleteUserFormSettingsById = async (settingsId) => {
  const settings = await getUserFormSettingsById(settingsId);
  if (!settings) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User form settings not found');
  }
  await settings.remove();
  return settings;
};

/**
 * Delete user form settings by user id
 * @param {ObjectId} userId
 * @returns {Promise<UserFormSettings>}
 */
const deleteUserFormSettingsByUserId = async (userId) => {
  const settings = await getUserFormSettingsByUserId(userId);
  if (!settings) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User form settings not found');
  }
  await settings.remove();
  return settings;
};

/**
 * Create or update user form settings
 * @param {ObjectId} userId
 * @param {Object} settingsBody
 * @returns {Promise<UserFormSettings>}
 */
const upsertUserFormSettings = async (userId, settingsBody) => {
  // Verify user exists
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const existingSettings = await getUserFormSettingsByUserId(userId);

  if (existingSettings) {
    // Update existing settings
    Object.assign(existingSettings, settingsBody);
    await existingSettings.save();
    return existingSettings;
  } else {
    // Create new settings
    return UserFormSettings.create({ ...settingsBody, user: userId });
  }
};

module.exports = {
  createUserFormSettings,
  queryUserFormSettings,
  getUserFormSettingsById,
  getUserFormSettingsByUserId,
  updateUserFormSettingsById,
  updateUserFormSettingsByUserId,
  deleteUserFormSettingsById,
  deleteUserFormSettingsByUserId,
  upsertUserFormSettings,
};
