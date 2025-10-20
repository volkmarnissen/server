#!/usr/bin/env bash
set -euo pipefail

# Build a Debian package for the server project
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"

echo "Installing system tooling if needed (you may be prompted for sudo)..."
echo "Make sure dpkg-buildpackage and debhelper are installed (apt-get install dpkg-dev debhelper build-essential)"

if [ ! -d node_modules ]; then
  echo "Installing npm dependencies..."
  npm ci
fi

echo "Building project (TypeScript)..."
npm run build

echo "Running dpkg-buildpackage..."
DEBEMAIL="Volkmar Nissen <volkmar.nissen@gmail.com>" \
DEBFULLNAME="Volkmar Nissen" \
chmod +x debian/postinst || true
chmod +x debian/prerm || true
dpkg-buildpackage -us -uc -b

echo "Build finished. Check parent directory for .deb files."
