#!/usr/bin/env node
/**
 * End-to-end test: submission flow with nodeId → activity log
 *
 * 1. Run migration 008 (adds node_id column if missing)
 * 2. Submit a test payload with nodeId
 * 3. Wait for worker to process
 * 4. Query submission_activity_log and verify node_id is present
 *
 * Usage:
 *   node scripts/test-submission-node-id.js
 *
 * Prerequisites: Backend running, Redis, MongoDB, PostgreSQL
 */

const path = require('path');
const fs = require('fs');

async function runMigration() {
  const { postgresPool } = require('../src/config/postgres');
  const migrationPath = path.join(
    __dirname,
    '../src/scripts/migrations/008_submission_activity_log_columns.sql'
  );
  if (!fs.existsSync(migrationPath)) {
    console.warn('⚠️  Migration 008 not found, skipping');
    return;
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
  for (const stmt of statements) {
    if (stmt.toLowerCase().includes('alter table') || stmt.toLowerCase().includes('create index')) {
      try {
        await postgresPool.query(stmt + ';');
        console.log('✅ Migration statement executed');
      } catch (e) {
        if (e.code === '42701') console.log('   (column/index already exists)');
        else console.warn('   Migration warning:', e.message);
      }
    }
  }
}

async function getTestFormAndTenant() {
  const mongoose = require('mongoose');
  const ProjectForm = require('../src/models/projectForm.model');
  const form = await ProjectForm.findOne().select('projectId tenantId').lean();
  if (!form) {
    throw new Error('No project form found in DB - create a form first');
  }
  return { projectId: form.projectId, tenantId: form.tenantId?.toString?.() || form.tenantId };
}

async function submitTest(projectId, tenantId, nodeId) {
  const axios = require('axios');
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000/v1';
  const token = process.env.TEST_ACCESS_TOKEN;
  if (!token) {
    console.warn('⚠️  TEST_ACCESS_TOKEN not set - submission may fail with 401');
  }
  const payload = {
    tenantId,
    projectId,
    formId: projectId,
    payload: { test_field: 'node_id_test_' + Date.now() },
    source: 'api',
    nodeId: nodeId || '000000000000000000000001', // fallback test node ID
  };
  const res = await axios.post(`${baseUrl}/submissions`, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    validateStatus: () => true,
  });
  return res;
}

async function queryActivityLog(jobId) {
  const { postgresPool } = require('../src/config/postgres');
  const r = await postgresPool.query(
    `SELECT id, job_id, node_id, action, status, created_at 
     FROM submission_activity_log 
     WHERE job_id = $1 
     ORDER BY created_at DESC 
     LIMIT 5`,
    [jobId]
  );
  return r.rows;
}

async function main() {
  console.log('\n🧪 Submission + nodeId → activity log test\n');

  try {
    // 1. Run migration
    console.log('1️⃣  Running migration 008...');
    await runMigration();

    // 2. Get test form
    console.log('2️⃣  Fetching test form...');
    const { projectId, tenantId } = await getTestFormAndTenant();
    console.log(`   projectId=${projectId}, tenantId=${tenantId}`);

    // 3. Submit with nodeId
    const testNodeId = '000000000000000000000001';
    console.log(`3️⃣  Submitting with nodeId=${testNodeId}...`);
    const res = await submitTest(projectId, tenantId, testNodeId);

    if (res.status >= 400) {
      console.error('❌ Submission failed:', res.status, res.data);
      process.exit(1);
    }
    const jobId = res.data?.jobId;
    if (!jobId) {
      console.error('❌ No jobId in response:', res.data);
      process.exit(1);
    }
    console.log(`   Job ID: ${jobId}`);

    // 4. Wait for worker
    console.log('4️⃣  Waiting 8s for worker to process...');
    await new Promise((r) => setTimeout(r, 8000));

    // 5. Query activity log
    console.log('5️⃣  Querying submission_activity_log...');
    const rows = await queryActivityLog(jobId);

    if (rows.length === 0) {
      console.warn('⚠️  No activity log rows for this job. Worker may not have run.');
      process.exit(1);
    }

    const withNodeId = rows.filter((r) => r.node_id);
    console.log(`   Rows: ${rows.length}, with node_id: ${withNodeId.length}`);
    rows.forEach((r, i) => {
      console.log(`   [${i}] action=${r.action} status=${r.status} node_id=${r.node_id ?? 'NULL'}`);
    });

    if (withNodeId.length > 0) {
      console.log('\n✅ node_id is being stored in submission_activity_log');
    } else {
      console.log('\n❌ node_id is NULL in all activity log rows - check controller/worker flow');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

main();
