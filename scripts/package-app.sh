#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "${APPLE_FM_BUILD_BIN:-}" ]]; then
  BIN_DIR="$APPLE_FM_BUILD_BIN"
else
  swift build --configuration release --package-path "$ROOT_DIR"
  BIN_DIR="$(swift build --configuration release --show-bin-path --package-path "$ROOT_DIR")"
fi

APP_BUNDLE="$ROOT_DIR/outputs/Familiar.app"
if [[ -e "$APP_BUNDLE" ]]; then
  echo "Refusing to overwrite existing app bundle: $APP_BUNDLE" >&2
  exit 1
fi

RESOURCE_BUNDLE="$BIN_DIR/AppleFMChat_AppleFMChat.bundle"
SERVER_BINARY="$BIN_DIR/apple-fm-chat"
if [[ ! -x "$SERVER_BINARY" || ! -d "$RESOURCE_BUNDLE" ]]; then
  echo "Expected server executable and resource bundle in $BIN_DIR" >&2
  exit 1
fi

mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Helpers" "$APP_BUNDLE/Contents/Resources"
cp "$ROOT_DIR/macos/FamiliarApp/Info.plist" "$APP_BUNDLE/Contents/Info.plist"
cp "$SERVER_BINARY" "$APP_BUNDLE/Contents/Helpers/apple-fm-chat"
cp -R "$RESOURCE_BUNDLE" "$APP_BUNDLE/Contents/Resources/"
cp -R "$RESOURCE_BUNDLE" "$APP_BUNDLE/Contents/Helpers/"

CLANG_MODULE_CACHE_PATH="${CLANG_MODULE_CACHE_PATH:-/private/tmp/familiar-clang-module-cache}" \
  xcrun --sdk macosx clang -fobjc-arc -mmacosx-version-min=26.0 \
  -framework Cocoa -framework WebKit \
  -o "$APP_BUNDLE/Contents/MacOS/Familiar" "$ROOT_DIR/macos/FamiliarApp/main.m"

codesign --force --deep --sign - "$APP_BUNDLE"
ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ROOT_DIR/outputs/Familiar-macOS.zip"
echo "Created $APP_BUNDLE and outputs/Familiar-macOS.zip"
