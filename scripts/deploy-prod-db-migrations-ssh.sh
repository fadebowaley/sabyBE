#!/usr/bin/env bash

# Apply production Postgres migrations over SSH against running Docker containers.
# This script is built for VM setups where containers already exist (no compose needed).
#
# Safe defaults:
# - Creates SQL backup before schema changes
# - Runs SQL with ON_ERROR_STOP enabled
# - Applies migrations in deterministic order
#
# Note:
# - SSH key is optional. If omitted, SSH will prompt for password.
# - Backfill is disabled by default until the backend image with new script is live.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: deploy-prod-db-migrations-ssh.sh --host <vm-ip-or-hostname> [options]

Options:
  --host <host>                Remote VM host/IP (required)
  --user <user>                SSH user (default: saby)
  --key <path>                 SSH private key (optional)
  --postgres-container <name>  Postgres container name (default: saby-postgres)
  --backend-container <name>   Backend container name (default: saby-backend)
  -h, --help                   Show help

Environment toggles:
  CREATE_BACKUP=1              Create DB backup before migration (default: 1)
  RUN_BACKFILL=0               Run compliance backfill after migration (default: 0)
EOF
}

REMOTE_HOST=""
REMOTE_USER="saby"
SSH_KEY=""
POSTGRES_CONTAINER="saby-postgres"
BACKEND_CONTAINER="saby-backend"
CREATE_BACKUP="${CREATE_BACKUP:-1}"
RUN_BACKFILL="${RUN_BACKFILL:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS=(
  "${SCRIPT_DIR}/../src/scripts/migrations/008_submission_activity_log_columns.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/009_add_node_reference_to_form_submissions.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/010_submission_compliance_sync.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/011_create_form_submission_enriched_view.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/012_optimize_module_report_table_indexes.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/add_workflow_tables.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/013_create_copilot_tables.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/014_create_copilot_entity_resolution_logs.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/015_create_copilot_node_dimensions.sql"
  "${SCRIPT_DIR}/../src/scripts/migrations/016_add_action_event_result_json.sql"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      REMOTE_HOST="${2:-}"
      shift 2
      ;;
    --user)
      REMOTE_USER="${2:-}"
      shift 2
      ;;
    --key)
      SSH_KEY="${2:-}"
      shift 2
      ;;
    --postgres-container)
      POSTGRES_CONTAINER="${2:-}"
      shift 2
      ;;
    --backend-container)
      BACKEND_CONTAINER="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${REMOTE_HOST}" ]]; then
  echo "Error: --host is required."
  usage
  exit 1
fi

for migration in "${MIGRATIONS[@]}"; do
  if [[ ! -f "${migration}" ]]; then
    echo "Error: local migration file not found: ${migration}"
    exit 1
  fi
done

SSH_CMD=(ssh)
if [[ -n "${SSH_KEY}" ]]; then
  if [[ ! -f "${SSH_KEY/#\~/$HOME}" ]]; then
    echo "Error: SSH key not found at ${SSH_KEY}"
    exit 1
  fi
  SSH_CMD+=(-i "${SSH_KEY}")
fi
SSH_CMD+=("${REMOTE_USER}@${REMOTE_HOST}")

echo "=== Production DB migration start ==="
echo "Host: ${REMOTE_HOST}"
echo "User: ${REMOTE_USER}"
echo "Postgres container: ${POSTGRES_CONTAINER}"
echo "Backend container: ${BACKEND_CONTAINER}"

echo "[1/4] Checking docker connectivity and container presence"
"${SSH_CMD[@]}" "docker ps --format '{{.Names}}' | grep -Fx '${POSTGRES_CONTAINER}' >/dev/null && docker ps --format '{{.Names}}' | grep -Fx '${BACKEND_CONTAINER}' >/dev/null"

if [[ "${CREATE_BACKUP}" == "1" ]]; then
  echo "[2/4] Creating backup from ${POSTGRES_CONTAINER}"
  TS="$(date +%Y%m%d_%H%M%S)"
  BACKUP_PATH="${HOME}/saby_pg_pre_migration_${TS}.sql"
  "${SSH_CMD[@]}" "docker exec -e PGPASSWORD=\"\${POSTGRES_PASSWORD}\" ${POSTGRES_CONTAINER} sh -lc 'pg_dump -U \"\${POSTGRES_USER}\" -d \"\${POSTGRES_DB}\"'" > "${BACKUP_PATH}"
  echo "Backup saved locally: ${BACKUP_PATH}"
else
  echo "[2/4] Backup skipped (CREATE_BACKUP=0)"
fi

echo "[3/4] Applying Postgres migrations"
for migration in "${MIGRATIONS[@]}"; do
  migration_name="$(basename "${migration}")"
  echo "  - Applying ${migration_name}"
  cat "${migration}" | "${SSH_CMD[@]}" \
    "docker exec -i -e PGPASSWORD=\"\${POSTGRES_PASSWORD}\" ${POSTGRES_CONTAINER} sh -lc 'psql -v ON_ERROR_STOP=1 -U \"\${POSTGRES_USER}\" -d \"\${POSTGRES_DB}\"'"
done

if [[ "${RUN_BACKFILL}" == "1" ]]; then
  echo "[4/4] Running compliance backfill in ${BACKEND_CONTAINER}"
  "${SSH_CMD[@]}" "docker exec -i ${BACKEND_CONTAINER} node src/scripts/backfill-compliance-tracking.js"
else
  echo "[4/4] Backfill skipped (RUN_BACKFILL=0)"
fi

echo "=== Production DB migration finished successfully ==="
