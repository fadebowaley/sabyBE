const mongoose = require('mongoose');
const config = require('./src/config/config');
const User = require('./src/models/user.model');
const logger = require('./src/config/logger');

/**
 * Generate a dummy phone number for testing
 * @returns {string} Dummy phone number
 */
function generateDummyPhoneNumber() {
  const countryCodes = ['+1', '+44', '+33', '+49', '+81', '+86', '+91', '+234'];
  const countryCode = countryCodes[Math.floor(Math.random() * countryCodes.length)];
  const areaCode = Math.floor(Math.random() * 900) + 100; // 100-999
  const number = Math.floor(Math.random() * 90000000) + 10000000; // 8 digits
  return `${countryCode}${areaCode}${number}`;
}

/**
 * Update user phone numbers
 */
async function updateUserPhoneNumbers() {
  try {
    console.log('🔧 Updating User Phone Numbers\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Step 1: Add dummy phone numbers to all users without phone numbers
    console.log('\n1️⃣ Adding dummy phone numbers to users without phone numbers...');
    const usersWithoutPhone = await User.find({
      $or: [
        { phoneNumber: { $exists: false } },
        { phoneNumber: null },
        { phoneNumber: '' }
      ]
    });

    console.log(`   Found ${usersWithoutPhone.length} users without phone numbers`);

    for (const user of usersWithoutPhone) {
      const dummyPhone = generateDummyPhoneNumber();
      user.phoneNumber = dummyPhone;
      user.isPhoneVerified = false; // Mark as unverified for dummy numbers
      await user.save();
      console.log(`   ✅ Added dummy phone ${dummyPhone} to ${user.email}`);
    }

    // Step 2: Update fadebowaley@gmail.com with real phone number
    console.log('\n2️⃣ Updating fadebowaley@gmail.com with real phone number...');
    const targetUser = await User.findOne({ email: 'fadebowaley@gmail.com' });

    if (targetUser) {
      targetUser.phoneNumber = '+2348145045108';
      targetUser.isPhoneVerified = true; // Mark as verified
      await targetUser.save();
      console.log('   ✅ Updated fadebowaley@gmail.com with phone +2348145045108 (verified)');
    } else {
      console.log('   ⚠️  User fadebowaley@gmail.com not found');
    }

    // Step 3: Show summary
    console.log('\n3️⃣ Summary:');
    const totalUsers = await User.countDocuments();
    const usersWithPhone = await User.countDocuments({ phoneNumber: { $exists: true, $ne: null, $ne: '' } });
    const verifiedPhones = await User.countDocuments({ isPhoneVerified: true });

    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Users with phone numbers: ${usersWithPhone}`);
    console.log(`   Verified phone numbers: ${verifiedPhones}`);

    // Step 4: Show fadebowaley@gmail.com details
    if (targetUser) {
      console.log('\n4️⃣ Target user details:');
      console.log(`   Email: ${targetUser.email}`);
      console.log(`   Phone: ${targetUser.phoneNumber}`);
      console.log(`   Phone Verified: ${targetUser.isPhoneVerified}`);
      console.log(`   Name: ${targetUser.firstname} ${targetUser.lastname}`);
    }

    console.log('\n🎉 Phone number update completed successfully!');

  } catch (error) {
    console.error('❌ Error updating phone numbers:', error.message);
    console.error('Full error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

// Run the update
updateUserPhoneNumbers();
