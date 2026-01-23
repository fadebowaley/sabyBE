/**
 * Create Production Tables
 * 
 * Creates DLQ, System Alerts, and Idempotency Cache tables
 */

const { postgresPool } = require('./src/config/postgres');
const fs = require('fs');
const logger = require('./src/config/logger');

async function createProductionTables() {
  console.log('\n🔧 Creating production tables...\n');

  try {
    const sql = fs.readFileSync('create-dlq-tables.sql', 'utf-8');
    
    await postgresPool.query(sql);
    
    console.log('✅ dead_letter_queue table created');
    console.log('✅ system_alerts table created');
    console.log('✅ idempotency_cache table created');
    
    // Verify tables exist
    const result = await postgresPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('dead_letter_queue', 'system_alerts', 'idempotency_cache')
      ORDER BY table_name
    `);
    
    console.log('\n📊 Tables created:');
    result.rows.forEach((row) => console.log(`  ✅ ${row.table_name}`));
    
    // Count columns
    const columns = await postgresPool.query(`
      SELECT table_name, COUNT(*) as column_count
      FROM information_schema.columns 
      WHERE table_name IN ('dead_letter_queue', 'system_alerts', 'idempotency_cache')
      GROUP BY table_name
      ORDER BY table_name
    `);
    
    console.log('\n📋 Column counts:');
    columns.rows.forEach((row) => 
      console.log(`  ${row.table_name}: ${row.column_count} columns`)
    );
    
    console.log('\n🎉 Production tables setup complete!\n');
    console.log('Next steps:');
    console.log('1. Restart backend: npm run dev');
    console.log('2. Test with: node test-perm-unified-submission.js\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to create tables:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createProductionTables();


