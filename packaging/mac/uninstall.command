#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

clear
"$SCRIPT_DIR/native-host-mac/uninstall-host.sh"
echo
read -r -p "창을 닫으려면 Enter를 누르세요."
