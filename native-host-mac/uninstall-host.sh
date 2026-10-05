#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.ssubong.chrome_capture"
USER_LIBRARY_DIR="${CVC_USER_LIBRARY_DIR:-$HOME/Library}"
INSTALL_DIR="$USER_LIBRARY_DIR/Application Support/ChromeCapture/native-host-mac"
MANIFEST_PATH="$USER_LIBRARY_DIR/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json"

rm -f "$MANIFEST_PATH"
rm -rf "$INSTALL_DIR"

echo "Chrome Capture 저장 도우미를 제거했습니다."
