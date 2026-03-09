#!/usr/bin/env bash
set -euo pipefail

# Reproducible entry/exit flow:
# 1) create owner+tenant
# 2) login
# 3) backup pre-import snapshot
# 4) convert master CSV -> import CSV
# 5) dry-run + import
# 6) backup post-import snapshot
# 7) wipe tenant data
# 8) backup post-wipe snapshot

BASE_URL="${BASE_URL:-http://localhost:4000}"
MASTER_CSV="${MASTER_CSV:-/Users/fadebowaley/saby/sabyBackend/docs/onboarding-master-template.csv}"
STRUCTURE_NAME="${STRUCTURE_NAME:-Master Structure}"
OWNER_FIRSTNAME="${OWNER_FIRSTNAME:-Tenant}"
OWNER_LASTNAME="${OWNER_LASTNAME:-Owner}"
OWNER_PHONE="${OWNER_PHONE:-+2348000000000}"
OWNER_PASSWORD="${OWNER_PASSWORD:-SabyOwner123!}"

TS="$(date +%Y%m%d_%H%M%S)"
OWNER_EMAIL="${OWNER_EMAIL:-owner.${TS}@dummy.saby.local}"
RUN_DIR="${RUN_DIR:-/Users/fadebowaley/saby/sabyBackend/artifacts/onboarding-runs/${TS}}"

mkdir -p "${RUN_DIR}"

echo "Run directory: ${RUN_DIR}"
echo "Owner email: ${OWNER_EMAIL}"

OWNER_RAW="$(node /Users/fadebowaley/saby/sabyBackend/src/scripts/create-owner-verified.js \
  --email="${OWNER_EMAIL}" \
  --password="${OWNER_PASSWORD}" \
  --firstname="${OWNER_FIRSTNAME}" \
  --lastname="${OWNER_LASTNAME}" \
  --phone="${OWNER_PHONE}" 2>&1)"
echo "${OWNER_RAW}" > "${RUN_DIR}/owner.raw.log"
TENANT_ID="$(node -e 'const s=process.argv[1]||""; const m=s.match(/"tenantId"\s*:\s*"([^"]+)"/); process.stdout.write(m?m[1]:"");' "${OWNER_RAW}")"
OWNER_JSON="$(node -e 'const s=process.argv[1]||""; const m=s.match(/\{[\s\S]*\}\s*$/); if(!m){process.stdout.write("{}");process.exit(0)}; try{const j=JSON.parse(m[0]); process.stdout.write(JSON.stringify(j,null,2));}catch{process.stdout.write("{}");}' "${OWNER_RAW}")"
echo "${OWNER_JSON}" > "${RUN_DIR}/owner.json"
if [[ -z "${TENANT_ID}" ]]; then
  echo "Failed to resolve tenantId from owner creation. See ${RUN_DIR}/owner.raw.log"
  exit 1
fi

LOGIN_PAYLOAD="$(node -e 'process.stdout.write(JSON.stringify({email:process.argv[1],password:process.argv[2]}));' "${OWNER_EMAIL}" "${OWNER_PASSWORD}")"
LOGIN_JSON="$(curl -sS -X POST "${BASE_URL}/v1/auth/login" -H 'Content-Type: application/json' -d "${LOGIN_PAYLOAD}")"
echo "${LOGIN_JSON}" > "${RUN_DIR}/login.json"
TOKEN="$(node -e 'try{const j=JSON.parse(process.argv[1]); process.stdout.write(j?.tokens?.access?.token||"")}catch{process.stdout.write("")}' "${LOGIN_JSON}")"
if [[ -z "${TOKEN}" ]]; then
  echo "Login failed. See ${RUN_DIR}/login.json"
  exit 1
fi

node /Users/fadebowaley/saby/sabyBackend/src/scripts/backup-tenant-snapshot.js \
  --tenantId="${TENANT_ID}" \
  --outDir="${RUN_DIR}" \
  --label="pre-import" > "${RUN_DIR}/backup-pre.json"

IMPORT_CSV="${RUN_DIR}/onboarding-import.csv"
node /Users/fadebowaley/saby/sabyBackend/scripts/convert-onboarding-master.js \
  "${MASTER_CSV}" \
  "${IMPORT_CSV}" \
  "${STRUCTURE_NAME}" > "${RUN_DIR}/convert.json"

DRY_PAYLOAD="$(node -e 'const fs=require("fs");const csv=fs.readFileSync(process.argv[1],"utf8");process.stdout.write(JSON.stringify({dryRun:true,csvText:csv}));' "${IMPORT_CSV}")"
DRY_JSON="$(curl -sS -X POST "${BASE_URL}/v1/copilot/onboarding/import-csv" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "${DRY_PAYLOAD}")"
echo "${DRY_JSON}" > "${RUN_DIR}/dry-run.json"
DRY_OK="$(node -e 'try{const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.ok===true))}catch{process.stdout.write("false")}' "${DRY_JSON}")"
if [[ "${DRY_OK}" != "true" ]]; then
  echo "Dry-run failed. See ${RUN_DIR}/dry-run.json"
  exit 1
fi

IMPORT_PAYLOAD="$(node -e 'const fs=require("fs");const csv=fs.readFileSync(process.argv[1],"utf8");process.stdout.write(JSON.stringify({dryRun:false,csvText:csv}));' "${IMPORT_CSV}")"
IMPORT_JSON="$(curl -sS -X POST "${BASE_URL}/v1/copilot/onboarding/import-csv" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "${IMPORT_PAYLOAD}")"
echo "${IMPORT_JSON}" > "${RUN_DIR}/import.json"
IMPORT_OK="$(node -e 'try{const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.ok===true))}catch{process.stdout.write("false")}' "${IMPORT_JSON}")"
if [[ "${IMPORT_OK}" != "true" ]]; then
  echo "Import failed. See ${RUN_DIR}/import.json"
  exit 1
fi

node /Users/fadebowaley/saby/sabyBackend/src/scripts/backup-tenant-snapshot.js \
  --tenantId="${TENANT_ID}" \
  --outDir="${RUN_DIR}" \
  --label="post-import" > "${RUN_DIR}/backup-post-import.json"

node /Users/fadebowaley/saby/sabyBackend/src/scripts/wipe-tenant-data.js \
  --tenantId="${TENANT_ID}" \
  --yes=true > "${RUN_DIR}/wipe.json"

node /Users/fadebowaley/saby/sabyBackend/src/scripts/backup-tenant-snapshot.js \
  --tenantId="${TENANT_ID}" \
  --outDir="${RUN_DIR}" \
  --label="post-wipe" > "${RUN_DIR}/backup-post-wipe.json"

cat > "${RUN_DIR}/SUMMARY.txt" <<EOF
Repro onboarding run completed.
Base URL: ${BASE_URL}
Tenant ID: ${TENANT_ID}
Owner Email: ${OWNER_EMAIL}
Owner Password: ${OWNER_PASSWORD}
Master CSV: ${MASTER_CSV}
Converted CSV: ${IMPORT_CSV}

Artifacts:
- owner.json
- login.json
- convert.json
- dry-run.json
- import.json
- pre-import.json
- post-import.json
- post-wipe.json
- backup-pre.json
- backup-post-import.json
- backup-post-wipe.json
- wipe.json
EOF

echo "Completed. Summary: ${RUN_DIR}/SUMMARY.txt"
