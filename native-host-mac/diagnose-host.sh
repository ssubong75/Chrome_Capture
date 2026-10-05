#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.ssubong.chrome_capture"
USER_LIBRARY_DIR="${CVC_USER_LIBRARY_DIR:-$HOME/Library}"
MANIFEST_PATH="$USER_LIBRARY_DIR/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json"

echo "[Node.js]"
command -v node || true
node -v || true

echo
echo "[저장 도우미 설정]"
if [[ -f "$MANIFEST_PATH" ]]; then
  cat "$MANIFEST_PATH"
else
  echo "설치되지 않았습니다."
fi
