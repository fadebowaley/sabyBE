#!/usr/bin/env bash
set -euo pipefail

# Build a daily Mongo data-gap report from a remote VM using mongoexport only.
# Safe/read-only: does not modify remote data.
#
# Example:
#   scripts/vm-mongo-gap-report.sh \
#     --host 192.248.162.63 \
#     --user saby \
#     --key ~/.ssh/saby-prod-2026 \
#     --password-file /Users/fadebowaley/saby/saby.key \
#     --start-date 2026-01-01 \
#     --days 65

HOST="192.248.162.63"
USER_NAME="saby"
SSH_KEY="${HOME}/.ssh/saby-prod-2026"
PASSWORD_FILE=""
START_DATE=""
DAYS=30
REMOTE_URI="mongodb://127.0.0.1:27017"

usage() {
  cat <<'USAGE'
Usage: scripts/vm-mongo-gap-report.sh --password-file <path> --start-date YYYY-MM-DD [options]

Options:
  --host <ip-or-host>         Default: 192.248.162.63
  --user <username>           Default: saby
  --key <ssh-private-key>     Default: ~/.ssh/saby-prod-2026
  --password-file <path>      Required (plain-text SSH password file)
  --start-date <YYYY-MM-DD>   Required
  --days <n>                  Default: 30
  --uri <mongodb-uri>         Default: mongodb://127.0.0.1:27017
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --user) USER_NAME="${2:-}"; shift 2 ;;
    --key) SSH_KEY="${2:-}"; shift 2 ;;
    --password-file) PASSWORD_FILE="${2:-}"; shift 2 ;;
    --start-date) START_DATE="${2:-}"; shift 2 ;;
    --days) DAYS="${2:-}"; shift 2 ;;
    --uri) REMOTE_URI="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$PASSWORD_FILE" || -z "$START_DATE" ]]; then
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
OUT_DIR="$(pwd)/artifacts/vm-gap-report-${HOST}-${TS}"
mkdir -p "$OUT_DIR"

REMOTE_HELPER="/tmp/mongo_gap_report_remote_${TS}.sh"
LOCAL_HELPER="/tmp/mongo_gap_report_remote_${TS}.sh"
REPORT_DIR_REMOTE="/tmp/mongo_gap_report_${TS}"

cat > "$LOCAL_HELPER" <<'REMOTE_SH'
#!/usr/bin/env bash
set -euo pipefail

START_DATE="$1"
DAYS="$2"
OUT_DIR="$3"
MONGO_URI="$4"

mkdir -p "$OUT_DIR"
LATEST_FILE="${OUT_DIR}/latest_markers.csv"
DAILY_FILE="${OUT_DIR}/daily_counts.csv"
ZERO_FILE="${OUT_DIR}/zero_days.csv"

echo "collection,date_field,current_count,latest_marker_json" > "$LATEST_FILE"
echo "collection,date_field,date_utc,count" > "$DAILY_FILE"

collections=(activitylogs uorders users guests checkoutconfirmations)
fields=(timestamp createdAt created created checkedOutAt)

for i in "${!collections[@]}"; do
  c="${collections[$i]}"
  f="${fields[$i]}"

  current_count="$(mongoexport --quiet --uri="$MONGO_URI" --db hotellar --collection "$c" --type=json | wc -l | tr -d ' ')"
  latest_json="$(mongoexport --quiet --uri="$MONGO_URI" --db hotellar --collection "$c" --type=json --sort "{${f}:-1}" --limit 1 --fields "$f" | sed -n '1p' | tr -d '\r' | sed 's/"/""/g')"
  echo "${c},${f},${current_count},\"${latest_json}\"" >> "$LATEST_FILE"

  for ((d=0; d< DAYS; d++)); do
    day="$(date -u -d "${START_DATE} +${d} day" +%Y-%m-%d)"
    next_day="$(date -u -d "${START_DATE} +$((d+1)) day" +%Y-%m-%d)"
    q="$(printf '{"%s":{"$gte":{"$date":"%sT00:00:00Z"},"$lt":{"$date":"%sT00:00:00Z"}}}' "$f" "$day" "$next_day")"
    count="$(mongoexport --quiet --uri="$MONGO_URI" --db hotellar --collection "$c" --query "$q" --type=json | wc -l | tr -d ' ')"
    echo "${c},${f},${day},${count}" >> "$DAILY_FILE"
  done
done

{
  echo "collection,date_utc,count"
  awk -F, 'NR>1 && $4==0 {print $1","$3","$4}' "$DAILY_FILE"
} > "$ZERO_FILE"

echo "Report generated:"
echo "  $LATEST_FILE"
echo "  $DAILY_FILE"
echo "  $ZERO_FILE"
REMOTE_SH

chmod +x "$LOCAL_HELPER"

echo "[1/4] Uploading remote helper..."
expect <<EOF
set timeout 120
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn scp -i "$SSH_KEY" "$LOCAL_HELPER" "${USER_NAME}@${HOST}:${REMOTE_HELPER}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF

echo "[2/4] Running remote report..."
expect <<EOF
set timeout 1800
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn ssh -tt -i "$SSH_KEY" "${USER_NAME}@${HOST}" "bash ${REMOTE_HELPER} ${START_DATE} ${DAYS} ${REPORT_DIR_REMOTE} ${REMOTE_URI}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF

echo "[3/4] Downloading report files..."
expect <<EOF
set timeout 300
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn scp -i "$SSH_KEY" "${USER_NAME}@${HOST}:${REPORT_DIR_REMOTE}/*.csv" "${OUT_DIR}/"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF

echo "[4/4] Remote cleanup..."
expect <<EOF
set timeout 120
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn ssh -tt -i "$SSH_KEY" "${USER_NAME}@${HOST}" "rm -f ${REMOTE_HELPER} && rm -rf ${REPORT_DIR_REMOTE}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF

rm -f "$LOCAL_HELPER"

echo "Done. Local report folder:"
echo "  $OUT_DIR"
echo ""
echo "Preview:"
sed -n '1,20p' "${OUT_DIR}/latest_markers.csv"
