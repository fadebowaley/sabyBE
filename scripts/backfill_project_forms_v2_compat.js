const mongoose = require('mongoose');
const config = require('../src/config/config');
const ProjectForm = require('../src/models/projectForm.model');
const Counter = require('../src/models/counter.model');
const projectFormWorkspaceService = require('../src/services/projectFormWorkspace.service');

async function generateUniqueValue(generator, existsQueryBuilder) {
  let value = generator();
  let attempts = 0;
  while (attempts < 12) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await ProjectForm.exists(existsQueryBuilder(value));
    if (!exists) return value;
    value = generator();
    attempts += 1;
  }
  throw new Error('Unable to generate unique value after multiple attempts');
}

async function backfillProjectForms() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const forms = await ProjectForm.find({ deletedAt: null }).sort({ createdAt: 1 });
  const summary = {
    scanned: forms.length,
    updated: 0,
    workspaceId: 0,
    formCategory: 0,
    schemaVersion: 0,
    enabledCapabilities: 0,
    publicSecureMode: 0,
    formId: 0,
    publicRef: 0,
    shareRef: 0,
    shareCode: 0,
  };

  for (const form of forms) {
    let changed = false;

    if (!String(form.workspaceId || '').trim()) {
      form.workspaceId = projectFormWorkspaceService.DEFAULT_WORKSPACE_ID;
      summary.workspaceId += 1;
      changed = true;
    }

    if (!form.metadata) {
      form.metadata = {};
      changed = true;
    }

    if (!form.metadata.formCategory) {
      form.metadata.formCategory = 'standard';
      summary.formCategory += 1;
      changed = true;
    }

    if (!form.metadata.schemaVersion) {
      form.metadata.schemaVersion = '1.1.0';
      summary.schemaVersion += 1;
      changed = true;
    }

    if (!Array.isArray(form.metadata.enabledCapabilities)) {
      form.metadata.enabledCapabilities = [];
      summary.enabledCapabilities += 1;
      changed = true;
    }

    if (!form.configuration) {
      form.configuration = {
        projectName: form.projectId || 'Untitled Form',
        tags: [],
        accessibility: [],
        security: 'public',
      };
      changed = true;
    }

    if (form.configuration.publicSecureMode !== 'single_qr_passwordless') {
      if (!form.configuration.publicSecureMode) {
        form.configuration.publicSecureMode = 'off';
        summary.publicSecureMode += 1;
        changed = true;
      }
    }

    if (!String(form.formId || '').trim()) {
      // eslint-disable-next-line no-await-in-loop
      form.formId = await generateUniqueValue(
        () => ProjectForm.generateFormId(),
        (value) => ({ formId: value })
      );
      summary.formId += 1;
      changed = true;
    }

    if (!String(form.publicRef || '').trim()) {
      // eslint-disable-next-line no-await-in-loop
      form.publicRef = await generateUniqueValue(
        () => ProjectForm.generatePublicRef(form.configuration?.projectName || form.projectId || 'form'),
        (value) => ({ publicRef: value })
      );
      summary.publicRef += 1;
      changed = true;
    }

    if (!String(form.shareRef || '').trim()) {
      // eslint-disable-next-line no-await-in-loop
      form.shareRef = await generateUniqueValue(
        () => ProjectForm.generateShareRef(),
        (value) => ({ shareRef: value })
      );
      summary.shareRef += 1;
      changed = true;
    }

    if (!String(form.shareCode || '').trim()) {
      // eslint-disable-next-line no-await-in-loop
      form.shareCode = await generateUniqueValue(
        () => ProjectForm.generateShareCode(),
        (value) => ({ shareCode: value })
      );
      summary.shareCode += 1;
      changed = true;
    }

    if (!String(form.formReference || '').trim()) {
      // eslint-disable-next-line no-await-in-loop
      form.formReference = await Counter.generateReference('formReference');
      changed = true;
    }

    if (!changed) continue;

    form.markModified('metadata');
    form.markModified('configuration');
    // eslint-disable-next-line no-await-in-loop
    await form.save();
    summary.updated += 1;
  }

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

backfillProjectForms().catch(async (error) => {
  console.error('Failed to backfill project forms:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
