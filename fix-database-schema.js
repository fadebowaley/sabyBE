/**
 * Fix Database Schema - Add node_id to submission_activity_log
 * 
 * Issue: Column "node_id" missing from submission_activity_log table
 * Fix: Add node_id column and index
 */

const { postgresPool } = require('./src/config/postgres');

async function fixDatabaseSchema() {
  console.log('\n🔧 Fixing Database Schema...\n');

  try {
    // 1. Add node_id column
    console.log('📝 Step 1: Adding node_id column...');
    await postgresPool.query(`
      ALTER TABLE submission_activity_log 
      ADD COLUMN IF NOT EXISTS node_id VARCHAR(64);
    `);
    console.log('✅ node_id column added\n');

    // 2. Add index
    console.log('📝 Step 2: Creating index...');
    await postgresPool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_log_node_id 
      ON submission_activity_log(node_id);
    `);
    console.log('✅ Index created\n');

    // 3. Verify columns
    console.log('📝 Step 3: Verifying schema...');
    const result = await postgresPool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'submission_activity_log'
      ORDER BY ordinal_position;
    `);

    console.log('\n📊 submission_activity_log columns:');
    result.rows.forEach((row) => {
      const checkmark = row.column_name === 'node_id' ? '✅' : '  ';
      console.log(`${checkmark} ${row.column_name} (${row.data_type})`);
    });

    console.log('\n🎉 Database schema fix complete!\n');
    console.log('Next steps:');
    console.log('1. Backend should auto-reload (nodemon)');
    console.log('2. Start worker: node src/workers/submission.worker.js');
    console.log('3. Run test: node test-perm-unified-submission.js\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Schema fix failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run fix
fixDatabaseSchema();


