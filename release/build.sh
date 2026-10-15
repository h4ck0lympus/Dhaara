#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
OUT=release/out
CACHE=release/cache
APPDIR=$OUT/AppDir
LIB=$APPDIR/usr/lib/dhara
ELECTRON_DIST=electron/node_modules/electron/dist

APPIMAGETOOL_URL=https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage
APPIMAGETOOL_SHA256=ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0
RUNTIME_URL=https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64
RUNTIME_SHA256=2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d

fail() { echo "release/build.sh: $*" >&2; exit 1; }

fetch() {
  if [ ! -f "$3" ]; then
    echo "downloading $1"
    curl -fsSL --retry 3 -o "$3.part" "$1" || fail "download failed: $1"
    mv "$3.part" "$3"
  fi
  if ! echo "$2  $3" | sha256sum -c --quiet -; then
    rm -f "$3"
    fail "SHA-256 mismatch for $3 (expected $2); the file was deleted"
  fi
}

case "$(node --version 2>/dev/null)" in v22.*) ;; *) fail 'Node 22 is required: export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH' ;; esac
[ -x .venv/bin/python ] || fail '.venv/bin/python is missing; run `uv sync` as the README says'
[ "$(uname -m)" = x86_64 ] || fail 'this build targets x86_64 only'
VERSION=$(node -p "require('./electron/package.json').version")
PY_VERSION=$(.venv/bin/python -c "import tomllib; print(tomllib.load(open('pyproject.toml', 'rb'))['project']['version'])")
[ "$VERSION" = "$PY_VERSION" ] || fail "version mismatch: electron/package.json $VERSION, pyproject.toml $PY_VERSION"
APPIMAGE=$OUT/Dhara-$VERSION-x86_64.AppImage

echo "== tools (pinned, verified)"
mkdir -p "$CACHE"
fetch "$APPIMAGETOOL_URL" "$APPIMAGETOOL_SHA256" "$CACHE/appimagetool-x86_64.AppImage"
fetch "$RUNTIME_URL" "$RUNTIME_SHA256" "$CACHE/runtime-x86_64"
chmod 755 "$CACHE/appimagetool-x86_64.AppImage"

echo "== 1/7 web bundle"
npm --prefix web ci
npm --prefix web run build

echo "== 2/7 PyInstaller from the release extra"
uv pip install -q --python .venv/bin/python -e '.[release]'

echo "== 3/7 frozen service"
rm -rf "$OUT/service" "$OUT/build"
.venv/bin/pyinstaller release/dhara-service.spec --noconfirm --distpath "$OUT/service" --workpath "$OUT/build" --log-level WARN

echo "== 4/7 Electron shell"
npm --prefix electron ci
npm --prefix electron run build

echo "== 5/7 AppDir"
rm -rf "$APPDIR"
mkdir -p "$LIB/resources/app/dist" "$LIB/resources/service"
cp -a "$ELECTRON_DIST/." "$LIB/"
mv "$LIB/electron" "$LIB/dhara"
rm -f "$LIB/resources/default_app.asar"
rm -f "$LIB/chrome-sandbox"
install -m 755 "$ELECTRON_DIST/chrome-sandbox" "$LIB/resources/chrome-sandbox"
cp electron/package.json "$LIB/resources/app/"
cp electron/dist/*.js electron/dist/*.cjs "$LIB/resources/app/dist/"
cp -a electron/static "$LIB/resources/app/static"
cp -a "$OUT/service/dhara-service" "$LIB/resources/service/dhara-service"
install -m 644 release/launch.cjs "$LIB/resources/launch.cjs"
install -m 755 release/AppRun "$APPDIR/AppRun"
install -m 644 release/dhara.desktop "$APPDIR/dhara.desktop"
install -m 644 web/public/icon.svg "$APPDIR/dhara.svg"
cp "$APPDIR/dhara.svg" "$APPDIR/.DirIcon"

echo "== 6/7 appimagetool"
rm -f "$APPIMAGE"
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$CACHE/appimagetool-x86_64.AppImage" -n \
  --mksquashfs-opt -force-uid --mksquashfs-opt "$(id -u)" --mksquashfs-opt -force-gid --mksquashfs-opt "$(id -g)" \
  --runtime-file "$CACHE/runtime-x86_64" "$APPDIR" "$APPIMAGE"

echo "== 7/7 self-check"
APPIMAGE_ABS=$PWD/$APPIMAGE
check=$(mktemp -d "${TMPDIR:-/tmp}/dhara-appimage-check-XXXXXX")
trap 'rm -rf "$check"' EXIT
(cd "$check" && "$APPIMAGE_ABS" --appimage-extract >/dev/null)
for p in AppRun dhara.desktop dhara.svg .DirIcon usr/lib/dhara/dhara usr/lib/dhara/resources/chrome-sandbox usr/lib/dhara/resources/launch.cjs \
         usr/lib/dhara/resources/app/package.json usr/lib/dhara/resources/app/dist/main.js usr/lib/dhara/resources/app/dist/preload.cjs \
         usr/lib/dhara/resources/app/static/startup.html usr/lib/dhara/resources/service/dhara-service/dhara-service \
         usr/lib/dhara/resources/service/dhara-service/_internal/web/dist/index.html; do
  [ -e "$check/squashfs-root/$p" ] || fail "missing from the AppImage: $p"
done
[ ! -e "$check/squashfs-root/usr/lib/dhara/chrome-sandbox" ] || fail 'chrome-sandbox must not sit beside the binary'
[ ! -e "$check/squashfs-root/usr/lib/dhara/resources/default_app.asar" ] || fail 'default_app.asar must not be shipped'
"$check/squashfs-root/usr/lib/dhara/resources/service/dhara-service/dhara-service" --help >/dev/null || fail 'dhara-service --help failed'
electron_version=$(ELECTRON_RUN_AS_NODE=1 "$check/squashfs-root/usr/lib/dhara/dhara" -p 'process.versions.electron') || fail 'the bundled Electron does not run in Node mode'
[ "$electron_version" = "$(cat "$ELECTRON_DIST/version")" ] || fail "the bundled Electron reports $electron_version"
echo "Electron $electron_version · service $(du -sh "$LIB/resources/service/dhara-service" | cut -f1) · AppDir $(du -sh "$APPDIR" | cut -f1) · AppImage $(du -h "$APPIMAGE" | cut -f1) ($(stat -c %s "$APPIMAGE") bytes)"
echo "$APPIMAGE"
