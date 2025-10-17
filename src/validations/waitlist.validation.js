const Joi = require('joi');

const createWaitlistEntry = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    name: Joi.string().required().trim().min(2).max(100),
    industry: Joi.string()
      .required()
      .valid(
        'Fintech',
        'Energy',
        'Non-Profit',
        'Education',
        'Healthcare',
        'Technology',
        'Manufacturing',
        'Retail',
        'Real Estate',
        'Other'
      ),
    designation: Joi.string()
      .required()
      .valid(
        'Tech Entrepreneur',
        'CEO / Founder',
        'CTO',
        'CIO',
        'VP of Engineering',
        'VP of Product',
        'Head of Data',
        'Product Manager',
        'Engineering Manager',
        'Data Scientist',
        'Software Engineer',
        'Business Analyst',
        'Consultant',
        'Investor',
        'Other'
      ),
    needsDemo: Joi.boolean().default(false),
    userType: Joi.string()
      .valid('developer', 'investor', 'organization')
      .default('organization'),
    referralSource: Joi.string().allow('').default(''),
    metadata: Joi.object().default({}),
  }),
};

const getWaitlistEntries = {
  query: Joi.object().keys({
    userType: Joi.string().valid('developer', 'investor', 'organization'),
    status: Joi.string().valid('pending', 'invited', 'converted'),
    industry: Joi.string().valid(
      'Fintech',
      'Energy',
      'Non-Profit',
      'Education',
      'Healthcare',
      'Technology',
      'Manufacturing',
      'Retail',
      'Real Estate',
      'Other'
    ),
    designation: Joi.string().valid(
      'Tech Entrepreneur',
      'CEO / Founder',
      'CTO',
      'CIO',
      'VP of Engineering',
      'VP of Product',
      'Head of Data',
      'Product Manager',
      'Engineering Manager',
      'Data Scientist',
      'Software Engineer',
      'Business Analyst',
      'Consultant',
      'Investor',
      'Other'
    ),
    needsDemo: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    filter: Joi.string(),
  }),
};

const updateWaitlistStatus = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().required().valid('pending', 'invited', 'converted'),
  }),
};

const deleteWaitlistEntry = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
};

const exportWaitlist = {
  query: Joi.object().keys({
    format: Joi.string().valid('json', 'csv').default('json'),
    filter: Joi.string(),
  }),
};

module.exports = {
  createWaitlistEntry,
  getWaitlistEntries,
  updateWaitlistStatus,
  deleteWaitlistEntry,
  exportWaitlist,
};
