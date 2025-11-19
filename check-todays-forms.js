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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const forms = await ProjectForm.find({ createdAt: { $gte: today } })
      .sort({ createdAt: -1 })
      .select('projectId _id createdAt permSettings')
      .lean();

    console.log(`\n📅 Forms created TODAY (Nov 5): ${forms.length} total\n`);

    forms.forEach((f, index) => {
      console.log(`━━━ Form ${index + 1} ━━━`);
      console.log('ProjectID:', f.projectId);
      console.log('MongoDB _id:', f._id);
      console.log('Created:', f.createdAt);
      console.log('PERM enabled:', f.permSettings?.enabled);
      console.log(
        'Auto-generate calendar:',
        f.permSettings?.autoGenerateCalendar
      );
      console.log(
        'Has calendarGeneration:',
        !!f.permSettings?.calendarGeneration
      );

      if (f.permSettings?.calendarGeneration) {
        console.log('✅ Calendar options FOUND:');
        console.log(JSON.stringify(f.permSettings.calendarGeneration, null, 2));
      } else {
        console.log('❌ No calendar options in permSettings');
      }
      console.log('');
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
