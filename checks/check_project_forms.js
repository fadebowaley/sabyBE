const mongoose = require('mongoose');
const config = require('./src/config/config');
const { ProjectForm } = require('./src/models');

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

// Check project forms
async function checkProjectForms() {
  try {
    console.log('🔍 Checking project forms in database...');

    // Get all project forms
    const projectForms = await ProjectForm.find({ deletedAt: null }).select(
      'projectId tenantId status configuration.projectName'
    );

    console.log(`📋 Found ${projectForms.length} project forms:`);

    projectForms.forEach((form, index) => {
      console.log(`   ${index + 1}. Project ID: ${form.projectId}`);
      console.log(`      Tenant ID: ${form.tenantId}`);
      console.log(`      Status: ${form.status}`);
      console.log(`      Name: ${form.configuration?.projectName || 'N/A'}`);
      console.log('');
    });

    // Check specific project form
    console.log('🔍 Looking for specific project form: proj_1VOA1DzFtUf2');
    const specificForm = await ProjectForm.findOne({
      projectId: 'proj_1VOA1DzFtUf2',
      deletedAt: null,
    });

    if (specificForm) {
      console.log('✅ Found specific project form:');
      console.log('   Project ID:', specificForm.projectId);
      console.log('   Tenant ID:', specificForm.tenantId);
      console.log('   Status:', specificForm.status);
      console.log('   Name:', specificForm.configuration?.projectName || 'N/A');
    } else {
      console.log('❌ Specific project form not found');
    }
  } catch (error) {
    console.error('❌ Error checking project forms:', error.message);
  }
}

// Run the check
const runCheck = async () => {
  await connectToDatabase();
  await checkProjectForms();

  console.log('🏁 Check completed');
  process.exit(0);
};

runCheck().catch((error) => {
  console.error('❌ Check failed:', error);
  process.exit(1);
});
