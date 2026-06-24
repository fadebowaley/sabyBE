#!/usr/bin/env node
/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../src/config/config');
const { ProjectForm, User } = require('../src/models');
const projectFormService = require('../src/services/projectForm.service');

const SYSTEM_TARGETS = ['user_profile', 'node_profile'];
const SYSTEM_CATEGORY = 'system';

const parseArgs = (argv) => {
  const args = {
    apply: false,
    tenants: [],
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (part === '--apply') {
      args.apply = true;
      continue;
    }
    if (part === '--json') {
      args.json = true;
      continue;
    }
    if (part === '--tenant' && argv[index + 1]) {
      args.tenants.push(String(argv[index + 1]).trim());
      index += 1;
    }
  }

  args.tenants = Array.from(new Set(args.tenants.filter(Boolean)));
  return args;
};

const systemFormFilter = (tenantId, target) => ({
  tenantId,
  'metadata.systemTarget': target,
  $or: [
    { 'identity.category': SYSTEM_CATEGORY },
    { 'metadata.formCategory': SYSTEM_CATEGORY },
  ],
});

const classifyForms = (forms) => {
  const totals = {
    total: forms.length,
    undeleted: 0,
    deleted: 0,
    live: 0,
    nonLive: 0,
  };

  const items = forms.map((form) => {
    const deleted = Boolean(form.deletedAt);
    const live =
      !deleted &&
      String(form.status || '').toLowerCase() === 'active' &&
      String(form?.identity?.status || '').toLowerCase() === 'published';

    if (deleted) {
      totals.deleted += 1;
    } else {
      totals.undeleted += 1;
      if (live) totals.live += 1;
      else totals.nonLive += 1;
    }

    return {
      id: String(form._id),
      projectId: form.projectId,
      publicRef: form.publicRef || null,
      shareRef: form.shareRef || null,
      status: form.status || null,
      identityStatus: form?.identity?.status || null,
      deletedAt: form.deletedAt || null,
      updatedAt: form.updatedAt || null,
      createdAt: form.createdAt || null,
      live,
    };
  });

  return { totals, items };
};

const getTenantIds = async (requestedTenantIds) => {
  if (requestedTenantIds.length > 0) return requestedTenantIds;

  const [userTenantIds, formTenantIds] = await Promise.all([
    User.distinct('tenantId', { tenantId: { $nin: [null, ''] } }),
    ProjectForm.distinct('tenantId', {
      tenantId: { $nin: [null, ''] },
      $or: [
        { 'identity.category': SYSTEM_CATEGORY },
        { 'metadata.formCategory': SYSTEM_CATEGORY },
      ],
    }),
  ]);

  return Array.from(new Set([...userTenantIds, ...formTenantIds].filter(Boolean))).sort();
};

const pickActor = async (tenantId) =>
  User.findOne({
    tenantId,
    $or: [{ isOwner: true }, { isSuper: true }, { isSaby: true }],
  })
    .sort({ isSaby: -1, isSuper: -1, isOwner: -1, createdAt: 1 })
    .select('_id email firstname lastname tenantId isOwner isSuper isSaby');

const repairTenantTarget = async ({ tenantId, target, actor }) => {
  const canonical = await projectFormService.getSystemProjectFormForTenant({
    tenantId,
    target,
    syncTemplate: true,
    createdBy: actor._id,
  });

  if (
    String(canonical.status || '').toLowerCase() !== 'active' ||
    String(canonical?.identity?.status || '').toLowerCase() !== 'published'
  ) {
    await canonical.publish();
  }

  return canonical;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  try {
    const tenantIds = await getTenantIds(args.tenants);
    const report = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const tenantId of tenantIds) {
      // eslint-disable-next-line no-await-in-loop
      const actor = await pickActor(tenantId);
      const tenantEntry = {
        tenantId,
        actor: actor
          ? {
              id: String(actor._id),
              email: actor.email,
              name: `${actor.firstname || ''} ${actor.lastname || ''}`.trim(),
              isOwner: Boolean(actor.isOwner),
              isSuper: Boolean(actor.isSuper),
              isSaby: Boolean(actor.isSaby),
            }
          : null,
        targets: {},
      };

      // eslint-disable-next-line no-restricted-syntax
      for (const target of SYSTEM_TARGETS) {
        // eslint-disable-next-line no-await-in-loop
        const beforeForms = await ProjectForm.find(systemFormFilter(tenantId, target))
          .sort({ updatedAt: -1, createdAt: -1 })
          .select(
            'projectId publicRef shareRef status identity.status deletedAt createdAt updatedAt'
          )
          .lean();

        const targetReport = {
          before: classifyForms(beforeForms),
          repaired: false,
          skipped: false,
          reason: null,
          canonical: null,
          after: null,
        };

        if (args.apply) {
          if (!actor) {
            targetReport.skipped = true;
            targetReport.reason = 'No owner/super/saby user found for tenant';
          } else {
            // eslint-disable-next-line no-await-in-loop
            const canonical = await repairTenantTarget({ tenantId, target, actor });
            targetReport.repaired = true;
            targetReport.canonical = {
              id: String(canonical._id),
              projectId: canonical.projectId,
              publicRef: canonical.publicRef || null,
              shareRef: canonical.shareRef || null,
              status: canonical.status || null,
              identityStatus: canonical?.identity?.status || null,
            };
          }
        }

        // eslint-disable-next-line no-await-in-loop
        const afterForms = await ProjectForm.find(systemFormFilter(tenantId, target))
          .sort({ updatedAt: -1, createdAt: -1 })
          .select(
            'projectId publicRef shareRef status identity.status deletedAt createdAt updatedAt'
          )
          .lean();

        targetReport.after = classifyForms(afterForms);
        tenantEntry.targets[target] = targetReport;
      }

      report.push(tenantEntry);
    }

    if (args.json) {
      console.log(JSON.stringify({ apply: args.apply, tenants: report }, null, 2));
    } else {
      console.log(
        `${args.apply ? 'REPAIR' : 'AUDIT'} system forms report for ${report.length} tenant(s)`
      );
      report.forEach((tenant) => {
        console.log(`\nTenant ${tenant.tenantId}`);
        console.log(
          `  Actor: ${
            tenant.actor
              ? `${tenant.actor.email} (${tenant.actor.name || 'no-name'})`
              : 'missing owner/super/saby actor'
          }`
        );
        SYSTEM_TARGETS.forEach((target) => {
          const item = tenant.targets[target];
          console.log(
            `  ${target}: before live=${item.before.totals.live}, before nonLive=${item.before.totals.nonLive}, before deleted=${item.before.totals.deleted}, after live=${item.after.totals.live}, after nonLive=${item.after.totals.nonLive}, repaired=${item.repaired}, skipped=${item.skipped}`
          );
          if (item.reason) {
            console.log(`    reason: ${item.reason}`);
          }
          if (item.canonical) {
            console.log(
              `    canonical: ${item.canonical.projectId} (${item.canonical.status}/${item.canonical.identityStatus})`
            );
          }
        });
      });
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to audit/repair system forms:', error);
  process.exit(1);
});
