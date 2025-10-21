const mongoose = require('mongoose');
const config = require('./src/config/config');
const ProjectForm = require('./src/models/projectForm.model');
const User = require('./src/models/user.model');
const logger = require('./src/config/logger');

async function createAdditionalProjects() {
  try {
    console.log('🏗️  Creating Additional Projects\n');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Find the user to use as createdBy
    const user = await User.findOne({ email: 'fadebowaley@gmail.com' });
    if (!user) {
      throw new Error('User fadebowaley@gmail.com not found');
    }
    console.log(`✅ Found user: ${user.email} (ID: ${user._id})`);

    const tenantId = '7vR-Ldacit';
    const projects = [
      {
        projectId: 'proj_CUSTOMER_SURVEY',
        configuration: {
          projectName: 'Customer Satisfaction Survey',
          description: 'Collect customer feedback and satisfaction ratings',
          category: 'survey',
          theme: 'modern',
        },
        elements: [
          {
            id: 'customer_name',
            type: 'text',
            label: 'Customer Name',
            required: true,
            placeholder: 'Enter your full name',
            validation: { minLength: 2, maxLength: 50 },
          },
          {
            id: 'email',
            type: 'email',
            label: 'Email Address',
            required: true,
            placeholder: 'your.email@example.com',
            validation: { pattern: 'email' },
          },
          {
            id: 'phone',
            type: 'phone',
            label: 'Phone Number',
            required: false,
            placeholder: '+1234567890',
            validation: { pattern: 'phone' },
          },
          {
            id: 'satisfaction_rating',
            type: 'select',
            label: 'Overall Satisfaction',
            required: true,
            options: [
              { value: '5', label: '⭐⭐⭐⭐⭐ Excellent' },
              { value: '4', label: '⭐⭐⭐⭐ Very Good' },
              { value: '3', label: '⭐⭐⭐ Good' },
              { value: '2', label: '⭐⭐ Fair' },
              { value: '1', label: '⭐ Poor' },
            ],
          },
          {
            id: 'service_quality',
            type: 'select',
            label: 'Service Quality Rating',
            required: true,
            options: [
              { value: 'excellent', label: 'Excellent' },
              { value: 'good', label: 'Good' },
              { value: 'average', label: 'Average' },
              { value: 'poor', label: 'Poor' },
            ],
          },
          {
            id: 'recommendation',
            type: 'checkbox',
            label: 'Would you recommend our service to others?',
            required: false,
          },
          {
            id: 'feedback',
            type: 'textarea',
            label: 'Additional Feedback',
            required: false,
            placeholder:
              'Please share your thoughts, suggestions, or concerns...',
            validation: { maxLength: 500 },
          },
        ],
      },
      {
        projectId: 'proj_EMPLOYEE_ONBOARDING',
        configuration: {
          projectName: 'Employee Onboarding Form',
          description: 'Complete new employee onboarding information',
          category: 'hr',
          theme: 'professional',
        },
        elements: [
          {
            id: 'full_name',
            type: 'text',
            label: 'Full Legal Name',
            required: true,
            placeholder: 'First Middle Last',
            validation: { minLength: 5, maxLength: 100 },
          },
          {
            id: 'date_of_birth',
            type: 'date',
            label: 'Date of Birth',
            required: true,
            validation: { minAge: 18, maxAge: 65 },
          },
          {
            id: 'personal_email',
            type: 'email',
            label: 'Personal Email',
            required: true,
            placeholder: 'personal.email@example.com',
          },
          {
            id: 'emergency_contact',
            type: 'text',
            label: 'Emergency Contact Name',
            required: true,
            placeholder: 'Full name of emergency contact',
          },
          {
            id: 'emergency_phone',
            type: 'phone',
            label: 'Emergency Contact Phone',
            required: true,
            placeholder: '+1234567890',
          },
          {
            id: 'address',
            type: 'textarea',
            label: 'Current Address',
            required: true,
            placeholder: 'Street, City, State, ZIP Code',
            validation: { minLength: 10, maxLength: 200 },
          },
          {
            id: 'bank_account',
            type: 'text',
            label: 'Bank Account Number',
            required: true,
            placeholder: 'Account number for direct deposit',
            validation: { pattern: 'numeric', minLength: 8, maxLength: 17 },
          },
          {
            id: 'tax_info',
            type: 'select',
            label: 'Tax Filing Status',
            required: true,
            options: [
              { value: 'single', label: 'Single' },
              { value: 'married', label: 'Married Filing Jointly' },
              { value: 'married_separate', label: 'Married Filing Separately' },
              { value: 'head_of_household', label: 'Head of Household' },
            ],
          },
          {
            id: 'dependents',
            type: 'number',
            label: 'Number of Dependents',
            required: true,
            placeholder: '0',
            validation: { min: 0, max: 10 },
          },
          {
            id: 'agreement',
            type: 'checkbox',
            label: 'I agree to the terms and conditions of employment',
            required: true,
          },
        ],
      },
      {
        projectId: 'proj_EVENT_REGISTRATION',
        configuration: {
          projectName: 'Event Registration Form',
          description: 'Register for upcoming events and workshops',
          category: 'events',
          theme: 'vibrant',
        },
        elements: [
          {
            id: 'attendee_name',
            type: 'text',
            label: 'Attendee Name',
            required: true,
            placeholder: 'Full name as it appears on ID',
            validation: { minLength: 2, maxLength: 50 },
          },
          {
            id: 'attendee_email',
            type: 'email',
            label: 'Email Address',
            required: true,
            placeholder: 'email@example.com',
          },
          {
            id: 'attendee_phone',
            type: 'phone',
            label: 'Phone Number',
            required: true,
            placeholder: '+1234567890',
          },
          {
            id: 'company',
            type: 'text',
            label: 'Company/Organization',
            required: false,
            placeholder: 'Your company name',
          },
          {
            id: 'job_title',
            type: 'text',
            label: 'Job Title',
            required: false,
            placeholder: 'Your current position',
          },
          {
            id: 'dietary_restrictions',
            type: 'select',
            label: 'Dietary Restrictions',
            required: false,
            options: [
              { value: 'none', label: 'No restrictions' },
              { value: 'vegetarian', label: 'Vegetarian' },
              { value: 'vegan', label: 'Vegan' },
              { value: 'gluten_free', label: 'Gluten-free' },
              { value: 'dairy_free', label: 'Dairy-free' },
              { value: 'other', label: 'Other (please specify)' },
            ],
          },
          {
            id: 'accessibility_needs',
            type: 'textarea',
            label: 'Accessibility Requirements',
            required: false,
            placeholder: 'Please describe any accessibility needs...',
            validation: { maxLength: 200 },
          },
          {
            id: 'newsletter_signup',
            type: 'checkbox',
            label: 'Subscribe to our newsletter for future events',
            required: false,
          },
        ],
      },
      {
        projectId: 'proj_MAINTENANCE_REQUEST',
        configuration: {
          projectName: 'Maintenance Request Form',
          description: 'Submit maintenance and repair requests',
          category: 'maintenance',
          theme: 'utilitarian',
        },
        elements: [
          {
            id: 'requester_name',
            type: 'text',
            label: 'Requester Name',
            required: true,
            placeholder: 'Your full name',
            validation: { minLength: 2, maxLength: 50 },
          },
          {
            id: 'contact_phone',
            type: 'phone',
            label: 'Contact Phone',
            required: true,
            placeholder: '+1234567890',
          },
          {
            id: 'location',
            type: 'text',
            label: 'Location/Address',
            required: true,
            placeholder: 'Building, floor, room number, or address',
            validation: { minLength: 5, maxLength: 100 },
          },
          {
            id: 'issue_type',
            type: 'select',
            label: 'Type of Issue',
            required: true,
            options: [
              { value: 'electrical', label: 'Electrical' },
              { value: 'plumbing', label: 'Plumbing' },
              { value: 'hvac', label: 'HVAC/Heating' },
              { value: 'structural', label: 'Structural' },
              { value: 'appliance', label: 'Appliance' },
              { value: 'pest_control', label: 'Pest Control' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'priority',
            type: 'select',
            label: 'Priority Level',
            required: true,
            options: [
              {
                value: 'emergency',
                label: '🚨 Emergency (immediate attention)',
              },
              { value: 'urgent', label: '⚠️ Urgent (within 24 hours)' },
              { value: 'normal', label: '📋 Normal (within 3-5 days)' },
              { value: 'low', label: '📝 Low (when convenient)' },
            ],
          },
          {
            id: 'description',
            type: 'textarea',
            label: 'Issue Description',
            required: true,
            placeholder: 'Please describe the problem in detail...',
            validation: { minLength: 10, maxLength: 500 },
          },
          {
            id: 'access_instructions',
            type: 'textarea',
            label: 'Access Instructions',
            required: false,
            placeholder: 'Any special access instructions, codes, or notes...',
            validation: { maxLength: 200 },
          },
          {
            id: 'photo_upload',
            type: 'file',
            label: 'Upload Photos (optional)',
            required: false,
            validation: {
              maxSize: 5,
              allowedTypes: ['image/jpeg', 'image/png'],
            },
          },
          {
            id: 'preferred_time',
            type: 'select',
            label: 'Preferred Contact Time',
            required: false,
            options: [
              { value: 'morning', label: 'Morning (8 AM - 12 PM)' },
              { value: 'afternoon', label: 'Afternoon (12 PM - 5 PM)' },
              { value: 'evening', label: 'Evening (5 PM - 8 PM)' },
              { value: 'anytime', label: 'Anytime' },
            ],
          },
        ],
      },
    ];

    console.log(`\n📋 Creating ${projects.length} new projects...`);

    const createdProjects = [];
    const errors = [];

    for (const projectData of projects) {
      try {
        // Check if project already exists
        const existingProject = await ProjectForm.findOne({
          projectId: projectData.projectId,
          tenantId,
        });

        if (existingProject) {
          console.log(
            `   ⚠️  Project ${projectData.projectId} already exists, skipping...`
          );
          continue;
        }

        const projectForm = new ProjectForm({
          projectId: projectData.projectId,
          tenantId,
          createdBy: user._id,
          configuration: projectData.configuration,
          elements: projectData.elements,
          status: 'active',
          metadata: {
            deploymentStatus: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await projectForm.save();
        createdProjects.push(projectForm);

        console.log(`   ✅ Created: ${projectData.configuration.projectName}`);
        console.log(`      Project ID: ${projectData.projectId}`);
        console.log(
          `      Elements: ${projectData.elements.length} form fields`
        );
        console.log(`      Category: ${projectData.configuration.category}`);
        console.log('');
      } catch (error) {
        console.log(
          `   ❌ Failed to create ${projectData.projectId}: ${error.message}`
        );
        errors.push({ projectId: projectData.projectId, error: error.message });
      }
    }

    console.log('\n📊 Summary:');
    console.log(
      `   ✅ Successfully created: ${createdProjects.length} projects`
    );
    console.log(`   ❌ Failed: ${errors.length} projects`);

    if (createdProjects.length > 0) {
      console.log('\n🎉 New projects available for Telegram bot:');
      createdProjects.forEach((project, index) => {
        console.log(
          `   ${index + 1}. ${project.configuration.projectName} (${
            project.projectId
          })`
        );
      });
    }

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach((error) => {
        console.log(`   - ${error.projectId}: ${error.error}`);
      });
    }
  } catch (error) {
    console.error('❌ Error creating projects:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

createAdditionalProjects();
