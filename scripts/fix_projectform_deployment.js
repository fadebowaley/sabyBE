const mongoose = require('mongoose');
const config = require('./src/config/config');
const ProjectForm = require('./src/models/projectForm.model');

async function fixProjectFormDeployment() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const projectId = 'proj_EMAIL_INGESTION_TEST_1753867697280';

  const updateResult = await ProjectForm.findOneAndUpdate(
    { projectId: projectId },
    {
      $set: {
        status: 'active',
        deployed: true,
        'metadata.deploymentStatus': 'published',
      },
    },
    { new: true }
  );

  if (updateResult) {
    console.log('✅ ProjectForm updated successfully:');
    console.log('   - Project ID:', updateResult.projectId);
    console.log('   - Status:', updateResult.status);
    console.log('   - Deployed:', updateResult.deployed);
    console.log('   - Metadata.deploymentStatus:', updateResult.metadata?.deploymentStatus);
  } else {
    console.log('❌ ProjectForm not found:', projectId);
  }

  await mongoose.connection.close();
}

fixProjectFormDeployment().catch((e) => {
  console.error('❌ Failed to update ProjectForm:', e.message);
  process.exit(1);
});
