/**
 * Add Missing Columns to form_submissions table
 * - submitted_by (VARCHAR)
 * - submitted_at (TIMESTAMP)
 */

const { postgresPool } = require('./src/config/postgres');
const logger = require('./src/config/logger');

async function addMissingColumns() {
  console.log('\n🔧 Adding missing columns to form_submissions table...\n');

  try {
    // 1. Add submitted_by column
    console.log('📝 Step 1: Adding submitted_by column...');
    await postgresPool.query(`
      ALTER TABLE form_submissions 
      ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(64);
    `);
    console.log('✅ submitted_by column added\n');

    // 2. Add submitted_at column
    console.log('📝 Step 2: Adding submitted_at column...');
    await postgresPool.query(`
      ALTER TABLE form_submissions 
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    `);
    console.log('✅ submitted_at column added\n');

    // 3. Add indexes for performance
    console.log('📝 Step 3: Creating indexes...');
    await postgresPool.query(`
      CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_by 
      ON form_submissions(submitted_by);
    `);
    await postgresPool.query(`
      CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_at 
      ON form_submissions(submitted_at);
    `);
    console.log('✅ Indexes created\n');

    // 4. Verify columns
    console.log('📝 Step 4: Verifying schema...');
    const result = await postgresPool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'form_submissions'
      ORDER BY ordinal_position;
    `);

    console.log('\n📊 form_submissions columns:');
    result.rows.forEach((row) => {
      const checkmark = ['submitted_by', 'submitted_at', 'node_id'].includes(row.column_name) ? '✅' : '  ';
      console.log(`${checkmark} ${row.column_name} (${row.data_type})`);
    });

    console.log('\n🎉 Schema update complete!\n');
    console.log('Next steps:');
    console.log('1. Worker should still be running');
    console.log('2. Run test: node test-perm-unified-submission.js\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Schema fix failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run fix
addMissingColumns();


