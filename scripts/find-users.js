require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config/config');
const { User } = require('../src/models');

const emails = [
  'abioye.ayorinde.ologuneru@sotsm.org',
  'ajiboye.oluwaseun.s.enugu@sotsm.org',
  'josaby@saby.ai',
];

async function findUsers() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    for (const email of emails) {
      // Try without tenant context first
      const user = await User.findOne({ email }).lean();
      if (user) {
        console.log(`✅ Found: ${email}`);
        console.log(`   ID: ${user._id}`);
        console.log(`   Tenant: ${user.tenant || 'N/A'}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
      } else {
        console.log(`❌ Not found: ${email}`);
      }
    }

    // Also list some users
    const someUsers = await User.find().limit(5).select('email name tenant').lean();
    console.log('\n📋 Sample users in database:');
    someUsers.forEach(u => {
      console.log(`   - ${u.email} (${u.name || 'N/A'})`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findUsers();

