#!/bin/bash
# Build a simple drag-to-Applications disk image from the release app.
# Usage: npm run tauri build -- --bundles app && scripts/make-dmg.sh
set -euo pipefail
cd "$(dirname "$0")/../src-tauri/target/release/bundle"
ARCH=$(uname -m)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -R macos/Typewriter.app "$STAGE/"
ln -s /Applications "$STAGE/Applications"
mkdir -p dmg
hdiutil create -volname Typewriter -srcfolder "$STAGE" -ov -format UDZO "dmg/Typewriter-$ARCH.dmg"
echo "Created src-tauri/target/release/bundle/dmg/Typewriter-$ARCH.dmg"
