#!/usr/bin/env bash
# Keep the builder's ownership inside SquashFS: Chromium's helper requires it.
set -euo pipefail
stage=${1:?Usage: repack-preview.sh APPDIR OUTPUT_APPIMAGE APPIMAGETOOL RUNTIME}
output=${2:?Missing output AppImage}
image_tool=${3:?Missing appimagetool}
image_runtime=${4:?Missing AppImage runtime}
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$image_tool" -n \
  --mksquashfs-opt -force-uid --mksquashfs-opt "$(id -u)" \
  --mksquashfs-opt -force-gid --mksquashfs-opt "$(id -g)" \
  --runtime-file "$image_runtime" "$stage" "$output"
