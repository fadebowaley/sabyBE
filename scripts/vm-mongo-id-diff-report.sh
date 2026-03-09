#!/usr/bin/env bash
set -euo pipefail

# Compare _id overlap between two Mongo databases on remote VM.
# Non-destructive: read-only via mongoexport.

HOST="192.248.162.63"
USER_NAME="saby"
SSH_KEY="${HOME}/.ssh/saby-prod-2026"
PASSWORD_FILE=""
DB_A="hotellar"
DB_B="hotellar_probe_jan"
URI="mongodb://127.0.0.1:27017"
COLLECTIONS="activitylogs,uorders,users,guests,checkoutconfirmations"

usage() {
  cat <<'USAGE'
Usage: scripts/vm-mongo-id-diff-report.sh --password-file <path> [options]

Options:
  --host <ip-or-host>          Default: 192.248.162.63
  --user <username>            Default: saby
  --key <ssh-private-key>      Default: ~/.ssh/saby-prod-2026
  --password-file <path>       Required
  --db-a <name>                Default: hotellar
  --db-b <name>                Default: hotellar_probe_jan
  --uri <mongodb-uri>          Default: mongodb://127.0.0.1:27017
  --collections <csv>          Default: activitylogs,uorders,users,guests,checkoutconfirmations
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --user) USER_NAME="${2:-}"; shift 2 ;;
    --key) SSH_KEY="${2:-}"; shift 2 ;;
    --password-file) PASSWORD_FILE="${2:-}"; shift 2 ;;
    --db-a) DB_A="${2:-}"; shift 2 ;;
    --db-b) DB_B="${2:-}"; shift 2 ;;
    --uri) URI="${2:-}"; shift 2 ;;
    --collections) COLLECTIONS="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$PASSWORD_FILE" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$PASSWORD_FILE" ]]; then
  echo "Password file not found: $PASSWORD_FILE" >&2
  exit 1
fi

if ! command -v expect >/dev/null 2>&1; then
  echo "expect is required but not installed." >&2
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="$(pwd)/artifacts/vm-id-diff-${HOST}-${TS}"
mkdir -p "$OUT_DIR"

REMOTE_HELPER="/tmp/mongo_id_diff_remote_${TS}.sh"
LOCAL_HELPER="/tmp/mongo_id_diff_remote_${TS}.sh"
REMOTE_OUT="/tmp/mongo_id_diff_${TS}"

cat > "$LOCAL_HELPER" <<'REMOTE_SH'
#!/usr/bin/env bash
set -euo pipefail
DB_A="$1"
DB_B="$2"
URI="$3"
OUT_DIR="$4"
COLLECTIONS="$5"

mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/id_diff_report.csv"
echo "collection,db_a_count,db_b_count,db_b_missing_in_a,db_a_newer_than_b,sample_missing_in_a,sample_newer_in_a" > "$REPORT"

IFS=',' read -r -a cols <<< "$COLLECTIONS"
for c in "${cols[@]}"; do
  a_ids="$OUT_DIR/${c}_a_ids.txt"
  b_ids="$OUT_DIR/${c}_b_ids.txt"
  mongoexport --quiet --uri="$URI" --db "$DB_A" --collection "$c" --type=json --fields _id | sed -n 's/.*"\$oid":"\([0-9a-f]\{24\}\)".*/\1/p' | sort -u > "$a_ids"
  mongoexport --quiet --uri="$URI" --db "$DB_B" --collection "$c" --type=json --fields _id | sed -n 's/.*"\$oid":"\([0-9a-f]\{24\}\)".*/\1/p' | sort -u > "$b_ids"

  a_count=$(wc -l < "$a_ids" | tr -d ' ')
  b_count=$(wc -l < "$b_ids" | tr -d ' ')
  b_missing_in_a=$(comm -23 "$b_ids" "$a_ids" | wc -l | tr -d ' ')
  a_newer_than_b=$(comm -13 "$b_ids" "$a_ids" | wc -l | tr -d ' ')
  sample_missing=$(comm -23 "$b_ids" "$a_ids" | head -n 5 | paste -sd'|' - || true)
  sample_newer=$(comm -13 "$b_ids" "$a_ids" | head -n 5 | paste -sd'|' - || true)

  echo "${c},${a_count},${b_count},${b_missing_in_a},${a_newer_than_b},\"${sample_missing}\",\"${sample_newer}\"" >> "$REPORT"
done

echo "Generated $REPORT"
REMOTE_SH

chmod +x "$LOCAL_HELPER"

echo "[1/4] Uploading helper"
expect <<EOF_EXPECT
set timeout 120
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn scp -i "$SSH_KEY" "$LOCAL_HELPER" "${USER_NAME}@${HOST}:${REMOTE_HELPER}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

echo "[2/4] Running remote compare"
expect <<EOF_EXPECT
set timeout 1800
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn ssh -tt -i "$SSH_KEY" "${USER_NAME}@${HOST}" "bash ${REMOTE_HELPER} ${DB_A} ${DB_B} ${URI} ${REMOTE_OUT} '${COLLECTIONS}'"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

echo "[3/4] Downloading report"
expect <<EOF_EXPECT
set timeout 300
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn scp -i "$SSH_KEY" "${USER_NAME}@${HOST}:${REMOTE_OUT}/id_diff_report.csv" "${OUT_DIR}/"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

echo "[4/4] Remote cleanup"
expect <<EOF_EXPECT
set timeout 120
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn ssh -tt -i "$SSH_KEY" "${USER_NAME}@${HOST}" "rm -f ${REMOTE_HELPER} && rm -rf ${REMOTE_OUT}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

rm -f "$LOCAL_HELPER"

echo "Done. Report: ${OUT_DIR}/id_diff_report.csv"
cat "${OUT_DIR}/id_diff_report.csv"
