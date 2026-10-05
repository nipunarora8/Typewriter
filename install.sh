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
  mkdir -p "$APPDIR/typewriter" "$APPDIR/applications"

  say "Downloading Typewriter $VERSION..."
  curl -fSL --progress-bar -o "$TMP/Typewriter.AppImage" \
    "$BASE/download/$TAG/Typewriter_${VERSION}_amd64.AppImage"
  chmod +x "$TMP/Typewriter.AppImage"
  mv "$TMP/Typewriter.AppImage" "$BIN"

  # App-menu entry and icon (standard icon-theme location, so every desktop finds it).
  for size in 32 64 128; do
    dir="$APPDIR/icons/hicolor/${size}x${size}/apps"
    mkdir -p "$dir"
    curl -fsSL -o "$dir/typewriter.png" \
      "https://raw.githubusercontent.com/$REPO/$TAG/src-tauri/icons/${size}x${size}.png" || true
  done
  cat > "$APPDIR/applications/typewriter.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Typewriter
Comment=A tiny desktop todo widget
Exec="$BIN"
Icon=$APPDIR/icons/hicolor/128x128/apps/typewriter.png
Terminal=false
Categories=Utility;
StartupWMClass=typewriter
DESKTOP
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPDIR/applications" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$APPDIR/icons/hicolor" >/dev/null 2>&1 || true
  # KDE keeps its own app list; ask it to re-read so the entry shows up now.
  if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 >/dev/null 2>&1 || true
    kquitapp6 krunner >/dev/null 2>&1 || true
  elif command -v kbuildsycoca5 >/dev/null 2>&1; then
    kbuildsycoca5 >/dev/null 2>&1 || true
    kquitapp5 krunner >/dev/null 2>&1 || true
  fi
  say "Installed to $BIN"
  say "Open Typewriter from your app menu, or run: $BIN"
}

case "$OS" in
  Darwin) install_mac ;;
  Linux) install_linux ;;
  *) die "Unsupported system: $OS" ;;
esac
