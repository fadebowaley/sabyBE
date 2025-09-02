// scripts/seedUserFormSettings.js
const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');
const User = require('../models/user.model');
const Role = require('../models/role.model'); // Adjust the path to your Role schema
const UserFormSettings = require('../models/userFormSettings.model');

const connectToDB = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB for seeding user form settings.');
  } catch (err) {
    logger.error('❌ Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

const defaultFormSettings = {
  access: {
    type: 'role-based',
    requiresLogin: true,
    allowedRoles: ['owner', 'admin'],
    submissionLimit: 50,
    allowMultipleSubmissions: true,
    allowAnonymous: false,
  },
  behavior: {
    autosave: true,
    saveDraft: false,
    allowResubmission: true,
    showProgressBar: true,
    timeoutInMinutes: 10,
    redirectAfterSubmit: '',
    customSuccessMessage: 'Thank you for your submission!',
  },
  distribution: {
    enablePublicUrl: true,
    enablePrivateUrl: true,
    enableHtmlEmbed: false,
    enableApiSubmission: true,
    enableJsEmbed: false,
    customDomain: '',
  },
  notifications: {
    onSubmit: {
      sendToUser: true,
      sendToOwner: true,
      emailTemplateId: 'thank_you_advanced',
      customEmails: [],
    },
    onFailure: {
      sendToOwner: true,
      emailTemplateId: 'error_notification',
    },
  },
  ui: {
    theme: 'dark',
    layout: 'multi-step',
    branding: {
      logoUrl: 'https://cdn.user.com/logo.png',
      primaryColor: '#222222',
      backgroundColor: '#ffffff',
      fontFamily: 'Inter',
      customCss: '',
    },
    language: 'en',
    showFormTitle: true,
    showFormDescription: true,
  },
  builder: {
    selectedStyle: 'default',
    wizardMode: true, // Matches the multi-step layout above
    columnSpans: {},
    elements: [],
    formLayout: {
      spacing: 'normal',
      labelPosition: 'top',
      buttonAlignment: 'left',
    },
    validation: {
      showRequiredAsterisk: true,
      validateOnSubmit: true,
      validateOnBlur: false,
    },
  },
};

(async () => {
  await connectToDB();

  const ownerUsers = await User.find({ isOwner: true });
  console.log(ownerUsers);
  console.log(`🎯 Found ${ownerUsers.length} users to seed.`);

  let createdCount = 0;

  for (const user of ownerUsers) {
    const existing = await UserFormSettings.findOne({ user: user._id });

    if (!existing) {
      await UserFormSettings.create({
        user: user._id,
        tenantId: user.tenantId || 'default',
        defaultFormSettings,
      });
      createdCount++;
      console.log(`➕ Created settings for: ${user.email}`);
    } else {
      console.log(`✅ Settings already exist for: ${user.email}`);
    }
  }

  console.log(`🎯 Done. ${createdCount} user settings created.`);
  process.exit();
})();
