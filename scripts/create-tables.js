#!/usr/bin/env node

/**
 * PostgreSQL Database Table Creation Script
 *
 * This script creates all required tables in the remote PostgreSQL database
 * using the SQL file: src/scripts/create_all_tables.sql
 */

const fs = require('fs');
const path = require('path');
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

async function createTables() {
  const pool = new Pool(dbConfig);

  try {
    log('\n🚀 Starting PostgreSQL table creation...', colors.cyan);
    log('============================================', colors.cyan);

    // Test connection
    log('\n🔌 Testing database connection...', colors.blue);
    log(`📊 Host: ${dbConfig.host}:${dbConfig.port}`, colors.blue);
    log(`👤 User: ${dbConfig.user}`, colors.blue);
    log(`🗄️  Database: ${dbConfig.database}`, colors.blue);

    const client = await pool.connect();

    // Test query
    const versionResult = await client.query('SELECT version()');
    log(`✅ Connected to PostgreSQL`, colors.green);
    log(
      `📋 Version: ${versionResult.rows[0].version
        .split(' ')
        .slice(0, 2)
        .join(' ')}`,
      colors.green
    );

    // Read SQL file
    const sqlFilePath = path.join(
      __dirname,
      '../src/scripts/create_all_tables.sql'
    );
    log(`\n📖 Reading SQL file: ${sqlFilePath}`, colors.blue);

    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`SQL file not found: ${sqlFilePath}`);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    log(`✅ SQL file loaded (${sqlContent.length} characters)`, colors.green);

    // Execute SQL
    log('\n🔨 Creating database tables...', colors.yellow);
    log('This may take a few moments...', colors.yellow);

    const startTime = Date.now();
    await client.query(sqlContent);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    log(`✅ All tables created successfully! (${duration}s)`, colors.green);

    // Verify tables were created
    log('\n🔍 Verifying created tables...', colors.blue);
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    if (tablesResult.rows.length > 0) {
      log(`✅ Found ${tablesResult.rows.length} tables:`, colors.green);
      tablesResult.rows.forEach((row, index) => {
        log(`   ${index + 1}. ${row.table_name}`, colors.green);
      });
    } else {
      log('⚠️  No tables found in public schema', colors.yellow);
    }

    // Check extensions
    log('\n🔧 Checking extensions...', colors.blue);
    const extensionsResult = await client.query(`
      SELECT extname 
      FROM pg_extension 
      WHERE extname = 'uuid-ossp'
    `);

    if (extensionsResult.rows.length > 0) {
      log('✅ UUID extension is installed', colors.green);
    } else {
      log('⚠️  UUID extension not found', colors.yellow);
    }

    client.release();

    log(
      '\n🎉 Database setup completed successfully!',
      colors.bright + colors.green
    );
    log('============================================', colors.cyan);
  } catch (error) {
    log('\n❌ Error creating tables:', colors.red);

    if (error.code) {
      log(`📋 Error Code: ${error.code}`, colors.red);
    }

    log(`📋 Error Message: ${error.message}`, colors.red);

    if (error.code === 'ECONNREFUSED') {
      log('\n💡 Troubleshooting tips:', colors.yellow);
      log('   - Check if PostgreSQL server is running', colors.yellow);
      log('   - Verify host and port configuration', colors.yellow);
      log('   - Check network connectivity', colors.yellow);
    } else if (error.code === '28000') {
      log('\n💡 Troubleshooting tips:', colors.yellow);
      log('   - Check username and password', colors.yellow);
      log('   - Verify database exists', colors.yellow);
      log('   - Check pg_hba.conf configuration', colors.yellow);
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  console.log(`
${colors.cyan}PostgreSQL Table Creation Script${colors.reset}

Usage: npm run create-table [options]

Options:
  --help, -h    Show this help message

Environment Variables:
  POSTGRES_HOST     PostgreSQL host (default: 20.169.129.160)
  POSTGRES_PORT     PostgreSQL port (default: 5432)
  POSTGRES_USER     PostgreSQL user (default: sabyagentic_user)
  POSTGRES_PASSWORD PostgreSQL password
  POSTGRES_DB       PostgreSQL database (default: halograph)

Examples:
  npm run create-table
  POSTGRES_HOST=localhost npm run create-table
`);
  process.exit(0);
}

// Run the script
if (require.main === module) {
  createTables().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = { createTables };
