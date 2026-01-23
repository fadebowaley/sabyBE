const { postgresPool } = require('./src/config/postgres');

(async () => {
  try {
    // Check total
    const total = await postgresPool.query('SELECT COUNT(*) as count FROM form_submissions');
    console.log('📊 Total submissions in database:', total.rows[0].count);
    
    // Check by tenant
    const byTenant = await postgresPool.query('SELECT tenant_id, COUNT(*) as count FROM form_submissions GROUP BY tenant_id');
    console.log('\n📊 Submissions by tenant:');
    byTenant.rows.forEach(row => {
      console.log(`  Tenant: ${row.tenant_id} | Count: ${row.count}`);
    });
    
    // Check for specific tenant
    const loggedInTenant = 'hWiWJ_X0m6';
    const userSubmissions = await postgresPool.query(
      'SELECT COUNT(*) as count FROM form_submissions WHERE tenant_id = $1',
      [loggedInTenant]
    );
    console.log(`\n🔍 Your tenant (${loggedInTenant}) has:`, userSubmissions.rows[0].count, 'submissions');
    
    // Show sample data
    const sample = await postgresPool.query(
      'SELECT id, tenant_id, node_id, month, perm_enabled FROM form_submissions LIMIT 5'
    );
    console.log('\n📋 Sample submissions:');
    sample.rows.forEach(row => {
      console.log(`  ID: ${row.id.substring(0, 8)}... | Tenant: ${row.tenant_id} | Node: ${row.node_id}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();


