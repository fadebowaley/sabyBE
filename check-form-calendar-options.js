const mongoose = require('mongoose');
require('dotenv').config();

const checkFormCalendarOptions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    const ProjectForm = mongoose.model(
      'ProjectForm',
      new mongoose.Schema({}, { strict: false }),
      'projectforms'
    );

    const form = await ProjectForm.findOne({
      projectId: 'proj_UnGnVWGwHqQd',
    }).lean();

    if (!form) {
      console.log('❌ Form not found');
      process.exit(1);
    }

    console.log('\n📋 Form Details:');
    console.log('Project ID:', form.projectId);
    console.log('Form ID:', form.formId);
    console.log('Status:', form.status);
    console.log('Published At:', form.publishedAt);

    console.log('\n📅 PERM Settings:');
    console.log(JSON.stringify(form.permSettings, null, 2));

    console.log('\n🔍 Calendar Generation Options:');
    if (form.permSettings?.calendarGeneration) {
      console.log('✅ Calendar options FOUND:');
      console.log(
        JSON.stringify(form.permSettings.calendarGeneration, null, 2)
      );
    } else {
      console.log('❌ Calendar options NOT FOUND in permSettings');
      console.log("\nThis is why backdating didn't work!");
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

checkFormCalendarOptions();
