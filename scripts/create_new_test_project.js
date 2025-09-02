const mongoose = require('mongoose');
const config = require('./src/config/config');

// Connect to MongoDB
const connectToDatabase = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
};

// Create new test project
async function createNewTestProject() {
  try {
    console.log('🚀 Creating new test project for email validation system...');

    const { ProjectForm } = require('./src/models');

    // Create a new test project form
    const newProjectForm = new ProjectForm({
      projectId: 'proj_TEST_EMAIL_VALIDATION',
      tenantId: '7vR-Ldacit', // Same tenant as fadebowaley@gmail.com
      status: 'active',
      configuration: {
        projectName: 'Email Validation Test Project',
        projectDescription: 'Test project for email validation system',
        settings: {
          allowMultipleSubmissions: false, // Test duplicate prevention
          submissionCooldown: 0, // No cooldown for testing
          formType: 'single',
        },
        elements: [
          {
            type: 'text',
            properties: {
              label: 'Full Name',
              required: true,
              placeholder: 'Enter your full name',
            },
          },
          {
            type: 'email',
            properties: {
              label: 'Email Address',
              required: true,
              placeholder: 'Enter your email address',
            },
          },
          {
            type: 'tel',
            properties: {
              label: 'Phone Number',
              required: true,
              placeholder: 'Enter your phone number',
            },
          },
          {
            type: 'textarea',
            properties: {
              label: 'Message',
              required: true,
              placeholder: 'Enter your message',
            },
          },
        ],
      },
      metadata: {
        deploymentStatus: 'published',
        version: '1.0.0',
        testProject: true,
      },
      createdBy: '507f1f77bcf86cd799439011', // Use a valid ObjectId
    });

    // Save the project form
    const savedProject = await newProjectForm.save();

    console.log('✅ New test project created successfully!');
    console.log('📋 Project Details:');
    console.log(`   - Project ID: ${savedProject.projectId}`);
    console.log(`   - Tenant ID: ${savedProject.tenantId}`);
    console.log(`   - Project Name: ${savedProject.configuration.projectName}`);
    console.log(`   - Status: ${savedProject.status}`);
    console.log(`   - Deployment Status: ${savedProject.metadata.deploymentStatus}`);
    console.log(`   - Form Fields: ${savedProject.configuration.elements.length}`);

    console.log('\n🔍 Form Fields:');
    if (savedProject.configuration.elements && savedProject.configuration.elements.length > 0) {
      savedProject.configuration.elements.forEach((element, index) => {
        console.log(
          `   ${index + 1}. ${element.properties.label} (${element.type}) - Required: ${element.properties.required}`
        );
      });
    } else {
      console.log('   No form fields defined');
    }

    console.log('\n📧 Email Template for Testing:');
    console.log('=============================');
    console.log('Subject: 📋 Form Submission - proj_TEST_EMAIL_VALIDATION');
    console.log('');
    console.log('This is a form submission email.');
    console.log('');
    console.log('PROJECT ID: proj_TEST_EMAIL_VALIDATION');
    console.log('TENANT ID: 7vR-Ldacit');
    console.log('');
    console.log('FORM DATA:');
    console.log('Full Name: Test User');
    console.log('Email Address: test@example.com');
    console.log('Phone Number: +1234567890');
    console.log('Message: This is a test submission for the new project.');
    console.log('');
    console.log('SUBMISSION METADATA:');
    console.log('- Submitted by: fadebowaley@gmail.com');
    console.log('- Project: Email Validation Test Project');
    console.log('- Form Type: Email Submission');
    console.log('- Validation Required: Yes');
    console.log('');
    console.log('This email should be processed by the email ingestion system and validated successfully.');
    console.log('');
    console.log('Best regards,');
    console.log('Test User');

    return savedProject;
  } catch (error) {
    console.error('❌ Error creating test project:', error.message);
    throw error;
  }
}

// Run the script
const runScript = async () => {
  await connectToDatabase();
  await createNewTestProject();

  console.log('\n🏁 Test project creation completed');
  console.log('\n🔍 Next Steps:');
  console.log('==============');
  console.log('1. Send test email using the template above');
  console.log('2. Monitor email ingestion logs: pm2 logs email-ingestor');
  console.log('3. Monitor submission worker logs: pm2 logs submission-worker');
  console.log('4. Check if confirmation email is received');
  console.log('5. Verify submission is created in database');

  process.exit(0);
};

runScript().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
