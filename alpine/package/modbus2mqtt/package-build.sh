#!/bin/sh
set -e

# package-build.sh
# Container-internal script for building modbus2mqtt APK
# This script runs inside the Alpine container and expects:
# Environment: PACKAGER_PRIVKEY, PKG_VERSION, HOST_UID, HOST_GID, ALPINE_VERSION

echo "=== APK Build Container Script ==="
echo "Alpine version: $ALPINE_VERSION"
echo "Package version: $PKG_VERSION"
echo "Build user: builder ($HOST_UID:$HOST_GID)"

# Setup Alpine repositories
ALPINE_REPO_VER="v${ALPINE_VERSION}"
cat > /etc/apk/repositories <<-REPO
https://dl-cdn.alpinelinux.org/alpine/${ALPINE_REPO_VER}/main
https://dl-cdn.alpinelinux.org/alpine/${ALPINE_REPO_VER}/community
REPO

if ! apk update >/dev/null 2>&1; then
  echo "ERROR: failed to use alpine repositories for ${ALPINE_REPO_VER}" >&2
  exit 1
fi

# Install build dependencies
echo "Installing build dependencies..."
apk add --no-cache abuild alpine-sdk nodejs npm git shadow openssl doas >/dev/null 2>&1
mkdir -p /etc/doas.d
echo 'permit nopass :dialout as root' > /etc/doas.d/doas.conf || true

# Setup groups and users
if ! getent group dialout >/dev/null 2>&1; then
  addgroup -g "${HOST_GID}" dialout >/dev/null 2>&1 || true
fi

adduser -D -u "${HOST_UID}" -G dialout builder || true
addgroup builder abuild || true
mkdir -p /home/builder
chown builder:dialout /home/builder || true
mkdir -p /home/builder/.npm
chown -R builder:dialout /home/builder/.npm || true

# Setup abuild keys
echo "Setting up signing keys..."
mkdir -p /home/builder/.abuild
printf '%s' "$PACKAGER_PRIVKEY" > /home/builder/.abuild/builder-6904805d.rsa

# Generate public key from private key
echo "Generating public key from private key..."
if openssl rsa -in /home/builder/.abuild/builder-6904805d.rsa -pubout -out /home/builder/.abuild/builder-6904805d.rsa.pub 2>/dev/null; then
  echo "✓ Public key generated successfully"
else
  echo "ERROR: Failed to generate public key from private key" >&2
  openssl rsa -in /home/builder/.abuild/builder-6904805d.rsa -pubout -out /home/builder/.abuild/builder-6904805d.rsa.pub 2>&1 || true
  exit 1
fi

chmod 600 /home/builder/.abuild/builder-6904805d.rsa || true
chown -R builder:dialout /home/builder/.abuild || true
cp /home/builder/.abuild/builder-6904805d.rsa.pub /etc/apk/keys || true

# Create abuild configuration
cat > /home/builder/.abuild/abuild.conf <<-EOF
PACKAGER_PRIVKEY="/home/builder/.abuild/builder-6904805d.rsa"
PACKAGER_PUBKEY="/home/builder/.abuild/builder-6904805d.rsa.pub"
REPODEST="/package"
EOF
chmod 600 /home/builder/.abuild/abuild.conf || true
chown builder:dialout /home/builder/.abuild/abuild.conf || true

# Prepare source
echo "Preparing source code..."
rm -rf /work/src/node_modules || true
sed -i 's/pkgver=.*/pkgver='"${PKG_VERSION}"'/g' /work/APKBUILD || true

# Build APK as builder user
echo "Building modbus2mqtt APK version $PKG_VERSION directly to /package"
su - builder -s /bin/sh -c '
  set -e
  cd /work
  
  # Configure abuild to build directly to the mounted repo directory
  export REPODEST="/package"
  
  # Clean old APK files first (abuild will create the architecture subdirectory)
  rm -f "/package/"*/modbus2mqtt*.apk || true
  
  # prepare abuild and build package (checksum + build/sign)
  abuild checksum || true
  abuild -r
  
  # Verify build results (abuild creates architecture-specific subdirectories)
  apk_count=$(find "/package" -name "*.apk" | wc -l)
  if [ "$apk_count" -gt 0 ]; then
    echo "✓ Built $apk_count APK files directly to /package"
    find "/package" -name "*.apk" -exec ls -la {} \;
  else
    echo "ERROR: No APK files found in /package" >&2
    find "/package" -type f || echo "No files found in /package"
    exit 1
  fi
  
  # Place the public signing key into the repo root for architecture-independent access
  if [ -f "/home/builder/.abuild/builder-6904805d.rsa.pub" ]; then
    cp /home/builder/.abuild/builder-6904805d.rsa.pub "/package/packager.rsa.pub"
    echo "✓ Public key copied to /package/packager.rsa.pub (architecture-independent)"
  else
    echo "WARNING: Public key /home/builder/.abuild/builder-6904805d.rsa.pub not found"
    echo "Available files in /home/builder/.abuild/:"
    ls -la /home/builder/.abuild/ || true
  fi
'

echo "✓ APK build completed successfully"