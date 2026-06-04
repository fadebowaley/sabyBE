#!/usr/bin/env node

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { User } = require('../src/models');
const tenantOnboardingService = require('../src/services/tenantOnboarding.service');

async function main() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const users = await User.find({
    $or: [{ isOwner: true }, { isSuper: true }, { isSaby: true }],
    deletedAt: null,
  }).select('_id tenantId email isOwner isSuper isSaby onboardingStatus onboardingComplete requiresOnboarding');

  let processed = 0;
  let updated = 0;
  let failed = 0;

  for (const user of users) {
    processed += 1;
    try {
      const onboarding = await tenantOnboardingService.getOnboardingStatus({
        userId: user._id,
      });

      const next = {
        onboardingStatus: onboarding?.completed
          ? 'complete'
          : onboarding?.requiresOnboarding
            ? 'required'
            : 'none',
        onboardingComplete: Boolean(onboarding?.completed),
        requiresOnboarding: Boolean(
          onboarding?.requiresOnboarding && !onboarding?.completed
        ),
        onboardingCompletedAt: onboarding?.completed ? new Date() : null,
      };

      const changed =
        user.onboardingStatus !== next.onboardingStatus ||
        user.onboardingComplete !== next.onboardingComplete ||
        user.requiresOnboarding !== next.requiresOnboarding ||
        (Boolean(user.onboardingCompletedAt) !== Boolean(next.onboardingCompletedAt));

      if (changed) {
        await User.updateOne({ _id: user._id }, { $set: next });
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          userId: String(user._id),
          tenantId: String(user.tenantId || ''),
          email: String(user.email || ''),
          error: error?.message || String(error),
        })
      );
    }
  }

  console.log(
    JSON.stringify({
      processed,
      updated,
      failed,
    })
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
