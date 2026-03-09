#!/usr/bin/env bash
set -euo pipefail

HOST="192.248.162.63"
USER_NAME="saby"
SSH_KEY="${HOME}/.ssh/saby-prod-2026"
PASSWORD_FILE=""
OUT_DIR="$(pwd)/artifacts"

usage() {
  cat <<'USAGE'
Usage: scripts/vm-mongo-backup-audit.sh --password-file <path> [options]

Options:
  --host <ip-or-host>        Default: 192.248.162.63
  --user <username>          Default: saby
  --key <ssh-private-key>    Default: ~/.ssh/saby-prod-2026
  --password-file <path>     Required
  --out-dir <path>           Default: ./artifacts
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --user) USER_NAME="${2:-}"; shift 2 ;;
    --key) SSH_KEY="${2:-}"; shift 2 ;;
    --password-file) PASSWORD_FILE="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
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
REPORT_DIR="${OUT_DIR}/vm-backup-audit-${HOST}-${TS}"
mkdir -p "$REPORT_DIR"
REPORT_FILE="${REPORT_DIR}/backup_audit.csv"
REMOTE_HELPER="/tmp/mongo_backup_audit_${TS}.sh"
LOCAL_HELPER="/tmp/mongo_backup_audit_${TS}.sh"

cat > "$LOCAL_HELPER" <<'REMOTE_SH'
#!/usr/bin/env bash
set -euo pipefail
echo "path,size_bytes,sha256,looks_valid_gzip"
for f in /home/saby/*backup*.archive.gz /home/saby/*backup*.tar.gz /home/saby/restore_from_vmbackup_20260219_084900/*.archive.gz; do
  [ -f "$f" ] || continue
  s=$(stat -c %s "$f")
  h=$(sha256sum "$f" | awk '{print $1}')
  if gzip -t "$f" >/dev/null 2>&1; then
    ok=true
  else
    ok=false
  fi
  echo "$f,$s,$h,$ok"
done
REMOTE_SH
chmod +x "$LOCAL_HELPER"

echo "[1/4] Uploading helper..."
expect <<EOF_EXPECT
set timeout 120
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn scp -i "$SSH_KEY" "$LOCAL_HELPER" "${USER_NAME}@${HOST}:${REMOTE_HELPER}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

echo "[2/4] Running remote backup audit..."
expect <<EOF_EXPECT > "$REPORT_FILE"
set timeout 600
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn ssh -tt -i "$SSH_KEY" "${USER_NAME}@${HOST}" "bash ${REMOTE_HELPER}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

sed -i.bak '/^spawn /d;/password:/d;/^Connection to /d' "$REPORT_FILE" && rm -f "${REPORT_FILE}.bak"

echo "[3/4] Remote cleanup..."
expect <<EOF_EXPECT
set timeout 120
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn ssh -tt -i "$SSH_KEY" "${USER_NAME}@${HOST}" "rm -f ${REMOTE_HELPER}"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

rm -f "$LOCAL_HELPER"

echo "[4/4] Done"
echo "Report: $REPORT_FILE"
cat "$REPORT_FILE"
