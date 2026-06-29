#!/usr/bin/env bash
# Builds the signed release APK into dist/. Self-contained: points at the
# userspace JDK 17 + Android SDK set up for this project.
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-$HOME/toolchain/jdk-17.0.13+11}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

./gradlew assembleRelease --no-daemon
mkdir -p dist
cp app/build/outputs/apk/release/app-release.apk dist/IPTVy-1.6-release.apk
cp app/build/outputs/apk/release/app-release.apk dist/IPTVy.apk
echo "Built: dist/IPTVy-1.6-release.apk (also copied to dist/IPTVy.apk)"
# Note: the download page (web/) no longer ships a committed APK — it redirects
# /iptvy.apk to the latest GitHub Release asset. To publish, push to main (CI
# builds + releases) or attach this APK to a release manually. See DEPLOYMENT.md.
