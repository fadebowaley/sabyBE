# Database Table Creation Script

This script automatically creates all necessary PostgreSQL tables for the Halo Backend application.

## Usage

```bash
npm run create-table
```

## What it does

The script executes the following SQL files in order:

1. **`src/scripts/create_form_submissions_table.sql`**
   - Creates the `form_submissions` table
   - Sets up indexes for optimal query performance
   - Adds project name and category columns

2. **`src/scripts/create_submission_activity_log_table.sql`**
   - Creates the `submission_activity_log` table
   - Sets up indexes for activity tracking
   - Tracks submission processing status

3. **`src/scripts/update_activity_log_table.sql`**
   - Adds additional columns to the activity log table
   - Creates indexes for the new columns

## Prerequisites

- Docker must be running
- Staging environment must be started: `./docker-build.sh start staging`
- PostgreSQL container must be running

## Output

The script provides colored console output showing:
- ✅ Success messages for each operation
- ⚠️ Warnings for non-critical issues
- ❌ Error messages for failures
- 📊 Summary of successful operations

## Tables Created

### form_submissions
- **Primary Key**: UUID with auto-generation
- **Core Fields**: tenant_id, project_id, form_id, node_id, user_id
- **Data Fields**: data (JSONB), meta (JSONB), status, source
- **Timestamps**: created_at, updated_at
- **Additional Fields**: project_name, project_category

### submission_activity_log
- **Primary Key**: Auto-incrementing integer
- **Core Fields**: tenant_id, project_id, form_id, user_id
- **Activity Fields**: action, status, job_id, message
- **Timestamp**: created_at
- **Additional Fields**: project_name, project_category

## Troubleshooting

If the script fails:
1. Ensure the staging environment is running: `./docker-build.sh status staging`
2. Check PostgreSQL container: `docker ps | grep halo-staging-postgres`
3. Verify SQL files exist in `src/scripts/`
4. Check Docker logs: `docker logs halo-staging-postgres`

## Manual Execution

You can also run individual SQL files manually:

```bash
# Execute a specific SQL file
cat src/scripts/create_form_submissions_table.sql | docker exec -i halo-staging-postgres psql -U postgres -d halo-staging
```
