#!/usr/bin/env bash
set -euo pipefail

# Compare ID overlap within a date window across two DBs for selected collections.
# Non-destructive; uses mongoexport queries.

HOST="192.248.162.63"
USER_NAME="saby"
SSH_KEY="${HOME}/.ssh/saby-prod-2026"
PASSWORD_FILE=""
DB_A="hotellar"
DB_B="hotellar_probe_jan"
URI="mongodb://127.0.0.1:27017"
START_DATE=""
END_DATE=""

usage() {
  cat <<'USAGE'
Usage: scripts/vm-mongo-window-id-diff.sh --password-file <path> --start-date YYYY-MM-DD --end-date YYYY-MM-DD [options]

Options:
  --host <ip-or-host>          Default: 192.248.162.63
  --user <username>            Default: saby
  --key <ssh-private-key>      Default: ~/.ssh/saby-prod-2026
  --password-file <path>       Required
  --db-a <name>                Default: hotellar
  --db-b <name>                Default: hotellar_probe_jan
  --uri <mongodb-uri>          Default: mongodb://127.0.0.1:27017
  --start-date <YYYY-MM-DD>    Required (inclusive)
  --end-date <YYYY-MM-DD>      Required (exclusive)
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
    --start-date) START_DATE="${2:-}"; shift 2 ;;
    --end-date) END_DATE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$PASSWORD_FILE" || -z "$START_DATE" || -z "$END_DATE" ]]; then
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

TS="$(date +%Y%m%d_%H%M%S)_$$"
OUT_DIR="$(pwd)/artifacts/vm-window-id-diff-${HOST}-${TS}"
mkdir -p "$OUT_DIR"

REMOTE_HELPER="/tmp/mongo_window_id_diff_${TS}.sh"
LOCAL_HELPER="/tmp/mongo_window_id_diff_${TS}.sh"
REMOTE_OUT="/tmp/mongo_window_id_diff_${TS}"

cat > "$LOCAL_HELPER" <<'REMOTE_SH'
#!/usr/bin/env bash
set -euo pipefail
DB_A="$1"
DB_B="$2"
URI="$3"
OUT_DIR="$4"
START_DATE="$5"
END_DATE="$6"

mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/window_id_diff_report.csv"
echo "collection,date_field,db_a_count,db_b_count,db_b_missing_in_a,db_a_only,sample_b_missing_in_a,sample_a_only" > "$REPORT"

collections=(activitylogs uorders users guests checkoutconfirmations)
fields=(timestamp createdAt created created checkedOutAt)

for i in "${!collections[@]}"; do
  c="${collections[$i]}"
  f="${fields[$i]}"

  q=$(printf '{"%s":{"$gte":{"$date":"%sT00:00:00Z"},"$lt":{"$date":"%sT00:00:00Z"}}}' "$f" "$START_DATE" "$END_DATE")
  a_ids="$OUT_DIR/${c}_a_ids.txt"
  b_ids="$OUT_DIR/${c}_b_ids.txt"

  mongoexport --quiet --uri="$URI" --db "$DB_A" --collection "$c" --query "$q" --type=json --fields _id | sed -n 's/.*"\$oid":"\([0-9a-f]\{24\}\)".*/\1/p' | sort -u > "$a_ids"
  mongoexport --quiet --uri="$URI" --db "$DB_B" --collection "$c" --query "$q" --type=json --fields _id | sed -n 's/.*"\$oid":"\([0-9a-f]\{24\}\)".*/\1/p' | sort -u > "$b_ids"

  a_count=$(wc -l < "$a_ids" | tr -d ' ')
  b_count=$(wc -l < "$b_ids" | tr -d ' ')
  b_missing_in_a=$(comm -23 "$b_ids" "$a_ids" | wc -l | tr -d ' ')
  a_only=$(comm -13 "$b_ids" "$a_ids" | wc -l | tr -d ' ')
  sample_b_missing=$(comm -23 "$b_ids" "$a_ids" | head -n 5 | paste -sd'|' - || true)
  sample_a_only=$(comm -13 "$b_ids" "$a_ids" | head -n 5 | paste -sd'|' - || true)

  echo "${c},${f},${a_count},${b_count},${b_missing_in_a},${a_only},\"${sample_b_missing}\",\"${sample_a_only}\"" >> "$REPORT"
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
spawn ssh -tt -i "$SSH_KEY" "${USER_NAME}@${HOST}" "bash ${REMOTE_HELPER} ${DB_A} ${DB_B} ${URI} ${REMOTE_OUT} ${START_DATE} ${END_DATE}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

echo "[3/4] Downloading report"
expect <<EOF_EXPECT
set timeout 300
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn scp -i "$SSH_KEY" "${USER_NAME}@${HOST}:${REMOTE_OUT}/window_id_diff_report.csv" "${OUT_DIR}/"
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

echo "Done. Report: ${OUT_DIR}/window_id_diff_report.csv"
cat "${OUT_DIR}/window_id_diff_report.csv"
