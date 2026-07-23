#!/usr/bin/env node
/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../config/config');
const { ProjectForm } = require('../models');

const getArg = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
};

const hasFlag = (flag) => process.argv.includes(flag);

const buildQuery = (tenantId) => {
  const query = {
    $or: [
      { 'capabilities.experience.compliance.reportingPeriod.weekStartsOn': { $exists: true } },
      { 'capabilities.experience.compliance.reportingPeriod.timezone': { $exists: true } },
      { 'capabilities.experience.compliance.submissionPolicy.closeWindowAtPeriodEnd': { $exists: true } },
      { 'capabilities.experience.compliance.enforcement.closeWindowAtPeriodEnd': { $exists: true } },
      { 'capabilities.experience.compliance.autoLockMonthEnd': { $exists: true } },
      {
        'metadata.moduleStudio.document.settings.capabilities.experience.compliance.reportingPeriod.weekStartsOn':
          { $exists: true },
      },
      {
        'metadata.moduleStudio.document.settings.capabilities.experience.compliance.reportingPeriod.timezone':
          { $exists: true },
      },
      {
        'metadata.moduleStudio.document.settings.capabilities.experience.compliance.submissionPolicy.closeWindowAtPeriodEnd':
          { $exists: true },
      },
      {
        'metadata.moduleStudio.document.settings.capabilities.experience.compliance.enforcement.closeWindowAtPeriodEnd':
          { $exists: true },
      },
      {
        'metadata.moduleStudio.document.settings.capabilities.experience.compliance.autoLockMonthEnd':
          { $exists: true },
      },
      { 'permSettings.reportingPeriod.weekStartsOn': { $exists: true } },
      { 'permSettings.reportingPeriod.timezone': { $exists: true } },
      { 'permSettings.submissionPolicy.closeWindowAtPeriodEnd': { $exists: true } },
      { 'permSettings.enforcement.closeWindowAtPeriodEnd': { $exists: true } },
      { 'permSettings.autoLockMonthEnd': { $exists: true } },
    ],
  };

  if (tenantId) {
    query.tenantId = tenantId;
  }

  return query;
};

const unsetPatch = {
  'capabilities.experience.compliance.reportingPeriod.weekStartsOn': '',
  'capabilities.experience.compliance.reportingPeriod.timezone': '',
  'capabilities.experience.compliance.submissionPolicy.closeWindowAtPeriodEnd': '',
  'capabilities.experience.compliance.enforcement.closeWindowAtPeriodEnd': '',
  'capabilities.experience.compliance.autoLockMonthEnd': '',
  'metadata.moduleStudio.document.settings.capabilities.experience.compliance.reportingPeriod.weekStartsOn':
    '',
  'metadata.moduleStudio.document.settings.capabilities.experience.compliance.reportingPeriod.timezone':
    '',
  'metadata.moduleStudio.document.settings.capabilities.experience.compliance.submissionPolicy.closeWindowAtPeriodEnd':
    '',
  'metadata.moduleStudio.document.settings.capabilities.experience.compliance.enforcement.closeWindowAtPeriodEnd':
    '',
  'metadata.moduleStudio.document.settings.capabilities.experience.compliance.autoLockMonthEnd':
    '',
  'permSettings.reportingPeriod.weekStartsOn': '',
  'permSettings.reportingPeriod.timezone': '',
  'permSettings.submissionPolicy.closeWindowAtPeriodEnd': '',
  'permSettings.enforcement.closeWindowAtPeriodEnd': '',
  'permSettings.autoLockMonthEnd': '',
};

const run = async () => {
  const tenantArg = getArg('--tenant');
  const tenantId = tenantArg ? String(tenantArg).trim() : '';
  const apply = hasFlag('--apply');
  const query = buildQuery(tenantId);

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);

    const matched = await ProjectForm.countDocuments(query);
    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          tenantId: tenantId || null,
          matched,
        },
        null,
        2
      )
    );

    if (!apply || matched === 0) {
      return;
    }

    const result = await ProjectForm.updateMany(query, {
      $unset: unsetPatch,
    });

    console.log(
      JSON.stringify(
        {
          mode: 'apply',
          tenantId: tenantId || null,
          matched: result.matchedCount ?? matched,
          modified: result.modifiedCount ?? 0,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      'remove-legacy-compliance-fields failed:',
      error?.message || error
    );
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_error) {}
  }
};

run();
