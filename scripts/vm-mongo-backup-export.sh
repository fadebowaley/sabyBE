#!/usr/bin/env bash
set -euo pipefail

# Export backup artifacts from remote VM and create a local manifest for rollback readiness.
# Read-only on DB. Remote filesystem operations limited to ls/stat/sha256sum.

HOST="192.248.162.63"
USER_NAME="saby"
SSH_KEY="${HOME}/.ssh/saby-prod-2026"
PASSWORD_FILE=""
REMOTE_FILE=""
OUT_ROOT="$(pwd)/artifacts/vm-backups"

usage() {
  cat <<'USAGE'
Usage: scripts/vm-mongo-backup-export.sh --password-file <path> --remote-file <path> [options]

Options:
  --host <ip-or-host>       Default: 192.248.162.63
  --user <username>         Default: saby
  --key <ssh-private-key>   Default: ~/.ssh/saby-prod-2026
  --password-file <path>    Required (plain-text SSH password file)
  --remote-file <path>      Required (remote backup archive path)
  --out-root <path>         Default: ./artifacts/vm-backups
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --user) USER_NAME="${2:-}"; shift 2 ;;
    --key) SSH_KEY="${2:-}"; shift 2 ;;
    --password-file) PASSWORD_FILE="${2:-}"; shift 2 ;;
    --remote-file) REMOTE_FILE="${2:-}"; shift 2 ;;
    --out-root) OUT_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$PASSWORD_FILE" || -z "$REMOTE_FILE" ]]; then
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
DEST_DIR="${OUT_ROOT}/${HOST}-${TS}"
mkdir -p "$DEST_DIR"
MANIFEST_FILE="${DEST_DIR}/manifest.txt"

echo "[1/3] Collecting remote metadata..."
expect <<EOF_EXPECT > "$MANIFEST_FILE"
set timeout 180
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn ssh -tt -i "$SSH_KEY" "${USER_NAME}@${HOST}" "set -e; ls -lh '$REMOTE_FILE'; stat -c 'size_bytes=%s mtime=%y' '$REMOTE_FILE'; sha256sum '$REMOTE_FILE'"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

# Remove expect noise lines from manifest.
sed -i.bak '/^spawn /d;/password:/d;/^Connection to /d' "$MANIFEST_FILE" && rm -f "${MANIFEST_FILE}.bak"

echo "[2/3] Downloading backup artifact..."
expect <<EOF_EXPECT
set timeout 1800
set pw [string trim [exec cat "$PASSWORD_FILE"]]
spawn scp -i "$SSH_KEY" "${USER_NAME}@${HOST}:$REMOTE_FILE" "$DEST_DIR/"
expect {
  -re ".*password:.*" { send "\$pw\r"; exp_continue }
  eof
}
EOF_EXPECT

LOCAL_FILE="${DEST_DIR}/$(basename "$REMOTE_FILE")"

# Local integrity record
{
  echo "local_file=${LOCAL_FILE}"
  echo "local_sha256=$(sha256sum "$LOCAL_FILE" | awk '{print $1}')"
  echo "exported_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$MANIFEST_FILE"

echo "[3/3] Done"
echo "Backup stored at: $LOCAL_FILE"
echo "Manifest: $MANIFEST_FILE"
