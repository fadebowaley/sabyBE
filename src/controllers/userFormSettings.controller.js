const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userFormSettingsService } = require('../services');

const createUserFormSettings = catchAsync(async (req, res) => {
  const settings = await userFormSettingsService.createUserFormSettings(
    req.body
  );
  res.status(httpStatus.CREATED).send(settings);
});

const getUserFormSettings = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['user', 'tenantId']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'user';

  const result = await userFormSettingsService.queryUserFormSettings(
    filter,
    options
  );
  res.send(result);
});

const getUserFormSettingsById = catchAsync(async (req, res) => {
  const settings = await userFormSettingsService.getUserFormSettingsById(
    req.params.settingsId
  );
  if (!settings) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User form settings not found');
  }
  res.send(settings);
});

const getUserFormSettingsByUserId = catchAsync(async (req, res) => {
  const settings = await userFormSettingsService.getUserFormSettingsByUserId(
    req.params.userId
  );
  if (!settings) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User form settings not found');
  }
  res.send(settings);
});

const updateUserFormSettings = catchAsync(async (req, res) => {
  const settings = await userFormSettingsService.updateUserFormSettingsById(
    req.params.settingsId,
    req.body
  );
  res.send(settings);
});

const updateUserFormSettingsByUserId = catchAsync(async (req, res) => {
  const settings = await userFormSettingsService.updateUserFormSettingsByUserId(
    req.params.userId,
    req.body
  );
  res.send(settings);
});

const deleteUserFormSettings = catchAsync(async (req, res) => {
  await userFormSettingsService.deleteUserFormSettingsById(
    req.params.settingsId
  );
  res.status(httpStatus.NO_CONTENT).send();
});

const deleteUserFormSettingsByUserId = catchAsync(async (req, res) => {
  await userFormSettingsService.deleteUserFormSettingsByUserId(
    req.params.userId
  );
  res.status(httpStatus.NO_CONTENT).send();
});

const upsertUserFormSettings = catchAsync(async (req, res) => {
  const settings = await userFormSettingsService.upsertUserFormSettings(
    req.params.userId,
    req.body
  );
  res.send(settings);
});

module.exports = {
  createUserFormSettings,
  getUserFormSettings,
  getUserFormSettingsById,
  getUserFormSettingsByUserId,
  updateUserFormSettings,
  updateUserFormSettingsByUserId,
  deleteUserFormSettings,
  deleteUserFormSettingsByUserId,
  upsertUserFormSettings,
};
