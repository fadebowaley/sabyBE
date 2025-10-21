const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const config = require('../src/config/config');

// Import models
const User = require('../src/models/user.model');
const { HaloCounter } = require('../src/models/haloCounter.model');

/**
 * Script to create a SabyUser with full privileges
 * This user can approve API keys and access all SabyUser-only features
 */

const createSabyUser = async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Check if SabyUser already exists
    const existingUser = await User.findOne({
      $or: [{ email: 'saby@sabyengineering.com' }, { isSaby: true }],
    });

    if (existingUser) {
      console.log('⚠️  SabyUser already exists:');
      console.log({
        email: existingUser.email,
        firstname: existingUser.firstname,
        lastname: existingUser.lastname,
        haloId: existingUser.haloId,
        userId: existingUser.userId,
        isSaby: existingUser.isSaby,
        isOwner: existingUser.isOwner,
        isSuper: existingUser.isSuper,
      });
      console.log('\n✅ You can use this user to test SabyUser features');
      process.exit(0);
    }

    // Get or create HaloCounter
    let haloCounter = await HaloCounter.findOne({});
    if (!haloCounter) {
      haloCounter = await HaloCounter.create({ counter: 0 });
    }

    // Increment and get new counter value
    haloCounter.counter += 1;
    await haloCounter.save();
    const haloId = `HALO${String(haloCounter.counter).padStart(6, '0')}`;

    // Generate userId
    const userId = nanoid(10);

    // Generate special tenantId for SabyUser
    const tenantId = `SABY-${nanoid(8)}`;

    // Hash password
    const hashedPassword = await bcrypt.hash('SabyAdmin123!', 8);

    // Create SabyUser
    const sabyUser = await User.create({
      userId,
      haloId,
      tenantId,
      email: 'saby@sabyengineering.com',
      password: hashedPassword,
      firstname: 'Saby',
      lastname: 'Admin',
      isSaby: true,
      isOwner: true, // Give owner privileges too
      isSuper: true, // Give super privileges too
      isAgreed: true,
      otpVerified: true, // Pre-verified so can login immediately
      isEmailVerified: true,
      status: true, // Active status
      roles: [],
    });

    console.log('\n🎉 SabyUser created successfully!\n');
    console.log('Login Credentials:');
    console.log('==================');
    console.log('Email:    saby@sabyengineering.com');
    console.log('Password: SabyAdmin123!');
    console.log('\nUser Details:');
    console.log('=============');
    console.log('User ID:  ', sabyUser.userId);
    console.log('Halo ID:  ', sabyUser.haloId);
    console.log('Tenant ID:', sabyUser.tenantId);
    console.log('Name:     ', `${sabyUser.firstname} ${sabyUser.lastname}`);
    console.log('\nPrivileges:');
    console.log('===========');
    console.log('✅ isSaby:  ', sabyUser.isSaby);
    console.log('✅ isSuper: ', sabyUser.isSuper);
    console.log('✅ isOwner: ', sabyUser.isOwner);
    console.log('\nFeature Access:');
    console.log('===============');
    console.log('✅ Can approve API keys (/apis/approvals)');
    console.log('✅ Can create internal/external/partner/system API keys');
    console.log("✅ Can view all tenants' API keys");
    console.log('✅ Can access Go Live dashboard (/apis/go-live)');
    console.log('✅ Full access to all protected routes');
    console.log('\nNext Steps:');
    console.log('===========');
    console.log('1. Start your backend: npm run dev');
    console.log('2. Start your frontend: pnpm dev');
    console.log('3. Login with the credentials above');
    console.log('4. Navigate to /apis/approvals to test approval workflow');
    console.log('5. Create API keys with SabyUser-only categories\n');
  } catch (error) {
    console.error('❌ Error creating SabyUser:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
createSabyUser();
