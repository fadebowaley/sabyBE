const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const readline = require('readline');
const config = require('../src/config/config');

// Import models
const User = require('../src/models/user.model');
const { HaloCounter } = require('../src/models/haloCounter.model');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

/**
 * Script to create a SabyUser with custom credentials
 */

const createCustomSabyUser = async () => {
  try {
    console.log('🎯 Create Custom SabyUser\n');
    console.log(
      'This script will create a user with full SabyUser privileges.'
    );
    console.log('Press Ctrl+C to cancel at any time.\n');

    // Get user input
    const email = await question('Email address: ');
    const firstname = await question('First name: ');
    const lastname = await question('Last name: ');
    const password = await question(
      'Password (min 8 chars, must contain letter & number): '
    );

    // Validate password
    if (
      password.length < 8 ||
      !/\d/.test(password) ||
      !/[a-zA-Z]/.test(password)
    ) {
      console.error(
        '❌ Password must be at least 8 characters and contain at least one letter and one number'
      );
      process.exit(1);
    }

    // Connect to MongoDB
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('⚠️  User with this email already exists:');
      console.log({
        email: existingUser.email,
        isSaby: existingUser.isSaby,
        isOwner: existingUser.isOwner,
        isSuper: existingUser.isSuper,
      });

      if (existingUser.isSaby) {
        console.log('\n✅ This user already has SabyUser privileges');
      } else {
        console.log(
          '\n⚠️  To upgrade this user to SabyUser, update the database:'
        );
        console.log(
          `   db.users.updateOne({email: "${email}"}, {$set: {isSaby: true, isSuper: true, isOwner: true}})`
        );
      }
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
    const hashedPassword = await bcrypt.hash(password, 8);

    // Create SabyUser
    const sabyUser = await User.create({
      userId,
      haloId,
      tenantId,
      email,
      password: hashedPassword,
      firstname,
      lastname,
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
    console.log('Email:    ', email);
    console.log('Password: ', password);
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
    console.log('\n⚠️  IMPORTANT: Save these credentials securely!\n');
  } catch (error) {
    console.error('❌ Error creating SabyUser:', error);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
createCustomSabyUser();
