const mongoose = require('mongoose');
const config = require('./src/config/config');
const User = require('./src/models/user.model');

async function printTenantUsers() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    const tenantId = '7vR-Ldacit';
    const users = await User.find({ tenantId });
    console.log(`\nUsers for tenantId: ${tenantId}`);
    users.forEach((user, idx) => {
      console.log(`\n${idx + 1}. ${user.firstname} ${user.lastname}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Phone: ${user.phoneNumber}`);
      console.log(`   Phone Verified: ${user.isPhoneVerified}`);
      console.log(`   UserId: ${user.userId}`);
      console.log(`   _id: ${user._id}`);
    });
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

printTenantUsers();
