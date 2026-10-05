#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.ssubong.chrome_capture"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_HOST="$SCRIPT_DIR/host.cjs"
EXTENSION_MANIFEST="$SCRIPT_DIR/../chrome-extension/manifest.json"
USER_LIBRARY_DIR="${CVC_USER_LIBRARY_DIR:-$HOME/Library}"
INSTALL_DIR="$USER_LIBRARY_DIR/Application Support/ChromeCapture/native-host-mac"
INSTALLED_HOST="$INSTALL_DIR/host.cjs"
RUNNER_PATH="$INSTALL_DIR/run-host.sh"
MANIFEST_DIR="$USER_LIBRARY_DIR/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"

NODE_PATH="$(command -v node || true)"
if [[ -z "$NODE_PATH" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE_PATH="$candidate"
    fi
  done
fi
if [[ -z "$NODE_PATH" ]]; then
  echo "오류: Node.js가 필요합니다. https://nodejs.org 에서 먼저 설치해 주세요." >&2
  exit 1
fi

if [[ ! -f "$SOURCE_HOST" || ! -f "$EXTENSION_MANIFEST" ]]; then
  echo "오류: 설치 파일이 누락되었습니다." >&2
  exit 1
fi

EXTENSION_ID="$("$NODE_PATH" -e '
  const fs = require("fs");
  const crypto = require("crypto");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!manifest.key) throw new Error("manifest key is missing");
  const publicKey = Buffer.from(manifest.key, "base64");
  const hex = crypto.createHash("sha256").update(publicKey).digest("hex").slice(0, 32);
  process.stdout.write([...hex].map((char) => String.fromCharCode(97 + parseInt(char, 16))).join(""));
' "$EXTENSION_MANIFEST")"

if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo "오류: 확장 ID를 계산하지 못했습니다." >&2
  exit 1
fi

install -d -m 755 "$INSTALL_DIR" "$MANIFEST_DIR"
install -m 755 "$SOURCE_HOST" "$INSTALLED_HOST"

cat > "$RUNNER_PATH" <<SH
#!/usr/bin/env bash
exec "$NODE_PATH" "$INSTALLED_HOST"
SH
chmod 755 "$RUNNER_PATH"

cat > "$MANIFEST_PATH" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Chrome Capture save helper for macOS",
  "path": "$RUNNER_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
JSON

echo
echo "Chrome Capture 저장 도우미 설치가 끝났습니다."
echo "기본 저장 폴더: ~/Desktop/Capture"
