const TenantConfig = require('../models/tenantConfig.model');

const DEFAULT_UI = { sections: [] };

const buildFallbackConfig = (tenantId, entityType) => ({
  tenantId,
  entityType,
  fields: [],
  ui: DEFAULT_UI,
  version: 1,
});

const getTenantConfig = async (tenantId, entityType) => {
  return TenantConfig.findOne({ tenantId, entityType }).lean();
};

const upsertTenantConfig = async (tenantId, entityType, payload, userId) => {
  const fields = payload.fields || [];
  const ui = payload.ui || DEFAULT_UI;
  const update = {
    $set: {
      fields,
      ui,
      updatedBy: userId || null,
    },
    $setOnInsert: {
      tenantId,
      entityType,
      createdBy: userId || null,
    },
  };

  if (typeof payload.version === 'number') {
    update.$set.version = payload.version;
  } else {
    update.$inc = { version: 1 };
  }

  const config = await TenantConfig.findOneAndUpdate(
    { tenantId, entityType },
    update,
    { new: true, upsert: true }
  ).lean();

  return config;
};

module.exports = {
  getTenantConfig,
  upsertTenantConfig,
  buildFallbackConfig,
};

