#!/bin/bash
# Quick schema fix for submission_activity_log

echo "🔧 Fixing submission_activity_log schema..."

# Run SQL fix
psql -h 20.169.129.160 -U sabyagentic_user -d halograph -f fix-activity-log-schema.sql

echo "✅ Schema fix complete!"
echo "Now restart the backend and run the test again."
