#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

clear
echo "Chrome Capture - Mac 저장 도우미 설치"
echo

if "$SCRIPT_DIR/native-host-mac/install-host.sh"; then
  echo
  echo "Chrome에서 chrome-extension 폴더를 로드해 주세요."
else
  echo
  echo "설치하지 못했습니다. 위 오류 내용을 확인해 주세요."
fi

echo
read -r -p "창을 닫으려면 Enter를 누르세요."
