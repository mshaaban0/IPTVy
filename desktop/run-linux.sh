#!/usr/bin/env bash
# Convenience launcher for running the Linux desktop app from WSL2 (WSLg).
#
# WSLg shows Linux GUI windows on the Windows desktop, but this WSL instance has
# no GPU passthrough (no /dev/dri), so hardware OpenGL fails with EGL/ZINK errors
# and the window can come up blank. Forcing Mesa's software renderer (llvmpipe)
# avoids that. On a real Linux box with a GPU you don't need any of this — just
# run `flutter run -d linux`.
set -e

export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe

FLUTTER="${FLUTTER:-/root/flutter/bin/flutter}"
cd "$(dirname "$0")"

# `run` gives hot reload; pass `build` to just produce a bundle instead.
"$FLUTTER" run -d linux "$@"
