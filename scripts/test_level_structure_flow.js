#!/usr/bin/env node

/**
 * Automated test script for level vs structure interactions.
 *
 * Usage:
 *   node scripts/test_level_structure_flow.js <ACCESS_TOKEN> <TENANT_ID>
 *
 * Requirements:
 *   - MongoDB connection configured via existing config.
 *   - Valid access token for the target tenant (same token used in FE).
 */

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const config = require('../src/config/config');
const { Level } = require('../src/models');

const ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN || process.argv[2];
const TENANT_ID = process.env.TEST_TENANT_ID || process.argv[3];

if (!ACCESS_TOKEN) {
  console.error(
    '[LEVEL/STRUCTURE TEST] Missing access token. Pass as first argument or set TEST_ACCESS_TOKEN.'
  );
  process.exit(1);
}

if (!TENANT_ID) {
  console.error(
    '[LEVEL/STRUCTURE TEST] Missing tenantId. Pass as second argument or set TEST_TENANT_ID.'
  );
  process.exit(1);
}

const authedRequest = (method, url) =>
  request(app)
    [method](url)
    .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
    .set('Content-Type', 'application/json');

const authedPost = (url) => authedRequest('post', url);
const authedPatch = (url) => authedRequest('patch', url);
const authedDelete = (url) => authedRequest('delete', url);

async function countLevels(tag) {
  const count = await Level.countDocuments({
    tenantId: TENANT_ID,
    deletedAt: null,
  });
  console.log(
    `[LEVEL/STRUCTURE TEST] ${tag} level count for tenant ${TENANT_ID}: ${count}`
  );
  return count;
}

async function main() {
  console.log('[LEVEL/STRUCTURE TEST] Connecting to MongoDB...');
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('[LEVEL/STRUCTURE TEST] MongoDB connected');

  try {
    const initialCount = await countLevels('Initial');

    // Step 1: Create structure (and level if needed) via controller
    const timestamp = Date.now();
    const tempId = `temp-${timestamp}`;
    const levelRank = 99;
    const structurePayload = {
      structures: [
        {
          tempId,
          name: `QA Structure ${timestamp}`,
          code: `QA-${timestamp}`,
          description: 'Automated test structure',
          levelRank,
          isSpecial: false,
          isActive: true,
          type: 'administrative',
          position: { x: 0, y: 0 },
        },
      ],
    };

    console.log(
      '[LEVEL/STRUCTURE TEST] Creating structure via POST /v1/structure'
    );
    const createRes = await authedPost('/v1/structure').send(structurePayload);
    console.log('[LEVEL/STRUCTURE TEST] Create status:', createRes.status);
    console.log('[LEVEL/STRUCTURE TEST] Create body:', createRes.body);

    if (createRes.status >= 400) {
      throw new Error(
        `[LEVEL/STRUCTURE TEST] Create structure failed: ${
          createRes.status
        } ${JSON.stringify(createRes.body)}`
      );
    }

    const createdStructureId = Array.isArray(createRes.body)
      ? createRes.body[0]
      : createRes.body?.id;
    if (!createdStructureId) {
      throw new Error(
        '[LEVEL/STRUCTURE TEST] Could not resolve created structure ID'
      );
    }
    console.log(
      '[LEVEL/STRUCTURE TEST] Created structure ID:',
      createdStructureId
    );

    await countLevels('After create');

    // Step 2: Update structure (toggle special) via PATCH endpoint
    console.log(
      '[LEVEL/STRUCTURE TEST] Patching structure via PATCH /v1/structure/:id'
    );
    const patchRes = await authedPatch(
      `/v1/structure/${createdStructureId}`
    ).send({ isSpecial: true });
    console.log('[LEVEL/STRUCTURE TEST] Patch status:', patchRes.status);
    console.log('[LEVEL/STRUCTURE TEST] Patch body:', patchRes.body);

    if (patchRes.status >= 400) {
      throw new Error(
        `[LEVEL/STRUCTURE TEST] Patch failed: ${
          patchRes.status
        } ${JSON.stringify(patchRes.body)}`
      );
    }

    // Step 3: Delete structure via DELETE endpoint
    console.log(
      '[LEVEL/STRUCTURE TEST] Deleting structure via DELETE /v1/structure/:id'
    );
    const deleteRes = await authedDelete(`/v1/structure/${createdStructureId}`);
    console.log('[LEVEL/STRUCTURE TEST] Delete status:', deleteRes.status);
    console.log('[LEVEL/STRUCTURE TEST] Delete body:', deleteRes.body);

    if (deleteRes.status >= 400) {
      throw new Error(
        `[LEVEL/STRUCTURE TEST] Delete failed: ${
          deleteRes.status
        } ${JSON.stringify(deleteRes.body)}`
      );
    }

    await countLevels('After delete');

    console.log('[LEVEL/STRUCTURE TEST] Test run completed successfully');
  } catch (error) {
    console.error('[LEVEL/STRUCTURE TEST] Error during test run:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('[LEVEL/STRUCTURE TEST] MongoDB connection closed');
  }
}

main();
