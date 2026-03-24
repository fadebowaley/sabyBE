const mongoose = require('mongoose');

const normalizeObject = (value) => {
  if (Array.isArray(value)) return value.map(normalizeObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = normalizeObject(value[key]);
      return acc;
    }, {});
};

const isSameObject = (a, b) =>
  JSON.stringify(normalizeObject(a || {})) === JSON.stringify(normalizeObject(b || {}));

const EXPECTED_INDEXES = [
  {
    name: 'tenantId_1_name_1',
    key: { tenantId: 1, name: 1 },
    options: { unique: true, partialFilterExpression: { deletedAt: null } },
  },
  {
    name: 'tenantId_1_rank_1',
    key: { tenantId: 1, rank: 1 },
    options: {
      unique: true,
      partialFilterExpression: { deletedAt: null, isSpecial: false },
    },
  },
];

const isLegacyGlobalUniqueConflict = (index) => {
  if (!index?.unique || !index?.key || typeof index.key !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(index.key, 'tenantId')) return false;
  const keys = Object.keys(index.key);
  return keys.includes('name') || keys.includes('rank');
};

const assertLevelIndexesReady = async () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('MongoDB connection is not ready for level index validation.');
  }

  const collection = mongoose.connection.db.collection('levels');
  const existing = await collection.indexes();
  const dropped = [];
  const created = [];

  // Remove legacy global unique indexes (e.g. name_1) that break multi-tenant onboarding.
  for (let i = 0; i < existing.length; i += 1) {
    const index = existing[i];
    if (!isLegacyGlobalUniqueConflict(index)) continue;
    // eslint-disable-next-line no-await-in-loop
    await collection.dropIndex(index.name);
    dropped.push(index.name);
  }

  let current = await collection.indexes();

  for (let i = 0; i < EXPECTED_INDEXES.length; i += 1) {
    const expected = EXPECTED_INDEXES[i];
    const byName = current.find((item) => item.name === expected.name);
    if (byName) {
      const matchesKey = isSameObject(byName.key, expected.key);
      const matchesUnique = Boolean(byName.unique) === Boolean(expected.options.unique);
      const matchesPartial = isSameObject(
        byName.partialFilterExpression || {},
        expected.options.partialFilterExpression || {}
      );
      if (!matchesKey || !matchesUnique || !matchesPartial) {
        // eslint-disable-next-line no-await-in-loop
        await collection.dropIndex(byName.name);
        dropped.push(byName.name);
      }
    }
    // eslint-disable-next-line no-await-in-loop
    current = await collection.indexes();
    const stillMissing = !current.some((item) => item.name === expected.name);
    if (stillMissing) {
      // eslint-disable-next-line no-await-in-loop
      await collection.createIndex(expected.key, {
        name: expected.name,
        ...expected.options,
      });
      created.push(expected.name);
      // eslint-disable-next-line no-await-in-loop
      current = await collection.indexes();
    }
  }

  return { ok: true, dropped, created };
};

module.exports = {
  assertLevelIndexesReady,
};

