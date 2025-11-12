#!/bin/bash
set -eu

# package.sh
# Host script for building modbus2mqtt APK packages
# Expects the following environment variables:
# - PACKAGER_PRIVKEY : full private abuild key (multi-line)
# - (optional) PKG_VERSION : package version; defaults to package.json via node

BASEDIR=$(dirname "$0")
cd "$BASEDIR"

# Source shared utilities for Alpine version detection
# shellcheck source=./arch-utils.sh
. "$BASEDIR/arch-utils.sh"

if [ -z "${PACKAGER_PRIVKEY:-}" ]; then
  echo "ERROR: PACKAGER_PRIVKEY must be set in the environment" >&2
  exit 2
fi

: "${PKG_VERSION:=$(node -p "require('../../../package.json').version")}" || true
export PKG_VERSION
echo "Package version: $PKG_VERSION"

# Detect Alpine version using shared function
detect_alpine_version || exit $?

# Persist chosen Alpine version for downstream scripts
persist_alpine_version "$BASEDIR/build"

# Setup directories and permissions
HOST_UID=$(id -u)
HOST_GID=$(id -g)
PACKAGE="$BASEDIR/../../repo"
mkdir -p "$PACKAGE"

# Prepare npm cache directory on host to speed up repeated builds
CACHE_DIR="$BASEDIR/build/npm-cache"
mkdir -p "$CACHE_DIR"

echo "Starting containerized APK build..."
echo "  Alpine version: $ALPINE_VERSION"
echo "  Package target: $PACKAGE"
echo "  Build user: $HOST_UID:$HOST_GID"

# Run build in Alpine container
docker run --rm -i \
  -v "$BASEDIR":/work \
  -w /work \
  -v "$PACKAGE":/package \
  -v "$CACHE_DIR":/home/builder/.npm \
  -e PACKAGER="Volkmar Nissen <volkmar.nissen@example.com>" \
  -e PKG_VERSION="$PKG_VERSION" \
  -e PACKAGER_PRIVKEY \
  -e HOST_UID="$HOST_UID" \
  -e HOST_GID="$HOST_GID" \
  -e ALPINE_VERSION="$ALPINE_VERSION" \
  -e NPM_CONFIG_CACHE="/home/builder/.npm" \
  -e npm_config_cache="/home/builder/.npm" \
  alpine:"$ALPINE_VERSION" \
  sh /work/package-build.sh

echo ""
echo "✓ package.sh finished successfully"
echo "Built packages:"
if [ -d "$PACKAGE" ]; then
  find "$PACKAGE" -name "*.apk" -exec ls -lh {} \; || echo "  No APK files found"
  if [ -f "$PACKAGE/packager.rsa.pub" ]; then
    echo "✓ Public key: $PACKAGE/packager.rsa.pub"
  fi
else
  echo "  No package directory found"
fi

# Verify file permissions and ownership for debugging
echo "Verifying package directory permissions..."
if [ -d "$PACKAGE" ]; then
  echo "Package directory contents and permissions:"
  ls -laR "$PACKAGE"
  echo "Current user: $(id -un) ($(id -u))"
  echo "Current group: $(id -gn) ($(id -g))"
else
  echo "WARNING: Package directory $PACKAGE not found"
fi