const mongoose = require('mongoose');
const config = require('./src/config/config');
const logger = require('./src/config/logger');

// Import models
const ProjectForm = require('./src/models/projectForm.model');
const User = require('./src/models/user.model');

/**
 * Create a test project form for Telegram bot testing
 */

async function createTelegramTestProject() {
  console.log('🧪 Creating Telegram Test Project\n');

  try {
    // Connect to database
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to database');

    // Check if test project already exists
    const existingProject = await ProjectForm.findOne({
      projectId: 'proj_TELEGRAM_TEST',
    });

    if (existingProject) {
      console.log('✅ Test project already exists');
      console.log(`   Project ID: ${existingProject.projectId}`);
      console.log(
        `   Project Name: ${existingProject.configuration?.projectName}`
      );
      console.log(`   Status: ${existingProject.status}`);
      return existingProject;
    }

    // Find a valid user for createdBy field
    const validUser = await User.findOne({ tenantId: '7vR-Ldacit' }).select(
      '_id'
    );
    if (!validUser) {
      console.log('❌ No users found in tenant 7vR-Ldacit');
      console.log('   Please create a user first or update the tenant ID');
      return;
    }

    console.log(`✅ Using user ${validUser._id} as creator`);

    // Create test project form
    const testProject = new ProjectForm({
      projectId: 'proj_TELEGRAM_TEST',
      tenantId: '7vR-Ldacit', // Default tenant
      name: 'Telegram Test Form',
      description: 'Test form for Telegram bot functionality',
      status: 'active',
      configuration: {
        projectName: 'Telegram Test Project',
        projectCategory: 'Testing',
        projectDescription: 'A test project for Telegram bot functionality',
        deploymentStatus: 'published',
      },
      elements: [
        {
          id: 'full_name',
          type: 'text',
          properties: {
            label: 'Full Name',
            required: true,
            placeholder: 'Enter your full name',
            minLength: 2,
            maxLength: 100,
          },
        },
        {
          id: 'email',
          type: 'email',
          properties: {
            label: 'Email Address',
            required: true,
            placeholder: 'Enter your email address',
          },
        },
        {
          id: 'phone',
          type: 'phone',
          properties: {
            label: 'Phone Number',
            required: true,
            placeholder: 'Enter your phone number',
          },
        },
        {
          id: 'age',
          type: 'number',
          properties: {
            label: 'Age',
            required: false,
            min: 18,
            max: 120,
            placeholder: 'Enter your age',
          },
        },
        {
          id: 'department',
          type: 'select',
          properties: {
            label: 'Department',
            required: true,
            options: ['Engineering', 'Marketing', 'Sales', 'Support', 'Other'],
          },
        },
        {
          id: 'skills',
          type: 'checkbox',
          properties: {
            label: 'Skills (Select all that apply)',
            required: false,
            multiple: true,
            options: [
              'JavaScript',
              'Python',
              'React',
              'Node.js',
              'MongoDB',
              'PostgreSQL',
            ],
          },
        },
        {
          id: 'experience',
          type: 'text',
          properties: {
            label: 'Work Experience',
            required: false,
            placeholder: 'Describe your work experience',
            maxLength: 500,
          },
        },
        {
          id: 'resume',
          type: 'file',
          properties: {
            label: 'Resume/CV (Optional)',
            required: false,
            description: 'Upload your resume or CV document',
          },
        },
        {
          id: 'photo',
          type: 'file',
          properties: {
            label: 'Profile Photo (Optional)',
            required: false,
            description: 'Upload a profile photo',
          },
        },
      ],
      metadata: {
        deploymentStatus: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
      },
      createdBy: validUser._id,
    });

    await testProject.save();
    console.log('✅ Test project created successfully');
    console.log(`   Project ID: ${testProject.projectId}`);
    console.log(`   Project Name: ${testProject.configuration.projectName}`);
    console.log(`   Elements: ${testProject.elements.length} questions`);
    console.log(`   Status: ${testProject.status}`);

    // Verify user exists for testing
    const testUser = await User.findOne({
      phone: '+1234567890',
      tenantId: '7vR-Ldacit',
    });

    if (!testUser) {
      console.log('\n⚠️  Test user not found');
      console.log(
        '   You may need to create a test user with phone: +1234567890'
      );
      console.log('   Or update the phone number in the validation service');
    } else {
      console.log('\n✅ Test user found');
      console.log(`   Name: ${testUser.name}`);
      console.log(`   Phone: ${testUser.phone}`);
      console.log(`   Tenant: ${testUser.tenantId}`);
    }

    console.log('\n🎉 Telegram test project setup complete!');
    console.log('\n📋 Test Instructions:');
    console.log('1. Start the Telegram bot');
    console.log('2. Send /start to begin');
    console.log(
      '3. Share your phone number (must be registered in the system)'
    );
    console.log('4. Select "Telegram Test Project"');
    console.log('5. Fill out the form step by step');
    console.log('6. Test file uploads with photos/documents');
    console.log('7. Submit the form');

    return testProject;
  } catch (error) {
    console.error('❌ Failed to create test project:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from database');
  }
}

// Run if this file is executed directly
if (require.main === module) {
  createTelegramTestProject()
    .then(() => {
      console.log('\n✅ Setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  createTelegramTestProject,
};
