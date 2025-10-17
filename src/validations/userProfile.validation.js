const Joi = require('joi');

const upsertUserProfile = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    title: Joi.string(),
    otherName: Joi.string().allow(''),
    phoneNumber: Joi.string(),
    gender: Joi.string().valid('Male', 'Female', 'Other'),
    dateOfBirth: Joi.date(),
    highestQualification: Joi.string(),
    professional: Joi.string(),
    maritalStatus: Joi.string().valid(
      'Single',
      'Married',
      'Divorced',
      'Widowed'
    ),
    stateOfOrigin: Joi.string(),
    lgaOfOrigin: Joi.string(),
    homeTown: Joi.string(),
    spouseName: Joi.string().allow(''),
    spousePhoneNumber: Joi.string().allow(''),
    spouseDateOfBirth: Joi.date().allow(null),
    nextOfKinName: Joi.string(),
    nextOfKinPhoneNumber: Joi.string(),
    nextOfKinRelationship: Joi.string(),
    residentialAddress: Joi.string(),
    stateOfResidence: Joi.string(),
    lgaOfResidence: Joi.string(),
    employmentCategory: Joi.string(),
    occupation: Joi.string(),
    employeeId: Joi.string().allow(''),
  }),
};

const getUserProfile = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
};

const deleteUserProfile = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
};

module.exports = {
  upsertUserProfile,
  getUserProfile,
  deleteUserProfile,
};
