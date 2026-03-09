#!/usr/bin/env node
/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../config/config');
const { User } = require('../models');

const parseArgs = () => {
  const out = {};
  process.argv.slice(2).forEach((arg) => {
    const [k, ...rest] = arg.split('=');
    if (!k.startsWith('--')) return;
    out[k.slice(2)] = rest.join('=');
  });
  return out;
};

const run = async () => {
  const args = parseArgs();
  const email = String(args.email || '').trim().toLowerCase();
  const password = String(args.password || '').trim();
  const firstname = String(args.firstname || 'Tenant').trim();
  const lastname = String(args.lastname || 'Owner').trim();
  const phoneNumber = String(args.phone || '+2348000000000').trim();

  if (!email || !password) {
    throw new Error(
      'Usage: node src/scripts/create-owner-verified.js --email=<email> --password=<password> [--firstname=Tenant] [--lastname=Owner] [--phone=+234...]'
    );
  }

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  try {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.createUser({
        firstname,
        lastname,
        email,
        password,
        isOwner: true,
        isSuper: true,
        isAgreed: true,
        phoneNumber,
      });
    }

    user.otpVerified = true;
    user.status = true;
    user.isEmailVerified = true;
    user.isPhoneVerified = Boolean(user.phoneNumber);
    await user.save();

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          userId: String(user._id),
          tenantId: user.tenantId,
          email: user.email,
          isOwner: user.isOwner,
          isSuper: user.isSuper,
          otpVerified: user.otpVerified,
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.connection.close();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
