#!/bin/bash
# Quick schema fix for submission_activity_log

echo "🔧 Fixing submission_activity_log schema..."

# Run SQL fix
psql -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-halograph_user}" -d "${POSTGRES_DB:-halograph}" -f fix-activity-log-schema.sql

echo "✅ Schema fix complete!"
echo "Now restart the backend and run the test again."
