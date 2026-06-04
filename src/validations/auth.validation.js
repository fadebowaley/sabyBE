const Joi = require('joi');
const { password } = require('./custom.validation');

const receivingAccountSchema = Joi.object().keys({
  id: Joi.string().allow('', null),
  label: Joi.string().allow('', null),
  accountNumber: Joi.string().allow('', null),
  bankName: Joi.string().allow('', null),
  bankCode: Joi.string().allow('', null),
  bankCategory: Joi.string().allow('', null),
  accountName: Joi.string().allow('', null),
  isPrimary: Joi.boolean(),
  isActive: Joi.boolean(),
});

const register = {
  body: Joi.object().keys({
    firstname: Joi.string().required(),
    lastname: Joi.string().required(),
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    isOwner: Joi.boolean().required(),
    isAgreed: Joi.boolean().required(),
    // isSuper: Joi.boolean().required(),
  }),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required(),
  }),
};

const phoneLoginRequestOtp = {
  body: Joi.object().keys({
    phoneNumber: Joi.string().required(),
  }),
};

const phoneLoginVerifyOtp = {
  body: Joi.object().keys({
    phoneNumber: Joi.string().required(),
    otp: Joi.string().required().pattern(/^\d{6}$/),
  }),
};

const socialLogin = {
  body: Joi.object().keys({
    provider: Joi.string().valid('google', 'apple').required(),
    email: Joi.string().email().required(),
    firstname: Joi.string().allow('', null),
    lastname: Joi.string().allow('', null),
    name: Joi.string().allow('', null),
    avatar: Joi.string().uri().allow('', null),
    emailVerified: Joi.boolean().allow(null),
  }),
};

const logout = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const refreshTokens = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
};

const resetPassword = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
  body: Joi.object().keys({
    password: Joi.string().required().custom(password),
  }),
};

const verifyEmail = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
};

const verifyOtp = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    otp: Joi.string().required(),
  }),
};

const resendOtp = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    purpose: Joi.string().valid('registration', 'password-reset').optional(),
  }),
};

const changePassword = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    newPassword: Joi.string().required().custom(password),
    otp: Joi.string().required().length(6),
  }),
};

const verifyPassword = {
  body: Joi.object().keys({
    password: Joi.string().required(),
  }),
};

const changePasswordAuthenticated = {
  body: Joi.object().keys({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().required().custom(password),
  }),
};

const requestEmailChangeOtp = {
  body: Joi.object().keys({
    currentValue: Joi.string().required().email(),
  }),
};

const requestPhoneChangeOtp = {
  body: Joi.object().keys({
    currentValue: Joi.string().required(),
  }),
};

const onboardingPhoneOtpSend = {
  body: Joi.object().keys({
    phoneNumber: Joi.string().required(),
  }),
};

const onboardingPhoneOtpVerify = {
  body: Joi.object().keys({
    phoneNumber: Joi.string().required(),
    otp: Joi.string().required().pattern(/^\d{6}$/),
  }),
};

const onboardingProfileUpsert = {
  body: Joi.object().keys({
    owner: Joi.object()
      .keys({
        phoneNumber: Joi.string().allow('', null),
        roleTitle: Joi.string().allow('', null),
      })
      .required(),
    company: Joi.object()
      .keys({
        name: Joi.string().required(),
        email: Joi.string().email().allow('', null),
        phone: Joi.string().allow('', null),
        organizationType: Joi.string().allow('', null),
        industry: Joi.string().allow('', null),
        size: Joi.string().allow('', null),
        timezone: Joi.string().allow('', null),
        country: Joi.string().allow('', null),
        state: Joi.string().allow('', null),
        city: Joi.string().allow('', null),
        address: Joi.string().allow('', null),
        receivingAccounts: Joi.array().items(receivingAccountSchema).default([]),
      })
      .required(),
    node: Joi.object()
      .keys({
        rootNodeName: Joi.string().allow('', null),
        rootLevelName: Joi.string().allow('', null),
        rootNodeAddress: Joi.string().allow('', null),
        nodeStructures: Joi.boolean()
          .truthy('yes')
          .truthy('true')
          .truthy('1')
          .falsy('no')
          .falsy('false')
          .falsy('0')
          .allow(null),
      })
      .required(),
  }),
};

const onboardingDraftUpsert = {
  body: Joi.object().keys({
    form: Joi.object()
      .keys({
        owner: Joi.object()
          .keys({
            phoneNumber: Joi.string().allow('', null),
            roleTitle: Joi.string().allow('', null),
          })
          .default({}),
        company: Joi.object()
          .keys({
            name: Joi.string().allow('', null),
            email: Joi.string().email().allow('', null),
            phone: Joi.string().allow('', null),
            organizationType: Joi.string().allow('', null),
            industry: Joi.string().allow('', null),
            size: Joi.string().allow('', null),
            timezone: Joi.string().allow('', null),
            country: Joi.string().allow('', null),
            state: Joi.string().allow('', null),
            city: Joi.string().allow('', null),
            address: Joi.string().allow('', null),
            receivingAccounts: Joi.array().items(receivingAccountSchema).default([]),
          })
          .default({}),
        node: Joi.object()
          .keys({
            rootNodeName: Joi.string().allow('', null),
            rootLevelName: Joi.string().allow('', null),
            rootNodeAddress: Joi.string().allow('', null),
            nodeStructures: Joi.boolean()
              .truthy('yes')
              .truthy('true')
              .truthy('1')
              .falsy('no')
              .falsy('false')
              .falsy('0')
              .allow(null),
          })
          .default({}),
      })
      .required(),
    currentIndex: Joi.number().integer().min(0).default(0),
    phase: Joi.string().valid('question', 'review', 'submitting', 'completed').default('question'),
    skipped: Joi.object().pattern(Joi.string(), Joi.boolean()).default({}),
  }),
};

const onboardingReceivingAccountsUpdate = {
  body: Joi.object().keys({
    receivingAccounts: Joi.array().items(receivingAccountSchema).default([]),
  }),
};

module.exports = {
  register,
  login,
  phoneLoginRequestOtp,
  phoneLoginVerifyOtp,
  socialLogin,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  verifyEmail,
  verifyOtp,
  resendOtp,
  changePassword,
  verifyPassword,
  changePasswordAuthenticated,
  requestEmailChangeOtp,
  requestPhoneChangeOtp,
  onboardingPhoneOtpSend,
  onboardingPhoneOtpVerify,
  onboardingProfileUpsert,
  onboardingDraftUpsert,
  onboardingReceivingAccountsUpdate,
};
