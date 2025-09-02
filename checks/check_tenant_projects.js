const mongoose = require('mongoose');
const config = require('./src/config/config');
const ProjectForm = require('./src/models/projectForm.model');

async function checkTenantProjects() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    const tenantId = '7vR-Ldacit';

    console.log(`\n🔍 Checking projects for tenant: ${tenantId}`);

    // Get all projects for the tenant
    const allProjects = await ProjectForm.find({ tenantId });
    console.log(`\n📊 Total projects found: ${allProjects.length}`);

    allProjects.forEach((project, index) => {
      console.log(`\n${index + 1}. Project: ${project.projectId}`);
      console.log(`   Name: ${project.configuration?.projectName || 'No name'}`);
      console.log(`   Status: ${project.status}`);
      console.log(`   Deployment Status: ${project.metadata?.deploymentStatus || 'Not set'}`);
      console.log(`   Deleted: ${project.deletedAt ? 'Yes' : 'No'}`);
      console.log(`   Elements: ${project.elements?.length || 0} form fields`);
    });

    // Get active and published projects
    const activeProjects = await ProjectForm.find({
      tenantId,
      status: 'active',
      'metadata.deploymentStatus': 'published',
      deletedAt: null
    });

    console.log(`\n✅ Active and published projects: ${activeProjects.length}`);
    activeProjects.forEach((project, index) => {
      console.log(`   ${index + 1}. ${project.projectId} - ${project.configuration?.projectName || 'No name'}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkTenantProjects();
