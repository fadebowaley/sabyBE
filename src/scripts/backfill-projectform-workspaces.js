#!/usr/bin/env node
/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../config/config');
const { ProjectForm } = require('../models');
const { projectFormWorkspaceService } = require('../services');

const getArg = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
};

const run = async () => {
  const tenantArg = getArg('--tenant');
  const tenantId = tenantArg ? String(tenantArg).trim() : '';

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);

    const tenantIds = tenantId
      ? [tenantId]
      : await ProjectForm.distinct('tenantId', {
          deletedAt: null,
          tenantId: { $exists: true, $ne: null },
        });

    if (!tenantIds.length) {
      console.log('No tenants found for workspace backfill.');
      return;
    }

    const rows = [];
    const failures = [];
    for (const entry of tenantIds) {
      const currentTenantId = String(entry || '').trim();
      if (!currentTenantId) continue;

      try {
        const { defaultWorkspace } =
          await projectFormWorkspaceService.ensureTenantWorkspaces({
            tenantId: currentTenantId,
          });

        const result =
          await projectFormWorkspaceService.backfillFormsToDefaultWorkspace({
            tenantId: currentTenantId,
            workspaceId: defaultWorkspace.workspaceId,
          });

        rows.push({
          tenantId: currentTenantId,
          workspaceId: defaultWorkspace.workspaceId,
          matched: result.matched,
          modified: result.modified,
          status: 'ok',
          error: '',
        });
      } catch (error) {
        failures.push({
          tenantId: currentTenantId,
          error: error?.message || String(error),
        });
        rows.push({
          tenantId: currentTenantId,
          workspaceId: '',
          matched: 0,
          modified: 0,
          status: 'skipped',
          error: error?.message || String(error),
        });
      }
    }

    console.table(rows);
    if (failures.length) {
      console.warn(
        `Completed with ${failures.length} skipped tenant(s). Review table above for error details.`
      );
    }
  } catch (error) {
    console.error(
      '❌ backfill-projectform-workspaces failed:',
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
