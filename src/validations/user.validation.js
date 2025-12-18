const Joi = require('joi');
const { password, objectId } = require('./custom.validation');

const createUser = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    role: Joi.string().required().valid('user', 'admin'),
  }),
};

const ownerCreate = {
  body: Joi.object().keys({
    firstname: Joi.string().required(),
    lastname: Joi.string().required(),
    roles: Joi.array()
      .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
      .default([]),
    email: Joi.string().required().email(),
    phoneNumber: Joi.string().required(),
    password: Joi.string().required().custom(password),
    isOwner: Joi.boolean().valid(false).default(false),
    isAdmin: Joi.boolean().valid(false).default(false),
    isSuper: Joi.boolean().valid(false).default(false),
    isSaby: Joi.boolean().valid(false).default(false),
    status: Joi.boolean().default(false),
  }),
};

const sabyUserCreate = {
  body: Joi.object().keys({
    firstname: Joi.string().required(),
    lastname: Joi.string().required(),
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    roles: Joi.array()
      .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
      .default([]),
  }),
};

const bulkCreate = {
  body: Joi.array()
    .items(
      Joi.object({
        firstname: Joi.string().required(),
        lastname: Joi.string().required(),
        email: Joi.string().required().email(),
        password: Joi.string().required().custom(password),
        phoneNumber: Joi.string()
          .pattern(/^[+]?[1-9][\d]{0,15}$/)
          .allow('', null)
          .optional(),
        roles: Joi.alternatives()
          .try(
            Joi.array().items(
              Joi.alternatives().try(
                Joi.string().regex(/^[0-9a-fA-F]{24}$/), // ObjectId
                Joi.string() // Role name
              )
            ),
            Joi.string().allow('') // Comma-separated role names or single role name
          )
          .optional()
          .allow(null, ''),
        isOwner: Joi.boolean().valid(false).default(false),
        isSuper: Joi.boolean().valid(false).default(false),
        isSaby: Joi.boolean().valid(false).default(false),
        isAdmin: Joi.boolean().valid(false).default(false),
        status: Joi.alternatives()
          .try(
            Joi.boolean(),
            Joi.string().valid('true', 'false', 'Active', 'Inactive', '')
          )
          .optional()
          .allow(null, '')
          .default(false),
        isEmailVerified: Joi.alternatives()
          .try(Joi.boolean(), Joi.string().valid('true', 'false', ''))
          .optional()
          .allow(null, ''),
        isPhoneVerified: Joi.alternatives()
          .try(Joi.boolean(), Joi.string().valid('true', 'false', ''))
          .optional()
          .allow(null, ''),
      }).unknown(false) // Don't allow unknown fields
    )
    .required(),
};

const bulkDelete = {
  body: Joi.object().keys({
    tenantId: Joi.string().required(), // Ensure tenantId is required
  }),
};

const getUsers = {
  query: Joi.object().keys({
    firstname: Joi.string(),
    lastname: Joi.string(),
    role: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    email: Joi.string().email(),
    userId: Joi.string(),
    status: Joi.string().allow(''),
    roles: Joi.string().allow(''),
    search: Joi.string().allow(''),
    q: Joi.string().allow(''),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      // User table fields
      email: Joi.string().email(),
      password: Joi.string().custom(password),
      firstname: Joi.string(),
      lastname: Joi.string(),
      phoneNumber: Joi.string()
        .pattern(/^[+]?[1-9][\d]{0,15}$/)
        .allow(''),
      isSuper: Joi.boolean(),
      isOwner: Joi.boolean(),
      isSaby: Joi.boolean(),
      isAdmin: Joi.boolean(),
      isActive: Joi.boolean(),
      isEmailVerified: Joi.boolean(),
      roles: Joi.array(),
      // UserProfile table fields (auto-routed to profile)
      title: Joi.string(),
      otherName: Joi.string(),
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
      nextOfKinName: Joi.string().allow(''),
      nextOfKinPhoneNumber: Joi.string().allow(''),
      nextOfKinRelationship: Joi.string().allow(''),
      residentialAddress: Joi.string(),
      stateOfResidence: Joi.string(),
      lgaOfResidence: Joi.string(),
      employmentCategory: Joi.string(),
      occupation: Joi.string(),
      employeeId: Joi.string(),
      officeTitle: Joi.string(),

      // ✨ NEW: Support nested profile object structure
      profile: Joi.object().keys({
        title: Joi.string(),
        otherName: Joi.string().allow(''),
        gender: Joi.string().valid('Male', 'Female', 'Other'),
        dateOfBirth: Joi.date(),
        highestQualification: Joi.string(),
        professional: Joi.string(),
        employmentCategory: Joi.string(),
        occupation: Joi.string(),
        employeeId: Joi.string().allow(''),
        officeTitle: Joi.string().allow(''),
        maritalStatus: Joi.string().valid(
          'Single',
          'Married',
          'Divorced',
          'Widowed'
        ),
        // Support both nested and flat structures for spouse
        spouse: Joi.object().keys({
          name: Joi.string().allow(''),
          phoneNumber: Joi.string().allow(''),
          dateOfBirth: Joi.date().allow(null),
        }),
        spouseName: Joi.string().allow(''),
        spousePhoneNumber: Joi.string().allow(''),
        spouseDateOfBirth: Joi.date().allow(null),
        // Support both nested and flat structures for nextOfKin
        nextOfKin: Joi.object().keys({
          name: Joi.string(),
          phoneNumber: Joi.string(),
          relationship: Joi.string(),
        }),
        nextOfKinName: Joi.string().allow(''),
        nextOfKinPhoneNumber: Joi.string().allow(''),
        nextOfKinRelationship: Joi.string().allow(''),
        // Allow phoneNumber in profile object (for profile-specific phone)
        phoneNumber: Joi.string()
          .pattern(/^[+]?[1-9][\d]{0,15}$/)
          .allow(''),
        stateOfOrigin: Joi.string(),
        lgaOfOrigin: Joi.string(),
        homeTown: Joi.string(),
        residentialAddress: Joi.string(),
        stateOfResidence: Joi.string(),
        lgaOfResidence: Joi.string(),
      }),
      customFields: Joi.object(),
    })
    .min(1),
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
};

const restoreUsers = {
  body: Joi.object().keys({
    tenantId: Joi.string().required().trim(),
  }),
};

const restoreUser = {
  params: Joi.object().keys({
    userId: Joi.string().required().trim(),
  }),
};

const softDeleteUser = {
  params: Joi.object().keys({
    userId: Joi.string().required().trim(),
  }),
};

const assignRoles = {
  params: Joi.object().keys({
    id: Joi.string().required().custom(objectId),
  }),
  body: Joi.object().keys({
    roles: Joi.alternatives()
      .try(
        Joi.string().custom(objectId),
        Joi.array().items(Joi.string().custom(objectId)).min(1)
      )
      .required(),
  }),
};

const updateProfileCompliance = {
  params: Joi.object().keys({
    userId: Joi.string().required().custom(objectId),
  }),
  body: Joi.object().keys({
    profileUpdateCompliant: Joi.boolean().required(),
  }),
};

const changeEmail = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    // OTP is verified before reaching this endpoint, so it's not required here
  }),
};

const changePhone = {
  body: Joi.object().keys({
    phone: Joi.string().required(),
    // OTP is verified before reaching this endpoint, so it's not required here
  }),
};

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  ownerCreate,
  sabyUserCreate,
  bulkCreate,
  bulkDelete,
  restoreUser,
  restoreUsers,
  softDeleteUser,
  assignRoles,
  updateProfileCompliance,
  changeEmail,
  changePhone,
};
