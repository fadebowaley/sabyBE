const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);

    const ProjectForm = mongoose.model(
      'ProjectForm',
      new mongoose.Schema({}, { strict: false }),
      'projectforms'
    );

    const form = await ProjectForm.findOne({
      projectId: 'proj_UnGnVWGwHqQd',
    }).lean();

    if (!form) {
      console.log('❌ Form proj_UnGnVWGwHqQd NOT FOUND in MongoDB!');
      console.log('\nSearching by published forms...');

      const recentPublished = await ProjectForm.find({ status: 'active' })
        .sort({ publishedAt: -1 })
        .limit(5)
        .select('projectId publishedAt permSettings.calendarGeneration')
        .lean();

      console.log('\n📋 Last 5 published forms:');
      recentPublished.forEach((f) => {
        console.log('---');
        console.log('ProjectID:', f.projectId);
        console.log('Published:', f.publishedAt);
        console.log(
          'Has calendar options:',
          !!f.permSettings?.calendarGeneration
        );
      });

      process.exit(1);
    }

    console.log('\n✅ Form FOUND!');
    console.log('\n📋 Form Details:');
    console.log('Project ID:', form.projectId);
    console.log('Form ID:', form.formId);
    console.log('Status:', form.status);
    console.log('Created At:', form.createdAt);
    console.log('Published At:', form.publishedAt);

    console.log('\n📅 PERM Settings:');
    console.log('- Enabled:', form.permSettings?.enabled);
    console.log('- Tracking Mode:', form.permSettings?.trackingMode);
    console.log('- Auto-generate:', form.permSettings?.autoGenerateCalendar);

    console.log('\n🔍 CALENDAR GENERATION OPTIONS:');
    if (form.permSettings?.calendarGeneration) {
      console.log('✅ OPTIONS FOUND:');
      console.log(
        JSON.stringify(form.permSettings.calendarGeneration, null, 2)
      );
    } else {
      console.log('❌ NO CALENDAR OPTIONS in permSettings');
      console.log("\n🚨 This is why backdating didn't work!");
      console.log('The form was created WITHOUT calendar options.');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
