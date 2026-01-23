/**
 * Add Today's Date to Calendar for Testing (LOCAL DATABASE)
 *
 * This script connects to the LOCAL Docker database and adds the current date
 * to the November 2025 calendar for proj_y2sZX9llL5D3 to enable immediate compliance testing.
 *
 * Usage: node scripts/add-today-to-calendar-local.js
 */

const { Pool } = require('pg');

// Connect to LOCAL Docker database
const postgresPool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'halograph_user',
  password: 'local_test_password_2025',
  database: 'halograph',
});

async function addTodayToCalendar() {
  const projectId = 'proj_y2sZX9llL5D3';
  const month = '2025-11-01';
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  console.log("📅 Adding today's date to LOCAL calendar...");
  console.log(`   Project: ${projectId}`);
  console.log(`   Month: ${month}`);
  console.log(`   Adding date: ${today}`);

  try {
    // Test connection
    const dbTest = await postgresPool.query('SELECT current_database()');
    console.log(`   Connected to database: ${dbTest.rows[0].current_database}`);

    // First, get current calendar
    console.log('🔍 Querying database...');
    const currentCalendar = await postgresPool.query(
      'SELECT id, project_id, month, daily_config FROM event_calendar WHERE project_id = $1 AND month = $2',
      [projectId, month]
    );

    console.log(`   Query returned ${currentCalendar.rows.length} rows`);

    if (currentCalendar.rows.length === 0) {
      console.log('❌ Calendar not found!');
      await postgresPool.end();
      process.exit(1);
    }

    console.log('   Calendar found:', currentCalendar.rows[0].id);
    const dailyConfig =
      typeof currentCalendar.rows[0].daily_config === 'string'
        ? JSON.parse(currentCalendar.rows[0].daily_config)
        : currentCalendar.rows[0].daily_config;
    const currentDates = dailyConfig.dates || [];

    console.log(`   Current dates count: ${currentDates.length}`);

    // Check if today is already in the calendar
    if (currentDates.includes(today)) {
      console.log(`✅ Today's date (${today}) is already in the calendar!`);
      await postgresPool.end();
      process.exit(0);
    }

    // Add today to the dates array (at the beginning for chronological order)
    const updatedDates = [today, ...currentDates].sort();
    const updatedConfig = {
      ...dailyConfig,
      dates: updatedDates,
      total_days: updatedDates.length,
      total_expected: updatedDates.length,
    };

    // Update the calendar
    await postgresPool.query(
      'UPDATE event_calendar SET daily_config = $1 WHERE project_id = $2 AND month = $3',
      [JSON.stringify(updatedConfig), projectId, month]
    );

    console.log(`✅ Successfully added ${today} to calendar!`);
    console.log(`   Updated dates count: ${updatedDates.length}`);
    console.log(`   First 5 dates: ${updatedDates.slice(0, 5).join(', ')}`);

    // Verify
    const verify = await postgresPool.query(
      'SELECT daily_config FROM event_calendar WHERE project_id = $1 AND month = $2',
      [projectId, month]
    );

    const verifyDates = verify.rows[0].daily_config.dates;
    console.log(`\n📊 Verification:`);
    console.log(`   Total dates in calendar: ${verifyDates.length}`);
    console.log(
      `   Contains ${today}: ${
        verifyDates.includes(today) ? '✅ Yes' : '❌ No'
      }`
    );

    await postgresPool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
    await postgresPool.end();
    process.exit(1);
  }
}

// Run the script
addTodayToCalendar();


