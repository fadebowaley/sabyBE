#!/usr/bin/env node

/**
 * PostgreSQL Database Table Verification Script
 *
 * This script verifies that all required tables exist in the remote PostgreSQL database
 */

const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection configuration
const dbConfig = {
  host: process.env.POSTGRES_HOST || 'postgres',
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || 'sabyagentic_user',
  password:
    process.env.POSTGRES_PASSWORD ||
    'WcKoT/m9hFGMaiztjci/reLyMVln9qE0ReAaHc0Cb8E=',
  database: process.env.POSTGRES_DB || 'halograph',
  ssl: false,
  connectionTimeoutMillis: 10000,
};

// Expected tables
const expectedTables = [
  'form_submissions',
  'form_templates',
  'form_validation_rules',
  'submission_activity_log',
];

// Expected views
const expectedViews = ['recent_submissions', 'submission_stats_by_project'];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function verifyTables() {
  const pool = new Pool(dbConfig);

  try {
    log('\n🔍 Verifying PostgreSQL Database Setup...', colors.cyan);
    log('=========================================', colors.cyan);

    const client = await pool.connect();

    // Connection info
    log(
      `\n📊 Database: ${dbConfig.database} on ${dbConfig.host}:${dbConfig.port}`,
      colors.blue
    );

    // Get database version
    const versionResult = await client.query('SELECT version()');
    log(
      `📋 PostgreSQL Version: ${versionResult.rows[0].version
        .split(' ')
        .slice(0, 2)
        .join(' ')}`,
      colors.blue
    );

    // Check tables
    log('\n📋 Checking Tables...', colors.cyan);
    const tablesResult = await client.query(`
      SELECT table_name, table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const existingTables = tablesResult.rows.filter(
      (row) => row.table_type === 'BASE TABLE'
    );
    const existingViews = tablesResult.rows.filter(
      (row) => row.table_type === 'VIEW'
    );

    // Verify expected tables
    let allTablesExist = true;
    expectedTables.forEach((tableName) => {
      const exists = existingTables.some((row) => row.table_name === tableName);
      if (exists) {
        log(`   ✅ ${tableName}`, colors.green);
      } else {
        log(`   ❌ ${tableName} (MISSING)`, colors.red);
        allTablesExist = false;
      }
    });

    // Verify expected views
    log('\n👁️  Checking Views...', colors.cyan);
    let allViewsExist = true;
    expectedViews.forEach((viewName) => {
      const exists = existingViews.some((row) => row.table_name === viewName);
      if (exists) {
        log(`   ✅ ${viewName}`, colors.green);
      } else {
        log(`   ❌ ${viewName} (MISSING)`, colors.red);
        allViewsExist = false;
      }
    });

    // Check extensions
    log('\n🔧 Checking Extensions...', colors.cyan);
    const extensionsResult = await client.query(`
      SELECT extname 
      FROM pg_extension 
      WHERE extname IN ('uuid-ossp', 'pg_stat_statements')
    `);

    const hasUUID = extensionsResult.rows.some(
      (row) => row.extname === 'uuid-ossp'
    );
    const hasStats = extensionsResult.rows.some(
      (row) => row.extname === 'pg_stat_statements'
    );

    log(
      `   ${hasUUID ? '✅' : '❌'} uuid-ossp extension`,
      hasUUID ? colors.green : colors.red
    );
    log(
      `   ${hasStats ? '✅' : '⚠️ '} pg_stat_statements extension`,
      hasStats ? colors.green : colors.yellow
    );

    // Check table sizes
    log('\n📊 Table Statistics...', colors.cyan);
    const statsResult = await client.query(`
      SELECT 
        schemaname,
        relname as tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes
      FROM pg_stat_user_tables 
      WHERE schemaname = 'public'
      ORDER BY relname
    `);

    if (statsResult.rows.length > 0) {
      statsResult.rows.forEach((row) => {
        log(
          `   📈 ${row.tablename}: ${row.inserts} inserts, ${row.updates} updates, ${row.deletes} deletes`,
          colors.blue
        );
      });
    } else {
      log('   📋 No statistics available yet', colors.yellow);
    }

    // Sample data check
    log('\n🔍 Sample Data Check...', colors.cyan);
    try {
      const sampleResult = await client.query(
        'SELECT COUNT(*) as count FROM form_submissions LIMIT 1'
      );
      log(
        `   📝 form_submissions: ${sampleResult.rows[0].count} records`,
        colors.blue
      );
    } catch (error) {
      log(`   ❌ Cannot query form_submissions: ${error.message}`, colors.red);
    }

    client.release();

    // Summary
    log('\n📋 Verification Summary:', colors.bright + colors.cyan);
    log('====================', colors.cyan);

    if (allTablesExist && allViewsExist && hasUUID) {
      log(
        '✅ Database setup is COMPLETE and READY!',
        colors.bright + colors.green
      );
      log('🚀 All required tables and views are present', colors.green);
      log('🔧 Required extensions are installed', colors.green);
    } else {
      log('⚠️  Database setup is INCOMPLETE', colors.yellow);
      if (!allTablesExist) {
        log('❌ Some required tables are missing', colors.red);
      }
      if (!allViewsExist) {
        log('❌ Some required views are missing', colors.red);
      }
      if (!hasUUID) {
        log('❌ UUID extension is missing', colors.red);
      }
      log('\n💡 Run: npm run create-table', colors.yellow);
    }
  } catch (error) {
    log('\n❌ Error verifying database:', colors.red);
    log(`📋 ${error.message}`, colors.red);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
if (require.main === module) {
  verifyTables().catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}

module.exports = { verifyTables };
