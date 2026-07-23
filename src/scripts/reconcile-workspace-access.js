#!/usr/bin/env node
/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../config/config');
const { TenantOnboarding } = require('../models');
const workspaceInvitationService = require('../services/workspaceInvitation.service');

const getArg = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
};

const hasFlag = (flag) => process.argv.includes(flag);

const ACCESS_PROFILE_WORKSPACE_OWNER = 'workspace_owner';
const ACCESS_PROFILE_DATA_ADMINISTRATOR = 'data_administrator';
const ACCESS_PROFILE_EDITOR = 'editor';
const ACCESS_PROFILE_VIEWER = 'viewer';

const normalizeString = (value, fallback = '') =>
  String(value == null ? fallback : value).trim();

const resolveAccessProfileIdFromMember = (member) => {
  const normalizedRole = normalizeString(member?.role).toLowerCase();
  const explicit = normalizeString(member?.accessProfileId).toLowerCase();

  if (normalizedRole === 'owner') {
    return ACCESS_PROFILE_WORKSPACE_OWNER;
  }

  if (normalizedRole === 'editor') {
    return ACCESS_PROFILE_EDITOR;
  }

  if (normalizedRole === 'viewer') {
    return explicit === ACCESS_PROFILE_DATA_ADMINISTRATOR
      ? ACCESS_PROFILE_DATA_ADMINISTRATOR
      : ACCESS_PROFILE_VIEWER;
  }

  return explicit === ACCESS_PROFILE_DATA_ADMINISTRATOR
    ? ACCESS_PROFILE_DATA_ADMINISTRATOR
    : ACCESS_PROFILE_VIEWER;
};

const run = async () => {
  const tenantArg = getArg('--tenant');
  const tenantId = tenantArg ? String(tenantArg).trim() : '';
  const apply = hasFlag('--apply');

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);

    const query = tenantId ? { tenantId } : {};
    const onboardings = await TenantOnboarding.find(query);

    if (!onboardings.length) {
      console.log('No tenant onboarding records found.');
      return;
    }

    const rows = [];

    for (const onboarding of onboardings) {
      const currentTenantId = String(onboarding.tenantId || '').trim();
      const actorUserId = onboarding.ownerUserId;
      const touchedUsers = new Set();
      let normalizedMemberCount = 0;
      let changed = false;

      (onboarding.workspaces || [])
        .filter((workspace) => workspace?.isDeleted !== true)
        .forEach((workspace) => {
          (workspace.members || [])
            .filter((member) => member?.status === 'active')
            .forEach((member) => {
              const nextAccessProfileId = resolveAccessProfileIdFromMember(member);
              const currentAccessProfileId = normalizeString(
                member?.accessProfileId
              ).toLowerCase();

              if (currentAccessProfileId !== nextAccessProfileId) {
                member.accessProfileId = nextAccessProfileId;
                normalizedMemberCount += 1;
                changed = true;
              }

              const userId = normalizeString(member?.userId);
              if (userId) {
                touchedUsers.add(userId);
              }
            });
        });

      if (apply && changed) {
        onboarding.markModified('workspaces');
        await onboarding.save();
      }

      let syncedUsers = 0;
      if (apply) {
        for (const userId of touchedUsers) {
          await workspaceInvitationService.syncWorkspaceAccessProfilesForUser({
            tenantId: currentTenantId,
            actorUserId,
            targetUserId: userId,
          });
          syncedUsers += 1;
        }
      }

      rows.push({
        tenantId: currentTenantId,
        workspaces: (onboarding.workspaces || []).filter(
          (workspace) => workspace?.isDeleted !== true
        ).length,
        touchedUsers: touchedUsers.size,
        normalizedMembers: normalizedMemberCount,
        syncedUsers,
        mode: apply ? 'apply' : 'dry-run',
      });
    }

    console.table(rows);
  } catch (error) {
    console.error(
      'reconcile-workspace-access failed:',
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
