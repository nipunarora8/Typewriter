#!/bin/sh
# Typewriter installer for macOS (Apple Silicon) and Linux (x86_64).
#   curl -fsSL https://raw.githubusercontent.com/nipunarora8/Typewriter/main/install.sh | sh
# Downloads the latest release from GitHub. Nothing else is fetched or run.
set -eu

REPO="nipunarora8/Typewriter"
BASE="https://github.com/$REPO/releases"

say() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required."

# The latest tag, read from the redirect of /releases/latest.
TAG=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$BASE/latest" | sed 's#.*/##')
case "$TAG" in v*) ;; *) die "Could not find the latest release." ;; esac
VERSION=${TAG#v}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

OS=$(uname -s)
ARCH=$(uname -m)

install_mac() {
  [ "$ARCH" = "arm64" ] || die "This build is for Apple Silicon Macs only."
  say "Downloading Typewriter $VERSION..."
  curl -fSL --progress-bar -o "$TMP/app.tar.gz" "$BASE/download/$TAG/Typewriter_aarch64.app.tar.gz"
  tar -xzf "$TMP/app.tar.gz" -C "$TMP"
  [ -d "$TMP/Typewriter.app" ] || die "Download did not contain Typewriter.app."

  DEST="/Applications"
  [ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
  if pgrep -x typewriter >/dev/null 2>&1; then
    say "Typewriter is running. Quit it first, then run this command again."
    exit 1
  fi
  rm -rf "$DEST/Typewriter.app"
  mv "$TMP/Typewriter.app" "$DEST/Typewriter.app"
  # Files fetched by curl are not quarantined; clear the flag anyway.
  xattr -dr com.apple.quarantine "$DEST/Typewriter.app" 2>/dev/null || true
  say "Installed to $DEST/Typewriter.app"
  open "$DEST/Typewriter.app"
}

install_linux() {
  [ "$ARCH" = "x86_64" ] || die "This build is for x86_64 Linux only."
  APPDIR="${XDG_DATA_HOME:-$HOME/.local/share}"
  BIN="$APPDIR/typewriter/Typewriter.AppImage"
  mkdir -p "$APPDIR/typewriter" "$APPDIR/applications" "$APPDIR/icons"

  say "Downloading Typewriter $VERSION..."
  curl -fSL --progress-bar -o "$TMP/Typewriter.AppImage" \
    "$BASE/download/$TAG/Typewriter_${VERSION}_amd64.AppImage"
  chmod +x "$TMP/Typewriter.AppImage"
  mv "$TMP/Typewriter.AppImage" "$BIN"

  # App-menu entry and icon, so it shows up like a normal app.
  curl -fsSL -o "$APPDIR/icons/typewriter.png" \
    "https://raw.githubusercontent.com/$REPO/$TAG/src-tauri/icons/128x128.png" || true
  cat > "$APPDIR/applications/typewriter.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Typewriter
Comment=A tiny desktop todo widget
Exec="$BIN"
Icon=$APPDIR/icons/typewriter.png
Terminal=false
Categories=Utility;
StartupWMClass=typewriter
DESKTOP
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPDIR/applications" >/dev/null 2>&1 || true
  say "Installed to $BIN"
  say "Open Typewriter from your app menu, or run: $BIN"
}

case "$OS" in
  Darwin) install_mac ;;
  Linux) install_linux ;;
  *) die "Unsupported system: $OS" ;;
esac
