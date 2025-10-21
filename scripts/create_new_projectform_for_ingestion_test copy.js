const mongoose = require('mongoose');
const config = require('./src/config/config');
const ProjectForm = require('./src/models/projectForm.model');

async function createNewProjectForm() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const newProjectForm = {
    projectId: `proj_EMAIL_INGESTION_TEST_${Date.now()}`,
    tenantId: '7vR-Ldacit',
    createdBy: '507f1f77bcf86cd799439011',
    configuration: {
      projectName: 'Email Ingestion Test Project',
      elements: [
        { name: 'Full Name', type: 'text', required: true },
        { name: 'Email Address', type: 'email', required: true },
        { name: 'Phone Number', type: 'text', required: false },
        { name: 'Message', type: 'text', required: true },
      ],
    },
    status: 'active',
    deployed: true,
  };

  const project = await ProjectForm.create(newProjectForm);
  console.log('✅ New ProjectForm created:', project.projectId);
  await mongoose.connection.close();
}

createNewProjectForm().catch((e) => {
  console.error('❌ Failed to create ProjectForm:', e.message);
  process.exit(1);
});
