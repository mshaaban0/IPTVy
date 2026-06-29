#!/usr/bin/env bash
# Package the shared web app (web/app) into a webOS .ipk and, optionally,
# install + launch it on a TV in Developer Mode.
#
# Requires the webOS TV CLI:  npm i -g @webos-tools/cli   (provides ares-*)
# One-time TV setup: enable Developer Mode on the TV, then:
#   ares-setup-device          # register the TV (name it e.g. "tv")
#   ares-novacom --device tv --getkey   # paste the Dev Mode passphrase
#
# Usage:
#   ./webos-build.sh                 # build dist/com.iptvy.app_*.ipk
#   ./webos-build.sh install tv      # build, then install + launch on device "tv"
set -euo pipefail

APP_DIR="web/app"
OUT_DIR="dist"
APP_ID="com.iptvy.app"

mkdir -p "$OUT_DIR"

echo "Packaging $APP_DIR -> $OUT_DIR ..."
ares-package "$APP_DIR" -o "$OUT_DIR"

IPK=$(ls -t "$OUT_DIR"/${APP_ID}_*.ipk | head -n1)
echo "Built: $IPK"

if [[ "${1:-}" == "install" ]]; then
  DEVICE="${2:-tv}"
  echo "Installing on '$DEVICE' ..."
  ares-install --device "$DEVICE" "$IPK"
  echo "Launching ..."
  ares-launch --device "$DEVICE" "$APP_ID"
fi
