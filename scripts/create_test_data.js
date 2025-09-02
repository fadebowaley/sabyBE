// create_test_data.js
// Script to create test user and project form for email validation testing

const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/sodzo', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
});

// User Schema (simplified for testing)
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// Project Form Schema (simplified for testing)
const ProjectFormSchema = new mongoose.Schema({
  projectId: { type: String, unique: true, required: true },
  tenantId: { type: String, required: true },
  configuration: {
    projectName: { type: String, required: true },
  },
  elements: [{ type: mongoose.Schema.Types.Mixed }],
  status: { type: String, default: 'active' },
  metadata: {
    deploymentStatus: { type: String, default: 'published' },
  },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const ProjectForm = mongoose.model('ProjectForm', ProjectFormSchema);

async function createTestData() {
  try {
    console.log('🔧 Creating test data for email validation...');

    // Create test user
    const testUser = await User.findOneAndUpdate(
      { email: 'fadebowaley@gmail.com' },
      {
        email: 'fadebowaley@gmail.com',
        tenantId: 'demo-tenant',
        deletedAt: null
      },
      { upsert: true, new: true }
    );

    console.log('✅ Test user created/updated:', testUser.email);

    // Create test project form
    const testProjectForm = await ProjectForm.findOneAndUpdate(
      { projectId: 'demo-project' },
      {
        projectId: 'demo-project',
        tenantId: 'demo-tenant',
        configuration: {
          projectName: 'Demo Property Form'
        },
        elements: [
          {
            id: 'name',
            type: 'text',
            properties: {
              label: 'Name',
              required: true,
              validation: { required: true }
            }
          },
          {
            id: 'email',
            type: 'email',
            properties: {
              label: 'Email',
              required: true,
              validation: { required: true }
            }
          },
          {
            id: 'phone',
            type: 'phone',
            properties: {
              label: 'Phone',
              required: true,
              validation: { required: true }
            }
          },
          {
            id: 'propertyType',
            type: 'select',
            properties: {
              label: 'Property Type',
              required: true,
              options: ['Residential', 'Commercial', 'Industrial'],
              validation: { required: true }
            }
          },
          {
            id: 'address',
            type: 'text',
            properties: {
              label: 'Address',
              required: true,
              validation: { required: true }
            }
          },
          {
            id: 'price',
            type: 'number',
            properties: {
              label: 'Price',
              required: true,
              validation: { required: true, min: 0 }
            }
          },
          {
            id: 'bedrooms',
            type: 'number',
            properties: {
              label: 'Bedrooms',
              required: false,
              validation: { min: 0 }
            }
          },
          {
            id: 'bathrooms',
            type: 'number',
            properties: {
              label: 'Bathrooms',
              required: false,
              validation: { min: 0 }
            }
          },
          {
            id: 'squareFeet',
            type: 'number',
            properties: {
              label: 'Square Feet',
              required: false,
              validation: { min: 0 }
            }
          },
          {
            id: 'yearBuilt',
            type: 'number',
            properties: {
              label: 'Year Built',
              required: false,
              validation: { min: 1900, max: new Date().getFullYear() }
            }
          },
          {
            id: 'description',
            type: 'text',
            properties: {
              label: 'Description',
              required: false,
              validation: { maxLength: 1000 }
            }
          }
        ],
        status: 'active',
        metadata: {
          deploymentStatus: 'published'
        },
        deletedAt: null
      },
      { upsert: true, new: true }
    );

    console.log('✅ Test project form created/updated:', testProjectForm.projectId);
    console.log('📋 Form elements:', testProjectForm.elements.length);

    // Verify the data
    const userCount = await User.countDocuments({ tenantId: 'demo-tenant' });
    const projectCount = await ProjectForm.countDocuments({ tenantId: 'demo-tenant' });

    console.log('\n📊 Test Data Summary:');
    console.log(`- Users in demo-tenant: ${userCount}`);
    console.log(`- Projects in demo-tenant: ${projectCount}`);
    console.log(`- Test user: ${testUser.email} (${testUser.tenantId})`);
    console.log(`- Test project: ${testProjectForm.projectId} (${testProjectForm.tenantId})`);

    console.log('\n🎯 Email validation test data is ready!');
    console.log('You can now send emails from fadebowaley@gmail.com to sendo@jmsfagribusiness.com');

  } catch (error) {
    console.error('❌ Error creating test data:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

createTestData();
