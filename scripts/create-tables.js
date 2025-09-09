#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function executeSQLFile(filePath, description) {
  try {
    log(`\n📄 Executing: ${description}`, 'cyan');
    log(`   File: ${path.basename(filePath)}`, 'blue');
    
    // Read the SQL file
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    // Write SQL content to a temporary file
    const tempFile = `/tmp/temp_sql_${Date.now()}.sql`;
    fs.writeFileSync(tempFile, sqlContent);
    
    // Execute the SQL file using cat and pipe
    const command = `cat ${tempFile} | docker exec -i halo-staging-postgres psql -U postgres -d halo-staging`;
    
    log(`   Executing SQL commands...`, 'yellow');
    
    const { stdout, stderr } = await execAsync(command);
    
    // Clean up temporary file
    fs.unlinkSync(tempFile);
    
    if (stderr && !stderr.includes('CREATE EXTENSION') && !stderr.includes('CREATE TABLE') && !stderr.includes('CREATE INDEX') && !stderr.includes('ALTER TABLE') && !stderr.includes('CREATE OR REPLACE') && !stderr.includes('DROP TRIGGER') && !stderr.includes('NOTICE')) {
      log(`   ⚠️  Warnings: ${stderr}`, 'yellow');
    }
    
    if (stdout) {
      log(`   ✅ Output: ${stdout.trim()}`, 'green');
    }
    
    log(`   ✅ ${description} completed successfully!`, 'green');
    return true;
    
  } catch (error) {
    // Clean up temporary file if it exists
    try {
      const tempFile = `/tmp/temp_sql_${Date.now()}.sql`;
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    log(`   ❌ Error executing ${description}:`, 'red');
    log(`   ${error.message}`, 'red');
    return false;
  }
}

async function createAllTables() {
  log('🗄️  POSTGRESQL TABLE CREATION SCRIPT', 'bright');
  log('=====================================', 'bright');
  
  // Define SQL files in execution order
  const sqlFiles = [
    {
      path: path.join(__dirname, '..', 'src', 'scripts', 'create_all_tables.sql'),
      description: 'Complete Database Schema (All Tables)'
    }
  ];
  
  let successCount = 0;
  let totalCount = sqlFiles.length;
  
  // Check if staging PostgreSQL container is running
  try {
    log('\n🔍 Checking PostgreSQL container status...', 'cyan');
    const { stdout } = await execAsync('docker ps | grep halo-staging-postgres');
    if (!stdout.includes('halo-staging-postgres')) {
      throw new Error('PostgreSQL container not running');
    }
    log('   ✅ PostgreSQL container is running', 'green');
  } catch (error) {
    log('   ❌ PostgreSQL container is not running!', 'red');
    log('   Please start the staging environment first:', 'yellow');
    log('   ./docker-build.sh start staging', 'yellow');
    process.exit(1);
  }
  
  // Execute each SQL file
  for (const sqlFile of sqlFiles) {
    if (fs.existsSync(sqlFile.path)) {
      const success = await executeSQLFile(sqlFile.path, sqlFile.description);
      if (success) {
        successCount++;
      }
    } else {
      log(`\n❌ File not found: ${sqlFile.path}`, 'red');
    }
  }
  
  // Summary
  log('\n📊 EXECUTION SUMMARY', 'bright');
  log('===================', 'bright');
  log(`✅ Successful: ${successCount}/${totalCount}`, successCount === totalCount ? 'green' : 'yellow');
  
  if (successCount === totalCount) {
    log('\n🎉 All tables created successfully!', 'green');
    log('The database is ready for use.', 'green');
    
    // Show created tables
    log('\n📋 Created Tables:', 'cyan');
    log('   • form_submissions (main submissions table)', 'blue');
    log('   • submission_activity_log (activity tracking)', 'blue');
    log('   • form_templates (template management)', 'blue');
    log('   • form_validation_rules (validation rules)', 'blue');
    
    log('\n📊 Created Views:', 'cyan');
    log('   • recent_submissions (recent submissions view)', 'blue');
    log('   • submission_stats_by_project (project statistics)', 'blue');
    
    log('\n⚡ Created Triggers:', 'cyan');
    log('   • Auto-update timestamps for all tables', 'blue');
  } else {
    log('\n⚠️  Some operations failed. Please check the errors above.', 'yellow');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  createAllTables().catch(error => {
    log(`\n�� Fatal error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { createAllTables, executeSQLFile };
